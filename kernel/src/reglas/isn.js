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
  id: 'CALC-ISN-001', version: '1.1.0', rubro: 'isn',
  titulo: 'Impuesto sobre nóminas por entidad', fundamento: 'Ley de hacienda o código fiscal de cada entidad; cuadro de conceptos (V8 pendiente); criterios C22 y C23',
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
    const tasa = tasaF ? tasaF.valor : null;
    const impuestoExacto = tasa ? base.por(Exacto.pct(tasa)) : null;
    const impuesto_c = impuestoExacto ? impuestoExacto.aCentavos() : null;

    // Adicionales. Con componentes cargados (p. ej. Chihuahua, C23) se calculan y se suman,
    // cada uno redondeado por separado; sin componentes sólo se describen y el resultado queda limitado.
    const adicional = ctx.catalogo.buscar('ISN_ADICIONAL', fecha, e.entidad);
    let adic = null, adicionales_c = 0;
    if (adicional) {
      ctx.param('ISN_ADICIONAL', fecha, e.entidad);
      const v = adicional.valor;
      if (Array.isArray(v.componentes) && impuestoExacto) {
        if (e.entidad === 'CHIH') ctx.criterio('C23');
        const comps = v.componentes.map(k => {
          const sobre = k.sobre === 'impuesto' ? impuestoExacto : base;
          const c = sobre.por(Exacto.pct(k.pct)).aCentavos();
          adicionales_c += c;
          return { clave: k.clave, sobre: k.sobre, pct: k.pct, valor_c: c };
        });
        let municipal = null;
        if (v.municipales) {
          if (!e.municipio) { municipal = 'municipio no indicado'; ctx.limitar('dato_faltante', 'municipio del registro (adicionales municipales de ' + e.entidad + ')'); }
          else if (v.municipales.municipios.includes(e.municipio)) { municipal = 'aplica, no calculado'; ctx.limitar('parametro_faltante', v.municipales.descripcion); }
          else municipal = 'no aplica en ' + e.municipio;
        }
        adic = { id: adicional.id, descripcion: v.descripcion, nivel: adicional.nivel, calculado: true, componentes: comps, adicionales_c, municipal };
      } else {
        adic = { id: adicional.id, descripcion: v.descripcion, nivel: adicional.nivel, calculado: false };
      }
    }
    const total_c = impuesto_c === null ? null : impuesto_c + adicionales_c;
    return {
      valor_c: total_c,
      traza: { registro: e.registro, entidad: e.entidad, mes: e.mes, conceptos: detalle, base_c: base.aCentavos(), exento_c: exento.aCentavos(),
        tasa_pct: tasa, nivel_tasa: tasaF ? tasaF.nivel : null, impuesto_c, adicionales_c, total_c, adicional: adic },
      extra: { impuesto_c, adicionales_c, total_c },
    };
  },
};
