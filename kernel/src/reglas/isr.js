// isr.js — Reglas de ISR y subsidio de la versión 1 (Reglas v1, 14-oct-2026).
//   CALC-SUB-001      Subsidio para el empleo por periodo
//   CALC-ISR-SEM-001  ISR semanal ordinario (y cualquier periodicidad con tarifa publicada)
//   CALC-ISR-CAT-001  ISR catorcenal (criterio C1: tarifa por día × 14)
//   CALC-ISR-AJM-001  Ajuste mensual
//   CALC-ISR-EXT-001  Pagos extra en corrida aparte (criterio C5)
//
// Redondeo: el ISR se calcula exacto y se redondea UNA vez, al final, medio hacia
// arriba. El subsidio del periodo es un importe (va al CFDI) y se redondea a centavo.
import { Exacto, E } from '../exacto.js';
import { aplicarTarifa, periodicidad, exigirCentavos, exigirFecha } from './comun.js';

const PRENOMINA = { clave: 'prenomina', obligatoria: true };
const CATALOGO_CONCEPTOS = { clave: 'catalogo_conceptos_cliente', obligatoria: true };
const XML = { clave: 'xml_nomina', obligatoria: false };

// ───────────────────────────── Subsidio ─────────────────────────────

/**
 * Subsidio del periodo (criterio C2): monto y tope proporcionales a los días.
 * @returns {{subsidio_c:number, monto_periodo_c:number, tope_periodo:Exacto, aplica:boolean, traza:object}}
 */
export function subsidioPeriodo(ctx, { base, dias, fecha_pago, subsidio_previo_mes_c = 0, base_es_diaria = false }) {
  const M = E(ctx.param('SUBSIDIO_MONTO_MENSUAL', fecha_pago).valor);
  const T = E(ctx.param('SUBSIDIO_TOPE_MENSUAL', fecha_pago).valor);
  const D = E(ctx.param('SUBSIDIO_DIVISOR_DIAS', fecha_pago).valor);
  ctx.criterio('C2');
  const d = E(dias);
  const montoPeriodo = M.div(D).por(d);
  // Corrección 2: con base diaria se compara contra el tope diario, no contra el monto.
  const tope = base_es_diaria ? T.div(D) : T.div(D).por(d);
  const aplica = Exacto.de(base).le(tope);
  let subsidio_c = aplica ? montoPeriodo.aCentavos() : 0;
  // El acumulado del mes nunca excede el máximo mensual.
  const maxRestante = Math.max(0, M.aCentavos() - subsidio_previo_mes_c);
  if (subsidio_c > maxRestante) subsidio_c = maxRestante;
  return {
    subsidio_c, monto_periodo_c: montoPeriodo.aCentavos(), tope_periodo: tope, aplica,
    traza: { monto_mensual: M.texto(2), tope_mensual: T.texto(2), divisor: D.texto(2), dias: d.texto(2),
      monto_periodo: montoPeriodo.texto(6), tope_comparado: tope.texto(6), base_comparada: Exacto.de(base).texto(6),
      comparacion: base_es_diaria ? 'base diaria vs tope diario' : 'base del periodo vs tope del periodo',
      aplica, subsidio_previo_mes_c, subsidio_c },
  };
}

export const CALC_SUB_001 = {
  id: 'CALC-SUB-001', version: '1.0.0', rubro: 'subsidio',
  titulo: 'Subsidio para el empleo por periodo',
  fundamento: 'Decreto DOF 31-dic-2025; criterio C2',
  fuentes: [PRENOMINA],
  /** entrada: { base_para_tope_c, periodicidad, fecha_pago, subsidio_previo_mes_c? } */
  calcular(e, ctx) {
    exigirCentavos('base_para_tope_c', e.base_para_tope_c); exigirFecha('fecha_pago', e.fecha_pago);
    const p = periodicidad(e.periodicidad);
    const r = subsidioPeriodo(ctx, { base: Exacto.centavos(e.base_para_tope_c), dias: p.dias, fecha_pago: e.fecha_pago, subsidio_previo_mes_c: e.subsidio_previo_mes_c || 0 });
    return { valor_c: r.subsidio_c, traza: { periodicidad: e.periodicidad, ...r.traza } };
  },
};

// ───────────────────────────── ISR por periodo ─────────────────────────────

/**
 * ISR a retener de una nómina ordinaria.
 *  · semanal/decenal/quincenal/mensual: tarifa publicada del periodo.
 *  · catorcenal (C1): base ÷ 14, tarifa por día, subsidio diario, × 14.
 * isr_retenido = máximo(0, ISR − subsidio). El subsidio que sobra no se entrega.
 */
export function isrPeriodo(ctx, { base_gravable_c, base_para_tope_c, periodicidad: per, fecha_pago, con_subsidio = true, subsidio_previo_mes_c = 0 }) {
  const p = periodicidad(per);
  const base = Exacto.centavos(base_gravable_c);
  const baseTope = Exacto.centavos(base_para_tope_c ?? base_gravable_c);
  let isr, trTarifa, sub = null;
  if (p.tabla) {
    const t = aplicarTarifa(ctx.param(p.tabla, fecha_pago), base);
    isr = t.isr; trTarifa = t.traza;
    if (con_subsidio) sub = subsidioPeriodo(ctx, { base: baseTope, dias: p.dias, fecha_pago, subsidio_previo_mes_c });
  } else {
    ctx.criterio(p.criterio);
    const dias = E(p.dias);
    const t = aplicarTarifa(ctx.param('ISR_TARIFA_DIARIA', fecha_pago), base.div(dias));
    isr = t.isr.por(dias); trTarifa = { ...t.traza, metodo: 'C1: base ÷ ' + p.dias + ', tarifa por día, × ' + p.dias, isr_periodo_exacto: isr.texto(6) };
    if (con_subsidio) sub = subsidioPeriodo(ctx, { base: baseTope.div(dias), dias: p.dias, fecha_pago, subsidio_previo_mes_c, base_es_diaria: true });
  }
  const subsidio_c = sub ? sub.subsidio_c : 0;
  const neto = isr.resta(Exacto.centavos(subsidio_c));
  const retenido_c = neto.le(0) ? 0 : neto.aCentavos();
  const acreditado_c = Math.min(subsidio_c, isr.aCentavos());
  return {
    isr_antes_subsidio_c: isr.aCentavos(), subsidio_c, subsidio_acreditado_c: acreditado_c, isr_retenido_c: retenido_c,
    traza: { periodicidad: per, base_gravable_c, base_para_tope_c: base_para_tope_c ?? base_gravable_c, tarifa: trTarifa,
      isr_antes_subsidio: isr.texto(6), subsidio: sub ? sub.traza : null, subsidio_no_entregado_c: subsidio_c - acreditado_c,
      isr_retenido_c: retenido_c, redondeo: 'único, al final, medio hacia arriba' },
  };
}

export const CALC_ISR_SEM_001 = {
  id: 'CALC-ISR-SEM-001', version: '1.0.0', rubro: 'isr',
  titulo: 'ISR semanal ordinario', fundamento: 'LISR art. 96; Anexo 8 RMF 2026, tarifa de 7 días',
  fuentes: [PRENOMINA, CATALOGO_CONCEPTOS, XML],
  /** entrada: { base_gravable_c, base_para_tope_c?, fecha_pago, periodicidad? ('semanal' por omisión), subsidio_previo_mes_c? } */
  calcular(e, ctx) {
    exigirCentavos('base_gravable_c', e.base_gravable_c); exigirFecha('fecha_pago', e.fecha_pago);
    const per = e.periodicidad || 'semanal';
    if (per === 'catorcenal') throw new Error('CALC-ISR-SEM-001: la catorcenal es CALC-ISR-CAT-001');
    const r = isrPeriodo(ctx, { ...e, periodicidad: per });
    return { valor_c: r.isr_retenido_c, traza: r.traza, extra: r };
  },
};

export const CALC_ISR_CAT_001 = {
  id: 'CALC-ISR-CAT-001', version: '1.0.0', rubro: 'isr',
  titulo: 'ISR catorcenal', fundamento: 'LISR art. 96; Anexo 8, tarifa por día; criterio C1',
  fuentes: [PRENOMINA, CATALOGO_CONCEPTOS, XML],
  calcular(e, ctx) {
    exigirCentavos('base_gravable_c', e.base_gravable_c); exigirFecha('fecha_pago', e.fecha_pago);
    const r = isrPeriodo(ctx, { ...e, periodicidad: 'catorcenal' });
    return { valor_c: r.isr_retenido_c, traza: r.traza, extra: r };
  },
};

export const CALC_ISR_AJM_001 = {
  id: 'CALC-ISR-AJM-001', version: '1.0.0', rubro: 'isr_ajuste_mensual',
  titulo: 'Ajuste mensual de ISR en la última nómina del mes',
  fundamento: 'LISR art. 96; hoja MENSUAL de R. González. Se aplica sólo si el perfil del cliente lo declara',
  fuentes: [PRENOMINA, CATALOGO_CONCEPTOS, XML],
  /**
   * entrada: { bases_mes_c: number[] (todas las nóminas pagadas en el mes, incluida la última),
   *            bases_tope_mes_c?: number[], isr_retenido_previo_mes_c, fecha_pago (última nómina),
   *            aplica_ajuste_mensual: boolean (perfil del cliente) }
   */
  calcular(e, ctx) {
    exigirFecha('fecha_pago', e.fecha_pago); exigirCentavos('isr_retenido_previo_mes_c', e.isr_retenido_previo_mes_c);
    if (e.aplica_ajuste_mensual !== true) {
      return { valor_c: null, no_aplica: true, traza: { motivo: 'El perfil del cliente no declara ajuste mensual' } };
    }
    const baseMes_c = e.bases_mes_c.reduce((s, b) => s + exigirCentavos('bases_mes_c[]', b), 0);
    const baseTopeMes_c = (e.bases_tope_mes_c || e.bases_mes_c).reduce((s, b) => s + b, 0);
    const t = aplicarTarifa(ctx.param('ISR_TARIFA_MENSUAL', e.fecha_pago), Exacto.centavos(baseMes_c));
    const sub = subsidioPeriodo(ctx, { base: Exacto.centavos(baseTopeMes_c), dias: '30.4', fecha_pago: e.fecha_pago });
    const neto = t.isr.resta(Exacto.centavos(sub.subsidio_c));
    const isrMes_c = neto.le(0) ? 0 : neto.aCentavos();
    const valor_c = isrMes_c - e.isr_retenido_previo_mes_c;
    return {
      valor_c,
      traza: { base_mes_c: baseMes_c, nominas_en_mes: e.bases_mes_c.length, tarifa: t.traza, subsidio_mensual: sub.traza,
        isr_mes_c: isrMes_c, isr_retenido_previo_mes_c: e.isr_retenido_previo_mes_c, isr_ultima_nomina_c: valor_c,
        nota: valor_c < 0 ? 'Resultado negativo: retención en exceso en el mes' : undefined },
    };
  },
};

export const CALC_ISR_EXT_001 = {
  id: 'CALC-ISR-EXT-001', version: '1.0.0', rubro: 'isr_pago_extra',
  titulo: 'ISR de pagos extra en corrida aparte', fundamento: 'Criterio C5 (por confirmar): tarifa del periodo sobre el pago solo',
  fuentes: [PRENOMINA, CATALOGO_CONCEPTOS, XML],
  /** entrada: { pago_gravable_c, periodicidad: 'semanal'|'catorcenal'|…, fecha_pago } */
  calcular(e, ctx) {
    exigirCentavos('pago_gravable_c', e.pago_gravable_c); exigirFecha('fecha_pago', e.fecha_pago);
    ctx.criterio('C5');
    const r = isrPeriodo(ctx, { base_gravable_c: e.pago_gravable_c, periodicidad: e.periodicidad, fecha_pago: e.fecha_pago, con_subsidio: false });
    return { valor_c: r.isr_retenido_c, traza: { ...r.traza, nota: 'Aplica dos veces los renglones bajos; lo corrige el ajuste mensual (C5 debe decir cómo entra).' } };
  },
};
