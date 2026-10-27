// seguridad-social.js — CALC-IMSS-001, CALC-RCV-001, CALC-INF-001.
//
// Base temporal «día cotizado»: cada día del periodo usa la UMA, el tope de SBC y
// las cuotas vigentes ESE día. Cada rama se acumula exacta y se redondea a
// centavos por rama (así calcula el SUA y así lo fija la regla).
// En la versión 1 el SBC no se recalcula: se toma del SUA o de la emisión tal como viene (V4 → v2).
// Desde 1.2.0 (kernel 0.11.0) la entrada puede traer `tramos` de SBC dentro del periodo.
import { Exacto, E } from '../exacto.js';
import { rangoFechas } from '../parametros.js';
import { tasaPorRango, exigirCentavos, exigirFecha } from './comun.js';

const SUA = { clave: 'sua_ema', obligatoria: true };

/**
 * Días del periodo con su SBC. Sin `tramos`, todos los días del periodo con `sbc_c`.
 * Con `tramos` ([{desde, hasta, sbc_c}], p. ej. los renglones de la emisión del IMSS o los
 * movimientos del SUA), sólo cuentan los días de los tramos, cada uno con su SBC. Cada rama se
 * redondea a centavo por tramo y los tramos se suman, como la emisión del IMSS y el SUA (C24;
 * comprobado contra el SUA de agosto 2026). Los tramos no se traslapan ni salen del periodo.
 */
function diasConSbc(periodo, e) {
  exigirFecha('periodo.desde', periodo.desde); exigirFecha('periodo.hasta', periodo.hasta);
  if (!Array.isArray(e.tramos)) {
    exigirCentavos('sbc_c', e.sbc_c);
    const s = Exacto.centavos(e.sbc_c);
    return { dias: rangoFechas(periodo.desde, periodo.hasta), sbcDe: () => s, tramoDe: () => 0, distintos: 1 };
  }
  if (!e.tramos.length) throw new Error('tramos vacío');
  const mapa = new Map(), idx = new Map(), sbcs = new Set();
  for (const [i, t] of e.tramos.entries()) {
    exigirFecha('tramos[' + i + '].desde', t.desde); exigirFecha('tramos[' + i + '].hasta', t.hasta);
    exigirCentavos('tramos[' + i + '].sbc_c', t.sbc_c);
    if (t.desde > t.hasta) throw new Error('tramos[' + i + ']: desde > hasta');
    if (t.desde < periodo.desde || t.hasta > periodo.hasta) throw new Error('tramos[' + i + '] fuera del periodo');
    const s = Exacto.centavos(t.sbc_c);
    sbcs.add(t.sbc_c);
    for (const d of rangoFechas(t.desde, t.hasta)) {
      if (mapa.has(d)) throw new Error('tramos traslapados en ' + d);
      mapa.set(d, s); idx.set(d, i);
    }
  }
  const dias = [...mapa.keys()].sort();
  return { dias, sbcDe: (d) => mapa.get(d), tramoDe: (d) => idx.get(d), distintos: sbcs.size };
}

/**
 * Días cotizados. Las incapacidades se restan; si llegan sólo como número y dentro del periodo
 * cambia la UMA o el SBC, no se sabe qué días restar: limitación al alcance en vez de suponer.
 */
function diasCotizados(ctx, periodo, e) {
  const base = diasConSbc(periodo, e);
  const todos = base.dias;
  const incapacidades = e.incapacidades;
  let sinIncap;
  if (Array.isArray(incapacidades)) {
    const set = new Set(incapacidades);
    sinIncap = todos.filter(d => !set.has(d));
  } else {
    const n = incapacidades || 0;
    if (n > todos.length) throw new Error('Incapacidades exceden los días del periodo');
    if (n > 0 && ctx.porDia('UMA_DIARIA', todos).length > 1) ctx.limitar('dato_faltante', 'fechas de incapacidad: la UMA cambia dentro del periodo');
    if (n > 0 && n < todos.length && base.distintos > 1) ctx.limitar('dato_faltante', 'fechas de incapacidad: el SBC cambia dentro del periodo');
    sinIncap = todos.slice(0, todos.length - n);
  }
  return { todos, sinIncap, sbcDe: base.sbcDe, tramoDe: base.tramoDe };
}

/** Salario mínimo diario que rige el día: general, o frontera si entrada.zona_salarial = 'frontera'. */
function salarioMinimoDelDia(ctx, e, dia) {
  return E(ctx.param(e.zona_salarial === 'frontera' ? 'SALARIO_MINIMO_FRONTERA' : 'SALARIO_MINIMO_GENERAL', dia).valor);
}

/**
 * C14 (LSS art. 36): ¿el trabajador percibe como cuota diaria el salario mínimo?
 * Se mide con el salario diario (entrada.salario_diario_c) cuando viene; si no, con el SBC
 * (con tramos, todos deben estar en el SM).
 * Un SM real integra arriba del mínimo (factor ≈ 1.0493), por eso el SBC sólo es respaldo.
 */
function ganaSalarioMinimo(ctx, e) {
  const sm = salarioMinimoDelDia(ctx, e, e.periodo.desde);
  const medido = Number.isInteger(e.salario_diario_c) ? 'salario_diario' : 'sbc';
  // Con tramos y sin salario diario: aplica sólo si todos los tramos tienen SBC = SM.
  const valores = medido === 'salario_diario' ? [e.salario_diario_c] : (Array.isArray(e.tramos) ? e.tramos.map(t => t.sbc_c) : [e.sbc_c]);
  const aplica = valores.every(v => Exacto.centavos(v).eq(sm));
  if (aplica) ctx.criterio('C14');
  return { aplica, medido, salario_minimo: sm.texto(2) };
}

/** Acumulador por tramo de SBC: cada rama se redondea a centavo en cada tramo y luego se suma (C24). */
function porTramo() {
  const m = new Map();
  return {
    sumar(t, k, v) { let o = m.get(t); if (!o) m.set(t, (o = {})); o[k] = (o[k] || Exacto.cero).suma(v); },
    centavos(k) { let s = 0; for (const o of m.values()) if (o[k]) s += o[k].aCentavos(); return s; },
  };
}

function sbcDelDia(ctx, sbc, dia) {
  const uma = E(ctx.param('UMA_DIARIA', dia).valor);
  const tope = uma.por(ctx.param('TOPE_SBC_VECES_UMA', dia).valor);
  return { uma, tope, sbc: Exacto.min(sbc, tope), topado: sbc.gt(tope) };
}

export const CALC_IMSS_001 = {
  id: 'CALC-IMSS-001', version: '1.2.0', rubro: 'imss',
  titulo: 'Cuotas IMSS por rama', fundamento: 'LSS arts. 25, 36, 71 a 74, 106, 107, 147 y 211; criterios C8, C14, C21 y C24',
  fuentes: [SUA, { clave: 'prima_rt_registro', obligatoria: true }, { clave: 'faltas_incapacidades', obligatoria: true }, { clave: 'movimientos_idse', obligatoria: false }],
  /**
   * entrada: { sbc_c | tramos: [{desde, hasta, sbc_c}], periodo: {desde, hasta}, incapacidades: string[]|number,
   *            ausentismos?: number, salario_diario_c?, zona_salarial?,
   *            prima_rt: { pct: '0.50', vigencia_desde, vigencia_hasta, registro } }
   * Devuelve valor_c = cuota obrera; extra.patronal_c = cuota patronal (dos renglones de calculo_kernel).
   */
  calcular(e, ctx) {
    const { sinIncap, sbcDe, tramoDe } = diasCotizados(ctx, e.periodo, e);
    if (e.ausentismos > 0) ctx.limitar('criterio_pendiente', 'ausentismos por rama (art. 31 LSS): ' + e.ausentismos + ' días no descontados');

    // Prima de riesgo: dato de entrada por registro, con vigencia y validación de captura.
    const pr = e.prima_rt;
    if (!pr || !pr.pct) { ctx.limitar('dato_faltante', 'prima de riesgo del registro'); }
    const rango = ctx.param('PRIMA_RT_RANGO', e.periodo.desde).valor;
    const prima = pr && pr.pct ? Exacto.pct(pr.pct) : Exacto.cero;
    if (pr && pr.pct && (E(pr.pct).lt(rango.minima) || E(pr.pct).gt(rango.maxima))) ctx.limitar('captura_invalida', 'prima de riesgo ' + pr.pct + '% fuera de [' + rango.minima + ', ' + rango.maxima + ']');
    if (pr && pr.vigencia_desde && (e.periodo.desde < pr.vigencia_desde || (pr.vigencia_hasta && e.periodo.hasta > pr.vigencia_hasta))) ctx.limitar('dato_fuera_de_vigencia', 'prima de riesgo ' + (pr.registro || ''));

    const RAMAS = ['cuota_fija_pat', 'excedente_pat', 'excedente_obr', 'dinero_pat', 'dinero_obr', 'gmp_pat', 'gmp_obr', 'rt_pat', 'iv_pat', 'iv_obr', 'guarderias_pat'];
    const acc = porTramo();
    const diasUma = new Map();
    let topado = false;
    for (const dia of sinIncap) {
      const c = ctx.param('IMSS_CUOTAS', dia).valor;
      const { uma, sbc: s, topado: t } = sbcDelDia(ctx, sbcDe(dia), dia);
      const t_ = tramoDe(dia);
      topado = topado || t;
      const umbral = uma.por(ctx.param('UMBRAL_EXCEDENTE_VECES_UMA', dia).valor);
      const exc = Exacto.max(s.resta(umbral), 0);
      acc.sumar(t_, 'cuota_fija_pat', uma.por(Exacto.pct(c.cuota_fija_pat)));
      acc.sumar(t_, 'excedente_pat', exc.por(Exacto.pct(c.excedente_pat)));
      acc.sumar(t_, 'excedente_obr', exc.por(Exacto.pct(c.excedente_obr)));
      acc.sumar(t_, 'dinero_pat', s.por(Exacto.pct(c.dinero_pat)));
      acc.sumar(t_, 'dinero_obr', s.por(Exacto.pct(c.dinero_obr)));
      acc.sumar(t_, 'gmp_pat', s.por(Exacto.pct(c.gmp_pat)));
      acc.sumar(t_, 'gmp_obr', s.por(Exacto.pct(c.gmp_obr)));
      acc.sumar(t_, 'rt_pat', s.por(prima));
      acc.sumar(t_, 'iv_pat', s.por(Exacto.pct(c.iv_pat)));
      acc.sumar(t_, 'iv_obr', s.por(Exacto.pct(c.iv_obr)));
      acc.sumar(t_, 'guarderias_pat', s.por(Exacto.pct(c.guarderias_pat)));
      const k = uma.texto(2);
      diasUma.set(k, (diasUma.get(k) || 0) + 1);
    }
    const ramas = {};
    for (const k of RAMAS) ramas[k] = acc.centavos(k);
    const obrera_c = ramas.excedente_obr + ramas.dinero_obr + ramas.gmp_obr + ramas.iv_obr;
    const patronal_c = ramas.cuota_fija_pat + ramas.excedente_pat + ramas.dinero_pat + ramas.gmp_pat + ramas.rt_pat + ramas.iv_pat + ramas.guarderias_pat;
    // C14 (LSS art. 36): si el trabajador percibe el salario mínimo, el patrón paga la cuota obrera.
    const sm = ganaSalarioMinimo(ctx, e);
    const absorbida_c = sm.aplica ? obrera_c : 0, retencion_c = obrera_c - absorbida_c;
    const traza = { sbc_c: e.sbc_c ?? null, tramos: e.tramos || null, tope_aplicado: topado, dias_cotizados: sinIncap.length, dias_por_uma: Object.fromEntries(diasUma),
      prima_rt: pr || null, ramas_c: ramas, obrera_c, patronal_c, redondeo: 'por rama y por tramo de SBC, a centavo (C24)',
      salario_minimo: sm, retencion_obrera_c: retencion_c, obrera_a_cargo_patron_c: absorbida_c };
    return { valor_c: retencion_c, traza, extra: { obrera_c, patronal_c, retencion_obrera_c: retencion_c, obrera_a_cargo_patron_c: absorbida_c },
      renglones: [{ rubro: 'imss_obrera', valor_c: retencion_c }, { rubro: 'imss_patronal', valor_c: patronal_c + absorbida_c }] };
  },
};

export const CALC_RCV_001 = {
  id: 'CALC-RCV-001', version: '1.2.0', rubro: 'rcv',
  titulo: 'Retiro, cesantía y vejez', fundamento: 'LSS arts. 36 y 168; Segundo Transitorio DOF 16-dic-2020; criterios C4, C8, C13 y C14',
  fuentes: [{ clave: 'sua_eba', obligatoria: true }],
  /** entrada: { sbc_c | tramos: [{desde, hasta, sbc_c}], periodo: {desde, hasta}, incapacidades, salario_diario_c?, zona_salarial? } */
  calcular(e, ctx) {
    ctx.criterio('C4');
    const { todos, sinIncap, sbcDe, tramoDe } = diasCotizados(ctx, e.periodo, e);
    const ceavDias = new Set(sinIncap);
    const acc = porTramo();
    const rangos = new Map();
    for (const dia of todos) {
      const c = ctx.param('RCV_CUOTAS', dia).valor;
      const { uma, sbc: s } = sbcDelDia(ctx, sbcDe(dia), dia);
      const t_ = tramoDe(dia);
      acc.sumar(t_, 'retiro', s.por(Exacto.pct(c.retiro_pat)));    // retiro no resta incapacidades (C8)
      if (ceavDias.has(dia)) {
        const tabla = ctx.param('CEAV_PATRONAL_TABLA', dia);
        const veces = s.div(uma).trunc2();                          // C4: truncado a dos decimales
        // C13: el primer renglón («1.00 SM») sólo aplica con SBC igual al salario mínimo exacto;
        // cualquier otro SBC se ubica por rango de UMA a partir del segundo renglón.
        const enSM = s.eq(salarioMinimoDelDia(ctx, e, dia));
        if (enSM) ctx.criterio('C13');
        const r = enSM ? { renglon: 1, tasa: tabla.valor[0][1] } : tasaPorRango({ valor: tabla.valor.slice(1) }, veces);
        acc.sumar(t_, 'ceav_pat', s.por(Exacto.pct(r.tasa)));
        acc.sumar(t_, 'ceav_obr', s.por(Exacto.pct(c.ceav_obr)));
        const k = (enSM ? '1.00 SM' : veces.texto(2)) + '→' + r.tasa + '%';
        rangos.set(k, (rangos.get(k) || 0) + 1);
      }
    }
    const retiro_c = acc.centavos('retiro'), ceav_pat_c = acc.centavos('ceav_pat'), ceav_obr_c = acc.centavos('ceav_obr');
    const patronal_c = retiro_c + ceav_pat_c;
    const sm = ganaSalarioMinimo(ctx, e);                           // C14: el patrón absorbe la cuota obrera
    const absorbida_c = sm.aplica ? ceav_obr_c : 0, retencion_c = ceav_obr_c - absorbida_c;
    return { valor_c: patronal_c,
      traza: { sbc_c: e.sbc_c ?? null, tramos: e.tramos || null, dias_retiro: todos.length, dias_ceav: sinIncap.length, rango_ceav: Object.fromEntries(rangos),
        retiro_c, ceav_patronal_c: ceav_pat_c, ceav_obrera_c: ceav_obr_c, patronal_c,
        salario_minimo: sm, retencion_ceav_obrera_c: retencion_c, ceav_obrera_a_cargo_patron_c: absorbida_c },
      extra: { retiro_c, ceav_pat_c, ceav_obr_c, patronal_c, retencion_ceav_obr_c: retencion_c, ceav_obr_a_cargo_patron_c: absorbida_c },
      renglones: [{ rubro: 'rcv_patronal', valor_c: patronal_c + absorbida_c }, { rubro: 'ceav_obrera', valor_c: retencion_c }] };
  },
};

export const CALC_INF_001 = {
  id: 'CALC-INF-001', version: '1.1.0', rubro: 'infonavit',
  titulo: 'Aportación patronal INFONAVIT', fundamento: 'Ley del INFONAVIT art. 29 fr. II',
  fuentes: [{ clave: 'sua_eba', obligatoria: true }],
  /** entrada: { sbc_c | tramos: [{desde, hasta, sbc_c}], periodo: {desde, hasta} } — no resta incapacidades */
  calcular(e, ctx) {
    const { dias, sbcDe, tramoDe } = diasConSbc(e.periodo, e);
    const acc = porTramo();
    for (const dia of dias) {
      const pct = ctx.param('INFONAVIT_APORTACION', dia).valor;
      acc.sumar(tramoDe(dia), 'ap', sbcDelDia(ctx, sbcDe(dia), dia).sbc.por(Exacto.pct(pct)));
    }
    const v = acc.centavos('ap');
    return { valor_c: v, traza: { sbc_c: e.sbc_c ?? null, tramos: e.tramos || null, dias: dias.length, aportacion_c: v } };
  },
};
