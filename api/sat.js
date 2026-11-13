// api/sat.js — Descarga directa del SAT (Web Service de Descarga Masiva). HRM (admin) y el perfil «carga» del cliente.
//
// /api/kernel/sat/credencial            GET ?empresa_id · POST multipart (empresa_id, cer, key, contrasena)
// /api/kernel/sat/credencial/borrar     POST { empresa_id }
// /api/kernel/sat/probar                POST { empresa_id }            autentica ante el SAT, no pide nada
// /api/kernel/sat/solicitudes           GET ?encargo_id · POST { encargo_id, tipos?, desde?, hasta? }
// /api/kernel/sat/avanzar               POST { id }                    verifica o baja ahora, sin esperar a la tarea programada
// /api/kernel/sat/reintentar            POST { id }
// /api/kernel/sat/bitacora              GET ?empresa_id                sólo admin
//
// La e.firma es del cliente. Desde el 12-nov-2026 (decisión de Claudio) el perfil «carga» la administra para SU
// empresa y pide las descargas de sus encargos abiertos: la lista blanca y el alcance por empresa están en
// permisos.js y aquí se vuelve a comprobar la empresa. El socio de consulta no entra y la bitácora es sólo de HRM.
// La contraseña del .key viaja una vez en el formulario, por HTTPS, y no se guarda ni se registra.
import { esCarga, puedeOperar } from './permisos.js';
import { estadoCredencial, guardarCredencial, borrarCredencial, probarConexion, crearSolicitudes, listarSolicitudes, avanzarSat, reintentarSat } from '../sat/descarga.js';

async function cuerpo(request) { try { return await request.json(); } catch { return null; } }
const MAX_ARCHIVO = 20000; // un .cer o un .key del SAT pesan menos de 3 KB

export async function rutasSat(request, env, u, C, J, ctx) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method, db = env.DB;
  if (!p.startsWith('/api/kernel/sat/')) return null;
  if (!puedeOperar(u)) return J({ error: 'Forbidden' }, 403, C);
  // Segunda comprobación para el perfil «carga» (la primera es la lista blanca): sólo su empresa. 404 y no 403,
  // para no confirmar que existe algo de otra empresa.
  const ajena = (empresa_id) => esCarga(u) && Number(empresa_id) !== Number(u.empresa_id);
  const NO_ES = () => J({ error: 'No encontrado' }, 404, C);

  if (p === '/api/kernel/sat/credencial' && m === 'GET') {
    const id = Number(url.searchParams.get('empresa_id'));
    if (!Number.isInteger(id)) return J({ error: 'empresa_id requerido' }, 400, C);
    if (ajena(id)) return NO_ES();
    return J(await estadoCredencial(env, id), 200, C);
  }
  if (p === '/api/kernel/sat/credencial' && m === 'POST') {
    const fd = await request.formData().catch(() => null);
    const cer = fd && fd.get('cer'), key = fd && fd.get('key'), contrasena = fd && fd.get('contrasena');
    const empresa_id = Number(fd && fd.get('empresa_id'));
    if (!cer || !key || typeof cer === 'string' || typeof key === 'string' || typeof contrasena !== 'string' || !contrasena || !Number.isInteger(empresa_id)) {
      return J({ error: 'Faltan campos: empresa_id, cer (archivo .cer), key (archivo .key) y contrasena' }, 400, C);
    }
    if (ajena(empresa_id)) return NO_ES();
    if (cer.size > MAX_ARCHIVO || key.size > MAX_ARCHIVO) return J({ error: 'Los archivos de la e.firma pesan unos cuantos KB: revisa que sean el .cer y el .key' }, 413, C);
    try {
      const r = await guardarCredencial(env, { empresa_id, cer: new Uint8Array(await cer.arrayBuffer()), key: new Uint8Array(await key.arrayBuffer()), contrasena, usuario_id: u.id });
      return J({ ok: true, ...r }, 201, C);
    } catch (e) { return J({ error: e.message }, 400, C); }
  }
  if (p === '/api/kernel/sat/bitacora' && m === 'GET') {
    if (u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);
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
    if (ajena(d.empresa_id)) return NO_ES();
    return J({ ok: true, ...(await borrarCredencial(env, d.empresa_id, u.id)) }, 200, C);
  }
  if (p === '/api/kernel/sat/probar') {
    if (!Number.isInteger(Number(d.empresa_id))) return J({ error: 'empresa_id requerido' }, 400, C);
    if (ajena(d.empresa_id)) return NO_ES();
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
