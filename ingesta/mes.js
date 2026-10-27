// ingesta/mes.js — ¿De qué mes es este documento? (carga automática por mes, 0019)
//
// Quien sube los archivos del cliente no elige el encargo: el sistema lee el mes del contenido y
// lo manda al encargo de ese mes. Cada señal lleva su fuerza:
//   cierta  · el dato viene en el archivo con formato fijo (periodo del .SUA; FechaFinalPago de los XML
//             cuando ≥ 90 % de los comprobantes caen en el mismo mes).
//   fuerte  · mes y año escritos juntos en el nombre, la hoja o un título («AGOSTO 2026», «08 AGOSTO 26»,
//             «2026-08»); la moda de FechaEmision de la metadata del SAT.
//   debil   · el nombre del mes sin año, o la moda de fechas con menos del 90 %.
// Se sube solo cuando la decisión es segura: una señal cierta, o fuerte sin otra que la contradiga.
// Si no, se pide un clic para confirmar el mes. Nunca se adivina en silencio.
//
// Estas funciones se embeben tal cual en el navegador (paginas/kernel.js con Function#toString):
// son declaraciones sin importaciones y sólo se llaman entre sí.

/** Texto → señales de mes: [{ mes: 'AAAA-MM' | null, numero, fuerza, texto }]. `hoy` = 'AAAA-MM-DD'. */
export function mesesEnTexto(texto, hoy) {
  var MESES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
    ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SEPT: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
  var t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  var anioHoy = Number(String(hoy || '').slice(0, 4)) || new Date().getFullYear();
  var anioValido = function (a) { return a >= 2020 && a <= anioHoy + 1; };
  var dos = function (n) { return (n < 10 ? '0' : '') + n; };
  var out = [];
  var nombres = Object.keys(MESES).sort(function (a, b) { return b.length - a.length; }).join('|');
  // Nombre del mes y año pegados o separados por espacio, guion, punto, guion bajo o diagonal.
  var re = new RegExp('(^|[^A-Z])(' + nombres + ')(?![A-Z])[\\s._\\-/]*(?:DE[\\s._\\-/]+|DEL[\\s._\\-/]+)?(\\d{4}|\\d{2})?(?!\\d)', 'g');
  var m;
  while ((m = re.exec(t))) {
    var n = MESES[m[2]], corto = m[2].length <= 4;
    var a = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : null;
    if (a !== null && m[3].length === 2 && Math.abs(a - anioHoy) > 2) a = null; // «AGOSTO 15» es un día, no 2015
    if (a !== null && !anioValido(a)) a = null;
    if (a === null && corto) continue; // «MAR», «DIC» sueltos se confunden con palabras: sólo valen con año
    out.push({ mes: a ? a + '-' + dos(n) : null, numero: n, fuerza: a ? 'fuerte' : 'debil', texto: m[0].replace(/^[^A-Z]/, '').trim() });
  }
  // Numérico: 2026-08 · 2026_08 · 202608 · 08-2026 · 08/2026 (sin dígitos alrededor).
  var reN = /(^|\D)(20\d{2})[\s._\-/]?(0[1-9]|1[0-2])(?!\d)|(^|\D)(0[1-9]|1[0-2])[\s._\-/](20\d{2})(?!\d)/g;
  while ((m = reN.exec(t))) {
    var an = Number(m[2] || m[6]), me = Number(m[3] || m[5]);
    if (!anioValido(an)) continue;
    // 20260815 es una fecha completa: el mes sigue siendo válido, pero «202608» sin separador sólo cuenta si no sigue un día.
    out.push({ mes: an + '-' + dos(me), numero: me, fuerza: 'fuerte', texto: m[0].replace(/^\D/, '').trim() });
  }
  return out;
}

/** Fechas 'AAAA-MM-DD…' → { mes, n, total, proporcion } con el mes que más se repite. */
export function mesDeFechas(fechas) {
  var cuenta = {}, total = 0;
  for (var i = 0; i < (fechas || []).length; i++) {
    var f = /^(20\d{2})-(0[1-9]|1[0-2])-\d{2}/.exec(String(fechas[i] || '').trim());
    if (!f) continue;
    var k = f[1] + '-' + f[2]; cuenta[k] = (cuenta[k] || 0) + 1; total++;
  }
  var mejor = null;
  for (var k2 in cuenta) if (!mejor || cuenta[k2] > cuenta[mejor] || (cuenta[k2] === cuenta[mejor] && k2 > mejor)) mejor = k2;
  return mejor ? { mes: mejor, n: cuenta[mejor], total: total, proporcion: cuenta[mejor] / total, meses: cuenta } : null;
}

/** Mes sin año → el más reciente que no sea futuro respecto a `hoy`. */
export function anioProbable(numero, hoy) {
  var a = Number(String(hoy).slice(0, 4)), mh = Number(String(hoy).slice(5, 7));
  var y = numero <= mh ? a : a - 1;
  return y + '-' + (numero < 10 ? '0' : '') + numero;
}

/**
 * Junta las señales de un archivo y decide.
 * señales: [{ mes, numero?, fuerza, fuente }] (fuente: 'contenido', 'nombre', 'hoja', 'titulo', 'lote').
 * → { mes, seguro, motivo, conflicto: [meses] }
 */
export function decidirMes(senales, hoy) {
  var peso = { cierta: 3, fuerte: 2, debil: 1 };
  var s = (senales || []).filter(function (x) { return x && (x.mes || x.numero); }).map(function (x) {
    return { mes: x.mes || anioProbable(x.numero, hoy), fuerza: x.fuerza, fuente: x.fuente, texto: x.texto, inferido_anio: !x.mes };
  });
  if (!s.length) return { mes: null, seguro: false, motivo: 'No se encontró el mes en el archivo', conflicto: [] };
  var puntos = {}, max = {};
  s.forEach(function (x) { puntos[x.mes] = (puntos[x.mes] || 0) + peso[x.fuerza]; max[x.mes] = Math.max(max[x.mes] || 0, peso[x.fuerza]); });
  var meses = Object.keys(puntos).sort(function (a, b) { return max[b] - max[a] || puntos[b] - puntos[a] || (b > a ? 1 : -1); });
  var mes = meses[0], top = max[mes];
  var otros = meses.slice(1).filter(function (k) { return max[k] >= 2; });
  var cierta = s.filter(function (x) { return x.mes === mes && x.fuerza === 'cierta'; })[0];
  var fuerte = s.filter(function (x) { return x.mes === mes && x.fuerza === 'fuerte'; })[0];
  var desc = function (x) { return (x.texto ? '«' + x.texto + '» ' : '') + ({ contenido: 'en el contenido', nombre: 'en el nombre del archivo', hoja: 'en el nombre de la hoja', titulo: 'en un título del archivo', lote: 'por los demás archivos del lote' }[x.fuente] || x.fuente); };
  // Una señal cierta manda aunque el nombre del archivo diga otra cosa (el nombre lo pone una persona).
  if (cierta && !otros.some(function (k) { return max[k] === 3; })) return { mes: mes, seguro: true, motivo: desc(cierta), conflicto: otros };
  if (top === 2 && !otros.length) return { mes: mes, seguro: true, motivo: desc(fuerte), conflicto: [] };
  var mejor = cierta || fuerte || s.filter(function (x) { return x.mes === mes; })[0];
  return { mes: mes, seguro: false, motivo: (otros.length ? 'Señales de meses distintos (' + [mes].concat(otros).join(', ') + '); ' : 'Probable, ') + desc(mejor), conflicto: otros };
}

/** Atributo FechaFinalPago (o el que se pida) de un XML de nómina, sin parsear el documento. */
export function atributoXml(xml, nombre) {
  var m = new RegExp('\\s' + nombre + '\\s*=\\s*"([^"]*)"').exec(String(xml || ''));
  return m ? m[1] : null;
}

/** Metadata del SAT (separada por «~», con encabezado) → fechas de emisión de los vigentes y cancelados. */
export function fechasMetadata(texto) {
  var lineas = String(texto || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (!lineas.length) return [];
  var enc = lineas[0].split('~').map(function (x) { return x.trim().toLowerCase(); });
  var i = enc.indexOf('fechaemision');
  if (i < 0) return [];
  var out = [];
  for (var j = 1; j < lineas.length; j++) { var v = lineas[j].split('~')[i]; if (v) out.push(v.trim()); }
  return out;
}

/** Nombres de hoja de un xl/workbook.xml. */
export function hojasLibro(workbookXml) {
  var out = [], re = /<sheet\b[^>]*\bname="([^"]*)"/g, m;
  while ((m = re.exec(String(workbookXml || '')))) out.push(m[1].replace(/&amp;/g, '&'));
  return out;
}

/** Primeros textos de xl/sharedStrings.xml (títulos y encabezados): hasta `max` entradas. */
export function textosLibro(sharedXml, max) {
  var out = [], re = /<t\b[^>]*>([^<]*)<\/t>/g, m;
  while ((m = re.exec(String(sharedXml || ''))) && out.length < (max || 400)) if (m[1].trim()) out.push(m[1]);
  return out;
}

/** ¿Maestro o prenómina? El maestro de PRIME trae hojas de activos, bajas o finiquitos. */
export function tipoLibro(hojas) {
  var k = (hojas || []).map(function (h) { return String(h).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); });
  return k.some(function (h) { return /ACTIVOS|BAJAS|FINIQUITOS/.test(h); }) ? 'maestro' : 'prenomina';
}

/** Señales de un libro .xlsx: nombre, hojas y títulos (los títulos sólo si traen año). */
export function senalesLibro(nombreArchivo, hojas, textos, hoy) {
  var s = [];
  mesesEnTexto(nombreArchivo, hoy).forEach(function (x) { s.push(Object.assign({ fuente: 'nombre' }, x)); });
  (hojas || []).forEach(function (h) { mesesEnTexto(h, hoy).forEach(function (x) { s.push(Object.assign({ fuente: 'hoja' }, x)); }); });
  // En los textos aparecen conceptos y nombres de personas: un mes suelto ahí no dice nada.
  var vistos = {};
  (textos || []).forEach(function (t) {
    mesesEnTexto(t, hoy).forEach(function (x) { if (x.fuerza === 'fuerte' && !vistos[x.mes]) { vistos[x.mes] = 1; s.push(Object.assign({ fuente: 'titulo' }, x)); } });
  });
  return s;
}

/** Señal del contenido de los XML: cierta si ≥ 90 % de los comprobantes terminan en el mismo mes. */
export function senalFechas(fechas, fuente, umbral, fuerzaAlta) {
  var r = mesDeFechas(fechas);
  if (!r) return null;
  var alta = r.proporcion >= (umbral || 0.9);
  return { mes: r.mes, fuerza: alta ? (fuerzaAlta || 'cierta') : 'debil', fuente: fuente || 'contenido',
    texto: r.n + ' de ' + r.total + ' fechas en ' + r.mes };
}

/** Primer y último día del mes 'AAAA-MM'. */
export function limitesMes(mes) {
  var m = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(String(mes || ''));
  if (!m) return null;
  var a = Number(m[1]), n = Number(m[2]);
  var ult = new Date(Date.UTC(a, n, 0)).getUTCDate();
  return { desde: m[1] + '-' + m[2] + '-01', hasta: m[1] + '-' + m[2] + '-' + (ult < 10 ? '0' : '') + ult };
}

/** Lista para embeber en la página (en orden de dependencia). */
export const FUNCIONES_MES = [mesesEnTexto, mesDeFechas, anioProbable, decidirMes, atributoXml, fechasMetadata, hojasLibro, textosLibro, tipoLibro, senalesLibro, senalFechas, limitesMes];
