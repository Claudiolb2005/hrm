// api/sua.js — Lectura del SUA y cruce kernel ↔ emisión del IMSS ↔ pago. Sólo admin.
//
// /api/kernel/sua               POST multipart (encargo_id, sua, ema, eba?, ema_pa?) — un registro patronal por llamada
//                               GET  ?encargo_id → lecturas vigentes (la última por periodo y registro)
// /api/kernel/sua/lectura       GET  ?id → reporte completo
// /api/kernel/sua/grupos        GET  ?encargo_id&periodo[&registro] → cruce agrupado por causa y rama
// /api/kernel/sua/cruces        GET  ?encargo_id&periodo&causa&rama[&registro] → renglones
// /api/kernel/sua/clasificar    POST { encargo_id, periodo, causa, rama?, registro?, cubeta, motivo, criterio_id? }
import { procesarRegistroSUA } from '../ingesta/sua-d1.js';

export const CUBETAS_SUA = ['proceso_mal', 'explicada', 'criterio_sin_resolver'];
const LIMITE_ARCHIVO = 20 * 1024 * 1024;
async function cuerpo(request) { try { return await request.json(); } catch { return null; } }

// Lectura vigente: la última que se subió para el mismo encargo, periodo y registro.
const VIGENTE = 'i.rowid = (SELECT max(j.rowid) FROM ingesta_sua j WHERE j.encargo_id = i.encargo_id AND j.periodo = i.periodo AND j.registro = i.registro)';

function filtro(q, base) {
  const f = [], a = [];
  for (const [k, col] of [['causa', 'c.causa'], ['rama', 'c.rama'], ['registro', 'i.registro'], ['tipo', 'c.tipo']]) {
    if (q[k] !== undefined && q[k] !== null && q[k] !== '') { a.push(q[k]); f.push(col + ' = ?' + (base + a.length - 1)); }
  }
  return { f, a };
}

export async function rutasSua(request, env, u, C, J) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/sua')) return null;
  if (u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);

  if (p === '/api/kernel/sua' && m === 'POST') {
    const fd = await request.formData().catch(() => null);
    const encargo_id = fd && fd.get('encargo_id');
    if (!encargo_id) return J({ error: 'Falta encargo_id' }, 400, C);
    const archivos = {};
    for (const k of ['sua', 'ema', 'eba', 'ema_pa']) {
      const f = fd.get(k);
      if (!f || typeof f === 'string') continue;
      if (f.size > LIMITE_ARCHIVO) return J({ error: k + ': excede 20 MB; ¿es el archivo correcto?' }, 413, C);
      archivos[k] = { nombre: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
    }
    try {
      const r = await procesarRegistroSUA(env, { encargo_id, archivos, usuario_id: u.id });
      const x = r.reporte;
      return J({ ok: true, id: r.id, registro: x.patron.registro, periodo: x.patron.periodo, trabajadores: x.trabajadores, cuadre: x.cuadre_interno.cuadra,
        totales: x.totales, por_causa: x.por_causa, renglones_cruce: x.renglones_cruce }, 201, C);
    } catch (e) { return J({ error: e.message }, 400, C); }
  }
  if (p === '/api/kernel/sua' && m === 'GET') {
    const { results } = await db.prepare('SELECT i.id, i.periodo, i.registro, i.folio, i.trabajadores, i.prima_rt_pct, i.cuadre_interno, i.ejecucion_id, i.creado_en, ' +
      "json_extract(i.reporte_json, '$.totales') AS totales, json_extract(i.reporte_json, '$.por_causa') AS por_causa, json_extract(i.reporte_json, '$.entidad') AS entidad, " +
      "json_extract(i.reporte_json, '$.ligados_prenomina') AS ligados, json_extract(i.reporte_json, '$.prima_distinta') AS prima_distinta, " +
      '(SELECT count(*) FROM cruce_sua c WHERE c.ingesta_sua_id = i.id) AS renglones, (SELECT count(*) FROM cruce_sua c WHERE c.ingesta_sua_id = i.id AND c.cubeta IS NULL) AS pendientes ' +
      'FROM ingesta_sua i WHERE i.encargo_id = ?1 AND ' + VIGENTE + ' ORDER BY i.periodo DESC, i.registro').bind(url.searchParams.get('encargo_id') || '').all();
    return J({ lecturas: results.map(r => ({ ...r, totales: r.totales ? JSON.parse(r.totales) : null, por_causa: r.por_causa ? JSON.parse(r.por_causa) : null })) }, 200, C);
  }
  if (p === '/api/kernel/sua/lectura' && m === 'GET') {
    const i = await db.prepare('SELECT * FROM ingesta_sua WHERE id = ?1').bind(url.searchParams.get('id') || '').first();
    if (!i) return J({ error: 'Lectura no existe' }, 404, C);
    return J({ lectura: { ...i, archivos: JSON.parse(i.archivos_json), reporte: JSON.parse(i.reporte_json), archivos_json: undefined, reporte_json: undefined } }, 200, C);
  }

  const q = Object.fromEntries(url.searchParams);
  if (p === '/api/kernel/sua/grupos' && m === 'GET') {
    if (!q.encargo_id || !q.periodo) return J({ error: 'encargo_id y periodo requeridos' }, 400, C);
    const { f, a } = filtro({ registro: q.registro }, 3);
    const { results } = await db.prepare('SELECT c.causa, c.rama, count(*) AS n, sum(c.cubeta IS NULL) AS pendientes, count(DISTINCT i.registro) AS registros, ' +
      'sum(coalesce(c.pagado_c, 0) - coalesce(c.kernel_c, 0)) AS pagado_menos_kernel_c, sum(coalesce(c.pagado_c, 0) - coalesce(c.emitido_c, 0)) AS pagado_menos_emitido_c, ' +
      'min(c.cubeta) AS cubeta, min(c.motivo) AS motivo FROM cruce_sua c JOIN ingesta_sua i ON i.id = c.ingesta_sua_id ' +
      'WHERE i.encargo_id = ?1 AND i.periodo = ?2 AND ' + VIGENTE + (f.length ? ' AND ' + f.join(' AND ') : '') + ' GROUP BY 1, 2 ORDER BY pendientes DESC, n DESC').bind(q.encargo_id, q.periodo, ...a).all();
    const t = results.reduce((s, g) => ({ n: s.n + g.n, p: s.p + g.pendientes }), { n: 0, p: 0 });
    return J({ grupos: results, total: t.n, aceptacion: { aceptado: t.p === 0, sin_clasificar: t.p } }, 200, C);
  }
  if (p === '/api/kernel/sua/cruces' && m === 'GET') {
    if (!q.encargo_id || !q.periodo) return J({ error: 'encargo_id y periodo requeridos' }, 400, C);
    const { f, a } = filtro(q, 3);
    const lim = Math.min(Number(q.limit || 200), 1000);
    const { results } = await db.prepare('SELECT c.*, i.registro, (coalesce(c.pagado_c,0) - coalesce(c.kernel_c,0)) AS pagado_menos_kernel_c, (coalesce(c.pagado_c,0) - coalesce(c.emitido_c,0)) AS pagado_menos_emitido_c ' +
      'FROM cruce_sua c JOIN ingesta_sua i ON i.id = c.ingesta_sua_id WHERE i.encargo_id = ?1 AND i.periodo = ?2 AND ' + VIGENTE + (f.length ? ' AND ' + f.join(' AND ') : '') +
      ' ORDER BY abs(coalesce(c.pagado_c,0) - coalesce(c.kernel_c,0)) + abs(coalesce(c.pagado_c,0) - coalesce(c.emitido_c,0)) DESC LIMIT ' + lim).bind(q.encargo_id, q.periodo, ...a).all();
    return J({ cruces: results.map(r => ({ ...r, detalle: r.detalle_json ? JSON.parse(r.detalle_json) : null, detalle_json: undefined })) }, 200, C);
  }
  if (p === '/api/kernel/sua/clasificar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || !d.periodo || !d.causa || !CUBETAS_SUA.includes(d.cubeta) || !d.motivo) return J({ error: 'Se espera { encargo_id, periodo, causa, rama?, registro?, cubeta, motivo, criterio_id? }' }, 400, C);
    if (d.cubeta === 'criterio_sin_resolver' && !d.criterio_id) return J({ error: 'Un criterio sin resolver se asienta en la bitácora: falta criterio_id' }, 400, C);
    const { f, a } = filtro({ causa: d.causa, rama: d.rama, registro: d.registro }, 3);
    const n0 = 2 + a.length;
    try {
      const r = await db.prepare('UPDATE cruce_sua SET cubeta = ?' + (n0 + 1) + ', motivo = ?' + (n0 + 2) + ', quien = ?' + (n0 + 3) + ', clasificado_por_usuario_id = ?' + (n0 + 4) +
        ', criterio_id = ?' + (n0 + 5) + ', clasificado_en = ?' + (n0 + 6) + ' WHERE id IN (SELECT c.id FROM cruce_sua c JOIN ingesta_sua i ON i.id = c.ingesta_sua_id ' +
        'WHERE i.encargo_id = ?1 AND i.periodo = ?2 AND ' + VIGENTE + ' AND c.cubeta IS NULL AND ' + f.join(' AND ') + ')')
        .bind(d.encargo_id, d.periodo, ...a, d.cubeta, d.motivo, u.nombre || u.email, u.id, d.criterio_id || null, new Date().toISOString()).run();
      return J({ ok: true, clasificados: r.meta?.changes ?? null }, 200, C);
    } catch (e) { return J({ error: e.message }, 409, C); }
  }
  return null;
}
