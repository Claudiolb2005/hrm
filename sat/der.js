// der.js — Lector mínimo de ASN.1 DER y del certificado X.509 de la e.firma. Sin dependencias.
//
// Sólo lo que hace falta para firmar ante el SAT: emisor (texto), número de serie (decimal), RFC del titular,
// vigencia, llave pública (para comprobar que el .key corresponde al .cer) y si el certificado es e.firma o sello.

const td = new TextDecoder('utf-8');

/** Un elemento DER en `u8` a partir de `pos`: etiqueta, contenido y dónde termina. */
export function elemento(u8, pos = 0) {
  if (pos + 2 > u8.length) throw new Error('DER truncado');
  const tag = u8[pos];
  let len = u8[pos + 1], p = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('DER: longitud no soportada');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + u8[p++];
  }
  if (p + len > u8.length) throw new Error('DER truncado');
  return { tag, ini: p, fin: p + len, pos, contenido: u8.subarray(p, p + len), completo: u8.subarray(pos, p + len) };
}

/** Hijos de un elemento construido (SEQUENCE, SET, [n]). */
export function hijos(u8, e) {
  const out = [];
  let p = e.ini;
  while (p < e.fin) { const h = elemento(u8, p); out.push(h); p = h.fin; }
  return out;
}

export function oid(bytes) {
  const out = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0;
  for (let i = 1; i < bytes.length; i++) {
    v = v * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) { out.push(v); v = 0; }
  }
  return out.join('.');
}

export function entero(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function texto(e) {
  // BMPString (UTF-16BE) es raro en certificados del SAT, pero se lee; el resto se trata como UTF-8/ASCII.
  if (e.tag === 0x1e) { let s = ''; for (let i = 0; i + 1 < e.contenido.length; i += 2) s += String.fromCharCode((e.contenido[i] << 8) | e.contenido[i + 1]); return s; }
  return td.decode(e.contenido);
}

function fechaDer(e) {
  const s = td.decode(e.contenido);
  const m = e.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s);
  if (!m) throw new Error('Certificado: fecha no reconocida');
  const anio = e.tag === 0x17 ? (Number(m[1]) >= 50 ? 1900 : 2000) + Number(m[1]) : Number(m[1]);
  return anio + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') + 'Z';
}

// Nombres de atributo como los escribe la referencia pública del servicio (phpcfdi) en X509IssuerName.
const ATRIBUTOS = {
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.5': 'serialNumber', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.9': 'street',
  '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title', '2.5.4.17': 'postalCode', '2.5.4.41': 'name', '2.5.4.42': 'GN',
  '2.5.4.45': 'x500UniqueIdentifier', '1.2.840.113549.1.9.1': 'emailAddress', '1.2.840.113549.1.9.2': 'unstructuredName',
};

function nombre(u8, e) {
  const pares = [];
  for (const set of hijos(u8, e)) for (const par of hijos(u8, set)) {
    const [k, v] = hijos(u8, par);
    pares.push([oid(k.contenido), texto(v)]);
  }
  const escapar = (s) => s.replace(/([,+"\\<>;])/g, '\\$1').replace(/^([ #])/, '\\$1').replace(/ $/, '\\ ');
  return { pares, texto: pares.map(([k, v]) => (ATRIBUTOS[k] || k) + '=' + escapar(v)).join(',') };
}

export function base64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function deBase64(b64) {
  const s = atob(String(b64).replace(/\s+/g, ''));
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/** Acepta el archivo tal como lo entrega el SAT (DER) o en PEM. */
export function aDer(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0x2d) { // '-----BEGIN'
    const t = td.decode(u8);
    const m = /-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/.exec(t);
    if (!m) throw new Error('PEM inválido');
    return deBase64(m[1]);
  }
  return u8;
}

/** Lee el .cer de la e.firma. */
export function leerCertificado(bytes) {
  const u8 = aDer(bytes);
  let cert;
  try { cert = elemento(u8, 0); } catch { throw new Error('El .cer no es un certificado'); }
  if (cert.tag !== 0x30) throw new Error('El .cer no es un certificado');
  const tbs = hijos(u8, hijos(u8, cert)[0]);
  let i = 0;
  if (tbs[0].tag === 0xa0) i = 1; // versión
  const serie = tbs[i], emisor = tbs[i + 2], validez = tbs[i + 3], sujeto = tbs[i + 4], spki = tbs[i + 5];
  if (!serie || serie.tag !== 0x02 || !spki || spki.tag !== 0x30) throw new Error('El .cer no es un certificado X.509');
  const [desde, hasta] = hijos(u8, validez).map(fechaDer);
  const em = nombre(u8, emisor), su = nombre(u8, sujeto);
  const dato = (k) => (su.pares.find(([o]) => o === k) || [])[1] || '';
  // x500UniqueIdentifier: «RFC» en persona física y «RFC / RFC del representante» en persona moral.
  const rfc = dato('2.5.4.45').split('/')[0].trim().toUpperCase();
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw new Error('El certificado no trae un RFC en el titular: no es un certificado del SAT');
  // Uso de la llave (2.5.29.15): la e.firma trae «acuerdo de llaves»; el sello (CSD) sólo firma.
  let esEfirma = null;
  const ext = tbs.find(x => x.tag === 0xa3);
  if (ext) for (const x of hijos(u8, hijos(u8, ext)[0])) {
    const p = hijos(u8, x);
    if (oid(p[0].contenido) !== '2.5.29.15') continue;
    const bits = elemento(u8, p[p.length - 1].ini); // BIT STRING dentro del OCTET STRING
    esEfirma = bits.contenido.length > 1 && (bits.contenido[1] & 0x08) !== 0;
  }
  return {
    rfc, titular: dato('2.5.4.3') || dato('2.5.4.41') || dato('2.5.4.10'),
    serie: entero(serie.contenido).toString(10),
    serie_sat: /^[\x30-\x39]+$/.test(td.decode(serie.contenido)) ? td.decode(serie.contenido) : null, // el SAT escribe su número de 20 dígitos en ASCII
    emisor: em.texto, vigente_desde: desde, vigente_hasta: hasta,
    es_efirma: esEfirma, spki: spki.completo.slice(), der: u8, b64: base64(u8),
  };
}
