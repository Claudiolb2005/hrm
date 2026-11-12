// efirma.js — La e.firma del contribuyente: abrir el .key, comprobar que corresponde al .cer, firmar y guardarla cifrada.
//
// Reglas:
//   · La contraseña del .key se usa una vez, al cargar, y no se guarda ni se registra.
//   · La llave privada nunca se escribe en claro: se guarda cifrada con AES-256-GCM. La llave de cifrado se deriva
//     de un secreto del Worker (SAT_LLAVE_MAESTRA) que no vive en D1 ni en el repositorio: quien sólo tenga la base
//     de datos no puede firmar.
//   · El cifrado queda atado a la empresa y al RFC: un renglón copiado a otra empresa no abre.
import { elemento, hijos, oid, entero, aDer, base64, deBase64, leerCertificado } from './der.js';
import { descifrar3desCbc } from './des.js';

const te = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

const PRF = { '1.2.840.113549.2.7': 'SHA-1', '1.2.840.113549.2.9': 'SHA-256', '1.2.840.113549.2.10': 'SHA-384', '1.2.840.113549.2.11': 'SHA-512' };
const CIFRADOS = {
  '1.2.840.113549.3.7': { nombre: '3des', bytes: 24 },
  '2.16.840.1.101.3.4.1.2': { nombre: 'aes', bytes: 16 },
  '2.16.840.1.101.3.4.1.42': { nombre: 'aes', bytes: 32 },
};

/** Abre el .key (PKCS#8 cifrado, PBES2) con su contraseña. Devuelve el PKCS#8 en claro (sólo en memoria). */
export async function abrirLlave(bytes, contrasena) {
  const u8 = aDer(bytes);
  let partes;
  try { partes = hijos(u8, elemento(u8, 0)); } catch { throw new Error('El .key no es una llave privada del SAT'); }
  if (partes.length !== 2 || partes[0].tag !== 0x30 || partes[1].tag !== 0x04) {
    throw new Error('El .key no es una llave privada cifrada (se espera el archivo .key tal como lo entrega el SAT)');
  }
  const alg = hijos(u8, partes[0]);
  if (oid(alg[0].contenido) !== '1.2.840.113549.1.5.13') throw new Error('El .key usa un cifrado antiguo que no se admite (se espera PBES2)');
  const [kdf, cif] = hijos(u8, alg[1]);
  const kdfP = hijos(u8, kdf);
  if (oid(kdfP[0].contenido) !== '1.2.840.113549.1.5.12') throw new Error('El .key usa una derivación de llave que no se admite (se espera PBKDF2)');
  const p = hijos(u8, kdfP[1]);
  const sal = p[0].contenido, iter = Number(entero(p[1].contenido));
  const prfSeq = p.find(x => x.tag === 0x30);
  const hash = prfSeq ? PRF[oid(hijos(u8, prfSeq)[0].contenido)] : 'SHA-1';
  if (!hash) throw new Error('El .key usa una función de derivación que no se admite');
  const cifP = hijos(u8, cif);
  const c = CIFRADOS[oid(cifP[0].contenido)];
  if (!c) throw new Error('El .key usa un cifrado que no se admite');
  const iv = cifP[1].contenido;
  if (!Number.isInteger(iter) || iter < 1 || iter > 10000000) throw new Error('El .key trae un número de iteraciones inválido');

  const base = await subtle().importKey('raw', te.encode(String(contrasena)), 'PBKDF2', false, ['deriveBits']);
  const llave = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', salt: sal, iterations: iter, hash }, base, c.bytes * 8));
  let claro;
  try {
    if (c.nombre === '3des') claro = descifrar3desCbc(llave, iv, partes[1].contenido);
    else {
      const k = await subtle().importKey('raw', llave, 'AES-CBC', false, ['decrypt']);
      claro = new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, k, partes[1].contenido));
    }
    // Con la contraseña equivocada el relleno casi siempre falla; cuando no, lo descifrado no es un PKCS#8.
    const e = elemento(claro, 0);
    if (e.tag !== 0x30 || e.fin !== claro.length) throw new Error('no es PKCS#8');
  } catch { throw new Error('La contraseña de la llave privada no es correcta'); }
  return claro.slice();
}

async function llaveFirma(pkcs8, hash = 'SHA-1') {
  return subtle().importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['sign']);
}

/** ¿El .key es el par del .cer? Se firma un texto y se verifica con la llave pública del certificado. */
export async function correspondeAlCertificado(pkcs8, cert) {
  try {
    const priv = await llaveFirma(pkcs8, 'SHA-256');
    const pub = await subtle().importKey('spki', cert.spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const msg = te.encode('hrm:comprobar-par');
    return await subtle().verify('RSASSA-PKCS1-v1_5', pub, await subtle().sign('RSASSA-PKCS1-v1_5', priv, msg), msg);
  } catch { return false; }
}

/** Objeto con el que se arman las peticiones al SAT: datos del certificado y la función de firma (RSA-SHA1, como pide el servicio). */
export async function crearFirma(cert, pkcs8) {
  const k = await llaveFirma(pkcs8, 'SHA-1');
  return {
    rfc: cert.rfc, certificado_b64: cert.b64, emisor: cert.emisor, serie: cert.serie,
    firmar: async (texto) => base64(new Uint8Array(await subtle().sign('RSASSA-PKCS1-v1_5', k, te.encode(texto)))),
  };
}

// ── Guardado cifrado ──
async function llaveMaestra(secreto) {
  if (typeof secreto !== 'string' || secreto.length < 32) {
    throw new Error('Falta el secreto SAT_LLAVE_MAESTRA del Worker (32 caracteres o más): sin él la e.firma no se guarda ni se usa');
  }
  const base = await subtle().importKey('raw', te.encode(secreto), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('hrm/sat/efirma/v1'), info: te.encode('llave-privada') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const atadura = (empresa_id, rfc) => te.encode('empresa:' + Number(empresa_id) + '|rfc:' + rfc);

export async function cifrarLlave(secreto, pkcs8, { empresa_id, rfc }) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const c = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: atadura(empresa_id, rfc) }, await llaveMaestra(secreto), pkcs8);
  return { llave_cifrada: base64(new Uint8Array(c)), iv: base64(iv) };
}

export async function descifrarLlave(secreto, { llave_cifrada, iv }, { empresa_id, rfc }) {
  const k = await llaveMaestra(secreto);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: deBase64(iv), additionalData: atadura(empresa_id, rfc) }, k, deBase64(llave_cifrada)));
  } catch { throw new Error('La e.firma guardada no abre con el secreto actual del Worker: vuelve a cargarla'); }
}

/** Valida el par .cer/.key con su contraseña. No guarda nada. */
export async function validarEfirma({ cer, key, contrasena, hoy = new Date().toISOString() }) {
  const cert = leerCertificado(cer);
  const pkcs8 = await abrirLlave(key, contrasena);
  if (!(await correspondeAlCertificado(pkcs8, cert))) throw new Error('El .key no corresponde al .cer: son de certificados distintos');
  if (cert.vigente_hasta < hoy) throw new Error('El certificado venció el ' + cert.vigente_hasta.slice(0, 10) + ': hay que renovar la e.firma en el SAT');
  const avisos = [];
  if (cert.es_efirma === false) avisos.push('El certificado parece un sello digital (CSD), no una e.firma: el SAT sólo acepta la e.firma para la descarga');
  return { cert, pkcs8, avisos };
}
