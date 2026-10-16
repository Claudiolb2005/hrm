// canonico.js — De los renglones crudos del archivo del cliente al renglón canónico (módulos 2 y 6).
//
// Aquí no se calcula nada fiscal: se identifica cada columna con el perfil, se convierten
// importes a centavos exactos y se hacen los controles de integridad del renglón.
// Lo que no se puede identificar no se adivina: se reporta.
import { Exacto } from '../kernel/src/exacto.js';
import { fechaSerial } from './xlsx.js';

export function clave(s) {
  if (s === null || s === undefined) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Importe a centavos exactos desde texto de Excel ("7760.6800000000003", "1.5E-2", "$1,234.50", "(12.00)"). */
export function aCentavos(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'boolean') throw new Error('importe booleano');
  let s = String(v).trim();
  if (s === '' || s === '-') return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '');
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m || (m[2] === '' && !m[3])) throw new Error('importe inválido "' + v + '"');
  let digitos = (m[2] || '0') + (m[3] || '');
  let escala = (m[3] || '').length - Number(m[4] || 0);
  let n = BigInt(digitos);
  let d = 1n;
  if (escala >= 0) d = 10n ** BigInt(escala); else n = n * 10n ** BigInt(-escala);
  if (m[1] === '-') neg = !neg;
  const c = new Exacto(neg ? -n : n, d).aCentavos();
  return c === 0 ? 0 : c; // sin -0
}

export function aFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return fechaSerial(s);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return null;
}

function todasLasVariantes(perfil) {
  const set = new Set();
  for (const vs of Object.values(perfil.columnas)) for (const v of vs) set.add(clave(v));
  for (const c of perfil.conceptos) set.add(clave(c.encabezado));
  for (const vs of Object.values(perfil.movimientos)) for (const v of vs) set.add(clave(v));
  return set;
}

/** Elige el renglón de encabezado: el de más celdas que el perfil reconoce. */
export function detectarEncabezado(primeros, perfil) {
  const variantes = todasLasVariantes(perfil);
  let mejor = { i: -1, n: 0 };
  primeros.forEach((fila, i) => {
    const n = (fila || []).filter(c => typeof c === 'string' && variantes.has(clave(c))).length;
    if (n > mejor.n) mejor = { i, n };
  });
  if (mejor.n < perfil.encabezado.minimo_coincidencias) return null;
  return mejor.i;
}

/** Mapa de columnas del archivo según el perfil. Reporta faltantes, no catalogadas y ambiguas. */
export function construirMapa(encabezado, perfil) {
  const pos = new Map(); // clave → [índices]
  encabezado.forEach((c, j) => {
    if (typeof c !== 'string' || !c.trim()) return;
    const k = clave(c);
    if (!pos.has(k)) pos.set(k, []);
    pos.get(k).push(j);
  });
  const primera = (variantes) => { for (const v of variantes) { const p = pos.get(clave(v)); if (p) return p[0]; } return undefined; };

  const cols = {};
  for (const [nombre, variantes] of Object.entries(perfil.columnas)) {
    const j = primera(variantes);
    if (j !== undefined) cols[nombre] = j;
  }
  const faltantes = perfil.requeridas.filter(r => cols[r] === undefined);

  const ini = primera([perfil.bloque_percepciones.desde]);
  const fin = primera([perfil.bloque_percepciones.hasta]);
  const conceptos = [];
  const usados = new Set();
  const ambiguos = [];
  for (const def of perfil.conceptos) {
    const p = pos.get(clave(def.encabezado));
    if (!p) continue;
    let j;
    if (p.length === 1) j = p[0];
    else if (def.ocurrencia === 'ultima') j = p[p.length - 1];
    else if (Number.isInteger(def.ocurrencia)) j = p[def.ocurrencia - 1];
    else { ambiguos.push({ encabezado: def.encabezado, columnas: p }); continue; }
    if (j === undefined) continue;
    if (ini !== undefined && fin !== undefined && (j < ini || j >= fin)) continue; // fuera del bloque: no es percepción
    conceptos.push({ j, ...def });
    usados.add(j);
  }
  const no_catalogados = [];
  if (ini !== undefined && fin !== undefined) {
    for (let j = ini; j < fin; j++) {
      const c = encabezado[j];
      if (usados.has(j) || typeof c !== 'string' || !c.trim()) continue;
      if (Object.values(cols).includes(j)) continue;
      no_catalogados.push({ j, encabezado: c });
    }
  }
  const movimientos = {};
  for (const [rubro, variantes] of Object.entries(perfil.movimientos)) {
    movimientos[rubro] = variantes.map(v => pos.get(clave(v))?.[0]).filter(j => j !== undefined);
  }
  return { cols, faltantes, conceptos, no_catalogados, ambiguos, movimientos,
    bloque: { desde: ini, hasta: fin }, columnas_archivo: encabezado.filter(Boolean).length };
}

export function clasificarCorrida(texto, perfil) {
  const k = clave(texto);
  for (const c of perfil.corridas) {
    const m = new RegExp(c.patron).exec(k);
    if (m) return { corrida_id: c.id.replace(/\$(\d)/g, (_, i) => m[Number(i)]), periodicidad: c.periodicidad, ordinaria: c.ordinaria };
  }
  return { corrida_id: k.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''), periodicidad: null, ordinaria: false };
}

/**
 * Renglón crudo → renglón canónico, o null si no es un renglón de datos (vacío, total).
 * Nunca descarta un importe: si una columna con importe no tiene significado, se reporta.
 */
export function renglonCanonico(fila, numero, mapa, perfil) {
  const v = (n) => (mapa.cols[n] !== undefined ? fila[mapa.cols[n]] : undefined);
  const corridaRaw = v('corrida');
  const colab = v('colaborador');
  if ((corridaRaw === null || corridaRaw === undefined || String(corridaRaw).trim() === '') && (colab === null || colab === undefined || String(colab).trim() === '')) return null;
  if (/TOTAL/.test(clave(corridaRaw)) || /TOTAL/.test(clave(colab))) return null;
  if (colab === null || colab === undefined || String(colab).trim() === '') return { fila: numero, excluido: 'sin_colaborador' };

  const errores = [];
  const cent = (x, que) => { try { return aCentavos(x); } catch (e) { errores.push(que + ': ' + e.message); return 0; } };
  const corrida = clasificarCorrida(corridaRaw, perfil);
  const percepciones = [];
  let sumaBloque = 0;
  for (const c of mapa.conceptos) {
    const m = cent(fila[c.j], c.encabezado);
    sumaBloque += m;
    if (m !== 0) percepciones.push({ encabezado: c.encabezado, tipo: c.tipo, concepto: c.concepto || null, monto_c: m });
  }
  const no_catalogados = [];
  for (const c of mapa.no_catalogados) {
    const m = cent(fila[c.j], c.encabezado);
    sumaBloque += m;
    if (m !== 0) no_catalogados.push({ encabezado: c.encabezado, monto_c: m });
  }
  const total = cent(v('total_percepciones'), 'TOTAL PERCEPCIONES');
  const movimientos = {};
  for (const [rubro, idxs] of Object.entries(mapa.movimientos)) {
    if (!idxs.length) continue;
    movimientos[rubro] = idxs.reduce((s, j) => s + cent(fila[j], rubro), 0);
  }
  const colaborador_id = String(colab).trim().replace(/\.0+$/, '');
  const domingos = v('domingos');
  return {
    fila: numero,
    corrida_raw: corridaRaw == null ? null : String(corridaRaw),
    ...corrida,
    colaborador_id,
    rfc: v('rfc') ? String(v('rfc')).trim().toUpperCase() : null,
    registro: v('registro') ? String(v('registro')).trim().toUpperCase() : null,
    sd_c: mapa.cols.sd !== undefined ? cent(v('sd'), 'SD') : null,
    sbc_c: mapa.cols.sbc !== undefined ? cent(v('sbc'), 'SBC') : null,
    fecha_ingreso: aFecha(v('fecha_ingreso')),
    domingos: domingos === undefined || domingos === null || domingos === '' ? null : Number(domingos),
    percepciones, no_catalogados,
    total_percepciones_c: total, suma_bloque_c: sumaBloque,
    control_ok: Math.abs(sumaBloque - total) <= 1,
    movimientos, errores,
  };
}
