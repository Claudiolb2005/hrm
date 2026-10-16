// exenciones.js — CALC-EXE-001 · Exenciones de ISR (LISR art. 93).
//
// Calcula la parte exenta de cada percepción y arma la base gravable. Los topes
// anuales necesitan lo consumido de enero al mes anterior: es ENTRADA, no supuesto.
// Un concepto sin renglón EXENCION:<concepto> en el catálogo grava al 100%.
import { Exacto, E } from '../exacto.js';
import { exigirCentavos, exigirFecha } from './comun.js';

/** Años de servicio para la exención por separación: fracción > 6 meses cuenta como año. */
export function aniosServicio(fecha_ingreso, fecha_baja) {
  exigirFecha('fecha_ingreso', fecha_ingreso); exigirFecha('fecha_baja', fecha_baja);
  const [y1, m1, d1] = fecha_ingreso.split('-').map(Number);
  const [y2, m2, d2] = fecha_baja.split('-').map(Number);
  let meses = (y2 - y1) * 12 + (m2 - m1);
  let dias = d2 - d1;
  if (dias < 0) { meses -= 1; dias += 30; }
  const completos = Math.floor(meses / 12);
  const restoMeses = meses % 12;
  const extra = restoMeses > 6 || (restoMeses === 6 && dias > 0) ? 1 : 0;
  return { completos, resto_meses: restoMeses, resto_dias: dias, computables: completos + extra };
}

export const CALC_EXE_001 = {
  id: 'CALC-EXE-001', version: '1.1.0', rubro: 'base_gravable_isr',
  titulo: 'Exenciones de ISR y base gravable', fundamento: 'LISR art. 93; UMA vigente a la fecha de pago',
  fuentes: [
    { clave: 'prenomina', obligatoria: true },
    // Sólo se necesitan cuando el renglón trae un concepto con tope anual o una separación;
    // si faltan en ese caso, el renglón queda limitado (no toda la regla).
    { clave: 'acumulado_anual_exenciones', obligatoria: false },
    { clave: 'fecha_ingreso', obligatoria: false },
    { clave: 'convenio_fondo_ahorro', obligatoria: false },
  ],
  /**
   * entrada: {
   *   fecha_pago,
   *   percepciones: [{ concepto, monto_c, domingos?, }],
   *   consumido: { <grupo|concepto>: centavos exentos ya consumidos en su periodo de acumulación },
   *   semanas_periodo?: número de semanas del periodo (topes semanales; 2 en catorcenal),
   *   perfil: { fondo_ahorro_cumple_requisitos?: boolean },
   *   separacion?: { fecha_ingreso, fecha_baja }
   * }
   */
  calcular(e, ctx) {
    exigirFecha('fecha_pago', e.fecha_pago);
    const uma = E(ctx.param('UMA_DIARIA', e.fecha_pago).valor);
    const consumido = { ...(e.consumido || {}) };
    const detalle = [];
    let gravable = Exacto.cero, exento = Exacto.cero, separacionGravable = Exacto.cero;

    for (const p of e.percepciones) {
      exigirCentavos('percepciones[].monto_c', p.monto_c);
      const monto = Exacto.centavos(p.monto_c);
      const fila = ctx.catalogo.buscar('EXENCION:' + p.concepto, e.fecha_pago);
      let ex = Exacto.cero, tope = null, antes = null, grupo = null, nota;
      if (fila) {
        ctx.param('EXENCION:' + p.concepto, e.fecha_pago); // registra uso y nivel
        const v = fila.valor;
        grupo = v.grupo || p.concepto;
        antes = consumido[grupo] || 0;
        switch (v.tipo) {
          case 'tope_uma':
            if (v.acumula === 'anio' && !(grupo in consumido)) {
              ctx.limitar('dato_faltante', p.concepto + ': acumulado anual de exenciones (' + grupo + ')');
              antes = 0;
            }
            tope = uma.por(v.veces); break;
          case 'uma_por_domingo':
            if (!Number.isInteger(p.domingos) || p.domingos < 1) { ctx.limitar('dato_faltante', p.concepto + ': domingos trabajados'); tope = Exacto.cero; }
            else { tope = uma.por(v.veces).por(p.domingos); antes = 0; }
            break;
          case 'pct_hasta_uma': {
            const mitad = monto.por(Exacto.pct(v.porcentaje));
            const semanas = v.acumula === 'semana' ? (e.semanas_periodo || 1) : 1;
            tope = uma.por(v.veces).por(semanas);
            const disp = Exacto.max(tope.resta(Exacto.centavos(antes)), 0);
            ex = Exacto.min(mitad, disp);
            break;
          }
          case 'separacion': {
            if (!e.separacion) { ctx.limitar('dato_faltante', p.concepto + ': fechas de ingreso y baja'); tope = Exacto.cero; break; }
            const a = aniosServicio(e.separacion.fecha_ingreso, e.separacion.fecha_baja);
            tope = uma.por(v.veces).por(a.computables);
            nota = 'Tope único para liquidación, indemnización y prima de antigüedad: ' + a.computables + ' años computables';
            break;
          }
          case 'requisitos':
            if (e.perfil?.fondo_ahorro_cumple_requisitos === true) { ex = monto; nota = 'Cumple requisitos (perfil)'; }
            else if (e.perfil?.fondo_ahorro_cumple_requisitos === false) { nota = 'No cumple requisitos (perfil): grava'; }
            else { ctx.limitar('dato_faltante', p.concepto + ': acreditar requisitos del fondo de ahorro'); nota = 'Sin acreditar requisitos: grava'; }
            break;
          case 'pendiente':
            ctx.limitar('criterio_pendiente', p.concepto + ': ' + v.decision); nota = 'Pendiente de decisión: se trata como gravado'; break;
          default:
            throw new Error('Tipo de exención desconocido: ' + v.tipo);
        }
        if (tope && ['tope_uma', 'uma_por_domingo', 'separacion'].includes(v.tipo)) {
          const disp = Exacto.max(tope.resta(Exacto.centavos(antes)), 0);
          ex = Exacto.min(monto, disp);
        }
      }
      // La parte exenta es un importe del CFDI: se redondea a centavo por concepto.
      const ex_c = ex.aCentavos();
      const gr_c = p.monto_c - ex_c;
      if (grupo) consumido[grupo] = (consumido[grupo] || 0) + ex_c;
      gravable = gravable.suma(Exacto.centavos(gr_c));
      exento = exento.suma(Exacto.centavos(ex_c));
      if (fila && fila.valor.tipo === 'separacion') separacionGravable = separacionGravable.suma(Exacto.centavos(gr_c));
      detalle.push({ concepto: p.concepto, monto_c: p.monto_c, exencion: fila ? fila.id : null,
        tope: tope ? tope.texto(2) : null, consumido_antes_c: antes, exento_c: ex_c, gravable_c: gr_c,
        acumulado_despues_c: grupo ? consumido[grupo] : null, nota });
    }

    const base_c = gravable.aCentavos();
    return {
      valor_c: base_c,
      traza: { uma: uma.texto(2), conceptos: detalle, exento_total_c: exento.aCentavos(), base_gravable_c: base_c,
        base_para_tope_subsidio_c: base_c - separacionGravable.aCentavos(),
        nota_tope_subsidio: 'Los pagos por separación no cuentan para el tope del subsidio' },
      extra: { base_gravable_c: base_c, base_para_tope_subsidio_c: base_c - separacionGravable.aCentavos(), consumido },
    };
  },
};
