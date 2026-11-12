// paquetes.js — Los paquetes que entrega el SAT, en R2: escribir por partes, unir varios ZIP en uno y sacar la metadata.
//
// El SAT parte una solicitud grande en varios paquetes (ZIP). El portal cruza un paquete por encargo, así que los
// XML de una solicitud se unen en un solo ZIP (sin recomprimir: se copian las entradas y se rehace el directorio).
import { abrirZip, fuenteR2 } from '../ingesta/xlsx.js';

const PARTE = 8 * 1024 * 1024; // R2 pide partes de 5 MB o más (salvo la última)
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const w16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
const w32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };

function juntar(trozos, total) {
  const out = new Uint8Array(total);
  let p = 0;
  for (const t of trozos) { out.set(t, p); p += t.length; }
  return out;
}

/**
 * Escritor a R2 que no necesita saber el tamaño por adelantado: sube por partes (multipart) cuando el archivo es
 * grande y de una vez cuando es chico. `escribir(u8)` y `cerrar()` → { key, size }; `abortar()` si algo falla.
 */
export function escritorR2(bucket, key, opciones = {}, { parte = PARTE } = {}) {
  let trozos = [], pendiente = 0, total = 0, subida = null;
  const partes = [];
  const subirParte = async () => {
    if (!subida) subida = await bucket.createMultipartUpload(key, opciones);
    partes.push(await subida.uploadPart(partes.length + 1, juntar(trozos, pendiente)));
    trozos = []; pendiente = 0;
  };
  return {
    get bytes() { return total; },
    async escribir(u8) {
      if (!u8 || !u8.length) return;
      trozos.push(u8); pendiente += u8.length; total += u8.length;
      if (pendiente >= parte && typeof bucket.createMultipartUpload === 'function') await subirParte();
    },
    async cerrar() {
      if (subida) { if (pendiente) await subirParte(); await subida.complete(partes); }
      else await bucket.put(key, juntar(trozos, pendiente), opciones);
      trozos = [];
      return { key, size: total };
    },
    async abortar() { trozos = []; if (subida) await subida.abort().catch(() => {}); },
  };
}

/** SHA-256 de un objeto de R2 (en streaming cuando el entorno lo permite). */
export async function huellaR2(bucket, key) {
  const o = await bucket.get(key);
  if (!o) throw new Error('R2: no existe ' + key);
  let h;
  if (globalThis.crypto && typeof globalThis.crypto.DigestStream === 'function') {
    const ds = new globalThis.crypto.DigestStream('SHA-256');
    await o.body.pipeTo(ds);
    h = new Uint8Array(await ds.digest);
  } else h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', await o.arrayBuffer()));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function directorio(bucket, key) {
  const fuente = await fuenteR2(bucket, key);
  const cola = Math.min(fuente.size, 65557);
  const fin = await fuente.leer(fuente.size - cola, cola);
  let e = -1;
  for (let i = fin.length - 22; i >= 0; i--) if (u32(fin, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('El paquete del SAT no es un ZIP válido: ' + key);
  const n = u16(fin, e + 10), cdSize = u32(fin, e + 12), cdOff = u32(fin, e + 16);
  if (cdOff === 0xffffffff || n === 0xffff) throw new Error('Paquete del SAT en ZIP64: no soportado');
  return { fuente, n, cdOff, cd: (await fuente.leer(cdOff, cdSize)).slice() };
}

/**
 * Une varios ZIP de R2 en uno. Las entradas se copian tal cual; sólo cambia su desplazamiento en el directorio.
 * Un archivo repetido (mismo nombre en dos paquetes) se conserva una vez. Devuelve { key, size, entradas, repetidas }.
 */
export async function unirZips(bucket, keys, destino, opciones = {}) {
  const w = escritorR2(bucket, destino, opciones);
  try {
    const vistos = new Set(), cds = [];
    let entradas = 0, repetidas = 0, base = 0, cdTotal = 0;
    for (const key of keys) {
      const d = await directorio(bucket, key);
      // Entradas en orden físico, con el final de cada una (el inicio de la siguiente o el directorio).
      const es = [];
      let p = 0;
      for (let i = 0; i < d.n; i++) {
        if (u32(d.cd, p) !== 0x02014b50) throw new Error('Directorio del ZIP dañado: ' + key);
        const largo = 46 + u16(d.cd, p + 28) + u16(d.cd, p + 30) + u16(d.cd, p + 32);
        es.push({ p, largo, local: u32(d.cd, p + 42), nombre: new TextDecoder().decode(d.cd.subarray(p + 46, p + 46 + u16(d.cd, p + 28))) });
        p += largo;
      }
      es.sort((a, b) => a.local - b.local);
      for (let i = 0; i < es.length; i++) {
        const x = es[i], fin = i + 1 < es.length ? es[i + 1].local : d.cdOff;
        if (vistos.has(x.nombre)) { repetidas += 1; continue; }
        vistos.add(x.nombre);
        const reg = d.cd.slice(x.p, x.p + x.largo);
        w32(reg, 42, base);
        cds.push(reg); cdTotal += reg.length; entradas += 1;
        // Copia por tramos para no cargar una entrada grande entera.
        for (let o = x.local; o < fin; o += PARTE) await w.escribir((await d.fuente.leer(o, Math.min(PARTE, fin - o))).slice());
        base += fin - x.local;
      }
    }
    if (entradas > 65535 || base > 0xfffffffe) throw new Error('Demasiados comprobantes para un solo paquete (' + entradas + '): pide el periodo en partes');
    for (const reg of cds) await w.escribir(reg);
    const eocd = new Uint8Array(22);
    w32(eocd, 0, 0x06054b50); w16(eocd, 8, entradas); w16(eocd, 10, entradas); w32(eocd, 12, cdTotal); w32(eocd, 16, base);
    await w.escribir(eocd);
    const r = await w.cerrar();
    return { ...r, entradas, repetidas };
  } catch (e) { await w.abortar(); throw e; }
}

async function inflar(bytes, metodo) {
  if (metodo === 0) return bytes;
  if (metodo !== 8) throw new Error('compresión no soportada ' + metodo);
  const s = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }).pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/**
 * Metadata de uno o varios paquetes del SAT → un solo .txt con un encabezado. Los paquetes traen `<id>_NN.txt`;
 * los `_tercero.txt` (datos de terceros) y cualquier otro archivo se dejan fuera.
 */
export async function metadataDePaquetes(bucket, keys) {
  const td = new TextDecoder('utf-8');
  let encabezado = null, renglones = 0;
  const partes = [];
  for (const key of keys) {
    const zip = await abrirZip(await fuenteR2(bucket, key));
    for (const e of [...zip.entradas.values()].sort((a, b) => a.local - b.local)) {
      if (!/\.txt$/i.test(e.nombre) || /_tercero\.txt$/i.test(e.nombre) || e.nombre.startsWith('__MACOSX/') || !e.original) continue;
      const cab = await zip.fuente.leer(e.local, 30);
      if (u32(cab, 0) !== 0x04034b50) throw new Error('Paquete de metadata dañado: ' + key);
      const datos = e.local + 30 + u16(cab, 26) + u16(cab, 28);
      const t = td.decode(await inflar(await zip.fuente.leer(datos, e.comprimido), e.metodo)).replace(/^﻿/, '');
      const lineas = t.split(/\r?\n/).filter(l => l.trim());
      if (!lineas.length || !/^Uuid~/i.test(lineas[0])) continue; // no es metadata de comprobantes
      if (!encabezado) encabezado = lineas[0];
      partes.push(lineas.slice(1).join('\n'));
      renglones += lineas.length - 1;
    }
  }
  return { texto: encabezado ? encabezado + '\n' + partes.filter(Boolean).join('\n') + '\n' : '', renglones };
}
