// Utilidades de prueba. Las pruebas sí leen archivos; el kernel no.
import { readFileSync } from 'node:fs';
import { Catalogo, Contexto, reglaPorId } from '../src/index.js';

export function filasSemilla() {
  return JSON.parse(readFileSync(new URL('../data/parametros-2026.json', import.meta.url))).filas;
}
export function catalogoSemilla(extra = []) { return new Catalogo([...filasSemilla(), ...extra]); }
export function correr(cat, id, entrada) {
  const ctx = new Contexto(cat);
  const r = reglaPorId(id).calcular(entrada, ctx);
  return { r, ctx };
}

// ── Entorno local con la forma de D1 y R2 (para pruebas de rutas e ingesta) ──
import { DatabaseSync } from 'node:sqlite';
import { deflateRawSync } from 'node:zlib';

export function d1Local() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const stmt = (sql, args = []) => ({ sql, args, bind: (...a) => stmt(sql, a),
    run: async () => { const r = raw.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    first: async () => raw.prepare(sql).get(...args) ?? null });
  return { raw, prepare: (sql) => stmt(sql),
    batch: async (ss) => { raw.exec('BEGIN'); try { for (const s of ss) raw.prepare(s.sql).run(...s.args); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } } };
}

export function r2Local() {
  const m = new Map();
  const obj = (u8) => ({ size: u8.length, body: new ReadableStream({ start(c) { c.enqueue(u8); c.close(); } }),
    arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length), text: async () => new TextDecoder().decode(u8) });
  return { mapa: m,
    meta: new Map(),
    async put(k, v, o) { if (v && typeof v.getReader === 'function') v = await new Response(v).arrayBuffer(); const u8 = typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v); m.set(k, u8); this.meta.set(k, (o && o.customMetadata) || {}); return { key: k, size: u8.length }; },
    async list({ prefix = '' } = {}) { return { truncated: false, objects: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(k => ({ key: k, size: m.get(k).length, uploaded: new Date('2026-10-15T12:00:00Z'), customMetadata: this.meta.get(k) || {} })) }; },
    async head(k) { return m.has(k) ? { key: k, size: m.get(k).length } : null; },
    async get(k, o) { if (!m.has(k)) return null; let u8 = m.get(k); if (o?.range) u8 = u8.subarray(o.range.offset, o.range.offset + o.range.length); return obj(u8); } };
}

export function baseDatos(migraciones = ['0001_kernel_v1.sql', '0002_semilla_kernel_v1.sql', '0003_ingesta_lotes.sql', '0004_sync_reglas_v1_1.sql', '0005_vista_diferencia.sql', '0006_hallazgos_dictamen.sql', '0007_cfdi_nomina.sql', '0008_requerimiento.sql', '0009_maestro_afiliacion.sql', '0010_parametros_valuacion.sql', '0011_cotizacion.sql', '0012_retencion.sql', '0013_parametros_cotejo_oficial.sql']) {
  const RAIZ = new URL('../../', import.meta.url);
  const db = d1Local();
  db.raw.exec(readFileSync(new URL('schema.sql', RAIZ), 'utf8'));
  for (const f of migraciones) db.raw.exec(readFileSync(new URL('migrations/' + f, RAIZ), 'utf8'));
  return db;
}

/** XLSX mínimo pero real (ZIP deflate, cadenas en línea): para pruebas sin archivos de clientes. */
export function xlsx(hojas) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (i) => { let s = ''; i += 1; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  const archivos = { '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets>' + hojas.map((h, i) => '<sheet name="' + esc(h.nombre) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships>' + hojas.map((h, i) => '<Relationship Id="rId' + (i + 1) + '" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '</Relationships>' };
  hojas.forEach((h, i) => {
    archivos['xl/worksheets/sheet' + (i + 1) + '.xml'] = '<worksheet><sheetData>' + h.filas.map((f, r) => '<row r="' + (r + 1) + '">' + f.map((v, c) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = col(c) + (r + 1);
      return typeof v === 'number' ? '<c r="' + ref + '"><v>' + v + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
    }).join('') + '</row>').join('') + '</sheetData><rowBreaks count="0"/></worksheet>';
  });
  return zipArchivos(archivos);
}

/** ZIP deflate mínimo de { nombre: texto } (sin dependencias). */
export function zipArchivos(archivos) {
  const partes = [], central = [];
  let off = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = deflateRawSync(Buffer.from(texto));
    const n = Buffer.from(nombre);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(datos.length, 18); lh.writeUInt32LE(Buffer.byteLength(texto), 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(datos.length, 20); ch.writeUInt32LE(Buffer.byteLength(texto), 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    partes.push(lh, n, datos); central.push(ch, n); off += 30 + n.length + datos.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length / 2, 8); fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...partes, cd, fin]));
}
