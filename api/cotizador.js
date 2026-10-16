// api/cotizador.js — Cotizador en el portal, sólo HRM (D9): toma colaboradores, registros, corridas y carga patronal
// reales del encargo y deja la cotización guardada e inmutable.
//
// GET  /api/kernel/cotizador/perfil?encargo_id=   insumos tomados de los datos del encargo
// POST /api/kernel/cotizador                      { insumos, guardar?, empresa_id?, encargo_id?, prospecto? }
// GET  /api/kernel/cotizaciones?empresa_id=       cotizaciones guardadas
import { cotizar, TARIFA } from '../servicio/cotizador.js';
import { nuevoId } from '../kernel/src/sello.js';

async function cuerpo(request) { try { return await request.json(); } catch { return null; } }

export async function perfilDelEncargo(env, encargo_id) {
  const db = env.DB;
  const enc = await db.prepare('SELECT * FROM encargo WHERE id = ?1').bind(encargo_id).first();
  if (!enc) return null;
  const pre = await db.prepare("SELECT id FROM ingesta WHERE encargo_id = ?1 AND tipo = 'prenomina' AND estado = 'terminado' ORDER BY actualizado_en DESC LIMIT 1").bind(enc.id).first();
  const meses = Math.max(1, Math.round((Date.parse(enc.periodo_hasta) - Date.parse(enc.periodo_desde)) / (30.4 * 86400000)));
  const cal = await db.prepare('SELECT count(*) AS n FROM calendario_nomina WHERE encargo_id = ?1').bind(enc.id).first();
  const out = { encargo_id: enc.id, meses, corridas_mes: Math.round((cal.n || 0) / meses), carga_patronal_mensual_c: enc.carga_patronal_c ? Math.round(enc.carga_patronal_c / meses) : null,
    colaboradores: null, registros: null, percepciones_mensuales_c: null, fuente: [] };
  if (pre) {
    const ids = new Set(), regs = new Set();
    let perc = 0;
    const { results: ls } = await db.prepare('SELECT r2_key FROM ingesta_lote WHERE ingesta_id = ?1').bind(pre.id).all();
    for (const l of ls) {
      const o = await env.DOCS.get(l.r2_key);
      if (!o) continue;
      for (const linea of (await o.text()).split('\n')) if (linea) {
        const r = JSON.parse(linea);
        ids.add(String(r.colaborador_id).split('#')[0]);
        if (r.registro) regs.add(r.registro);
        perc += r.total_percepciones_c || 0;
      }
    }
    Object.assign(out, { colaboradores: ids.size, registros: regs.size, percepciones_mensuales_c: Math.round(perc / meses) });
    out.fuente.push('prenómina ' + pre.id);
  }
  if (enc.carga_patronal_c) out.fuente.push('carga patronal capturada en el encargo');
  return out;
}

export async function rutasCotizador(request, env, u, C, J) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/cotiza')) return null;
  if (u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);
  if (p === '/api/kernel/cotizador/perfil' && m === 'GET') {
    const r = await perfilDelEncargo(env, url.searchParams.get('encargo_id') || '');
    return r ? J({ perfil: r, tarifa: TARIFA }, 200, C) : J({ error: 'Encargo no existe' }, 404, C);
  }
  if (p === '/api/kernel/cotizador' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.insumos) return J({ error: 'Se espera { insumos }' }, 400, C);
    const q = cotizar(d.insumos);
    if (!q.cotizable) return J({ error: q.motivo }, 400, C);
    if (!d.guardar) return J({ cotizacion: q }, 200, C);
    if (!d.empresa_id && !d.prospecto) return J({ error: 'Para guardar indica la empresa o el prospecto' }, 400, C);
    const id = nuevoId('cot');
    await db.prepare('INSERT INTO cotizacion (id, empresa_id, encargo_id, prospecto, tarifa, insumos_json, resultado_json, iguala_mensual, diagnostico, creado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
      .bind(id, d.empresa_id ? Number(d.empresa_id) : null, d.encargo_id || null, d.prospecto || null, q.tarifa, JSON.stringify(d.insumos), JSON.stringify(q), q.iguala_mensual, q.diagnostico, u.id).run();
    return J({ ok: true, id, cotizacion: q }, 201, C);
  }
  if (p === '/api/kernel/cotizaciones' && m === 'GET') {
    const e = url.searchParams.get('empresa_id');
    const q = e ? db.prepare('SELECT id, empresa_id, encargo_id, prospecto, tarifa, iguala_mensual, diagnostico, creado_en FROM cotizacion WHERE empresa_id = ?1 ORDER BY creado_en DESC').bind(Number(e))
      : db.prepare('SELECT c.id, c.empresa_id, em.nombre AS empresa, c.encargo_id, c.prospecto, c.tarifa, c.iguala_mensual, c.diagnostico, c.creado_en FROM cotizacion c LEFT JOIN empresas em ON em.id = c.empresa_id ORDER BY c.creado_en DESC LIMIT 100');
    return J({ cotizaciones: (await q.all()).results }, 200, C);
  }
  return null;
}
