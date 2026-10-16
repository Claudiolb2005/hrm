// trabajos.js — Cola de ingesta en el servidor (T8).
//
// «El portal deja el archivo en R2 sin procesar, encola un trabajo, un consumidor lo procesa
// por lotes idempotentes escribiendo a D1 y re-encolando el siguiente, el portal muestra el
// avance, y al terminar dispara las pruebas.» La cola vive en D1 (tabla ingesta); la consumen
// el cron del Worker (cada minuto) y POST /api/kernel/ingestas/:id/avanzar.
//
// Fases:  pendiente → calculando (lotes) → mensual (AJM, ISN) → cerrando (sello + reconciliación) → terminado
// Cada paso es idempotente: ids deterministas, INSERT OR IGNORE, y un candado con vencimiento.
import { abrirLibro, fuenteBuffer } from './xlsx.js';
import { detectarEncabezado, construirMapa, renglonCanonico } from './canonico.js';
import { itemsDeRenglon, itemsMensuales, ultimasDelMes } from './items.js';
import { abrirEjecucion, calcularLote, cerrarEjecucion } from '../kernel/src/ejecutar.js';
import { reconciliar } from '../kernel/src/reconciliacion.js';
import { cargarCatalogo, persistirApertura, sentenciasLote, leerLotes, persistirCierre, insertarMultiple, verificarArranque } from '../kernel/src/d1.js';
import { sha256Hex, nuevoId } from '../kernel/src/sello.js';
import prime from './perfiles/prime.js';

export const PERFILES = { prime };
export const RENGLONES_POR_LOTE = 250;
const LOTES_POR_PASO = 6;
const CANDADO_MS = 120000;
const MOV_COLS = 'id, encargo_id, ingesta_id, corrida_id, colaborador_id, rubro, valor_c, archivo_sha256, renglon_origen';
const RUBROS_CONCILIADOS = ['isr', 'isn'];

const ahoraISO = () => new Date().toISOString();

async function ejecutarLotes(db, sentencias) {
  for (let i = 0; i < sentencias.length; i += 50) await db.batch(sentencias.slice(i, i + 50));
}

export async function crearIngesta(env, { encargo_id, tipo = 'prenomina', perfil = 'prime', r2_key, archivo_nombre, usuario_id }) {
  if (!PERFILES[perfil]) throw new Error('Perfil desconocido: ' + perfil);
  const enc = await env.DB.prepare('SELECT id FROM encargo WHERE id = ?1').bind(encargo_id).first();
  if (!enc) throw new Error('Encargo no existe');
  const head = await env.DOCS.head(r2_key);
  if (!head) throw new Error('El archivo no está en R2: ' + r2_key);
  const id = nuevoId('ing');
  await env.DB.prepare('INSERT INTO ingesta (id, encargo_id, tipo, perfil, r2_key, archivo_nombre, tamano, creado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
    .bind(id, encargo_id, tipo, perfil, r2_key, archivo_nombre || r2_key.split('/').pop(), head.size, usuario_id ?? null).run();
  return id;
}

async function tomar(db, id) {
  const ahora = Date.now();
  const r = await db.prepare('UPDATE ingesta SET tomado_hasta = ?2, intentos = intentos + 1 WHERE id = ?1 AND (tomado_hasta IS NULL OR tomado_hasta < ?3)')
    .bind(id, new Date(ahora + CANDADO_MS).toISOString(), new Date(ahora).toISOString()).run();
  return (r.meta?.changes ?? r.changes ?? 0) === 1;
}
async function soltar(db, id) {
  await db.prepare("UPDATE ingesta SET tomado_hasta = NULL, actualizado_en = datetime('now') WHERE id = ?1").bind(id).run();
}

async function contexto(db, ing, catalogo) {
  const enc = await db.prepare('SELECT * FROM encargo WHERE id = ?1').bind(ing.encargo_id).first();
  const { results: cal } = await db.prepare('SELECT * FROM calendario_nomina WHERE encargo_id = ?1').bind(ing.encargo_id).all();
  const calendario = new Map(cal.map(c => [c.corrida_id, { periodicidad: c.periodicidad, desde: c.desde, hasta: c.hasta, fecha_pago: c.fecha_pago, ordinaria: c.ordinaria === 1 }]));
  const { results: regs } = await db.prepare('SELECT registro, entidad FROM registro_patronal WHERE empresa_id = ?1 AND entidad IS NOT NULL').bind(enc.empresa_id).all();
  return { encargo: enc, encargo_id: enc.id, calendario, ultimaDelMes: ultimasDelMes(calendario), entidades: new Map(regs.map(r => [r.registro, r.entidad])),
    perfil: PERFILES[ing.perfil], catalogo, aplicaAjuste: enc.aplica_ajuste_mensual === 1 };
}

// ── Fase 1: leer el archivo (streaming), validar el mapa, partir en lotes canónicos en R2 y abrir la ejecución.
async function fasePendiente(env, ing) {
  const db = env.DB;
  const perfil = PERFILES[ing.perfil];
  const obj = await env.DOCS.get(ing.r2_key);
  if (!obj) throw new Error('El archivo ya no está en R2');
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const archivo_sha256 = await sha256Hex(bytes);
  const libro = await abrirLibro(fuenteBuffer(bytes));

  // Hoja: la más grande (el acumulado trae hojas auxiliares). Se decide por el tamaño
  // descomprimido de su XML en el directorio del ZIP, sin recorrerlas.
  let hoja = libro.hojas[0].nombre;
  if (perfil.hoja === 'mayor' && libro.hojas.length > 1) {
    let mejor = -1;
    for (const h of libro.hojas) { const t = libro.zip.entradas.get(h.ruta)?.original || 0; if (t > mejor) { mejor = t; hoja = h.nombre; } }
  }

  const primeros = [];
  let mapa = null, filaEnc = null;
  const lotes = [];
  let actual = [];
  const excluidos = {}, corridas = {}, sinCalendario = {};
  const vistos = new Map();
  let renglones = 0, duplicados = 0;
  const catalogo = await cargarCatalogo(db);
  const ctx = await contexto(db, ing, catalogo);
  const pendientesEscritura = [];

  const cerrarLote = async () => {
    if (!actual.length) return;
    const n = lotes.length + 1;
    const key = 'ingestas/' + ing.id + '/lote-' + String(n).padStart(4, '0') + '.ndjson';
    pendientesEscritura.push(env.DOCS.put(key, actual.map(r => JSON.stringify(r)).join('\n') + '\n', { httpMetadata: { contentType: 'application/x-ndjson' } }));
    lotes.push({ n, key, renglones: actual.length });
    actual = [];
  };

  await libro.recorrer(hoja, async (fila, numero) => {
    if (!mapa) {
      primeros.push(fila);
      if (primeros.length < perfil.encabezado.buscar_en_primeros) return;
      const i = detectarEncabezado(primeros, perfil);
      if (i === null) throw new Error('No se encontró el renglón de encabezado del perfil ' + perfil.id);
      filaEnc = i + 1;
      mapa = construirMapa(primeros[i], perfil);
      if (mapa.faltantes.length) throw new Error('Columnas requeridas faltantes: ' + mapa.faltantes.join(', '));
      for (let k = i + 1; k < primeros.length; k++) await procesar(primeros[k], k + 1);
      return;
    }
    await procesar(fila, numero);
  });
  if (!mapa) { // archivo con menos renglones que la ventana de búsqueda
    const i = detectarEncabezado(primeros, perfil);
    if (i === null) throw new Error('No se encontró el renglón de encabezado del perfil ' + perfil.id);
    filaEnc = i + 1; mapa = construirMapa(primeros[i], perfil);
    if (mapa.faltantes.length) throw new Error('Columnas requeridas faltantes: ' + mapa.faltantes.join(', '));
    for (let k = i + 1; k < primeros.length; k++) await procesar(primeros[k], k + 1);
  }

  async function procesar(fila, numero) {
    const r = renglonCanonico(fila, numero, mapa, perfil);
    if (!r) return;
    if (r.excluido) { excluidos[r.excluido] = (excluidos[r.excluido] || 0) + 1; return; }
    renglones += 1;
    corridas[r.corrida_id] = (corridas[r.corrida_id] || 0) + 1;
    if (!ctx.calendario.has(r.corrida_id)) sinCalendario[r.corrida_id] = (sinCalendario[r.corrida_id] || 0) + 1;
    // Un colaborador con dos renglones en la misma corrida (dos registros) se separa por registro.
    const k = r.corrida_id + '|' + r.colaborador_id;
    if (vistos.has(k)) { duplicados += 1; r.colaborador_id = r.colaborador_id + '#' + (r.registro || numero); }
    vistos.set(k, true);
    actual.push(r);
    if (actual.length >= RENGLONES_POR_LOTE) await cerrarLote();
  }
  await cerrarLote();
  await Promise.all(pendientesEscritura);
  if (!renglones) throw new Error('El archivo no tiene renglones de datos');

  const excluidosCal = Object.values(sinCalendario).reduce((s, n) => s + n, 0);
  const fuentes = {
    // Cada renglón de datos debe producir su base gravable (EXE); el resto de reglas se mide contra sus ítems.
    prenomina: { estado: excluidosCal ? 'incompleta' : 'completa', sha256: archivo_sha256, universo_por_regla: { 'CALC-EXE-001': renglones },
      excluidos: Object.entries(sinCalendario).map(([corrida, n]) => ({ corrida, renglones: n, motivo: 'calendario_faltante' })) },
    catalogo_conceptos_cliente: { estado: mapa.no_catalogados.length || mapa.ambiguos.length ? 'incompleta' : 'completa',
      perfil: perfil.id + '@' + perfil.version, excluidos: [...mapa.no_catalogados.map(c => c.encabezado), ...mapa.ambiguos.map(a => a.encabezado + ' (ambiguo)')] },
    matriz_isn_concepto: { estado: 'incompleta', excluidos: ['Cuadro concepto × entidad sin fundamento por celda (V8); sólo CDMX cargado'] },
  };
  if (mapa.cols.fecha_ingreso !== undefined) fuentes.fecha_ingreso = { estado: 'completa' };
  if (ctx.entidades.size) fuentes.entidad_por_registro = { estado: 'incompleta', nota: 'se marca completa cuando todos los registros del archivo tienen entidad' };

  const ejecucion = await abrirEjecucion({ catalogo, encargo_id: ing.encargo_id, fuentes, ahora: ahoraISO() });
  await persistirApertura(db, ejecucion, { catalogo });
  const reporte = {
    hoja, fila_encabezado: filaEnc, columnas_archivo: mapa.columnas_archivo, renglones, duplicados_por_registro: duplicados,
    excluidos, corridas, sin_calendario: sinCalendario,
    mapa: { columnas: Object.keys(mapa.cols), conceptos: mapa.conceptos.map(c => c.encabezado), no_catalogados: mapa.no_catalogados.map(c => c.encabezado),
      ambiguos: mapa.ambiguos, movimientos: Object.fromEntries(Object.entries(mapa.movimientos).map(([k, v]) => [k, v.length])) },
    fuentes,
  };
  await ejecutarLotes(db, [
    ...insertarMultiple(db, 'ingesta_lote', 'ingesta_id, n, r2_key, renglones', lotes.map(l => [ing.id, l.n, l.key, l.renglones])),
    db.prepare("UPDATE ingesta SET estado = 'calculando', archivo_sha256 = ?2, ejecucion_id = ?3, lotes_total = ?4, renglones = ?5, reporte_json = ?6, error = NULL, actualizado_en = datetime('now') WHERE id = ?1")
      .bind(ing.id, archivo_sha256, ejecucion.id, lotes.length, renglones, JSON.stringify(reporte)),
  ]);
}

async function leerNdjson(env, key) {
  const o = await env.DOCS.get(key);
  if (!o) throw new Error('Falta el lote ' + key);
  return (await o.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
}

async function ejecucionAbierta(db, id) {
  const e = await db.prepare('SELECT * FROM ejecucion WHERE id = ?1').bind(id).first();
  return { id: e.id, encargo_id: e.encargo_id, kernel_version: e.kernel_version, kernel_huella: e.kernel_huella, version_catalogo_reglas: e.version_catalogo_reglas,
    version_parametros: e.version_parametros, entradas_sha256: JSON.parse(e.entradas_sha256_json), abierta_en: e.abierta_en, estado: e.estado };
}

// ── Fase 2: un lote a la vez. Idempotente: si se repite, produce los mismos ids y el mismo sello.
async function faseCalculando(env, ing, hasta) {
  const db = env.DB;
  const catalogo = await cargarCatalogo(db);
  const ctx = await contexto(db, ing, catalogo);
  const reporte = JSON.parse(ing.reporte_json);
  const ejecucion = await ejecucionAbierta(db, ing.ejecucion_id);
  let hechos = 0;
  while (Date.now() < hasta && hechos < LOTES_POR_PASO) {
    const lote = await db.prepare("SELECT * FROM ingesta_lote WHERE ingesta_id = ?1 AND estado = 'pendiente' ORDER BY n LIMIT 1").bind(ing.id).first();
    if (!lote) {
      await db.prepare("UPDATE ingesta SET estado = 'mensual', actualizado_en = datetime('now') WHERE id = ?1").bind(ing.id).run();
      return 'mensual';
    }
    const renglones = await leerNdjson(env, lote.r2_key);
    const items = [], movimientos = [];
    for (const r of renglones) {
      const x = await itemsDeRenglon(r, ctx, ing.archivo_sha256, ing.id);
      items.push(...x.items);
      movimientos.push(...x.movimientos.filter(m => RUBROS_CONCILIADOS.includes(m.rubro)));
    }
    const res = await calcularLote({ catalogo, ejecucion, fuentes: reporte.fuentes, items, lote: lote.n, ahora: ejecucion.abierta_en });
    await ejecutarLotes(db, [
      ...sentenciasLote(db, res, { ejecucion_id: ejecucion.id, ejercicio: ctx.encargo.ejercicio }),
      ...insertarMultiple(db, 'movimiento_nomina', MOV_COLS, movimientos.map(m => [m.id, m.encargo_id, m.ingesta_id, m.corrida_id, m.colaborador_id, m.rubro, m.valor_c, m.archivo_sha256, m.renglon_origen])),
      db.prepare("UPDATE ingesta_lote SET estado = 'hecho' WHERE ingesta_id = ?1 AND n = ?2").bind(ing.id, lote.n),
      db.prepare("UPDATE ingesta SET lotes_hechos = (SELECT count(*) FROM ingesta_lote WHERE ingesta_id = ?1 AND estado = 'hecho'), actualizado_en = datetime('now') WHERE id = ?1").bind(ing.id),
    ]);
    hechos += 1;
  }
  return 'calculando';
}

// ── Fase 3: ajuste mensual de ISR e ISN por registro (necesitan el mes completo).
async function faseMensual(env, ing) {
  const db = env.DB;
  const catalogo = await cargarCatalogo(db);
  const ctx = await contexto(db, ing, catalogo);
  const reporte = JSON.parse(ing.reporte_json);
  const ejecucion = await ejecucionAbierta(db, ing.ejecucion_id);
  const { results: lotes } = await db.prepare('SELECT r2_key FROM ingesta_lote WHERE ingesta_id = ?1 ORDER BY n').bind(ing.id).all();
  const renglones = [];
  for (const l of lotes) renglones.push(...await leerNdjson(env, l.r2_key));
  const m = await itemsMensuales(renglones, ctx, ing.archivo_sha256, ing.id);
  const fuentes = { ...reporte.fuentes };
  if (fuentes.entidad_por_registro && m.reporte.isn_sin_entidad.length === 0) fuentes.entidad_por_registro = { estado: 'completa' };
  reporte.fuentes = fuentes;
  reporte.mensual = m.reporte;
  const n = ing.lotes_total + 1;
  const res = await calcularLote({ catalogo, ejecucion, fuentes, items: m.items, lote: n, ahora: ejecucion.abierta_en });
  await ejecutarLotes(db, [
    ...sentenciasLote(db, res, { ejecucion_id: ejecucion.id, ejercicio: ctx.encargo.ejercicio }),
    ...insertarMultiple(db, 'movimiento_nomina', MOV_COLS, m.movimientos.map(x => [x.id, x.encargo_id, x.ingesta_id, x.corrida_id, x.colaborador_id, x.rubro, x.valor_c, x.archivo_sha256, x.renglon_origen])),
    db.prepare("UPDATE ingesta SET estado = 'cerrando', reporte_json = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(ing.id, JSON.stringify(reporte)),
  ]);
  return 'cerrando';
}

// ── Fase 4: sellar la ejecución y reconciliar contra lo que calculó la nómina actual.
async function faseCerrando(env, ing) {
  const db = env.DB;
  const reporte = JSON.parse(ing.reporte_json);
  const ejecucion = await ejecucionAbierta(db, ing.ejecucion_id);
  if (ejecucion.estado === 'abierta') {
    const lotes = await leerLotes(db, ejecucion.id);
    const { estado, ...abierta } = ejecucion;
    const cerrada = await cerrarEjecucion({ ejecucion: abierta, lotes, fuentes: reporte.fuentes, ahora: ahoraISO() });
    await persistirCierre(db, cerrada);
  }
  const { results: rr } = await db.prepare('SELECT regla_id, estado, universo_esperado, universo_efectivo, excluidos_json FROM resultado_regla WHERE ejecucion_id = ?1 ORDER BY regla_id').bind(ejecucion.id).all();
  reporte.resultados = rr.map(r => { const x = JSON.parse(r.excluidos_json); return { regla_id: r.regla_id, estado: r.estado, esperado: r.universo_esperado,
    efectivo: r.universo_efectivo, excluidos: x.total, por_motivo: x.por_motivo }; });
  const ph = RUBROS_CONCILIADOS.map((_, i) => '?' + (i + 2)).join(',');
  const { results: calcs } = await db.prepare('SELECT id, colaborador_id, rubro, corrida_id, valor_calculado_c, limitado, regla_id FROM calculo_kernel WHERE ejecucion_id = ?1 AND rubro IN (' + ph + ')')
    .bind(ejecucion.id, ...RUBROS_CONCILIADOS).all();
  const { results: movs } = await db.prepare('SELECT id, colaborador_id, rubro, corrida_id, valor_c FROM movimiento_nomina WHERE ingesta_id = ?1').bind(ing.id).all();
  const rec = reconciliar(calcs.map(c => ({ ...c, limitado: c.limitado === 1 })), movs.map(m => ({ ...m, movimiento_ref: m.id })));
  await ejecutarLotes(db, insertarMultiple(db, 'diferencia', 'id, calculo_kernel_id, movimiento_id',
    rec.diferencias.map(d => ['dif_' + d.calculo_kernel_id.slice(5), d.calculo_kernel_id, d.movimiento_ref])));
  // Resumen por regla y rubro, y las diferencias agrupadas por importe (para clasificar en bloque).
  const porRegla = {};
  const reglaDe = new Map(calcs.map(c => [c.id, c.regla_id]));
  for (const d of rec.diferencias) {
    const k = reglaDe.get(d.calculo_kernel_id) + '|' + d.rubro;
    const g = porRegla[k] || (porRegla[k] = { diferencias: 0, suma_c: 0, por_importe: {} });
    g.diferencias += 1; g.suma_c += d.diferencia_c;
    g.por_importe[d.diferencia_c] = (g.por_importe[d.diferencia_c] || 0) + 1;
  }
  for (const g of Object.values(porRegla)) g.por_importe = Object.entries(g.por_importe).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c, n]) => ({ diferencia_c: Number(c), n }));
  reporte.reconciliacion = { coincidencias: rec.coincidencias, coincidencias_limitadas: rec.coincidencias_limitadas, diferencias: rec.diferencias.length,
    limitados: rec.limitados.length, sin_par_cliente: rec.sin_par_cliente.length, sin_par_kernel: rec.sin_par_kernel.length, por_regla: porRegla };
  await db.prepare("UPDATE ingesta SET estado = 'terminado', reporte_json = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(ing.id, JSON.stringify(reporte)).run();
  return 'terminado';
}

/**
 * Avanza una ingesta (o la más antigua activa) hasta agotar el presupuesto de tiempo.
 * Devuelve el estado final. Seguro de llamar en paralelo: el candado evita doble proceso.
 */
export async function avanzar(env, { ingesta_id, presupuesto_ms = 20000 } = {}) {
  const db = env.DB;
  const hasta = Date.now() + presupuesto_ms;
  const ing0 = ingesta_id
    ? await db.prepare('SELECT * FROM ingesta WHERE id = ?1').bind(ingesta_id).first()
    : await db.prepare("SELECT * FROM ingesta WHERE estado IN ('pendiente','calculando','mensual','cerrando') AND (tomado_hasta IS NULL OR tomado_hasta < ?1) ORDER BY actualizado_en LIMIT 1").bind(ahoraISO()).first();
  if (!ing0) return { estado: 'sin_trabajo' };
  if (['terminado', 'error'].includes(ing0.estado)) return { id: ing0.id, estado: ing0.estado };
  if (!(await tomar(db, ing0.id))) return { id: ing0.id, estado: ing0.estado, ocupado: true };
  try {
    const sinFuentes = await verificarArranque(db);
    if (sinFuentes.length) throw new Error('Matriz incompleta; el kernel no arranca: ' + sinFuentes.join(', '));
    let estado = ing0.estado;
    while (Date.now() < hasta && !['terminado', 'error'].includes(estado)) {
      const ing = await db.prepare('SELECT * FROM ingesta WHERE id = ?1').bind(ing0.id).first();
      if (estado === 'pendiente') { await fasePendiente(env, ing); estado = 'calculando'; }
      else if (estado === 'calculando') estado = await faseCalculando(env, ing, hasta);
      else if (estado === 'mensual') estado = await faseMensual(env, ing);
      else if (estado === 'cerrando') estado = await faseCerrando(env, ing);
    }
    return { id: ing0.id, estado };
  } catch (e) {
    await db.prepare("UPDATE ingesta SET estado = 'error', error = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(ing0.id, String(e && e.stack || e).slice(0, 4000)).run();
    return { id: ing0.id, estado: 'error', error: String(e.message || e) };
  } finally {
    await soltar(db, ing0.id);
  }
}

export async function estadoIngesta(db, id) {
  const i = await db.prepare('SELECT id, encargo_id, tipo, perfil, archivo_nombre, archivo_sha256, tamano, estado, ejecucion_id, lotes_total, lotes_hechos, renglones, reporte_json, error, intentos, creado_en, actualizado_en FROM ingesta WHERE id = ?1').bind(id).first();
  if (!i) return null;
  return { ...i, reporte: i.reporte_json ? JSON.parse(i.reporte_json) : null, reporte_json: undefined,
    avance: i.lotes_total ? Math.round(100 * i.lotes_hechos / i.lotes_total) : 0 };
}

/** Reintentar una ingesta en error desde la fase en que quedó (los pasos son idempotentes). */
export async function reintentar(db, id) {
  const i = await db.prepare('SELECT * FROM ingesta WHERE id = ?1').bind(id).first();
  if (!i || i.estado !== 'error') return false;
  let estado = 'pendiente';
  if (i.ejecucion_id) {
    const e = await db.prepare('SELECT estado FROM ejecucion WHERE id = ?1').bind(i.ejecucion_id).first();
    const pend = await db.prepare("SELECT count(*) n FROM ingesta_lote WHERE ingesta_id = ?1 AND estado = 'pendiente'").bind(id).first();
    estado = e.estado === 'sellada' ? 'cerrando' : pend.n > 0 ? 'calculando' : 'mensual';
  }
  await db.prepare("UPDATE ingesta SET estado = ?2, error = NULL, tomado_hasta = NULL, actualizado_en = datetime('now') WHERE id = ?1").bind(id, estado).run();
  return estado;
}
