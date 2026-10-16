// xlsx.js — Lector XLSX en streaming para el servidor (T8). Sin dependencias.
//
// Un acumulado de 14 mil renglones × 91 columnas descomprime a decenas de MB de XML:
// no cabe cómodo en la memoria de un Worker si se carga entero. Este lector:
//   · lee el directorio central del ZIP por rango (R2 soporta lectura por rango),
//   · descomprime cada entrada con DecompressionStream('deflate-raw') nativo,
//   · carga sólo sharedStrings y workbook en memoria,
//   · recorre la hoja renglón por renglón sin materializar el XML completo.
// Determinista: no interpreta formatos ni fechas; entrega valores crudos (número o texto).

const td = new TextDecoder();

/** Fuente de bytes en memoria (pruebas o archivos chicos). */
export function fuenteBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return {
    size: u8.length,
    async leer(offset, length) { return u8.subarray(offset, offset + length); },
    async stream(offset, length) {
      const parte = u8.subarray(offset, offset + length);
      return new ReadableStream({ start(c) { c.enqueue(parte); c.close(); } });
    },
  };
}

/** Fuente de bytes sobre un objeto de R2 (lecturas por rango). */
export async function fuenteR2(bucket, key) {
  const head = await bucket.head(key);
  if (!head) throw new Error('R2: no existe ' + key);
  return {
    size: head.size,
    async leer(offset, length) {
      const o = await bucket.get(key, { range: { offset, length } });
      return new Uint8Array(await o.arrayBuffer());
    },
    async stream(offset, length) {
      const o = await bucket.get(key, { range: { offset, length } });
      return o.body;
    },
  };
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Lee el directorio central del ZIP. */
export async function abrirZip(fuente) {
  const cola = Math.min(fuente.size, 65557);
  const fin = await fuente.leer(fuente.size - cola, cola);
  let eocd = -1;
  for (let i = fin.length - 22; i >= 0; i--) if (u32(fin, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('XLSX: no es un ZIP válido (sin directorio central)');
  const n = u16(fin, eocd + 10);
  const cdSize = u32(fin, eocd + 12);
  const cdOff = u32(fin, eocd + 16);
  if (cdOff === 0xffffffff) throw new Error('XLSX: ZIP64 no soportado');
  const cd = await fuente.leer(cdOff, cdSize);
  const entradas = new Map();
  let p = 0;
  for (let i = 0; i < n; i++) {
    if (u32(cd, p) !== 0x02014b50) throw new Error('XLSX: directorio central corrupto');
    const metodo = u16(cd, p + 10);
    const comprimido = u32(cd, p + 20);
    const original = u32(cd, p + 24);
    const ln = u16(cd, p + 28), lx = u16(cd, p + 30), lc = u16(cd, p + 32);
    const local = u32(cd, p + 42);
    const nombre = td.decode(cd.subarray(p + 46, p + 46 + ln));
    entradas.set(nombre, { nombre, metodo, comprimido, original, local });
    p += 46 + ln + lx + lc;
  }
  return { fuente, entradas };
}

async function streamEntrada(zip, nombre) {
  const e = zip.entradas.get(nombre);
  if (!e) throw new Error('XLSX: falta ' + nombre);
  const h = await zip.fuente.leer(e.local, 30);
  if (u32(h, 0) !== 0x04034b50) throw new Error('XLSX: encabezado local inválido en ' + nombre);
  const datos = e.local + 30 + u16(h, 26) + u16(h, 28);
  const s = await zip.fuente.stream(datos, e.comprimido);
  if (e.metodo === 0) return s;
  if (e.metodo === 8) return s.pipeThrough(new DecompressionStream('deflate-raw'));
  throw new Error('XLSX: método de compresión no soportado ' + e.metodo);
}

async function textoEntrada(zip, nombre) {
  const r = streamEntrada(zip, nombre).then(s => s.pipeThrough(new TextDecoderStream()).getReader());
  const lector = await r;
  let t = '';
  for (;;) { const { value, done } = await lector.read(); if (done) break; t += value; }
  return t;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function desescapar(s) {
  // Normalización de fin de línea de XML 1.0 (§2.11): CRLF y CR literales → LF.
  return s.replace(/\r\n?/g, '\n').replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]);
}

function textoDeSi(si) {
  // Texto de <si> o <is>: concatena todos los <t>, ignora la fonética (<rPh>).
  let out = '';
  const sinFon = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(sinFon))) out += m[1] ? desescapar(m[1]) : '';
  return out;
}

async function cadenasCompartidas(zip) {
  if (!zip.entradas.has('xl/sharedStrings.xml')) return [];
  const xml = await textoEntrada(zip, 'xl/sharedStrings.xml');
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1] ? textoDeSi(m[1]) : '');
  return out;
}

/** Hojas del libro: [{ nombre, ruta }]. */
export async function hojas(zip) {
  const wb = await textoEntrada(zip, 'xl/workbook.xml');
  const rels = await textoEntrada(zip, 'xl/_rels/workbook.xml.rels');
  const destino = new Map();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const t = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && t) destino.set(id, t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''));
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const nombre = desescapar(/\bname="([^"]*)"/.exec(m[1])?.[1] || '');
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1] || /\bid="([^"]+)"/.exec(m[1])?.[1];
    out.push({ nombre, ruta: destino.get(rid) });
  }
  return out;
}

function colIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

// '<row' seguido de espacio, '>' o '/': no confundir con <rowBreaks>.
function buscarRow(buf, desde = 0) {
  for (;;) {
    const i = buf.indexOf('<row', desde);
    if (i < 0) return -1;
    const c = buf[i + 4];
    if (c === undefined) return -1; // incompleto: esperar más datos
    if (c === ' ' || c === '>' || c === '/' || c === '\n' || c === '\t' || c === '\r') return i;
    desde = i + 4;
  }
}

function parseFila(xml, ss) {
  const fila = [];
  const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m, siguiente = 0;
  while ((m = re.exec(xml))) {
    const at = m[1];
    const r = /\br="([A-Z]+)\d+"/.exec(at);
    const idx = r ? colIndex(r[1]) : siguiente;
    siguiente = idx + 1;
    const t = /\bt="([^"]+)"/.exec(at)?.[1];
    const cuerpo = m[2] || '';
    let v = null;
    if (t === 'inlineStr') v = textoDeSi(cuerpo);
    else {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(cuerpo);
      if (vm) {
        const raw = vm[1];
        if (t === 's') v = ss[Number(raw)] ?? '';
        else if (t === 'str' || t === 'e') v = desescapar(raw);
        else if (t === 'b') v = raw === '1';
        else v = raw; // número: se entrega como TEXTO exacto, para no pasar por float
      }
    }
    fila[idx] = v;
  }
  return fila;
}

/**
 * Recorre los renglones de una hoja. `alRenglon(fila, numero)` recibe un arreglo
 * (posiciones vacías = null/undefined) y el número de renglón de Excel (1-based).
 * Los números llegan como texto exacto (p. ej. "7760.68"), nunca como float.
 */
export async function recorrerHoja(zip, ruta, alRenglon, { ss } = {}) {
  ss = ss || await cadenasCompartidas(zip);
  const lector = (await streamEntrada(zip, ruta)).pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let n = 0;
  for (;;) {
    const { value, done } = await lector.read();
    if (value) buf += value;
    let ini;
    while ((ini = buscarRow(buf)) >= 0) {
      const cierreVacio = buf.indexOf('/>', ini);
      const apertura = buf.indexOf('>', ini);
      if (apertura < 0) break;
      let fin, cuerpo, atr;
      if (cierreVacio >= 0 && cierreVacio + 1 === apertura) { // <row .../>
        atr = buf.slice(ini + 4, cierreVacio); cuerpo = ''; fin = apertura + 1;
      } else {
        const c = buf.indexOf('</row>', apertura);
        if (c < 0) break;
        atr = buf.slice(ini + 4, apertura); cuerpo = buf.slice(apertura + 1, c); fin = c + 6;
      }
      const num = Number(/\br="(\d+)"/.exec(atr)?.[1] || (n + 1));
      n = num;
      await alRenglon(parseFila(cuerpo, ss), num);
      buf = buf.slice(fin);
    }
    if (done) break;
    // Conserva sólo desde el último <row abierto; descarta el resto (sheetData, cols, etc.).
    if (buf.length > 1 << 20 && buscarRow(buf) < 0) buf = buf.slice(-16);
  }
  return n;
}

/** Abre un XLSX y devuelve la hoja elegida por `elegir(hojas)` (por omisión, la primera). */
export async function abrirLibro(fuente) {
  const zip = await abrirZip(fuente);
  const hs = await hojas(zip);
  const ss = await cadenasCompartidas(zip);
  return {
    zip, hojas: hs, cadenas: ss.length,
    recorrer: (hoja, fn) => recorrerHoja(zip, (hs.find(h => h.nombre === hoja) || hs[0]).ruta, fn, { ss }),
  };
}

/** Fecha serial de Excel (sistema 1900) → YYYY-MM-DD. */
export function fechaSerial(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const ms = Math.round((n - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
