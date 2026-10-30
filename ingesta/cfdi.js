// cfdi.js — Ingesta en el servidor de los XML de nómina (B3) y de la metadata del SAT; cruce con la nómina.
//
//   ZIP de XML ──► R2 ──► ingesta_cfdi (cola en D1, cron cada minuto)
//     pendiente   directorio del ZIP, huella del paquete, lotes por rango de entradas
//     leyendo     una lectura por rango de R2 por lote; cada XML se descomprime, se lee y se asigna a su corrida (D5)
//     cruzando    nómina ↔ CFDI por colaborador y corrida contra la última prenómina terminada del encargo
//     terminado
//   Metadata del SAT (.txt «~»): pendiente → leyendo (estatus por UUID) → terminado.
// Idempotente: repetir un lote o un cruce no duplica; un cruce nuevo conserva la clasificación de lo que vuelve a encontrar.
import { abrirZip, fuenteR2 } from './xlsx.js';
import { leerCfdi, asignarCorrida, leerMetadataSat } from './cfdi-xml.js';
import { cruzarNominaCfdi, emparejarExtras, llaveBase, RUBROS_CRUCE } from './cruce.js';
import { sha256Hex, nuevoId } from '../kernel/src/sello.js';
import { insertarMultiple } from '../kernel/src/d1.js';

export const XML_POR_LOTE = 250;
const LOTES_POR_PASO = 4;
const META_POR_LOTE = 1000;
const CANDADO_MS = 120000;
const ACTIVOS = ['pendiente', 'leyendo', 'cruzando'];
const COMP_COLS = 'ingesta_id, archivo, encargo_id, uuid, colaborador_llave, corrida_id, motivo_sin_corrida, tipo_nomina, periodicidad_pago, fecha_pago, fecha_final_pago, ' +
  'registro_patronal, rfc_receptor, num_empleado, total_percepciones_c, isr_retenido_c, total_c, n_errores, datos_json';
const ahoraISO = () => new Date().toISOString();
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function lotesDb(db, st) { for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50)); }

export async function crearIngestaCfdi(env, { encargo_id, tipo, r2_key, archivo_nombre, llave = 'num_empleado', usuario_id }) {
  if (!['xml_nomina', 'metadata_sat'].includes(tipo)) throw new Error('Tipo: xml_nomina (ZIP de XML) o metadata_sat (.txt del SAT)');
  if (!['num_empleado', 'rfc'].includes(llave)) throw new Error('Llave: num_empleado o rfc');
  const enc = await env.DB.prepare('SELECT id FROM encargo WHERE id = ?1').bind(encargo_id).first();
  if (!enc) throw new Error('Encargo no existe');
  const head = await env.DOCS.head(r2_key);
  if (!head) throw new Error('El archivo no está en R2: ' + r2_key);
  const id = nuevoId('cfd');
  await env.DB.prepare('INSERT INTO ingesta_cfdi (id, encargo_id, tipo, r2_key, archivo_nombre, tamano, llave, creado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
    .bind(id, encargo_id, tipo, r2_key, archivo_nombre || r2_key.split('/').pop(), head.size, llave, usuario_id ?? null).run();
  return id;
}

/** Huella del paquete completo, en streaming cuando el entorno lo permite (Workers: crypto.DigestStream). */
async function huellaR2(env, key) {
  const o = await env.DOCS.get(key);
  if (globalThis.crypto && typeof globalThis.crypto.DigestStream === 'function') {
    const ds = new globalThis.crypto.DigestStream('SHA-256');
    await o.body.pipeTo(ds);
    return [...new Uint8Array(await ds.digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Hex(new Uint8Array(await o.arrayBuffer()));
}

/** Entradas XML del ZIP en orden físico (por desplazamiento): el mismo orden en cada fase. */
async function entradasXml(env, key) {
  const fuente = await fuenteR2(env.DOCS, key);
  const zip = await abrirZip(fuente);
  const todas = [...zip.entradas.values()].sort((a, b) => a.local - b.local);
  const xml = todas.filter(e => /\.xml$/i.test(e.nombre) && !e.nombre.startsWith('__MACOSX/') && !e.nombre.endsWith('/'));
  return { fuente, todas, xml, otros: todas.length - xml.length };
}

async function inflar(bytes, metodo) {
  if (metodo === 0) return bytes;
  if (metodo !== 8) throw new Error('compresión no soportada ' + metodo);
  const s = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }).pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// ── Fase 1 ──
async function fasePendiente(env, ing) {
  const db = env.DB;
  const archivo_sha256 = await huellaR2(env, ing.r2_key);
  if (ing.tipo === 'metadata_sat') {
    const o = await env.DOCS.get(ing.r2_key);
    const { registros, errores } = leerMetadataSat(new TextDecoder('utf-8').decode(await o.arrayBuffer()));
    const n = Math.ceil(registros.length / META_POR_LOTE);
    const lotes = Array.from({ length: n }, (_, i) => [ing.id, i + 1, i * META_POR_LOTE, Math.min(registros.length, (i + 1) * META_POR_LOTE)]);
    const reporte = { registros: registros.length, vigentes: registros.filter(r => r.estatus === 'vigente').length, cancelados: registros.filter(r => r.estatus === 'cancelado').length,
      lineas_invalidas: errores.length, muestra_invalidas: errores.slice(0, 20) };
    await lotesDb(db, [...insertarMultiple(db, 'ingesta_cfdi_lote', 'ingesta_id, n, desde, hasta', lotes),
      db.prepare("UPDATE ingesta_cfdi SET estado = 'leyendo', archivo_sha256 = ?2, lotes_total = ?3, entradas = ?4, reporte_json = ?5, error = NULL, actualizado_en = datetime('now') WHERE id = ?1")
        .bind(ing.id, archivo_sha256, n, registros.length, JSON.stringify(reporte))]);
    return 'leyendo';
  }
  const { xml, otros } = await entradasXml(env, ing.r2_key);
  if (!xml.length) throw new Error('El ZIP no trae archivos .xml');
  const n = Math.ceil(xml.length / XML_POR_LOTE);
  const lotes = Array.from({ length: n }, (_, i) => [ing.id, i + 1, i * XML_POR_LOTE, Math.min(xml.length, (i + 1) * XML_POR_LOTE)]);
  await lotesDb(db, [...insertarMultiple(db, 'ingesta_cfdi_lote', 'ingesta_id, n, desde, hasta', lotes),
    db.prepare("UPDATE ingesta_cfdi SET estado = 'leyendo', archivo_sha256 = ?2, lotes_total = ?3, entradas = ?4, reporte_json = ?5, error = NULL, actualizado_en = datetime('now') WHERE id = ?1")
      .bind(ing.id, archivo_sha256, n, xml.length, JSON.stringify({ xml: xml.length, otros_archivos: otros }))]);
  return 'leyendo';
}

// ── Fase 2 ──
async function faseLeyendo(env, ing, hasta) {
  const db = env.DB;
  let ctx = null, meta = null;
  let hechos = 0;
  while (Date.now() < hasta && hechos < LOTES_POR_PASO) {
    const lote = await db.prepare("SELECT * FROM ingesta_cfdi_lote WHERE ingesta_id = ?1 AND estado = 'pendiente' ORDER BY n LIMIT 1").bind(ing.id).first();
    if (!lote) {
      const sig = ing.tipo === 'metadata_sat' ? 'terminado' : 'cruzando';
      await db.prepare("UPDATE ingesta_cfdi SET estado = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(ing.id, sig).run();
      return sig;
    }
    let st;
    if (ing.tipo === 'metadata_sat') {
      if (!meta) { const o = await env.DOCS.get(ing.r2_key); meta = leerMetadataSat(new TextDecoder('utf-8').decode(await o.arrayBuffer())).registros; }
      const filas = meta.slice(lote.desde, lote.hasta);
      st = [];
      for (let i = 0; i < filas.length; i += 16) {
        const g = filas.slice(i, i + 16);
        let k = 0;
        const vals = g.map(() => '(' + Array.from({ length: 6 }, () => '?' + (++k)).join(',') + ')').join(',');
        st.push(db.prepare('INSERT INTO cfdi_estado_sat (encargo_id, uuid, estatus, fecha_cancelacion, rfc_emisor, ingesta_id) VALUES ' + vals +
          ' ON CONFLICT (encargo_id, uuid) DO UPDATE SET estatus = excluded.estatus, fecha_cancelacion = excluded.fecha_cancelacion, rfc_emisor = excluded.rfc_emisor, ingesta_id = excluded.ingesta_id')
          .bind(...g.flatMap(r => [ing.encargo_id, r.uuid, r.estatus, r.fecha_cancelacion, r.rfc_emisor, ing.id])));
      }
    } else {
      if (!ctx) {
        const { results: cal } = await db.prepare('SELECT corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria FROM calendario_nomina WHERE encargo_id = ?1').bind(ing.encargo_id).all();
        ctx = { calendario: cal.map(c => ({ ...c, ordinaria: c.ordinaria === 1 })), zip: await entradasXml(env, ing.r2_key) };
      }
      const { fuente, todas, xml } = ctx.zip;
      const es = xml.slice(lote.desde, lote.hasta);
      const ini = es[0].local;
      const ultimo = es[es.length - 1];
      const sig = todas.find(e => e.local > ultimo.local);
      const fin = sig ? sig.local : fuente.size;
      const buf = await fuente.leer(ini, fin - ini);
      const filas = [];
      for (const e of es) {
        const o = e.local - ini;
        let c, fatal = null;
        try {
          if (u32(buf, o) !== 0x04034b50) throw new Error('encabezado local inválido');
          const datos = o + 30 + u16(buf, o + 26) + u16(buf, o + 28);
          const bytes = await inflar(buf.subarray(datos, datos + e.comprimido), e.metodo);
          c = leerCfdi(new TextDecoder('utf-8').decode(bytes));
          if (!c.uuid) fatal = 'sin UUID (no timbrado)';
          else if (c.tipo_comprobante !== 'N') fatal = 'no es CFDI de nómina';
          else if (!c.fecha_final_pago) fatal = 'sin complemento de nómina';
        } catch (err) { c = { errores: [String(err.message || err)] }; fatal = 'no se pudo leer: ' + String(err.message || err).slice(0, 120); }
        const asig = fatal ? { corrida_id: null, motivo: 'comprobante inválido: ' + fatal } : asignarCorrida(c, ctx.calendario);
        const llave = fatal ? null : ing.llave === 'rfc' ? c.rfc_receptor : c.num_empleado;
        filas.push([ing.id, e.nombre, ing.encargo_id, c.uuid || null, llave, asig.corrida_id, asig.motivo || null, c.tipo_nomina || null, c.periodicidad_pago || null,
          c.fecha_pago || null, c.fecha_final_pago || null, c.registro_patronal || null, c.rfc_receptor || null, c.num_empleado || null,
          c.total_percepciones_c ?? null, c.isr_retenido_c ?? null, c.total_c ?? null, (c.errores || []).length, JSON.stringify({ ...c, curp: undefined, nss: undefined })]); // N7: sin CURP ni NSS
      }
      st = insertarMultiple(db, 'comprobante', COMP_COLS, filas);
    }
    await lotesDb(db, [...st,
      db.prepare("UPDATE ingesta_cfdi_lote SET estado = 'hecho' WHERE ingesta_id = ?1 AND n = ?2").bind(ing.id, lote.n),
      db.prepare("UPDATE ingesta_cfdi SET lotes_hechos = (SELECT count(*) FROM ingesta_cfdi_lote WHERE ingesta_id = ?1 AND estado = 'hecho'), actualizado_en = datetime('now') WHERE id = ?1").bind(ing.id)]);
    hechos += 1;
  }
  return 'leyendo';
}

// ── Fase 3: cruce nómina ↔ CFDI ──
async function faseCruzando(env, ing) {
  const db = env.DB;
  const pre = await db.prepare("SELECT id, ejecucion_id FROM ingesta WHERE encargo_id = ?1 AND tipo = 'prenomina' AND estado = 'terminado' ORDER BY actualizado_en DESC LIMIT 1").bind(ing.encargo_id).first();
  if (!pre) throw new Error('Para cruzar hace falta la prenómina del periodo terminada en este encargo. Súbela y vuelve a cruzar.');
  const { results: comps } = await db.prepare('SELECT archivo, uuid, colaborador_llave, corrida_id, motivo_sin_corrida, tipo_nomina, periodicidad_pago, fecha_pago, fecha_final_pago, total_percepciones_c, isr_retenido_c, total_c, n_errores, ' +
    "json_extract(datos_json, '$.tipo_relacion') AS tipo_relacion, json_extract(datos_json, '$.errores') AS errores FROM comprobante WHERE ingesta_id = ?1 ORDER BY archivo").bind(ing.id).all();
  // La corrida se vuelve a asignar con el calendario vigente: si se corrigió el calendario, «Volver a cruzar» lo toma.
  // El comprobante leído no cambia (es inmutable); la asignación vigente vive en el cruce.
  const { results: calVig } = await db.prepare('SELECT corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria FROM calendario_nomina WHERE encargo_id = ?1').bind(ing.encargo_id).all();
  let reasig = 0;
  for (const c of comps) {
    if (/^comprobante inválido/.test(c.motivo_sin_corrida || '')) continue;
    const a = asignarCorrida(c, calVig);
    if ((a.corrida_id || null) === (c.corrida_id || null)) continue;
    c.corrida_id = a.corrida_id || null; c.motivo_sin_corrida = a.motivo || null;
    reasig += 1;
  }
  const { results: est } = await db.prepare('SELECT uuid, estatus FROM cfdi_estado_sat WHERE encargo_id = ?1').bind(ing.encargo_id).all();
  const estado = new Map(est.map(e => [e.uuid, e.estatus]));
  const ph = RUBROS_CRUCE.map((_, i) => '?' + (i + 2)).join(',');
  const { results: movs } = await db.prepare('SELECT id, colaborador_id, rfc, corrida_id, rubro, valor_c FROM movimiento_nomina WHERE ingesta_id = ?1 AND rubro IN (' + ph + ')')
    .bind(pre.id, ...RUBROS_CRUCE).all();

  const vistos = new Map(), duplicados = [], sinCorrida = {}, invalidos = [], conErrores = [];
  let cancelados = 0, sinEstado = 0, sustituciones = 0;
  const vigentes = [];
  for (const c of comps) {
    const contarSinCorrida = () => {
      const m = (c.motivo_sin_corrida || 'sin corrida').replace(/\d{4}-\d{2}-\d{2}/g, 'AAAA-MM-DD');
      sinCorrida[m] = (sinCorrida[m] || 0) + 1;
    };
    if (!c.corrida_id && /^comprobante inválido/.test(c.motivo_sin_corrida || '')) { contarSinCorrida(); invalidos.push(c.archivo); continue; }
    if (vistos.has(c.uuid)) { duplicados.push({ uuid: c.uuid, archivos: [vistos.get(c.uuid), c.archivo] }); continue; }
    vistos.set(c.uuid, c.archivo);
    const e = estado.get(c.uuid);
    if (e === 'cancelado') { cancelados += 1; continue; }
    vigentes.push(c);
  }
  const nomina = movs.map(m => ({ colaborador_llave: ing.llave === 'rfc' ? (m.rfc || '') : llaveBase(m.colaborador_id), corrida_id: m.corrida_id, rubro: m.rubro, valor_c: m.valor_c, movimiento_id: m.id }))
    .filter(m => m.colaborador_llave);
  const sinRfc = ing.llave === 'rfc' ? movs.filter(m => !m.rfc).length : 0;
  // Bonos, finiquitos y demás pagos fuera de la nómina ordinaria: su CFDI se busca por colaborador e importe.
  const { results: cal } = await db.prepare('SELECT corrida_id FROM calendario_nomina WHERE encargo_id = ?1 AND ordinaria = 1').bind(ing.encargo_id).all();
  const emp = emparejarExtras(nomina, vigentes, new Set(cal.map(x => x.corrida_id)));
  const validos = [];
  for (const c of emp.cfdis) {
    if (c.corrida_id) {
      if (!estado.get(c.uuid)) sinEstado += 1;
      if (c.tipo_relacion === '04') sustituciones += 1;
      if (c.n_errores) conErrores.push({ archivo: c.archivo, uuid: c.uuid, errores: JSON.parse(c.errores || '[]').slice(0, 3) });
      validos.push(c); continue;
    }
    const m = (c.motivo_sin_corrida || 'sin corrida').replace(/\d{4}-\d{2}-\d{2}/g, 'AAAA-MM-DD');
    sinCorrida[m] = (sinCorrida[m] || 0) + 1;
  }
  const pagosExtra = {};
  for (const x of emp.reasignados) {
    const g = pagosExtra[x.a] || (pagosExtra[x.a] = { cfdi: 0, desde_corrida: {}, sin_corrida: 0 });
    g.cfdi += 1;
    if (x.de) g.desde_corrida[x.de] = (g.desde_corrida[x.de] || 0) + 1; else g.sin_corrida += 1;
  }
  const r = cruzarNominaCfdi(nomina, validos);
  // Por corrida: deja ver de un vistazo si al paquete le falta una semana completa.
  const porCorrida = {};
  const cuenta = (cid, k) => { const x = porCorrida[cid] || (porCorrida[cid] = { nomina: 0, cfdi: 0, sin_cfdi: 0, sin_nomina: 0, diferencias: 0 }); x[k] += 1; };
  new Set(nomina.map(m => m.corrida_id + '|' + m.colaborador_llave)).forEach(x => cuenta(x.split('|')[0], 'nomina'));
  new Set(validos.map(c => c.corrida_id + '|' + c.colaborador_llave)).forEach(x => cuenta(x.split('|')[0], 'cfdi'));
  for (const x of r.cruces) cuenta(x.corrida_id, x.tipo === 'diferencia' ? 'diferencias' : x.tipo);
  const corte = ahoraISO();
  const filas = [];
  for (const x of r.cruces) {
    const id = 'cru_' + (await sha256Hex([ing.id, pre.id, x.tipo, x.colaborador_llave, x.corrida_id, x.rubro, x.nomina_c, x.cfdi_c, x.uuids].join('|'))).slice(0, 24);
    filas.push([id, ing.encargo_id, ing.id, pre.id, corte, x.tipo, x.colaborador_llave, x.corrida_id, x.rubro, x.movimiento_id, x.uuids, x.nomina_c, x.cfdi_c]);
  }
  const st = [];
  const COLS = 'id, encargo_id, ingesta_cfdi_id, prenomina_ingesta_id, corte, tipo, colaborador_llave, corrida_id, rubro, movimiento_id, uuids, nomina_c, cfdi_c';
  for (let i = 0; i < filas.length; i += 7) {
    const g = filas.slice(i, i + 7);
    let k = 0;
    const vals = g.map(() => '(' + Array.from({ length: 13 }, () => '?' + (++k)).join(',') + ')').join(',');
    st.push(db.prepare('INSERT INTO cruce_cfdi (' + COLS + ') VALUES ' + vals + ' ON CONFLICT (id) DO UPDATE SET corte = excluded.corte').bind(...g.flat()));
  }
  // Estado del módulo 4.2: nunca «completo» si algo del universo quedó fuera o sin verificar.
  const motivos = [];
  const nSinCorrida = Object.values(sinCorrida).reduce((s, n) => s + n, 0);
  if (nSinCorrida) motivos.push(nSinCorrida + ' comprobantes sin corrida del calendario o inválidos');
  if (duplicados.length) motivos.push(duplicados.length + ' UUID repetidos en el paquete');
  if (sinEstado) motivos.push(sinEstado + ' comprobantes sin estado ante el SAT (falta la metadata)');
  if (r.rubros_sin_dato_en_nomina.length) motivos.push('La prenómina no trae ' + r.rubros_sin_dato_en_nomina.join(', '));
  if (sinRfc) motivos.push(sinRfc + ' renglones de la prenómina sin RFC');
  const reporte = { ...(JSON.parse(ing.reporte_json || '{}')), prenomina_ingesta_id: pre.id, ejecucion_id: pre.ejecucion_id, corte, llave: ing.llave,
    comprobantes: comps.length, validos: validos.length, invalidos: invalidos.length, muestra_invalidos: invalidos.slice(0, 20), sin_corrida: sinCorrida,
    duplicados: duplicados.length, muestra_duplicados: duplicados.slice(0, 20), cancelados, sin_estado_sat: sinEstado, sustituciones,
    corridas_reasignadas_por_calendario: reasig,
    pagos_extra: { cfdi_emparejados: emp.reasignados.length, por_corrida: pagosExtra, muestra: emp.reasignados.slice(0, 20) },
    con_errores_internos: conErrores.length, muestra_errores: conErrores.slice(0, 20),
    cruce: { coincidencias: r.coincidencias, con_diferencia: r.con_diferencia, por_tipo: r.por_tipo, multiples_cfdi: r.multiples_cfdi, llaves_nomina: r.llaves_nomina, llaves_cfdi: r.llaves_cfdi,
      rubros_sin_dato_en_nomina: r.rubros_sin_dato_en_nomina, por_corrida: porCorrida },
    modulo_4_2: { estado: motivos.length ? 'universo_parcial' : 'completo', motivos, esperado: r.llaves_nomina, efectivo: r.coincidencias + r.con_diferencia } };
  await lotesDb(db, [...st, db.prepare("UPDATE ingesta_cfdi SET estado = 'terminado', prenomina_ingesta_id = ?2, ejecucion_id = ?3, corte_actual = ?4, reporte_json = ?5, actualizado_en = datetime('now') WHERE id = ?1")
    .bind(ing.id, pre.id, pre.ejecucion_id, corte, JSON.stringify(reporte))]);
  return 'terminado';
}

async function tomar(db, id) {
  const ahora = Date.now();
  const r = await db.prepare('UPDATE ingesta_cfdi SET tomado_hasta = ?2, intentos = intentos + 1 WHERE id = ?1 AND (tomado_hasta IS NULL OR tomado_hasta < ?3)')
    .bind(id, new Date(ahora + CANDADO_MS).toISOString(), new Date(ahora).toISOString()).run();
  return (r.meta?.changes ?? r.changes ?? 0) === 1;
}

export async function avanzarCfdi(env, { ingesta_id, presupuesto_ms = 20000 } = {}) {
  const db = env.DB;
  const hasta = Date.now() + presupuesto_ms;
  const ing0 = ingesta_id
    ? await db.prepare('SELECT * FROM ingesta_cfdi WHERE id = ?1').bind(ingesta_id).first()
    : await db.prepare("SELECT * FROM ingesta_cfdi WHERE estado IN ('pendiente','leyendo','cruzando') AND (tomado_hasta IS NULL OR tomado_hasta < ?1) ORDER BY actualizado_en LIMIT 1").bind(ahoraISO()).first();
  if (!ing0) return { estado: 'sin_trabajo' };
  if (!ACTIVOS.includes(ing0.estado)) return { id: ing0.id, estado: ing0.estado };
  if (!(await tomar(db, ing0.id))) return { id: ing0.id, estado: ing0.estado, ocupado: true };
  try {
    let estado = ing0.estado;
    while (Date.now() < hasta && ACTIVOS.includes(estado)) {
      const ing = await db.prepare('SELECT * FROM ingesta_cfdi WHERE id = ?1').bind(ing0.id).first();
      if (estado === 'pendiente') estado = await fasePendiente(env, ing);
      else if (estado === 'leyendo') estado = await faseLeyendo(env, ing, hasta);
      else if (estado === 'cruzando') estado = await faseCruzando(env, ing);
    }
    return { id: ing0.id, estado };
  } catch (e) {
    await db.prepare("UPDATE ingesta_cfdi SET estado = 'error', error = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(ing0.id, String(e && e.stack || e).slice(0, 4000)).run();
    return { id: ing0.id, estado: 'error', error: String(e.message || e) };
  } finally {
    await db.prepare("UPDATE ingesta_cfdi SET tomado_hasta = NULL, actualizado_en = datetime('now') WHERE id = ?1").bind(ing0.id).run();
  }
}

export async function estadoIngestaCfdi(db, id) {
  const i = await db.prepare('SELECT id, encargo_id, tipo, archivo_nombre, archivo_sha256, tamano, llave, estado, lotes_total, lotes_hechos, entradas, prenomina_ingesta_id, ejecucion_id, corte_actual, ' +
    'reporte_json, error, intentos, creado_en, actualizado_en FROM ingesta_cfdi WHERE id = ?1').bind(id).first();
  if (!i) return null;
  return { ...i, reporte: i.reporte_json ? JSON.parse(i.reporte_json) : null, reporte_json: undefined, avance: i.lotes_total ? Math.round(100 * i.lotes_hechos / i.lotes_total) : 0 };
}

/** Reintentar desde la fase en que quedó; o volver a cruzar (p. ej. llegó la metadata o una prenómina nueva). */
export async function reintentarCfdi(db, id, { recruzar = false } = {}) {
  const i = await db.prepare('SELECT * FROM ingesta_cfdi WHERE id = ?1').bind(id).first();
  if (!i) return false;
  let estado;
  if (recruzar) { if (i.tipo !== 'xml_nomina' || !['terminado', 'error'].includes(i.estado) || !i.lotes_total || i.lotes_hechos < i.lotes_total) return false; estado = 'cruzando'; }
  else {
    if (i.estado !== 'error') return false;
    estado = !i.lotes_total ? 'pendiente' : i.lotes_hechos < i.lotes_total ? 'leyendo' : i.tipo === 'metadata_sat' ? 'terminado' : 'cruzando';
  }
  await db.prepare("UPDATE ingesta_cfdi SET estado = ?2, error = NULL, tomado_hasta = NULL, actualizado_en = datetime('now') WHERE id = ?1").bind(id, estado).run();
  return estado;
}
