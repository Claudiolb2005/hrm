// api/sat.js — Descarga directa del SAT (Web Service de Descarga Masiva). Sólo admin (HRM).
//
// /api/kernel/sat/credencial            GET ?empresa_id · POST multipart (empresa_id, cer, key, contrasena)
// /api/kernel/sat/credencial/borrar     POST { empresa_id }
// /api/kernel/sat/probar                POST { empresa_id }            autentica ante el SAT, no pide nada
// /api/kernel/sat/solicitudes           GET ?encargo_id · POST { encargo_id, tipos?, desde?, hasta? }
// /api/kernel/sat/avanzar               POST { id }                    verifica o baja ahora, sin esperar a la tarea programada
// /api/kernel/sat/reintentar            POST { id }
// /api/kernel/sat/bitacora              GET ?empresa_id
//
// La e.firma es del cliente: no se abre al perfil «carga» ni al socio (no están en la lista blanca de permisos.js y
// aquí se exige admin). La contraseña del .key viaja una vez en el formulario, por HTTPS, y no se guarda ni se registra.
import { estadoCredencial, guardarCredencial, borrarCredencial, probarConexion, crearSolicitudes, listarSolicitudes, avanzarSat, reintentarSat } from '../sat/descarga.js';

async function cuerpo(request) { try { return await request.json(); } catch { return null; } }
const MAX_ARCHIVO = 20000; // un .cer o un .key del SAT pesan menos de 3 KB

export async function rutasSat(request, env, u, C, J, ctx) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/sat/')) return null;
  if (!u || u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);

  if (p === '/api/kernel/sat/credencial' && m === 'GET') {
    const id = Number(url.searchParams.get('empresa_id'));
    if (!Number.isInteger(id)) return J({ error: 'empresa_id requerido' }, 400, C);
    return J(await estadoCredencial(env, id), 200, C);
  }
  if (p === '/api/kernel/sat/credencial' && m === 'POST') {
    const fd = await request.formData().catch(() => null);
    const cer = fd && fd.get('cer'), key = fd && fd.get('key'), contrasena = fd && fd.get('contrasena');
    const empresa_id = Number(fd && fd.get('empresa_id'));
    if (!cer || !key || typeof cer === 'string' || typeof key === 'string' || typeof contrasena !== 'string' || !contrasena || !Number.isInteger(empresa_id)) {
      return J({ error: 'Faltan campos: empresa_id, cer (archivo .cer), key (archivo .key) y contrasena' }, 400, C);
    }
    if (cer.size > MAX_ARCHIVO || key.size > MAX_ARCHIVO) return J({ error: 'Los archivos de la e.firma pesan unos cuantos KB: revisa que sean el .cer y el .key' }, 413, C);
    try {
      const r = await guardarCredencial(env, { empresa_id, cer: new Uint8Array(await cer.arrayBuffer()), key: new Uint8Array(await key.arrayBuffer()), contrasena, usuario_id: u.id });
      return J({ ok: true, ...r }, 201, C);
    } catch (e) { return J({ error: e.message }, 400, C); }
  }
  if (p === '/api/kernel/sat/bitacora' && m === 'GET') {
    const { results } = await db.prepare('SELECT b.accion, b.detalle, b.en, us.nombre AS usuario FROM sat_bitacora b LEFT JOIN usuarios us ON us.id = b.usuario_id WHERE b.empresa_id = ?1 ORDER BY b.id DESC LIMIT 100')
      .bind(Number(url.searchParams.get('empresa_id'))).all();
    return J({ bitacora: results }, 200, C);
  }
  if (p === '/api/kernel/sat/solicitudes' && m === 'GET') {
    return J({ solicitudes: await listarSolicitudes(db, url.searchParams.get('encargo_id')) }, 200, C);
  }

  if (m !== 'POST') return null;
  const d = await cuerpo(request);
  if (!d || typeof d !== 'object') return J({ error: 'JSON inválido' }, 400, C);
  if (p === '/api/kernel/sat/credencial/borrar') {
    if (!Number.isInteger(Number(d.empresa_id))) return J({ error: 'empresa_id requerido' }, 400, C);
    return J({ ok: true, ...(await borrarCredencial(env, d.empresa_id, u.id)) }, 200, C);
  }
  if (p === '/api/kernel/sat/probar') {
    try { return J(await probarConexion(env, d.empresa_id, u.id), 200, C); }
    catch (e) { return J({ error: e.message }, 502, C); }
  }
  if (p === '/api/kernel/sat/solicitudes') {
    let r;
    try { r = await crearSolicitudes(env, { encargo_id: d.encargo_id, tipos: d.tipos, desde: d.desde, hasta: d.hasta, usuario_id: u.id }); }
    catch (e) { return J({ error: e.message }, 400, C); }
    // Se envían al SAT de una vez; lo demás lo lleva la tarea programada.
    const enviar = (async () => { for (const id of r.solicitudes) await avanzarSat(env, { solicitud_id: id, presupuesto_ms: 20000 }); })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(enviar); else await enviar;
    return J({ ok: true, ...r }, 201, C);
  }
  if (p === '/api/kernel/sat/avanzar') {
    if (!d.id) return J({ error: 'id requerido' }, 400, C);
    const r = await avanzarSat(env, { solicitud_id: String(d.id), forzar: true, presupuesto_ms: 20000 });
    return J(r, 200, C);
  }
  if (p === '/api/kernel/sat/reintentar') {
    const estado = d.id ? await reintentarSat(env, d.id) : false;
    if (!estado) return J({ error: 'Sólo se reintenta una solicitud en error; una rechazada, vencida o sin datos se pide de nuevo' }, 400, C);
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzarSat(env, { solicitud_id: String(d.id), presupuesto_ms: 20000 }));
    return J({ ok: true, estado }, 200, C);
  }
  return null;
}
