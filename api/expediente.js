// api/expediente.js — Expediente de defensa del encargo (N6) e inventario de datos (N7.3). Sólo admin.
// GET  /api/kernel/expediente?encargo_id=      papeles de trabajo, archivos fuente con su plazo, inventario
// POST /api/kernel/expediente/retencion        { encargo_id, retencion_contrato_hasta }
import { conservarHasta, categoriaDe, INVENTARIO } from '../servicio/expediente.js';

async function cuerpo(request) { try { return await request.json(); } catch { return null; } }

export async function rutasExpediente(request, env, u, C, J) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/expediente')) return null;
  if (u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);
  if (p === '/api/kernel/expediente/retencion' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || (d.retencion_contrato_hasta && !/^\d{4}-\d{2}-\d{2}$/.test(d.retencion_contrato_hasta))) return J({ error: 'Se espera { encargo_id, retencion_contrato_hasta: AAAA-MM-DD | null }' }, 400, C);
    await db.prepare('UPDATE encargo SET retencion_contrato_hasta = ?2 WHERE id = ?1').bind(d.encargo_id, d.retencion_contrato_hasta || null).run();
    return J({ ok: true }, 200, C);
  }
  if (p === '/api/kernel/expediente' && m === 'GET') {
    const enc = await db.prepare('SELECT * FROM encargo WHERE id = ?1').bind(url.searchParams.get('encargo_id') || '').first();
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    const n = async (sql) => ((await db.prepare(sql).bind(enc.id).first()) || {}).n || 0;
    const papeles = {
      ejecuciones: await n('SELECT count(*) AS n FROM ejecucion WHERE encargo_id = ?1'),
      calculos: await n('SELECT count(*) AS n FROM calculo_kernel WHERE encargo_id = ?1'),
      diferencias: await n('SELECT count(*) AS n FROM v_diferencia WHERE encargo_id = ?1'),
      cruces_cfdi: await n('SELECT count(*) AS n FROM cruce_cfdi WHERE encargo_id = ?1'),
      comprobantes: await n('SELECT count(*) AS n FROM comprobante WHERE encargo_id = ?1'),
      casos_afiliacion: await n('SELECT count(*) AS n FROM cruce_afiliacion WHERE encargo_id = ?1'),
      hallazgos: await n('SELECT count(*) AS n FROM hallazgo WHERE encargo_id = ?1'),
      bitacora_hallazgos: await n('SELECT count(*) AS n FROM hallazgo_bitacora b JOIN hallazgo h ON h.id = b.hallazgo_id WHERE h.encargo_id = ?1'),
      dictamenes: await n('SELECT count(*) AS n FROM dictamen WHERE encargo_id = ?1'),
    };
    const hasta = conservarHasta(enc.ejercicio, enc.retencion_contrato_hasta);
    const archivos = [];
    const listar = async (prefix) => {
      let cursor;
      do {
        const r = await env.DOCS.list({ prefix, cursor, include: ['customMetadata'] });
        for (const o of r.objects) archivos.push({ key: o.key, tamano: o.size, subido: o.uploaded || null, categoria: categoriaDe(o.key),
          conservar_hasta: (o.customMetadata && o.customMetadata.conservar_hasta) || hasta });
        cursor = r.truncated ? r.cursor : null;
      } while (cursor && archivos.length < 5000);
    };
    await listar('encargos/' + enc.id + '/');
    const { results: ings } = await db.prepare('SELECT id FROM ingesta WHERE encargo_id = ?1').bind(enc.id).all();
    for (const i of ings) await listar('ingestas/' + i.id + '/');
    const hoy = new Date().toISOString().slice(0, 10);
    const porCategoria = {};
    for (const a of archivos) { const c = porCategoria[a.categoria] || (porCategoria[a.categoria] = { archivos: 0, bytes: 0 }); c.archivos += 1; c.bytes += a.tamano || 0; }
    return J({ encargo: { id: enc.id, ejercicio: enc.ejercicio, retencion_contrato_hasta: enc.retencion_contrato_hasta },
      papeles_de_trabajo: { conservacion: 'Permanente: la base impide borrarlos', conteos: papeles },
      archivos_fuente: { conservar_hasta: hasta, regla: 'Cinco años después de la última declaración del ejercicio ' + enc.ejercicio + ' (anual: 31-mar-' + (enc.ejercicio + 1) + '), o lo que pida el contrato si es mayor',
        por_categoria: porCategoria, archivos: archivos.slice(0, 500), total: archivos.length, vencidos: archivos.filter(a => a.conservar_hasta && a.conservar_hasta < hoy).length },
      inventario: INVENTARIO }, 200, C);
  }
  return null;
}
