// soap.js — Mensajes del Web Service de Descarga Masiva del SAT (versión 1.5, 30-may-2025). Funciones puras.
//
// El servicio no acepta cualquier XML firmado: espera los sobres exactamente con esta forma (digestión SHA-1 del
// nodo sin espacios entre etiquetas, SignedInfo en forma canónica exclusiva, firma RSA-SHA1 con la e.firma).
// La forma se fijó contra las peticiones grabadas de la referencia pública phpcfdi/sat-ws-descarga-masiva:
// con la misma llave y los mismos datos, la firma sale idéntica byte por byte (ver pruebas).

export const EXTREMOS = {
  autenticar: 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc',
  solicitar: 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc',
  verificar: 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc',
  descargar: 'https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaService.svc',
};
export const ACCIONES = {
  autenticar: 'http://DescargaMasivaTerceros.gob.mx/IAutenticacion/Autentica',
  solicitar: 'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaEmitidos',
  verificar: 'http://DescargaMasivaTerceros.sat.gob.mx/IVerificaSolicitudDescargaService/VerificaSolicitudDescarga',
  descargar: 'http://DescargaMasivaTerceros.sat.gob.mx/IDescargaMasivaTercerosService/Descargar',
};

const NS_DES = 'http://DescargaMasivaTerceros.sat.gob.mx';
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const NS_WSU = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const NS_WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';

export const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sha1B64(texto) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto)));
  let s = ''; for (const b of h) s += String.fromCharCode(b);
  return btoa(s);
}

async function firmaXml(firma, aDigerir, uri, keyInfo) {
  const digestion = await sha1B64(aDigerir);
  const cuerpo = '<CanonicalizationMethod Algorithm="' + C14N + '"></CanonicalizationMethod><SignatureMethod Algorithm="' + NS_DSIG + 'rsa-sha1"></SignatureMethod>' +
    '<Reference URI="' + uri + '"><Transforms><Transform Algorithm="' + C14N + '"></Transform></Transforms>' +
    '<DigestMethod Algorithm="' + NS_DSIG + 'sha1"></DigestMethod><DigestValue>' + digestion + '</DigestValue></Reference></SignedInfo>';
  const valor = await firma.firmar('<SignedInfo xmlns="' + NS_DSIG + '">' + cuerpo); // se firma con el espacio de nombres declarado
  return '<Signature xmlns="' + NS_DSIG + '"><SignedInfo>' + cuerpo + '<SignatureValue>' + valor + '</SignatureValue>' + keyInfo + '</Signature>';
}

const keyInfoCertificado = (firma) => '<KeyInfo><X509Data><X509IssuerSerial><X509IssuerName>' + escXml(firma.emisor) + '</X509IssuerName><X509SerialNumber>' + firma.serie +
  '</X509SerialNumber></X509IssuerSerial><X509Certificate>' + firma.certificado_b64 + '</X509Certificate></X509Data></KeyInfo>';

/** Fecha y hora UTC con milisegundos, como las pide la autenticación. */
export const fechaSat = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, '.000Z');

export function idToken() {
  const a = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const h = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  return 'uuid-' + h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20) + '-1';
}

/** Autenticación: sello de tiempo de 5 minutos firmado. */
export async function sobreAutenticar(firma, { creado, expira, id = idToken() }) {
  const tiempos = '<u:Created>' + fechaSat(creado) + '</u:Created><u:Expires>' + fechaSat(expira) + '</u:Expires></u:Timestamp>';
  const sello = await firmaXml(firma, '<u:Timestamp xmlns:u="' + NS_WSU + '" u:Id="_0">' + tiempos, '#_0',
    '<KeyInfo><o:SecurityTokenReference><o:Reference URI="#' + id + '" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"/></o:SecurityTokenReference></KeyInfo>');
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="' + NS_WSU + '"><s:Header><o:Security xmlns:o="' + NS_WSSE + '" s:mustUnderstand="1">' +
    '<u:Timestamp u:Id="_0">' + tiempos +
    '<o:BinarySecurityToken u:Id="' + id + '" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" ' +
    'EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + firma.certificado_b64 + '</o:BinarySecurityToken>' +
    sello + '</o:Security></s:Header><s:Body><Autentica xmlns="http://DescargaMasivaTerceros.gob.mx"/></s:Body></s:Envelope>';
}

async function sobreFirmado(firma, nodo, hijo, atributos) {
  const attrs = Object.keys(atributos).filter(k => atributos[k] !== '' && atributos[k] != null).sort() // en orden alfabético
    .map(k => k + '="' + escXml(atributos[k]) + '"').join(' ');
  const sello = await firmaXml(firma, '<des:' + nodo + ' xmlns:des="' + NS_DES + '"><des:' + hijo + ' ' + attrs + '></des:' + hijo + '></des:' + nodo + '>', '', keyInfoCertificado(firma));
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="' + NS_DES + '" xmlns:xd="' + NS_DSIG + '"><s:Header/><s:Body>' +
    '<des:' + nodo + '><des:' + hijo + ' ' + attrs + '>' + sello + '</des:' + hijo + '></des:' + nodo + '></s:Body></s:Envelope>';
}

/**
 * Solicitud de comprobantes EMITIDOS por el RFC de la e.firma.
 * tipo: 'Metadata' | 'CFDI' · fechas 'AAAA-MM-DDTHH:MM:SS' (hora del centro de México, sin zona) · tipo_comprobante 'N' = nómina.
 * estado: 'Todos' | 'Vigente' | 'Cancelado'.
 */
export function sobreSolicitar(firma, { tipo, fecha_inicial, fecha_final, tipo_comprobante = '', estado = 'Todos' }) {
  if (!['Metadata', 'CFDI'].includes(tipo)) throw new Error('TipoSolicitud: Metadata o CFDI');
  const f = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;
  if (!f.test(fecha_inicial) || !f.test(fecha_final)) throw new Error('Fechas de la solicitud: AAAA-MM-DDTHH:MM:SS');
  if (!(fecha_inicial < fecha_final)) throw new Error('La fecha inicial debe ser anterior a la final');
  return sobreFirmado(firma, 'SolicitaDescargaEmitidos', 'solicitud', {
    EstadoComprobante: estado, FechaFinal: fecha_final, FechaInicial: fecha_inicial, RfcEmisor: firma.rfc, RfcSolicitante: firma.rfc,
    TipoComprobante: tipo_comprobante, TipoSolicitud: tipo,
  });
}
export const sobreVerificar = (firma, id_solicitud) => sobreFirmado(firma, 'VerificaSolicitudDescarga', 'solicitud', { IdSolicitud: id_solicitud, RfcSolicitante: firma.rfc });
export const sobreDescargar = (firma, id_paquete) => sobreFirmado(firma, 'PeticionDescargaMasivaTercerosEntrada', 'peticionDescarga', { IdPaquete: id_paquete, RfcSolicitante: firma.rfc });

// ── Respuestas ──
const desesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/** Atributos del primer elemento con ese nombre local (con cualquier prefijo). */
export function atributosDe(xml, nombre) {
  const m = new RegExp('<(?:[\\w.-]+:)?' + nombre + '(\\s[^>]*?)?/?>').exec(xml);
  if (!m) return null;
  const out = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let a;
  while ((a = re.exec(m[1] || ''))) out[a[1]] = desesc(a[2] ?? a[3]);
  return out;
}
export function contenidosDe(xml, nombre) {
  const re = new RegExp('<(?:[\\w.-]+:)?' + nombre + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?' + nombre + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(desesc(m[1].trim()));
  return out;
}

/** Falla SOAP (p. ej. firma o certificado rechazados): { codigo, mensaje } o null. */
export function fallaSoap(xml) {
  if (!/<(?:[\w.-]+:)?Fault[\s>]/.test(xml)) return null;
  return { codigo: (contenidosDe(xml, 'faultcode')[0] || '').replace(/\s+/g, ' '), mensaje: (contenidosDe(xml, 'faultstring')[0] || 'Falla del servicio del SAT').replace(/\s+/g, ' ') };
}

export function leerToken(xml) {
  const valor = contenidosDe(xml, 'AutenticaResult')[0] || '';
  return { valor, creado: contenidosDe(xml, 'Created')[0] || null, expira: contenidosDe(xml, 'Expires')[0] || null };
}
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

export function leerSolicitud(xml) {
  const a = atributosDe(xml, 'SolicitaDescargaEmitidosResult') || {};
  return { cod_estatus: num(a.CodEstatus), mensaje: a.Mensaje || '', id_solicitud: a.IdSolicitud || '' };
}
export function leerVerificacion(xml) {
  const a = atributosDe(xml, 'VerificaSolicitudDescargaResult') || {};
  return { cod_estatus: num(a.CodEstatus), mensaje: a.Mensaje || '', estado_solicitud: num(a.EstadoSolicitud), codigo_estado_solicitud: num(a.CodigoEstadoSolicitud),
    numero_cfdis: num(a.NumeroCFDIs), paquetes: contenidosDe(xml, 'IdsPaquetes').filter(Boolean) };
}

// Lo que el SAT dice con cada código, en palabras del portal.
export const ESTADOS_SOLICITUD = { 1: 'Aceptada', 2: 'En proceso', 3: 'Terminada', 4: 'Error', 5: 'Rechazada', 6: 'Vencida' };
export const CODIGOS = {
  300: 'Usuario no válido', 301: 'XML mal formado', 302: 'Sello mal formado', 303: 'El sello no corresponde al RFC solicitante', 304: 'Certificado revocado o caduco',
  305: 'Certificado inválido', 404: 'Error no controlado del SAT: reintentar más tarde', 5000: 'Solicitud recibida con éxito', 5001: 'Tercero no autorizado',
  5002: 'Se agotaron las solicitudes de por vida para esos mismos parámetros', 5003: 'Tope máximo: el periodo supera el límite de comprobantes por solicitud',
  5004: 'No se encontró información', 5005: 'Solicitud duplicada: ya hay una vigente con los mismos parámetros', 5006: 'Error interno del SAT',
};
