// servicio/cotizador.js — Cotizador de honorarios (módulo 26; D9). Sólo para HRM.
//
// Tarifa de «Nómina Verificada v2» con las recomendaciones de la Revisión del maestro v0.3 (N2, N3, T7):
//   · B1–B4 por plantilla (precio de tabla); B5+ por fórmula, donde el esfuerzo lo marcan registros y corridas:
//       iguala = 45,000 + 36·C + 2,200·máx(R − 3, 0) + 2,800·máx(K − 2, 0), redondeada al millar (por ratificar).
//   · Piso: ninguna iguala por debajo de $50 por colaborador ni del 0.85 % de la carga patronal mensual.
//   · Diagnóstico (niveles A) = k × iguala del mismo perfil: k = 5.2 de B1 a B4 y 4.0 de B5 en adelante (N2).
//   · Ratio de honorarios contra el costo total de nómina: percepciones + carga patronal (N3).
//   · «RFC adicional +35 %» sólo en B1–B4; en B5+ un grupo es la suma de fórmulas individuales (T7).
// Todo en centavos enteros; los porcentajes, exactos.
import { E } from '../kernel/src/exacto.js';

export const TARIFA = {
  version: 'NV2-2026-10 (por ratificar)',
  niveles: [
    { nivel: 'B1', desde: 40, hasta: 50, iguala: 6900, frecuencia: 'Trimestral + cierre anual' },
    { nivel: 'B2', desde: 51, hasta: 150, iguala: 14500, frecuencia: 'Mensual, antes del timbrado' },
    { nivel: 'B3', desde: 151, hasta: 400, iguala: 27500, frecuencia: 'Por periodo' },
    { nivel: 'B4', desde: 401, hasta: 1000, iguala: 52000, frecuencia: 'Por periodo + cierre mensual' },
  ],
  b5: { base: 45000, por_colaborador: 36, por_registro: 2200, registros_incluidos: 3, por_corrida: 2800, corridas_incluidas: 2, redondeo: 1000 },
  piso: { por_colaborador: 50, pct_carga: '0.85' },
  k_diagnostico: { tabla: '5.2', formula: '4.0' },
  complementos: {
    rfc_adicional_pct: '35', ejercicio_anterior_pct: '55', preventiva_pct: '30',
    repse: 28000, contrato_colectivo: 35000, sbc_variable: 22000, hora_requerimiento: 2400, saldos_a_favor_pct: '20',
  },
};

const redondearA = (pesosExacto, paso) => Math.floor(Number(pesosExacto.div(paso).aCentavos()) / 100 + 0.5) * paso; // medio hacia arriba al múltiplo
const pct = (a_c, b_c) => (b_c > 0 ? E(a_c).por(100).div(b_c).texto(3) : null);

/**
 * @param {object} p { colaboradores, registros, corridas_mes, carga_patronal_mensual_c, percepciones_mensuales_c,
 *                     rfc_adicionales, ejercicios_anteriores, repse, contrato_colectivo, sbc_variable, preventiva,
 *                     horas_requerimiento, saldos_recuperados_c }
 */
export function cotizar(p, t = TARIFA) {
  const C = p.colaboradores | 0, R = p.registros | 0, K = p.corridas_mes | 0;
  if (C < 40) return { cotizable: false, motivo: 'Menos de 40 colaboradores: fuera de la tabla, se cotiza a mano' };
  const traza = [];
  let nivel, iguala_sin_redondeo, iguala;
  const fila = t.niveles.find(n => C >= n.desde && C <= n.hasta);
  if (fila) {
    nivel = fila.nivel; iguala_sin_redondeo = E(fila.iguala); iguala = fila.iguala;
    traza.push(nivel + ' por plantilla (' + fila.desde + '–' + fila.hasta + ' colaboradores): $' + fila.iguala.toLocaleString('en-US') + ' de tabla');
  } else {
    nivel = 'B5+';
    const b = t.b5;
    const r = Math.max(R - b.registros_incluidos, 0), k = Math.max(K - b.corridas_incluidas, 0);
    iguala_sin_redondeo = E(b.base).suma(E(b.por_colaborador).por(C)).suma(E(b.por_registro).por(r)).suma(E(b.por_corrida).por(k));
    iguala = redondearA(iguala_sin_redondeo, b.redondeo);
    traza.push('B5+: ' + b.base + ' + ' + b.por_colaborador + ' × ' + C + ' + ' + b.por_registro + ' × ' + r + ' + ' + b.por_corrida + ' × ' + k + ' = ' + iguala_sin_redondeo.texto(2) + ' → ' + iguala + ' (al millar)');
  }
  // Complementos mensuales sobre la iguala.
  const c = t.complementos;
  const mensuales = [];
  if (p.rfc_adicionales > 0) {
    if (nivel === 'B5+') return { cotizable: false, motivo: 'En B5+ un grupo se cotiza como la suma de las fórmulas de cada RFC (T7), no con el +35 %' };
    mensuales.push({ concepto: 'RFC adicional × ' + p.rfc_adicionales, importe: E(iguala).por(c.rfc_adicional_pct).div(100).por(p.rfc_adicionales).aCentavos() / 100 });
  }
  if (p.preventiva) mensuales.push({ concepto: 'Modalidad preventiva (+' + c.preventiva_pct + ' %)', importe: E(iguala).por(c.preventiva_pct).div(100).aCentavos() / 100 });
  const iguala_con_complementos = iguala + mensuales.reduce((s, m) => s + m.importe, 0);
  // Piso
  const pisoColab = t.piso.por_colaborador * C;
  const pisoCarga = p.carga_patronal_mensual_c > 0 ? Math.ceil(E(p.carga_patronal_mensual_c).por(t.piso.pct_carga).div(100).div(100).aCentavos() / 100) : 0;
  const piso = Math.max(pisoColab, pisoCarga);
  const iguala_final = Math.max(iguala_con_complementos, piso);
  if (iguala_final > iguala_con_complementos) traza.push('Aplica el piso: $' + piso.toLocaleString('en-US') + (pisoCarga > pisoColab ? ' (0.85 % de la carga patronal)' : ' ($50 por colaborador)'));
  // Diagnóstico (niveles A)
  const k = nivel === 'B5+' ? t.k_diagnostico.formula : t.k_diagnostico.tabla;
  const diagnostico = redondearA(iguala_sin_redondeo.por(k), 1000);
  traza.push('Diagnóstico = ' + k + ' × ' + iguala_sin_redondeo.texto(2) + ' → ' + diagnostico + ' (al millar)');
  const unaVez = [];
  if (p.ejercicios_anteriores > 0) unaVez.push({ concepto: 'Ejercicio anterior × ' + p.ejercicios_anteriores + ' (+' + c.ejercicio_anterior_pct + ' % del diagnóstico c/u)', importe: E(diagnostico).por(c.ejercicio_anterior_pct).div(100).por(p.ejercicios_anteriores).aCentavos() / 100 });
  if (p.repse) unaVez.push({ concepto: 'REPSE, ICSOE o SISUB', importe: c.repse });
  if (p.contrato_colectivo) unaVez.push({ concepto: 'Contrato colectivo o turnos', importe: c.contrato_colectivo });
  if (p.sbc_variable) unaVez.push({ concepto: 'Reconstrucción de SBC variable', importe: c.sbc_variable });
  if (p.horas_requerimiento > 0) unaVez.push({ concepto: 'Requerimiento ya notificado: ' + p.horas_requerimiento + ' h', importe: c.hora_requerimiento * p.horas_requerimiento });
  if (p.saldos_recuperados_c > 0) unaVez.push({ concepto: 'Recuperación de saldos a favor (' + c.saldos_a_favor_pct + ' %)', importe: E(p.saldos_recuperados_c).por(c.saldos_a_favor_pct).div(100).aCentavos() / 100 });
  // Ratios (N3: contra el costo total de nómina; siempre se dice la base).
  const carga = p.carga_patronal_mensual_c || 0, perc = p.percepciones_mensuales_c || 0;
  const costoMensual_c = carga + perc;
  return {
    cotizable: true, tarifa: t.version, nivel, frecuencia: fila ? fila.frecuencia : 'Por periodo, multi-registro',
    insumos: { colaboradores: C, registros: R, corridas_mes: K, carga_patronal_mensual_c: carga || null, percepciones_mensuales_c: perc || null },
    iguala_formula: iguala, complementos_mensuales: mensuales, piso: { importe: piso, por_colaborador: pisoColab, por_carga: pisoCarga }, iguala_mensual: iguala_final,
    diagnostico, k_diagnostico: k, una_vez: unaVez,
    ratios: {
      iguala_por_colaborador: Math.round(iguala_final / C),
      iguala_pct_carga_patronal: pct(iguala_final * 100, carga),
      iguala_pct_costo_total: pct(iguala_final * 100, costoMensual_c),
      diagnostico_pct_costo_total_anual: pct(diagnostico * 100, costoMensual_c * 12),
      base: 'Costo total de nómina = percepciones + carga patronal (N3)',
    },
    traza,
  };
}
