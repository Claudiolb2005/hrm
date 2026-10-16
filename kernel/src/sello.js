// sello.js — Huellas SHA-256 y sello de ejecución (T2, decisión 5).
//
// Cada ejecución se sella con: huella del código del kernel, versión del
// catálogo de reglas, versión de parámetros y huella SHA-256 de los archivos de
// entrada. Con eso se puede afirmar, años después, con qué se calculó.
// Usa WebCrypto (disponible en Workers y en Node ≥ 19).

export async function sha256Hex(texto) {
  const datos = typeof texto === 'string' ? new TextEncoder().encode(texto) : texto;
  const h = await globalThis.crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** JSON con llaves ordenadas: la misma entrada siempre da la misma huella. */
export function jsonCanonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (typeof v.toJSON === 'function') return jsonCanonico(v.toJSON());
  if (Array.isArray(v)) return '[' + v.map(jsonCanonico).join(',') + ']';
  const ks = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return '{' + ks.map(k => JSON.stringify(k) + ':' + jsonCanonico(v[k])).join(',') + '}';
}

export function nuevoId(prefijo) {
  const a = new Uint8Array(10);
  globalThis.crypto.getRandomValues(a);
  return prefijo + '_' + [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
