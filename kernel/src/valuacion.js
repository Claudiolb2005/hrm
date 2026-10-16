// valuacion.js — Valuación de una contribución omitida (módulo 18): actualización, recargos y multa.
//
//   Actualización (CFF art. 17-A): factor = INPC del mes anterior al más reciente del periodo
//     ÷ INPC del mes anterior al más antiguo; se calcula hasta el diezmilésimo (truncado) y si es
//     menor que 1 se toma 1. Si el INPC del mes que toca no se ha publicado, se usa el último publicado.
//   Recargos (CFF art. 21): sobre la contribución actualizada, por cada mes o fracción desde la fecha
//     en que debió pagarse, con la tasa de cada mes; máximo cinco años.
//   Multa: CFF art. 76 (ISR retenido) o LSS art. 304 (cuotas), sobre la contribución actualizada.
//     Mínimo = corrección espontánea antes de que la autoridad la descubra (CFF art. 73: sin multa);
//     máximo = multa máxima.
// Aritmética exacta y un solo redondeo por importe; nada de float. Todo lo que no se puede valuar
// se dice (ISN: la ley de cada estado; sin INPC: limitado).
import { E, Exacto } from './exacto.js';

/** Contribuciones valuables por rubro de hallazgo y cómo se fija su vencimiento. */
export const CONTRIBUCION_DE_RUBRO = {
  isr: { contribucion: 'isr_retenciones', multa: 'MULTA_OMISION_CFF', fundamento: 'LISR art. 96: entero a más tardar el día 17 del mes siguiente', bimestral: false },
  imss: { contribucion: 'cuotas_imss', multa: 'MULTA_OMISION_LSS', fundamento: 'LSS art. 39: día 17 del mes siguiente', bimestral: false },
  rcv: { contribucion: 'rcv', multa: 'MULTA_OMISION_LSS', fundamento: 'LSS art. 39: día 17 del mes siguiente al bimestre', bimestral: true },
  infonavit: { contribucion: 'infonavit', multa: 'MULTA_OMISION_LSS', fundamento: 'Ley INFONAVIT art. 35: día 17 del mes siguiente al bimestre', bimestral: true },
};

const pad = (n) => String(n).padStart(2, '0');
const mesMas = (ym, k) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + k; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); };

/** Día en que debió pagarse la contribución causada en `periodo` (YYYY-MM). */
export function fechaLimite(periodo, { bimestral = false } = {}) {
  const [, m] = periodo.split('-').map(Number);
  const ultimo = bimestral && m % 2 === 1 ? mesMas(periodo, 1) : periodo; // el bimestre cierra en mes par
  return mesMas(ultimo, 1) + '-17';
}

/** Meses o fracción transcurridos desde la fecha límite hasta la fecha de cálculo (CFF art. 21). */
export function mesesDeMora(limite, calculo) {
  if (calculo <= limite) return 0;
  const [y1, m1, d1] = limite.split('-').map(Number), [y2, m2, d2] = calculo.split('-').map(Number);
  let n = (y2 - y1) * 12 + (m2 - m1);
  if (d2 > d1) n += 1;
  return Math.max(1, Math.min(60, n));
}

function inpcDe(catalogo, ym, ultimoPublicado) {
  const f = catalogo.buscar('INPC', ym + '-15');
  if (f) return { ym, valor: f.valor, nivel: f.nivel, id: f.id };
  if (ultimoPublicado) {
    for (let k = 1; k <= 3; k++) { const g = catalogo.buscar('INPC', mesMas(ym, -k) + '-15'); if (g) return { ym: mesMas(ym, -k), valor: g.valor, nivel: g.nivel, id: g.id, sustituto_de: ym }; }
  }
  return null;
}

/**
 * @param {{ catalogo, omision_c: number, rubro: string, periodo: string, fecha_calculo: string }} a
 * @returns {{ valuable: boolean, motivo?: string, ... }}
 */
export function valuarOmision({ catalogo, omision_c, rubro, periodo, fecha_calculo }) {
  const def = CONTRIBUCION_DE_RUBRO[rubro];
  if (!def) return { valuable: false, motivo: rubro === 'isn' ? 'ISN: los accesorios se rigen por la ley de cada estado; no se valúan en esta versión' : 'Rubro sin contribución valuable: ' + rubro };
  if (!(omision_c > 0)) return { valuable: false, motivo: 'Sin contribución omitida (la diferencia es a favor)' };
  const limite = fechaLimite(periodo, def);
  const traza = { contribucion: def.contribucion, periodo, fecha_limite: limite, fecha_calculo, fundamento_vencimiento: def.fundamento };
  const omision = E(omision_c).div(100);
  if (fecha_calculo <= limite) {
    return { valuable: true, ...traza, omision_c, actualizacion_c: 0, recargos_c: 0, multa_min_c: 0, multa_max_c: 0, contingencia_min_c: omision_c, contingencia_max_c: omision_c,
      nota: 'Todavía no vence: sin accesorios', niveles: [] };
  }
  // Actualización
  const reciente = inpcDe(catalogo, mesMas(fecha_calculo.slice(0, 7), -1), true);
  const antiguo = inpcDe(catalogo, mesMas(limite.slice(0, 7), -1), false);
  if (!reciente || !antiguo) return { valuable: false, motivo: 'Falta el INPC de ' + (!antiguo ? mesMas(limite.slice(0, 7), -1) : mesMas(fecha_calculo.slice(0, 7), -1)) + ' en el catálogo', ...traza };
  // Hasta el diezmilésimo, truncado (positivo: truncar = floor).
  const crudo = E(reciente.valor).div(antiguo.valor);
  let factor = new Exacto((crudo.n * 10000n) / crudo.d, 10000n);
  if (factor.lt(1)) factor = E(1);
  const actualizada = omision.por(factor);
  const actualizada_c = actualizada.aCentavos();
  const actualizacion_c = actualizada_c - omision_c;
  // Recargos: tasa del mes en que corre cada mes de mora.
  const n = mesesDeMora(limite, fecha_calculo);
  let tasa = E(0);
  const tasas = [];
  for (let k = 0; k < n; k++) {
    const ym = mesMas(limite.slice(0, 7), k);
    const f = catalogo.buscar('RECARGOS_MORA_MENSUAL', ym + '-15');
    if (!f) return { valuable: false, motivo: 'Falta la tasa de recargos de ' + ym, ...traza };
    tasa = tasa.suma(f.valor);
    tasas.push({ mes: ym, tasa_pct: f.valor, nivel: f.nivel });
  }
  const recargos_c = actualizada.por(tasa).div(100).aCentavos();
  // Multa
  const m = catalogo.buscar(def.multa, fecha_calculo);
  if (!m) return { valuable: false, motivo: 'Falta el parámetro de multa ' + def.multa, ...traza };
  const multa_min_c = actualizada.por(m.valor.min_pct).div(100).aCentavos();
  const multa_max_c = actualizada.por(m.valor.max_pct).div(100).aCentavos();
  return {
    valuable: true, ...traza, omision_c,
    inpc_reciente: reciente, inpc_antiguo: antiguo, factor: factor.texto(4), actualizacion_c,
    meses_recargos: n, tasas, tasa_acumulada_pct: tasa.texto(2), recargos_c,
    multa: { parametro: m.id, min_pct: m.valor.min_pct, max_pct: m.valor.max_pct, fundamento: m.fundamento }, multa_min_c, multa_max_c,
    // Corrección espontánea: contribución + actualización + recargos. Descubierta por la autoridad: más la multa máxima.
    contingencia_min_c: omision_c + actualizacion_c + recargos_c,
    contingencia_max_c: omision_c + actualizacion_c + recargos_c + multa_max_c,
    niveles: [...new Set([reciente.nivel, antiguo.nivel, m.nivel, ...tasas.map(t => t.nivel)])].sort(),
  };
}

/** Suma valuaciones de varios periodos de un mismo hallazgo. */
export function sumarValuaciones(vs) {
  const ok = vs.filter(v => v.valuable);
  const s = (k) => ok.reduce((t, v) => t + (v[k] || 0), 0);
  return { valuable: ok.length > 0, periodos: vs, no_valuados: vs.filter(v => !v.valuable).map(v => v.motivo),
    omision_c: s('omision_c'), actualizacion_c: s('actualizacion_c'), recargos_c: s('recargos_c'), multa_min_c: s('multa_min_c'), multa_max_c: s('multa_max_c'),
    contingencia_min_c: s('contingencia_min_c'), contingencia_max_c: s('contingencia_max_c') };
}
