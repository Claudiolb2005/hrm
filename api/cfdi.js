// api/cfdi.js — XML de nómina, metadata del SAT y cruce nómina ↔ CFDI (módulo 4.2). Sólo admin.
//
// /api/kernel/cfdi                  POST multipart (file, encargo_id, tipo xml_nomina|metadata_sat, llave) · GET ?encargo_id
// /api/kernel/cfdi/ingesta          GET ?id
// /api/kernel/cfdi/avanzar          POST { id }
// /api/kernel/cfdi/reintentar       POST { id, recruzar? }
// /api/kernel/cruces/grupos         GET ?ingesta_cfdi_id
// /api/kernel/cruces                GET ?ingesta_cfdi_id&tipo&rubro&dif_c&corrida_id
// /api/kernel/cruces/clasificar     POST { ingesta_cfdi_id, tipo, rubro, dif_c?, corrida_id?, cubeta, motivo, criterio_id? }
import { metadatosFuente } from '../servicio/expediente.js';
import { crearIngestaCfdi, avanzarCfdi, estadoIngestaCfdi, reintentarCfdi } from '../ingesta/cfdi.js';
import { puedeOperar, esCarga, verificarEncargo } from './permisos.js';

export const CUBETAS_CRUCE = ['proceso_mal', 'explicada', 'criterio_sin_resolver'];
async function cuerpo(request) { try { return await request.json(); } catch { return null; } }

/** Filtro de cruces vigentes (último corte) de una ingesta de CFDI. */
function filtroCruces(q, base = 2) {
  const filtros = [], args = [];
  for (const k of ['tipo', 'rubro', 'corrida_id']) if (q[k] !== undefined && q[k] !== null && q[k] !== '') { args.push(q[k]); filtros.push('c.' + k + ' = ?' + (base + args.length - 1)); }
  if (q.dif_c !== undefined && q.dif_c !== null && q.dif_c !== '') { args.push(Number(q.dif_c)); filtros.push('(c.cfdi_c - c.nomina_c) = ?' + (base + args.length - 1)); }
  return { filtros, args };
}

export async function rutasCfdi(request, env, u, C, J, ctx) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/cfdi') && !p.startsWith('/api/kernel/cruces')) return null;
  if (!puedeOperar(u)) return J({ error: 'Forbidden' }, 403, C);

  if (p === '/api/kernel/cfdi' && m === 'POST') {
    const fd = await request.formData().catch(() => null);
    const f = fd && fd.get('file');
    const encargo_id = fd && fd.get('encargo_id');
    if (!f || !f.name || !encargo_id) return J({ error: 'Faltan campos: file, encargo_id' }, 400, C);
    const ve = await verificarEncargo(db, u, encargo_id);
    if (ve) return J({ error: ve.error }, ve.status, C);
    const tipo = fd.get('tipo') || (/\.zip$/i.test(f.name) ? 'xml_nomina' : 'metadata_sat');
    if (tipo === 'xml_nomina' && !/\.zip$/i.test(f.name)) return J({ error: 'Los XML van en un .zip' }, 400, C);
    if (tipo === 'metadata_sat' && !/\.(txt|csv)$/i.test(f.name)) return J({ error: 'La metadata del SAT es el .txt de la descarga masiva' }, 400, C);
    if (f.size > 95 * 1024 * 1024) return J({ error: 'El archivo excede 95MB: parte el paquete en varios ZIP' }, 413, C);
    const r2_key = 'encargos/' + encargo_id + '/cfdi/' + Date.now() + '_' + f.name.replace(/[^\w.\- ]+/g, '_');
    await env.DOCS.put(r2_key, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' }, customMetadata: await metadatosFuente(db, encargo_id, tipo) });
    let id;
    try { id = await crearIngestaCfdi(env, { encargo_id, tipo, r2_key, archivo_nombre: f.name, llave: fd.get('llave') || 'num_empleado', usuario_id: u.id }); }
    catch (e) { return J({ error: e.message }, 400, C); }
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzarCfdi(env, { ingesta_id: id, presupuesto_ms: 25000 }));
    return J({ ok: true, id }, 201, C);
  }
  if (p === '/api/kernel/cfdi' && m === 'GET') {
    const { results } = await db.prepare('SELECT id, tipo, archivo_nombre, estado, llave, lotes_total, lotes_hechos, entradas, prenomina_ingesta_id, substr(error, 1, 300) AS error, creado_en, actualizado_en ' +
      'FROM ingesta_cfdi WHERE encargo_id = ?1 ORDER BY creado_en DESC').bind(url.searchParams.get('encargo_id') || '').all();
    return J({ ingestas: results }, 200, C);
  }
  if (p === '/api/kernel/cfdi/ingesta' && m === 'GET') {
    const i = await estadoIngestaCfdi(db, url.searchParams.get('id') || '');
    return i ? J({ ingesta: i }, 200, C) : J({ error: 'Ingesta no existe' }, 404, C);
  }
  if (p === '/api/kernel/cfdi/avanzar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.id) return J({ error: 'id requerido' }, 400, C);
    const r = await avanzarCfdi(env, { ingesta_id: d.id, presupuesto_ms: 20000 });
    return J({ ...r, ingesta: await estadoIngestaCfdi(db, d.id) }, 200, C);
  }
  if (p === '/api/kernel/cfdi/reintentar' && m === 'POST') {
    const d = await cuerpo(request);
    const estado = d && d.id ? await reintentarCfdi(db, d.id, { recruzar: !!d.recruzar }) : false;
    if (!estado) return J({ error: d && d.recruzar ? 'Se vuelve a cruzar un paquete de XML ya leído' : 'Sólo se reintenta una ingesta en error' }, 400, C);
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzarCfdi(env, { ingesta_id: d.id, presupuesto_ms: 25000 }));
    return J({ ok: true, estado }, 200, C);
  }

  // ── Cruces vigentes (último corte) ──
  const ingCfdi = async (id) => id ? db.prepare('SELECT id, encargo_id, corte_actual FROM ingesta_cfdi WHERE id = ?1').bind(id).first() : null;
  if (p === '/api/kernel/cruces/grupos' && m === 'GET') {
    const i = await ingCfdi(url.searchParams.get('ingesta_cfdi_id'));
    if (!i || !i.corte_actual) return J({ grupos: [], total: 0, aceptacion: { aceptado: true, sin_clasificar: 0 } }, 200, C);
    const { results } = await db.prepare("SELECT c.tipo, c.rubro, CASE WHEN c.tipo = 'diferencia' THEN c.cfdi_c - c.nomina_c END AS dif_c, " +
      "CASE WHEN c.tipo <> 'diferencia' THEN c.corrida_id END AS corrida_id, count(*) AS n, sum(c.cubeta IS NULL) AS pendientes, " +
      'sum(abs(coalesce(c.nomina_c, 0) - coalesce(c.cfdi_c, 0))) AS suma_abs_c, min(c.cubeta) AS cubeta, min(c.motivo) AS motivo ' +
      'FROM cruce_cfdi c WHERE c.ingesta_cfdi_id = ?1 AND c.corte = ?2 GROUP BY 1, 2, 3, 4 ORDER BY pendientes DESC, suma_abs_c DESC LIMIT 500').bind(i.id, i.corte_actual).all();
    const t = await db.prepare('SELECT count(*) AS n, sum(cubeta IS NULL) AS p FROM cruce_cfdi WHERE ingesta_cfdi_id = ?1 AND corte = ?2').bind(i.id, i.corte_actual).first();
    return J({ grupos: results, total: t.n || 0, aceptacion: { aceptado: (t.p || 0) === 0, sin_clasificar: t.p || 0 } }, 200, C);
  }
  if (p === '/api/kernel/cruces' && m === 'GET') {
    const q = Object.fromEntries(url.searchParams);
    const i = await ingCfdi(q.ingesta_cfdi_id);
    if (!i) return J({ error: 'Ingesta no existe' }, 404, C);
    const { filtros, args } = filtroCruces(q, 3);
    const lim = Math.min(Number(q.limit || 200), 1000);
    const { results } = await db.prepare('SELECT c.*, (c.cfdi_c - c.nomina_c) AS dif_c FROM cruce_cfdi c WHERE c.ingesta_cfdi_id = ?1 AND c.corte = ?2' +
      (filtros.length ? ' AND ' + filtros.join(' AND ') : '') + ' ORDER BY abs(coalesce(c.nomina_c,0) - coalesce(c.cfdi_c,0)) DESC LIMIT ' + lim).bind(i.id, i.corte_actual, ...args).all();
    return J({ cruces: results }, 200, C);
  }
  if (p === '/api/kernel/cruces/clasificar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !CUBETAS_CRUCE.includes(d.cubeta) || !d.motivo) return J({ error: 'Se espera { ingesta_cfdi_id, tipo, rubro, dif_c?, corrida_id?, cubeta, motivo, criterio_id? }' }, 400, C);
    if (d.cubeta === 'criterio_sin_resolver' && !d.criterio_id) return J({ error: 'Un criterio sin resolver se asienta en la bitácora: falta criterio_id' }, 400, C);
    const i = await ingCfdi(d.ingesta_cfdi_id);
    if (!i || !i.corte_actual) return J({ error: 'Ingesta sin cruce' }, 404, C);
    const { filtros, args } = filtroCruces(d, 3);
    if (!filtros.length) return J({ error: 'Pon al menos un filtro (tipo, rubro, importe o corrida)' }, 400, C);
    const n0 = 2 + args.length;
    try {
      const r = await db.prepare('UPDATE cruce_cfdi SET cubeta = ?' + (n0 + 1) + ', motivo = ?' + (n0 + 2) + ', quien = ?' + (n0 + 3) + ', clasificado_por_usuario_id = ?' + (n0 + 4) +
        ', criterio_id = ?' + (n0 + 5) + ', clasificado_en = ?' + (n0 + 6) + ' WHERE id IN (SELECT c.id FROM cruce_cfdi c WHERE c.ingesta_cfdi_id = ?1 AND c.corte = ?2 AND c.cubeta IS NULL AND ' + filtros.join(' AND ') + ')')
        .bind(i.id, i.corte_actual, ...args, d.cubeta, d.motivo, u.nombre || u.email, u.id, d.criterio_id || null, new Date().toISOString()).run();
      return J({ ok: true, clasificados: r.meta?.changes ?? null }, 200, C);
    } catch (e) { return J({ error: e.message }, 409, C); }
  }
  return null;
}
