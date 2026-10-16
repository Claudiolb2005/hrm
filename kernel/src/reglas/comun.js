// comun.js — Utilidades compartidas por las reglas CALC.
import { Exacto, E } from '../exacto.js';

/**
 * Aplica una tarifa del art. 96 a una base EXACTA (puede no ser múltiplo de centavo,
 * p. ej. la base diaria del criterio C1). El renglón es el último cuyo límite
 * inferior es ≤ base; con bases en centavos equivale a li ≤ base ≤ ls.
 * Devuelve el ISR exacto (sin redondear) y la traza del renglón.
 */
export function aplicarTarifa(fila, base) {
  base = Exacto.de(base);
  const tabla = fila.valor;
  if (base.le(0)) {
    return { isr: Exacto.cero, traza: { tabla: fila.id, renglon: null, caso_borde: 'base_cero_o_negativa', base: base.texto(6) } };
  }
  let idx = -1;
  for (let i = 0; i < tabla.length; i++) if (E(tabla[i][0]).le(base)) idx = i;
  if (idx < 0) idx = 0; // 0 < base < 0.01 sólo ocurre con bases diarias exactas
  const [li, ls, cf, pct] = tabla[idx];
  const exc = Exacto.max(base.resta(li), 0);
  const isr = E(cf).suma(exc.por(Exacto.pct(pct)));
  return {
    isr,
    traza: { tabla: fila.id, renglon: idx + 1, limite_inferior: li, limite_superior: ls, cuota_fija: cf, tasa_pct: pct,
      base: base.texto(6), excedente: exc.texto(6), isr_exacto: isr.texto(6) },
  };
}

/** Busca la tasa de una tabla de rangos [[hasta|null, tasa], …] para un valor dado. */
export function tasaPorRango(fila, valor) {
  valor = Exacto.de(valor);
  for (let i = 0; i < fila.valor.length; i++) {
    const [hasta, tasa] = fila.valor[i];
    if (hasta === null || valor.le(hasta)) return { renglon: i + 1, hasta, tasa };
  }
  throw new Error('tasaPorRango: sin renglón para ' + valor.texto());
}

export const PERIODICIDADES = {
  diaria:     { dias: '1',    tabla: 'ISR_TARIFA_DIARIA' },
  semanal:    { dias: '7',    tabla: 'ISR_TARIFA_SEMANAL' },
  decenal:    { dias: '10',   tabla: 'ISR_TARIFA_DECENAL' },
  catorcenal: { dias: '14',   tabla: null, criterio: 'C1' }, // tarifa por día × 14
  quincenal:  { dias: '15',   tabla: 'ISR_TARIFA_QUINCENAL' },
  mensual:    { dias: '30.4', tabla: 'ISR_TARIFA_MENSUAL' },
};

export function periodicidad(p) {
  const r = PERIODICIDADES[p];
  if (!r) throw new Error('Periodicidad no soportada: ' + p);
  return r;
}

export function exigirCentavos(nombre, v) {
  if (!Number.isInteger(v)) throw new Error(nombre + ' debe ser entero en centavos (recibido ' + v + ')');
  return v;
}

export function exigirFecha(nombre, v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(nombre + ' debe ser fecha YYYY-MM-DD');
  return v;
}
