// isn.js — CALC-ISN-001 · Impuesto sobre nóminas por registro patronal y entidad.
//
// El ISN deja de ser tasa × base y pasa a ser concepto × entidad (cuadro de R.
// González): por cada concepto pagado en el mes, su trato en esa entidad. La
// entidad es atributo del centro de trabajo del registro, nunca se infiere de un
// reporte (Z3337346103 es Sinaloa). Tasa o trato en nivel C → limitación al
// alcance, no conforme. Adicionales y estímulos van en renglón aparte.
import { Exacto, E } from '../exacto.js';
import { exigirCentavos } from './comun.js';

export const CALC_ISN_001 = {
  id: 'CALC-ISN-001', version: '1.0.0', rubro: 'isn',
  titulo: 'Impuesto sobre nóminas por entidad', fundamento: 'Ley de hacienda o código fiscal de cada entidad; cuadro de conceptos (V8 pendiente)',
  fuentes: [
    { clave: 'prenomina', obligatoria: true },
    { clave: 'entidad_por_registro', obligatoria: true },
    { clave: 'matriz_isn_concepto', obligatoria: true },
    { clave: 'declaraciones_isn', obligatoria: false },
  ],
  /**
   * entrada: { registro, entidad, mes: 'YYYY-MM', conceptos: [{ concepto, monto_c }] }
   * Mes por fecha de pago.
   */
  calcular(e, ctx) {
    if (!/^\d{4}-\d{2}$/.test(e.mes)) throw new Error('mes debe ser YYYY-MM');
    if (!e.entidad) throw new Error('CALC-ISN-001: la entidad del registro es dato obligatorio');
    const fecha = e.mes + '-01';
    const tasaF = ctx.paramOpcional('ISN_TASA', fecha, e.entidad, 'parametro_faltante');
    let base = Exacto.cero, exento = Exacto.cero;
    const detalle = [];
    for (const c of e.conceptos) {
      exigirCentavos('conceptos[].monto_c', c.monto_c);
      const f = ctx.catalogo.buscar('ISN_CONCEPTO:' + c.concepto, fecha, e.entidad);
      let trato;
      if (!f) {
        trato = 'grava';
        ctx.limitar('trato_isn_no_cargado', c.concepto + ' en ' + e.entidad);
      } else {
        ctx.param('ISN_CONCEPTO:' + c.concepto, fecha, e.entidad);
        trato = f.valor.trato;
        if (trato === 'exento_hasta') { ctx.limitar('exento_hasta_requiere_detalle', c.concepto + ' en ' + e.entidad); trato = 'grava'; }
      }
      const m = Exacto.centavos(c.monto_c);
      if (trato === 'exento') exento = exento.suma(m); else base = base.suma(m);
      detalle.push({ concepto: c.concepto, monto_c: c.monto_c, trato, fuente_trato: f ? f.id : null, nivel: f ? f.nivel : null });
    }
    // Adicionales: si existe renglón (hoy todos en nivel C), el resultado queda limitado.
    const adicional = ctx.catalogo.buscar('ISN_ADICIONAL', fecha, e.entidad);
    if (adicional) ctx.param('ISN_ADICIONAL', fecha, e.entidad);
    const tasa = tasaF ? tasaF.valor : null;
    const impuesto_c = tasa ? base.por(Exacto.pct(tasa)).aCentavos() : null;
    return {
      valor_c: impuesto_c,
      traza: { registro: e.registro, entidad: e.entidad, mes: e.mes, conceptos: detalle, base_c: base.aCentavos(), exento_c: exento.aCentavos(),
        tasa_pct: tasa, nivel_tasa: tasaF ? tasaF.nivel : null, impuesto_c,
        adicional: adicional ? { id: adicional.id, descripcion: adicional.valor.descripcion, nivel: adicional.nivel, calculado: false } : null },
    };
  },
};
