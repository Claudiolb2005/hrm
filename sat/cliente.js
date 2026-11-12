// cliente.js — Las cuatro operaciones del Web Service de Descarga Masiva del SAT.
//
//   autenticar ─► token (5 min) ─► solicitar ─► verificar (hasta que termine) ─► descargar cada paquete
//
// No guarda nada: recibe la firma (sat/efirma.js) y devuelve lo que contestó el SAT. `fetch` se inyecta para las pruebas.
import { EXTREMOS, ACCIONES, sobreAutenticar, sobreSolicitar, sobreVerificar, sobreDescargar, fallaSoap, leerToken, leerSolicitud, leerVerificacion, atributosDe } from './soap.js';
import { deBase64 } from './der.js';

/** Error del servicio. `transitorio`: vale la pena reintentar más tarde (red, 5xx, SAT caído). */
export class ErrorSat extends Error {
  constructor(mensaje, { transitorio = false, codigo = null } = {}) { super(mensaje); this.name = 'ErrorSat'; this.transitorio = transitorio; this.codigo = codigo; }
}

async function enviar(http, operacion, sobre, token) {
  const headers = { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: ACCIONES[operacion] };
  if (token) headers.Authorization = 'WRAP access_token="' + token + '"';
  let r;
  try { r = await http(EXTREMOS[operacion], { method: 'POST', headers, body: sobre }); }
  catch (e) { throw new ErrorSat('No se pudo conectar con el SAT (' + operacion + '): ' + String(e && e.message || e).slice(0, 200), { transitorio: true }); }
  return r;
}

async function texto(r, operacion) {
  const t = await r.text();
  const falla = fallaSoap(t);
  // Una falla de seguridad es de la firma o del certificado; cualquier otra falla del servidor se reintenta.
  if (falla) throw new ErrorSat('El SAT rechazó la petición (' + operacion + '): ' + falla.mensaje, { transitorio: !/security|seguridad|InvalidSecurity|FailedAuthentication/i.test(falla.codigo + ' ' + falla.mensaje), codigo: falla.codigo });
  if (r.status >= 500) throw new ErrorSat('El SAT respondió ' + r.status + ' (' + operacion + ')', { transitorio: true });
  if (r.status >= 400) throw new ErrorSat('El SAT respondió ' + r.status + ' (' + operacion + ')', { transitorio: r.status === 408 || r.status === 429 });
  if (!t.trim()) throw new ErrorSat('El SAT respondió vacío (' + operacion + ')', { transitorio: true });
  return t;
}

export async function autenticar(firma, { http = fetch, ahora = Date.now() } = {}) {
  const sobre = await sobreAutenticar(firma, { creado: ahora, expira: ahora + 5 * 60000 });
  const tok = leerToken(await texto(await enviar(http, 'autenticar', sobre, null), 'autenticar'));
  if (!tok.valor) throw new ErrorSat('El SAT no entregó el token de acceso', { transitorio: true });
  return tok;
}

export async function solicitar(firma, token, parametros, { http = fetch } = {}) {
  return leerSolicitud(await texto(await enviar(http, 'solicitar', await sobreSolicitar(firma, parametros), token), 'solicitar'));
}

export async function verificar(firma, token, id_solicitud, { http = fetch } = {}) {
  return leerVerificacion(await texto(await enviar(http, 'verificar', await sobreVerificar(firma, id_solicitud), token), 'verificar'));
}

/**
 * Descarga un paquete y lo entrega por partes a `escribir(u8)` sin tener nunca el paquete completo en memoria:
 * la respuesta es un XML con el ZIP en base64 dentro de <Paquete>, que puede pesar decenas de MB.
 * Devuelve { cod_estatus, mensaje, bytes }.
 */
export async function descargar(firma, token, id_paquete, escribir, { http = fetch } = {}) {
  const r = await enviar(http, 'descargar', await sobreDescargar(firma, id_paquete), token);
  if (r.status >= 400 || !r.body) { await texto(r, 'descargar'); throw new ErrorSat('El SAT respondió ' + r.status + ' (descargar)', { transitorio: true }); }
  // La respuesta es ASCII (XML y base64): se pasa a texto byte por byte, sin depender de qué codificaciones trae el entorno.
  const ascii = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return t; };
  const lector = r.body.getReader();
  let cabeza = '', dentro = false, fin = false, resto = '', bytes = 0, cola = '';
  const volcar = async (b64, final) => {
    let s = (resto + b64).replace(/\s+/g, '');
    const util = final ? s.length : s.length - (s.length % 4);
    resto = s.slice(util); s = s.slice(0, util);
    if (!s) return;
    let u8;
    try { u8 = deBase64(s); } catch { throw new ErrorSat('El paquete del SAT llegó dañado (base64 inválido)', { transitorio: true }); }
    bytes += u8.length;
    await escribir(u8);
  };
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    let t = ascii(value);
    if (fin) { cola += t.slice(0, 2000); continue; }
    if (!dentro) {
      cabeza += t;
      const m = /<(?:[\w.-]+:)?Paquete(?:\s[^>]*)?>/.exec(cabeza);
      if (!m) { if (cabeza.length > 200000) throw new ErrorSat('Respuesta del SAT no reconocida (descargar)', { transitorio: true }); continue; }
      t = cabeza.slice(m.index + m[0].length); cabeza = cabeza.slice(0, m.index); dentro = true;
    }
    const c = t.indexOf('<');
    if (c >= 0) { await volcar(t.slice(0, c), true); fin = true; cola = t.slice(c); } else await volcar(t, false);
  }
  const falla = fallaSoap(cabeza + cola);
  if (falla) throw new ErrorSat('El SAT rechazó la petición (descargar): ' + falla.mensaje, { transitorio: !/security|InvalidSecurity/i.test(falla.codigo + falla.mensaje), codigo: falla.codigo });
  const a = atributosDe(cabeza + cola, 'respuesta') || {};
  if (dentro && !fin) throw new ErrorSat('La descarga del paquete se cortó', { transitorio: true });
  return { cod_estatus: a.CodEstatus ? Number(a.CodEstatus) : null, mensaje: a.Mensaje || '', bytes };
}
