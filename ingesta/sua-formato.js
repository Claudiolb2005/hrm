// sua-formato.js — Lectura del archivo de pago del SUA (.SUA) y de la emisión del IMSS (EMA/EBA, CDEMMO99/CDEBMO99).
// Puro: recibe texto y devuelve estructuras; no hace E/S ni cálculo de cuotas.
//
// Archivo de pago .SUA (lo que se pagó). Ancho fijo de 295, sin saltos de línea. Registros:
//   02 patrón · 03 trabajador · 04 movimiento · 05 totales por rama · 06 totales del pago.
//   El 03 trae días, incapacidades y ausentismos del mes y del bimestre, y el importe pagado por rama
//   (patrón + obrero juntos en IMSS; CEAV patronal y obrera separadas).
//   El 04 sólo es confiable en sus primeros 51 caracteres: el resto es relleno que el SUA no limpia.
// Emisión del IMSS (lo que se debía pagar). Un renglón por tramo de SBC (alta, modificación, baja):
//   CDEMMO99 (EMA, mensual): 11 cuotas en 8 dígitos (patrón y obrero separados).
//   CDEBMO99 (EBA, bimestral): retiro, CEAV patronal, CEAV obrera, INFONAVIT y amortización.
//   CDEMPA99 / CDEBPA99: datos del patrón y prima de riesgo de trabajo.
// Los layouts se fijaron contra el paquete de agosto 2026 de PrimeWireless (30 registros): las sumas de los 03
// cuadran al centavo con el registro 05, y los tramos de la emisión con el 03 de cada trabajador.

export const ANCHO_SUA = 295;

export const RAMAS_IMSS = ['cuota_fija', 'excedente', 'dinero', 'gmp', 'rt', 'iv', 'guarderias'];
export const RAMAS_RCV = ['retiro', 'ceav_patronal', 'ceav_obrera'];
export const RAMAS = [...RAMAS_IMSS, ...RAMAS_RCV, 'infonavit'];

const ent = (s) => { const t = String(s).trim(); if (!/^\d+$/.test(t)) throw new Error('Campo numérico inválido: «' + s + '»'); return Number(t); };
const dec = (s) => { const t = String(s).trim(); if (!/^\d+\.\d{2}$/.test(t)) throw new Error('Importe inválido: «' + s + '»'); return Number(t.replace('.', '')); };
const fechaAmd = (s) => /^\d{8}$/.test(s) && s !== '00000000' ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : null;
const fechaDma = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); return m && m[3] !== '1900' ? m[3] + '-' + m[2] + '-' + m[1] : null; };

/** Bytes del archivo como texto (el SUA usa Latin-1). */
export function textoLatin1(bytes) {
  if (typeof bytes === 'string') return bytes;
  return new TextDecoder('latin1').decode(bytes);
}

/** ¿Este texto es un archivo de pago del SUA? (registro 02 al inicio, múltiplo de 295) */
export function esArchivoSUA(texto) {
  const t = texto.replace(/[\r\n]/g, '');
  return t.length >= ANCHO_SUA && t.length % ANCHO_SUA === 0 && t.startsWith('02') && /^02[A-Z0-9]{11}/.test(t);
}

/**
 * Lee el archivo de pago. Devuelve patrón, trabajadores (03), movimientos (04), totales (05) y el control
 * de cuadre: la suma de los 03 por rama contra el 05.
 */
export function leerArchivoSUA(texto) {
  const t = textoLatin1(texto).replace(/[\r\n]/g, '');
  if (!esArchivoSUA(t)) throw new Error('No es un archivo de pago del SUA (ancho 295, registro 02)');
  const recs = [];
  for (let i = 0; i < t.length; i += ANCHO_SUA) recs.push(t.slice(i, i + ANCHO_SUA));
  const r02 = recs[0];
  const registro = r02.slice(2, 13);
  const patron = { registro, rfc: r02.slice(14, 26).trim(), periodo: r02.slice(26, 30) + '-' + r02.slice(30, 32), folio: r02.slice(32, 38).trim(),
    razon_social: r02.slice(38, 88).trim() };
  const trabajadores = [], movimientos = [], tipos = {};
  let r05 = null;
  for (const [i, r] of recs.entries()) {
    const tipo = r.slice(0, 2);
    tipos[tipo] = (tipos[tipo] || 0) + 1;
    if (tipo !== '02' && r.slice(2, 13) !== registro) throw new Error('Registro ' + (i + 1) + ': registro patronal distinto (' + r.slice(2, 13) + ')');
    if (tipo === '03') {
      const pag = {
        cuota_fija: ent(r.slice(159, 166)), excedente: ent(r.slice(166, 173)), dinero: ent(r.slice(173, 180)), gmp: ent(r.slice(180, 187)),
        rt: ent(r.slice(187, 194)), iv: ent(r.slice(194, 201)), guarderias: ent(r.slice(201, 208)),
        retiro: ent(r.slice(221, 228)), ceav_patronal: ent(r.slice(235, 242)), ceav_obrera: ent(r.slice(242, 249)), infonavit: ent(r.slice(263, 270)),
      };
      trabajadores.push({
        nss: r.slice(32, 43), rfc: r.slice(43, 56).trim() || null, credito_infonavit: r.slice(74, 84).trim() || null,
        sbc_c: ent(r.slice(144, 151)),
        mes: { dias: ent(r.slice(153, 155)), incapacidades: ent(r.slice(155, 157)), ausentismos: ent(r.slice(157, 159)) },
        bimestre: { dias: ent(r.slice(215, 217)), incapacidades: ent(r.slice(217, 219)), ausentismos: ent(r.slice(219, 221)) },
        actualizacion_imss_c: ent(r.slice(208, 215)), amortizacion_c: ent(r.slice(270, 277)),
        pagado_c: pag, registro_n: i + 1,
      });
    } else if (tipo === '04') {
      movimientos.push({ nss: r.slice(13, 24), tipo: r.slice(24, 26), fecha: fechaAmd(r.slice(26, 34)), folio: r.slice(34, 42).trim() || null,
        dias: /^\d{2}$/.test(r.slice(42, 44)) ? Number(r.slice(42, 44)) : 0, sbc_c: /^\d{7}$/.test(r.slice(44, 51)) ? Number(r.slice(44, 51)) : null });
    } else if (tipo === '05') r05 = r;
  }
  // Control: sumas de los 03 contra el 05 (IMSS por rama, retiro, CEAV patronal + obrera, amortización).
  const suma = (k) => trabajadores.reduce((s, w) => s + w.pagado_c[k], 0);
  const control = [];
  if (r05) {
    const en05 = (v) => v === 0 || r05.includes(String(v).padStart(9, '0'));
    for (const k of RAMAS_IMSS) control.push({ rama: k, suma_03_c: suma(k), en_05: en05(suma(k)) });
    control.push({ rama: 'retiro', suma_03_c: suma('retiro'), en_05: en05(suma('retiro')) });
    const ceav = suma('ceav_patronal') + suma('ceav_obrera');
    control.push({ rama: 'ceav', suma_03_c: ceav, en_05: en05(ceav) });
    const am = trabajadores.reduce((s, w) => s + w.amortizacion_c, 0);
    control.push({ rama: 'amortizacion', suma_03_c: am, en_05: en05(am) });
  }
  return { patron, trabajadores, movimientos, tipos, control, cuadra: !!r05 && control.every(c => c.en_05) };
}

/**
 * Lee CDEMMO99 (EMA) o CDEBMO99 (EBA). Cada renglón es un tramo: código de movimiento, fecha de inicio
 * (null = desde el inicio del periodo), días, SBC y cuotas. Devuelve Map nss → tramos[].
 */
export function leerEmision(texto, tipo) {
  if (tipo !== 'ema' && tipo !== 'eba') throw new Error('leerEmision: tipo ema|eba');
  const lineas = textoLatin1(texto).split(/\r?\n/).map(l => l.replace(/\r$/, '')).filter(l => l.trim());
  const ini = tipo === 'ema' ? 22 : 20;
  const porNss = new Map();
  let registro = null;
  for (const [i, l] of lineas.entries()) {
    if (l[ini] !== 'A') throw new Error((tipo === 'ema' ? 'CDEMMO99' : 'CDEBMO99') + ' renglón ' + (i + 1) + ': formato no reconocido');
    const nss = l.slice(ini + 1, ini + 12);
    const codigo = l.slice(ini + 12, ini + 14);
    const fecha = fechaDma(l.slice(ini + 14, ini + 24));
    const dias = ent(l.slice(ini + 24, ini + 26));
    const sbc_c = ent(l.slice(ini + 26, ini + 32));
    const a = ini + 32;
    let cuotas;
    if (tipo === 'ema') {
      const v = (k) => ent(l.slice(a + 8 * k, a + 8 * k + 8));
      cuotas = { cuota_fija: v(0), excedente_pat: v(1), excedente_obr: v(2), dinero_pat: v(3), dinero_obr: v(4), gmp_pat: v(5), gmp_obr: v(6),
        rt: v(7), iv_pat: v(8), iv_obr: v(9), guarderias: v(10) };
    } else {
      cuotas = { retiro: ent(l.slice(a, a + 8)), ceav_patronal: ent(l.slice(a + 8, a + 16)), ceav_obrera: ent(l.slice(a + 16, a + 24)),
        infonavit: dec(l.slice(a + 31, a + 40)), amortizacion: dec(l.slice(a + 40, a + 48)) };
    }
    registro = registro || l.slice(0, 8);
    if (!porNss.has(nss)) porNss.set(nss, []);
    porNss.get(nss).push({ codigo, fecha, dias, sbc_c, cuotas });
  }
  return { tipo, prefijo_registro: registro, renglones: lineas.length, porNss };
}

/** CDEMPA99 / CDEBPA99: registro patronal, periodo y prima de riesgo de trabajo vigente. */
export function leerPatronEmision(texto) {
  const l = textoLatin1(texto).split(/\r?\n/)[0] || '';
  const p = l.indexOf('P', 18);
  if (p < 0) throw new Error('CDEMPA99: no se encontró el registro patronal');
  const registro = l.slice(p + 1, p + 12);
  const resto = l.slice(p + 12 + 1 + 50);
  const m = /^C\d{9}(\d{2})(\d{4})(\d{2}\.\d{5})/.exec(resto);
  if (!m) throw new Error('CDEMPA99: no se encontró la prima de riesgo');
  return { registro, periodo: m[2] + '-' + m[1], prima_rt_pct: m[3].replace(/^0+(?=\d)/, '') };
}

/** Suma de cuotas de la emisión por rama de comparación (patrón + obrero juntos en IMSS, como el .SUA). */
export function emitidoPorRama(tramosEma = [], tramosEba = []) {
  const r = Object.fromEntries(RAMAS.map(k => [k, 0]));
  for (const t of tramosEma) {
    const c = t.cuotas;
    r.cuota_fija += c.cuota_fija; r.excedente += c.excedente_pat + c.excedente_obr; r.dinero += c.dinero_pat + c.dinero_obr;
    r.gmp += c.gmp_pat + c.gmp_obr; r.rt += c.rt; r.iv += c.iv_pat + c.iv_obr; r.guarderias += c.guarderias;
  }
  for (const t of tramosEba) { r.retiro += t.cuotas.retiro; r.ceav_patronal += t.cuotas.ceav_patronal; r.ceav_obrera += t.cuotas.ceav_obrera; r.infonavit += t.cuotas.infonavit; }
  return r;
}
