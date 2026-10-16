// api/requerimiento.js — Requerimiento de información (módulo 23) y el encargo visto por el cliente (módulos 25 y 27).
//
// Admin:   /api/kernel/requerimiento (GET ?encargo_id) · /requerimiento/generar · /requerimiento/item
//          /requerimiento/archivo/revisar · /requerimiento/archivo/procesar
// Cliente: /api/encargos · /api/encargo?id= · /api/encargo/archivo (multipart) · /api/encargo/hallazgo
//
// El cliente sólo ve encargos de su empresa; de los hallazgos, sólo los que ya salieron en un dictamen
// emitido (lo que está en revisión es papel de trabajo). Nunca cierra un hallazgo: propone responsable,
// fecha y avance, y queda en la bitácora con su nombre.
import { listaPBC, FUENTES } from '../kernel/src/index.js';
import { crearIngesta, avanzar } from '../ingesta/trabajos.js';
import { crearIngestaCfdi, avanzarCfdi } from '../ingesta/cfdi.js';
import { nuevoId } from '../kernel/src/sello.js';

// Sin estas dos no hay opinión (D13), aunque ninguna regla las marque como obligatorias.
export const ESENCIALES = ['prenomina', 'xml_nomina'];
// Fuentes que no declara una regla CALC pero que el dictamen usa (cruce de afiliación, D7 cualitativo).
export const ADICIONALES = ['maestro_empleados'];
const ESTADOS = ['pendiente', 'entregada', 'completa', 'incompleta', 'no_aplica'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX = 95 * 1024 * 1024;

async function cuerpo(request) { try { return await request.json(); } catch { return null; } }

/**
 * Estado efectivo de cada fuente: lo que demuestran las ingestas manda sobre lo capturado a mano
 * (una prenómina terminada con corridas sin calendario es «incompleta», diga lo que diga la captura).
 */
export async function requerimientoDe(db, encargo_id) {
  const { results: items } = await db.prepare('SELECT * FROM requerimiento WHERE encargo_id = ?1').bind(encargo_id).all();
  const { results: arch } = await db.prepare('SELECT id, fuente_clave, nombre, tamano, subido_en, revision, nota_revision, revisado_en, ingesta_id FROM requerimiento_archivo WHERE encargo_id = ?1 ORDER BY subido_en DESC').bind(encargo_id).all();
  const pre = await db.prepare("SELECT reporte_json, actualizado_en FROM ingesta WHERE encargo_id = ?1 AND tipo = 'prenomina' AND estado = 'terminado' ORDER BY actualizado_en DESC LIMIT 1").bind(encargo_id).first();
  const xml = await db.prepare("SELECT reporte_json, actualizado_en FROM ingesta_cfdi WHERE encargo_id = ?1 AND tipo = 'xml_nomina' AND estado = 'terminado' ORDER BY actualizado_en DESC LIMIT 1").bind(encargo_id).first();
  const auto = {};
  if (pre) {
    const f = (JSON.parse(pre.reporte_json || '{}').fuentes) || {};
    for (const [k, v] of Object.entries(f)) auto[k] = { estado: v.estado === 'completa' ? 'completa' : 'incompleta', por: 'ingesta de la prenómina', en: pre.actualizado_en,
      detalle: (v.excluidos || []).slice(0, 5).map(x => typeof x === 'string' ? x : (x.corrida ? x.corrida + ' (' + x.renglones + ' renglones sin calendario)' : JSON.stringify(x))) };
  }
  if (xml) {
    const m = (JSON.parse(xml.reporte_json || '{}').modulo_4_2) || {};
    auto.xml_nomina = { estado: m.estado === 'completo' ? 'completa' : 'incompleta', por: 'lectura de los XML', en: xml.actualizado_en, detalle: m.motivos || [] };
  }
  const mae = await db.prepare('SELECT registros, reporte_json, creado_en FROM maestro_carga WHERE encargo_id = ?1 ORDER BY creado_en DESC LIMIT 1').bind(encargo_id).first();
  if (mae) {
    const r = JSON.parse(mae.reporte_json || '{}');
    auto.maestro_empleados = { estado: r.sin_maestro ? 'incompleta' : 'completa', por: 'lectura del maestro (' + mae.registros + ' empleados)', en: mae.creado_en,
      detalle: r.sin_maestro ? [r.sin_maestro + ' colaboradores pagados que no aparecen en el maestro'] : [] };
  }
  return items.map(i => {
    const a = auto[i.fuente_clave];
    const archivos = arch.filter(x => x.fuente_clave === i.fuente_clave);
    let estado = i.estado;
    if (a && i.estado !== 'no_aplica') estado = a.estado;
    else if (estado === 'pendiente' && archivos.some(x => x.revision !== 'rechazado')) estado = 'entregada';
    return { ...i, descripcion: (FUENTES[i.fuente_clave] || {}).descripcion || i.fuente_clave, estado_efectivo: estado, evidencia: a || null, archivos,
      vencida: estado === 'pendiente' && i.fecha_compromiso && i.fecha_compromiso < new Date().toISOString().slice(0, 10) };
  }).sort((x, y) => (y.esencial - x.esencial) || (y.obligatoria - x.obligatoria) || x.fuente_clave.localeCompare(y.fuente_clave));
}

async function procesarArchivo(env, ctx, a, u, d) {
  const esZip = /\.zip$/i.test(a.nombre), esXlsx = /\.xlsx$/i.test(a.nombre), esTxt = /\.(txt|csv)$/i.test(a.nombre);
  if (a.fuente_clave === 'prenomina' && esXlsx) {
    const id = await crearIngesta(env, { encargo_id: a.encargo_id, r2_key: a.r2_key, archivo_nombre: a.nombre, usuario_id: u.id });
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzar(env, { ingesta_id: id, presupuesto_ms: 25000 }));
    return id;
  }
  if (a.fuente_clave === 'xml_nomina' && (esZip || esTxt)) {
    const id = await crearIngestaCfdi(env, { encargo_id: a.encargo_id, tipo: esZip ? 'xml_nomina' : 'metadata_sat', r2_key: a.r2_key, archivo_nombre: a.nombre, llave: (d && d.llave) || 'num_empleado', usuario_id: u.id });
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzarCfdi(env, { ingesta_id: id, presupuesto_ms: 25000 }));
    return id;
  }
  throw new Error('Este archivo no tiene lectura automática (' + a.fuente_clave + ', ' + a.nombre + '): revísalo y márcalo aceptado o rechazado');
}

export async function rutasRequerimiento(request, env, u, C, J, ctx) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;

  // ── Cliente ──
  const encargoVisible = async (id) => {
    const e = id ? await db.prepare('SELECT * FROM encargo WHERE id = ?1').bind(id).first() : null;
    if (!e) return null;
    if (u.rol !== 'admin' && Number(u.empresa_id) !== Number(e.empresa_id)) return null;
    return e;
  };
  if (p === '/api/encargos' && m === 'GET') {
    const q = u.rol === 'admin' ? db.prepare('SELECT e.*, em.nombre AS empresa FROM encargo e JOIN empresas em ON em.id = e.empresa_id ORDER BY e.periodo_hasta DESC LIMIT 200')
      : db.prepare('SELECT e.*, em.nombre AS empresa FROM encargo e JOIN empresas em ON em.id = e.empresa_id WHERE e.empresa_id = ?1 ' +
        'AND (EXISTS (SELECT 1 FROM requerimiento r WHERE r.encargo_id = e.id) OR EXISTS (SELECT 1 FROM dictamen d WHERE d.encargo_id = e.id)) ORDER BY e.periodo_hasta DESC').bind(Number(u.empresa_id));
    const { results } = await q.all();
    const out = [];
    for (const e of results) {
      const req = await requerimientoDe(db, e.id);
      const dic = await db.prepare('SELECT id, version, opinion, emitido_en FROM dictamen WHERE encargo_id = ?1 ORDER BY version DESC LIMIT 1').bind(e.id).first();
      out.push({ id: e.id, empresa: e.empresa, periodo_desde: e.periodo_desde, periodo_hasta: e.periodo_hasta, nivel: e.nivel, estado: e.estado,
        pendientes: req.filter(r => ['pendiente', 'incompleta'].includes(r.estado_efectivo)).length, total: req.length, dictamen: dic || null });
    }
    return J({ encargos: out }, 200, C);
  }
  if (p === '/api/encargo' && m === 'GET') {
    const e = await encargoVisible(url.searchParams.get('id'));
    if (!e) return J({ error: 'Encargo no encontrado' }, 404, C);
    const req = await requerimientoDe(db, e.id);
    // Hallazgos que ya salieron en un dictamen emitido, con su foto más reciente.
    const { results: hs } = await db.prepare('SELECT h.id, h.numero, h.titulo, h.modulo, h.criterio, h.condicion, h.recomendacion, h.responsable, h.fecha_compromiso, h.estatus, h.riesgo, ' +
      '(SELECT x.material FROM dictamen_hallazgo x JOIN dictamen d ON d.id = x.dictamen_id WHERE x.hallazgo_id = h.id ORDER BY d.version DESC LIMIT 1) AS material, ' +
      '(SELECT x.efecto_max_c FROM dictamen_hallazgo x JOIN dictamen d ON d.id = x.dictamen_id WHERE x.hallazgo_id = h.id ORDER BY d.version DESC LIMIT 1) AS efecto_max_c ' +
      'FROM hallazgo h WHERE h.encargo_id = ?1 AND EXISTS (SELECT 1 FROM dictamen_hallazgo x WHERE x.hallazgo_id = h.id) ORDER BY h.numero').bind(e.id).all();
    const { results: com } = await db.prepare("SELECT b.hallazgo_id, b.campo, b.despues, b.motivo, b.quien, b.en FROM hallazgo_bitacora b JOIN hallazgo h ON h.id = b.hallazgo_id " +
      "WHERE h.encargo_id = ?1 AND b.campo IN ('comentario','responsable','fecha_compromiso','estatus') ORDER BY b.id DESC LIMIT 300").bind(e.id).all();
    const { results: dics } = await db.prepare('SELECT id, version, opinion, emitido_en, motivo_version FROM dictamen WHERE encargo_id = ?1 ORDER BY version DESC').bind(e.id).all();
    const emp = await db.prepare('SELECT nombre, rfc FROM empresas WHERE id = ?1').bind(e.empresa_id).first();
    return J({ encargo: { id: e.id, empresa: emp && emp.nombre, rfc: emp && emp.rfc, periodo_desde: e.periodo_desde, periodo_hasta: e.periodo_hasta, nivel: e.nivel, estado: e.estado, cerrado_en: e.cerrado_en },
      requerimiento: req, hallazgos: hs.map(h => ({ ...h, historia: com.filter(c => c.hallazgo_id === h.id).slice(0, 10) })), dictamenes: dics }, 200, C);
  }
  if (p === '/api/encargo/archivo' && m === 'POST') {
    const fd = await request.formData().catch(() => null);
    const f = fd && fd.get('file');
    const e = await encargoVisible(fd && fd.get('encargo_id'));
    const fuente = fd && fd.get('fuente_clave');
    if (!e) return J({ error: 'Encargo no encontrado' }, 404, C);
    if (!f || !f.name) return J({ error: 'Falta el archivo' }, 400, C);
    if (f.size > MAX) return J({ error: 'El archivo excede 95MB: pártelo en varios' }, 413, C);
    const item = await db.prepare('SELECT 1 FROM requerimiento WHERE encargo_id = ?1 AND fuente_clave = ?2').bind(e.id, fuente || '').first();
    if (!item) return J({ error: 'Ese documento no está en el requerimiento de este encargo' }, 400, C);
    if (e.cerrado_en) return J({ error: 'El encargo está cerrado: una corrección abre un encargo nuevo' }, 409, C);
    const id = nuevoId('pbc');
    const r2_key = 'encargos/' + e.id + '/pbc/' + fuente + '/' + Date.now() + '_' + f.name.replace(/[^\w.\- ]+/g, '_');
    await env.DOCS.put(r2_key, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' } });
    await db.prepare('INSERT INTO requerimiento_archivo (id, encargo_id, fuente_clave, r2_key, nombre, tamano, subido_por) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(id, e.id, fuente, r2_key, f.name, f.size, u.id).run();
    return J({ ok: true, id }, 201, C);
  }
  if (p === '/api/encargo/hallazgo' && m === 'POST') {
    const d = await cuerpo(request);
    const h = d && d.id ? await db.prepare('SELECT h.*, e.empresa_id FROM hallazgo h JOIN encargo e ON e.id = h.encargo_id WHERE h.id = ?1').bind(d.id).first() : null;
    const visible = h && (u.rol === 'admin' || Number(u.empresa_id) === Number(h.empresa_id)) &&
      (await db.prepare('SELECT 1 FROM dictamen_hallazgo WHERE hallazgo_id = ?1').bind(h.id).first());
    if (!visible) return J({ error: 'Hallazgo no encontrado' }, 404, C);
    if (['corregido', 'resuelto_por_reproceso', 'superado'].includes(h.estatus)) return J({ error: 'El hallazgo ya está cerrado' }, 409, C);
    if (d.fecha_compromiso && !FECHA.test(d.fecha_compromiso)) return J({ error: 'Fecha: AAAA-MM-DD' }, 400, C);
    const quien = (u.rol === 'admin' ? '' : 'Cliente: ') + (u.nombre || u.email);
    const cambios = [];
    for (const k of ['responsable', 'fecha_compromiso']) if (k in d && String(d[k] || '') !== String(h[k] || '')) cambios.push([k, h[k], d[k] || null]);
    // El cliente avisa que ya está corrigiendo; cerrar como «corregido» es de HRM, con evidencia.
    if (d.en_correccion && h.estatus === 'abierto') cambios.push(['estatus', h.estatus, 'en_correccion']);
    const comentario = d.comentario ? String(d.comentario).trim().slice(0, 2000) : '';
    if (!cambios.length && !comentario) return J({ ok: true, cambios: 0 }, 200, C);
    const st = [];
    if (cambios.length) {
      const args = [h.id, u.id];
      const sets = cambios.map(([k, , v]) => { args.push(v); return k + ' = ?' + args.length; });
      st.push(db.prepare("UPDATE hallazgo SET " + sets.join(', ') + ", actualizado_por_usuario_id = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(...args));
    }
    for (const [k, a, v] of cambios) st.push(db.prepare('INSERT INTO hallazgo_bitacora (hallazgo_id, campo, antes, despues, motivo, usuario_id, quien) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(h.id, k, a === null ? null : String(a), v === null ? null : String(v), comentario || null, u.id, quien));
    if (comentario && !cambios.length) st.push(db.prepare("INSERT INTO hallazgo_bitacora (hallazgo_id, campo, despues, usuario_id, quien) VALUES (?1, 'comentario', ?2, ?3, ?4)").bind(h.id, comentario, u.id, quien));
    try { await db.batch(st); } catch (e) { return J({ error: e.message }, 409, C); }
    return J({ ok: true, cambios: cambios.length + (comentario && !cambios.length ? 1 : 0) }, 200, C);
  }

  // ── Admin ──
  if (!p.startsWith('/api/kernel/requerimiento')) return null;
  if (u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);
  if (p === '/api/kernel/requerimiento' && m === 'GET') {
    const e = await encargoVisible(url.searchParams.get('encargo_id'));
    if (!e) return J({ error: 'Encargo no existe' }, 404, C);
    return J({ requerimiento: await requerimientoDe(db, e.id), estados: ESTADOS }, 200, C);
  }
  if (p === '/api/kernel/requerimiento/generar' && m === 'POST') {
    const d = await cuerpo(request);
    const e = await encargoVisible(d && d.encargo_id);
    if (!e) return J({ error: 'Encargo no existe' }, 404, C);
    if (d.fecha_compromiso && !FECHA.test(d.fecha_compromiso)) return J({ error: 'fecha_compromiso: AAAA-MM-DD' }, 400, C);
    const ahora = new Date().toISOString();
    const pbc = listaPBC();
    for (const k of [...ESENCIALES, ...ADICIONALES]) if (!pbc.some(x => x.clave === k)) pbc.push({ clave: k, obligatoria_para: [] });
    const st = pbc.map(x => db.prepare('INSERT OR IGNORE INTO requerimiento (encargo_id, fuente_clave, esencial, obligatoria, responsable, solicitado_en, fecha_compromiso) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(e.id, x.clave, ESENCIALES.includes(x.clave) ? 1 : 0, x.obligatoria_para.length || ESENCIALES.includes(x.clave) || ADICIONALES.includes(x.clave) ? 1 : 0, d.responsable || null, ahora, d.fecha_compromiso || null));
    await db.batch(st);
    return J({ ok: true, requerimiento: await requerimientoDe(db, e.id) }, 201, C);
  }
  if (p === '/api/kernel/requerimiento/item' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || !d.fuente_clave) return J({ error: 'Se espera { encargo_id, fuente_clave, estado?, responsable?, fecha_compromiso?, nota? }' }, 400, C);
    if (d.estado && !ESTADOS.includes(d.estado)) return J({ error: 'Estado: ' + ESTADOS.join(', ') }, 400, C);
    if (d.estado === 'no_aplica' && !d.nota) return J({ error: 'Marcar «no aplica» exige la nota de por qué' }, 400, C);
    if (d.fecha_compromiso && !FECHA.test(d.fecha_compromiso)) return J({ error: 'fecha_compromiso: AAAA-MM-DD' }, 400, C);
    const sets = [], args = [d.encargo_id, d.fuente_clave];
    for (const k of ['estado', 'responsable', 'fecha_compromiso', 'nota']) if (k in d) { args.push(d[k] || null); sets.push(k + ' = ?' + args.length); }
    if (!sets.length) return J({ error: 'Nada que cambiar' }, 400, C);
    const r = await db.prepare("UPDATE requerimiento SET " + sets.join(', ') + ", actualizado_en = datetime('now') WHERE encargo_id = ?1 AND fuente_clave = ?2").bind(...args).run();
    if (!(r.meta?.changes ?? r.changes)) return J({ error: 'No está en el requerimiento' }, 404, C);
    return J({ ok: true }, 200, C);
  }
  if (p === '/api/kernel/requerimiento/archivo/revisar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.id || !['aceptado', 'rechazado'].includes(d.revision)) return J({ error: 'Se espera { id, revision: aceptado|rechazado, nota? }' }, 400, C);
    if (d.revision === 'rechazado' && !d.nota) return J({ error: 'Rechazar exige decirle al cliente por qué' }, 400, C);
    await db.prepare("UPDATE requerimiento_archivo SET revision = ?2, nota_revision = ?3, revisado_por = ?4, revisado_en = datetime('now') WHERE id = ?1").bind(d.id, d.revision, d.nota || null, u.id).run();
    return J({ ok: true }, 200, C);
  }
  if (p === '/api/kernel/requerimiento/archivo/procesar' && m === 'POST') {
    const d = await cuerpo(request);
    const a = d && d.id ? await db.prepare('SELECT * FROM requerimiento_archivo WHERE id = ?1').bind(d.id).first() : null;
    if (!a) return J({ error: 'Archivo no existe' }, 404, C);
    if (a.ingesta_id) return J({ error: 'Ya se procesó: ingesta ' + a.ingesta_id }, 409, C);
    let id;
    try { id = await procesarArchivo(env, ctx, a, u, d); } catch (e) { return J({ error: e.message }, 400, C); }
    await db.prepare("UPDATE requerimiento_archivo SET ingesta_id = ?2, revision = 'aceptado', revisado_por = ?3, revisado_en = datetime('now') WHERE id = ?1").bind(a.id, id, u.id).run();
    return J({ ok: true, ingesta_id: id }, 200, C);
  }
  return null;
}
