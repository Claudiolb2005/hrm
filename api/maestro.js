// api/maestro.js — Maestro de empleados y cruce de afiliación (pago a persona sin alta o ya dada de baja). Sólo admin.
//
// POST /api/kernel/maestro (multipart: file, encargo_id) · GET /api/kernel/maestro?encargo_id=
// POST /api/kernel/maestro/cruzar { id }
// GET  /api/kernel/afiliacion?carga_id= · POST /api/kernel/afiliacion/clasificar { carga_id, tipo?, ids?, cubeta, motivo, criterio_id? }
import { leerMaestro, cruzarAfiliacion, PERFIL_MAESTRO_PRIME } from '../ingesta/maestro.js';
import { sha256Hex, nuevoId } from '../kernel/src/sello.js';
import { insertarMultiple } from '../kernel/src/d1.js';
import { metadatosFuente } from '../servicio/expediente.js';
import { puedeOperar, esCarga, verificarEncargo } from './permisos.js';

const CUBETAS = ['proceso_mal', 'explicada', 'criterio_sin_resolver'];
async function cuerpo(request) { try { return await request.json(); } catch { return null; } }
async function lotes(db, st) { for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50)); }

/** Cruza la carga contra la última prenómina terminada del encargo. Conserva la clasificación de lo que vuelve a encontrar. */
export async function cruzarCarga(env, carga) {
  const db = env.DB;
  const pre = await db.prepare("SELECT id, ejecucion_id FROM ingesta WHERE encargo_id = ?1 AND tipo = 'prenomina' AND estado = 'terminado' ORDER BY actualizado_en DESC LIMIT 1").bind(carga.encargo_id).first();
  if (!pre) return { cruzado: false, motivo: 'Falta la prenómina terminada del encargo' };
  const { results: ms } = await db.prepare('SELECT * FROM colaborador_maestro WHERE carga_id = ?1').bind(carga.id).all();
  const maestro = new Map(ms.map(m => [m.num_empleado, m]));
  const { results: cal } = await db.prepare('SELECT corrida_id, desde, hasta, ordinaria FROM calendario_nomina WHERE encargo_id = ?1').bind(carga.encargo_id).all();
  const calendario = new Map(cal.map(c => [c.corrida_id, { desde: c.desde, hasta: c.hasta, ordinaria: c.ordinaria === 1 }]));
  const { results: ls } = await db.prepare('SELECT r2_key FROM ingesta_lote WHERE ingesta_id = ?1 ORDER BY n').bind(pre.id).all();
  const renglones = [];
  for (const l of ls) {
    const o = await env.DOCS.get(l.r2_key);
    if (!o) throw new Error('Falta el lote ' + l.r2_key + ' de la prenómina');
    for (const linea of (await o.text()).split('\n')) if (linea) { const r = JSON.parse(linea); renglones.push({ colaborador_id: r.colaborador_id, corrida_id: r.corrida_id, total_percepciones_c: r.total_percepciones_c, percepciones: r.percepciones }); }
  }
  const r = cruzarAfiliacion(renglones, maestro, calendario);
  const corte = new Date().toISOString();
  const filas = [];
  for (const c of r.casos) {
    const id = 'afi_' + (await sha256Hex([carga.id, pre.id, c.tipo, c.colaborador_id, c.corrida_id, c.fecha_evento, c.percepciones_c].join('|'))).slice(0, 24);
    filas.push([id, carga.encargo_id, carga.id, pre.id, corte, c.tipo, c.colaborador_id, c.corrida_id, c.fecha_evento, c.fuente_fecha, c.percepciones_c]);
  }
  const st = [];
  const COLS = 'id, encargo_id, carga_id, prenomina_ingesta_id, corte, tipo, colaborador_id, corrida_id, fecha_evento, fuente_fecha, percepciones_c';
  for (let i = 0; i < filas.length; i += 9) {
    const g = filas.slice(i, i + 9);
    let k = 0;
    const vals = g.map(() => '(' + Array.from({ length: 11 }, () => '?' + (++k)).join(',') + ')').join(',');
    st.push(db.prepare('INSERT INTO cruce_afiliacion (' + COLS + ') VALUES ' + vals + ' ON CONFLICT (id) DO UPDATE SET corte = excluded.corte').bind(...g.flat()));
  }
  const rep0 = JSON.parse(carga.reporte_json || '{}');
  const porTipo = {};
  for (const c of r.casos) porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1;
  const reporte = { ...rep0, prenomina_ingesta_id: pre.id, corte, revisados: r.revisados, casos: r.casos.length, por_tipo: porTipo,
    sin_maestro: r.sin_maestro.length, muestra_sin_maestro: r.sin_maestro.slice(0, 30),
    modulo_4_12: { estado: 'universo_parcial', esperado: r.revisados + r.sin_maestro.length, efectivo: r.revisados,
      motivos: ['Fechas de alta y baja del maestro del cliente, no de los movimientos afiliatorios del IDSE'].concat(r.sin_maestro.length ? [r.sin_maestro.length + ' colaboradores pagados que no están en el maestro'] : []) } };
  await lotes(db, [...st, db.prepare('UPDATE maestro_carga SET prenomina_ingesta_id = ?2, ejecucion_id = ?3, corte_actual = ?4, reporte_json = ?5 WHERE id = ?1')
    .bind(carga.id, pre.id, pre.ejecucion_id, corte, JSON.stringify(reporte))]);
  return { cruzado: true, reporte };
}

export async function rutasMaestro(request, env, u, C, J) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/maestro') && !p.startsWith('/api/kernel/afiliacion')) return null;
  if (!puedeOperar(u)) return J({ error: 'Forbidden' }, 403, C);

  if (p === '/api/kernel/maestro' && m === 'POST') {
    const fd = await request.formData().catch(() => null);
    const f = fd && fd.get('file');
    const encargo_id = fd && fd.get('encargo_id');
    if (!f || !f.name || !encargo_id) return J({ error: 'Faltan campos: file, encargo_id' }, 400, C);
    const ve = await verificarEncargo(db, u, encargo_id);
    if (ve) return J({ error: ve.error }, ve.status, C);
    if (!/\.xlsx$/i.test(f.name)) return J({ error: 'El maestro va en .xlsx' }, 400, C);
    if (f.size > 30 * 1024 * 1024) return J({ error: 'El maestro excede 30MB' }, 413, C);
    const enc = await db.prepare('SELECT id FROM encargo WHERE id = ?1').bind(encargo_id).first();
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    const bytes = new Uint8Array(await f.arrayBuffer());
    let mae;
    try { mae = await leerMaestro(bytes); } catch (e) { return J({ error: e.message }, 400, C); }
    const id = nuevoId('mae');
    const r2_key = 'encargos/' + encargo_id + '/maestro/' + Date.now() + '_' + f.name.replace(/[^\w.\- ]+/g, '_');
    await env.DOCS.put(r2_key, bytes, { customMetadata: await metadatosFuente(db, encargo_id, 'maestro_empleados') });
    const reporte = { hojas: mae.hojas, sin_numero: mae.sin_numero, inconsistencias: mae.inconsistencias.length, muestra_inconsistencias: mae.inconsistencias.slice(0, 20),
      con_baja: mae.registros.filter(x => x.fecha_baja || x.fecha_baja_imss).length, con_baja_imss: mae.registros.filter(x => x.fecha_baja_imss).length };
    await lotes(db, [db.prepare('INSERT INTO maestro_carga (id, encargo_id, perfil, r2_key, archivo_nombre, archivo_sha256, registros, reporte_json, creado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
      .bind(id, encargo_id, PERFIL_MAESTRO_PRIME.id + '@' + PERFIL_MAESTRO_PRIME.version, r2_key, f.name, await sha256Hex(bytes), mae.registros.length, JSON.stringify(reporte), u.id),
      ...insertarMultiple(db, 'colaborador_maestro', 'carga_id, num_empleado, rfc, fecha_alta, fecha_antiguedad, fecha_baja, fecha_baja_imss, grupo, hoja',
        mae.registros.map(x => [id, x.num_empleado, x.rfc, x.fecha_alta, x.fecha_antiguedad, x.fecha_baja, x.fecha_baja_imss, x.grupo, x.hoja]))]);
    const carga = await db.prepare('SELECT * FROM maestro_carga WHERE id = ?1').bind(id).first();
    const cr = await cruzarCarga(env, carga);
    return J({ ok: true, id, registros: mae.registros.length, ...cr }, 201, C);
  }
  if (p === '/api/kernel/maestro' && m === 'GET') {
    const { results } = await db.prepare('SELECT id, archivo_nombre, archivo_sha256, registros, prenomina_ingesta_id, corte_actual, reporte_json, creado_en FROM maestro_carga WHERE encargo_id = ?1 ORDER BY creado_en DESC')
      .bind(url.searchParams.get('encargo_id') || '').all();
    return J({ cargas: results.map(c => ({ ...c, reporte: JSON.parse(c.reporte_json || '{}'), reporte_json: undefined })) }, 200, C);
  }
  if (p === '/api/kernel/maestro/cruzar' && m === 'POST') {
    const d = await cuerpo(request);
    const carga = d && d.id ? await db.prepare('SELECT * FROM maestro_carga WHERE id = ?1').bind(d.id).first() : null;
    if (!carga) return J({ error: 'Carga no existe' }, 404, C);
    const r = await cruzarCarga(env, carga);
    return r.cruzado ? J({ ok: true, ...r }, 200, C) : J({ error: r.motivo }, 409, C);
  }
  const cargaActual = async (id) => id ? db.prepare('SELECT id, encargo_id, corte_actual FROM maestro_carga WHERE id = ?1').bind(id).first() : null;
  if (p === '/api/kernel/afiliacion' && m === 'GET') {
    const c = await cargaActual(url.searchParams.get('carga_id'));
    if (!c || !c.corte_actual) return J({ casos: [], aceptacion: { aceptado: true, sin_clasificar: 0 } }, 200, C);
    const { results } = await db.prepare('SELECT * FROM cruce_afiliacion WHERE carga_id = ?1 AND corte = ?2 ORDER BY tipo, corrida_id, colaborador_id LIMIT 2000').bind(c.id, c.corte_actual).all();
    const pend = results.filter(x => !x.cubeta).length;
    return J({ casos: results, aceptacion: { aceptado: pend === 0, sin_clasificar: pend } }, 200, C);
  }
  if (p === '/api/kernel/afiliacion/clasificar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !CUBETAS.includes(d.cubeta) || !d.motivo) return J({ error: 'Se espera { carga_id, tipo? | ids?, cubeta, motivo, criterio_id? }' }, 400, C);
    if (d.cubeta === 'criterio_sin_resolver' && !d.criterio_id) return J({ error: 'Un criterio sin resolver se asienta en la bitácora: falta criterio_id' }, 400, C);
    const c = await cargaActual(d.carga_id);
    if (!c || !c.corte_actual) return J({ error: 'Carga sin cruce' }, 404, C);
    const filtros = ['carga_id = ?1', 'corte = ?2', 'cubeta IS NULL'], args = [c.id, c.corte_actual];
    if (d.tipo) { args.push(d.tipo); filtros.push('tipo = ?' + args.length); }
    if (Array.isArray(d.ids) && d.ids.length) { const ph = d.ids.slice(0, 80).map(x => { args.push(x); return '?' + args.length; }); filtros.push('id IN (' + ph.join(',') + ')'); }
    if (filtros.length === 3) return J({ error: 'Pon un tipo o los casos a clasificar' }, 400, C);
    const n0 = args.length;
    try {
      const r = await db.prepare('UPDATE cruce_afiliacion SET cubeta = ?' + (n0 + 1) + ', motivo = ?' + (n0 + 2) + ', quien = ?' + (n0 + 3) + ', clasificado_por_usuario_id = ?' + (n0 + 4) +
        ', criterio_id = ?' + (n0 + 5) + ', clasificado_en = ?' + (n0 + 6) + ' WHERE ' + filtros.join(' AND ')).bind(...args, d.cubeta, d.motivo, u.nombre || u.email, u.id, d.criterio_id || null, new Date().toISOString()).run();
      return J({ ok: true, clasificados: r.meta?.changes ?? null }, 200, C);
    } catch (e) { return J({ error: e.message }, 409, C); }
  }
  return null;
}
