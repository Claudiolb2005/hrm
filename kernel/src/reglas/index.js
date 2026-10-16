// reglas/index.js — Catálogo de reglas CALC y matriz regla ↔ fuente (T3).
//
// La matriz deja de ser un anexo y se deriva de las propias reglas: cada regla
// declara sus fuentes (obligatorias u opcionales). De aquí salen las dos cosas
// que antes se escribían por separado (Anexo A y Anexo B): qué prueba corre y
// qué se le pide al cliente (lista PBC). Una regla sin fuentes no arranca.
import { sha256Hex, jsonCanonico } from '../sello.js';
import { CALC_SUB_001, CALC_ISR_SEM_001, CALC_ISR_CAT_001, CALC_ISR_AJM_001, CALC_ISR_EXT_001 } from './isr.js';
import { CALC_EXE_001 } from './exenciones.js';
import { CALC_IMSS_001, CALC_RCV_001, CALC_INF_001 } from './seguridad-social.js';
import { CALC_ISN_001 } from './isn.js';

/** Fuentes que puede declarar una regla. `anexo`: llave del Anexo C/PBC (por mapear con HRM). */
export const FUENTES = {
  prenomina:                  { descripcion: 'Prenómina por periodo con conceptos, registro patronal y fecha de pago', anexo: null },
  catalogo_conceptos_cliente: { descripcion: 'Catálogo de conceptos del cliente con su trato (grava_isr, integra_sbc, afecta_neto)', anexo: null },
  xml_nomina:                 { descripcion: 'XML de nómina originales del periodo (no el export de One Facture)', anexo: null },
  acumulado_anual_exenciones: { descripcion: 'Acumulado anual por trabajador de enero al mes anterior (exenciones consumidas)', anexo: null },
  fecha_ingreso:              { descripcion: 'Fecha de ingreso (y de baja en separaciones) por trabajador', anexo: null },
  convenio_fondo_ahorro:      { descripcion: 'Convenio del fondo de ahorro y política de retiros (P6)', anexo: null },
  sua_ema:                    { descripcion: 'SUA o EMA del mes: SBC y días por trabajador', anexo: null },
  sua_eba:                    { descripcion: 'SUA o EBA del bimestre', anexo: null },
  prima_rt_registro:          { descripcion: 'Prima de riesgo de trabajo por registro patronal con su vigencia', anexo: null },
  faltas_incapacidades:       { descripcion: 'Faltas e incapacidades por trabajador con fechas', anexo: null },
  movimientos_idse:           { descripcion: 'Movimientos afiliatorios IDSE', anexo: null },
  entidad_por_registro:       { descripcion: 'Entidad federativa del centro de trabajo de cada registro patronal', anexo: null },
  matriz_isn_concepto:        { descripcion: 'Matriz ISN concepto × entidad con trato, tope y fundamento', anexo: null },
  declaraciones_isn:          { descripcion: 'Declaraciones estatales de ISN del mes, para conciliar el entero', anexo: null },
  maestro_empleados:          { descripcion: 'Maestro de empleados del periodo: fechas de alta y de baja (incluida la baja ante el IMSS) por trabajador', anexo: null },
};

export const REGLAS_V1 = [
  CALC_EXE_001, CALC_SUB_001, CALC_ISR_SEM_001, CALC_ISR_CAT_001, CALC_ISR_AJM_001, CALC_ISR_EXT_001,
  CALC_IMSS_001, CALC_RCV_001, CALC_INF_001, CALC_ISN_001,
];

/**
 * Prueba de arranque de la matriz: toda regla activa declara al menos una fuente
 * obligatoria y sólo fuentes conocidas. Si falla, el sistema no arranca.
 */
export function verificarMatriz(reglas = REGLAS_V1, fuentes = FUENTES) {
  const errores = [];
  const ids = new Set();
  for (const r of reglas) {
    if (ids.has(r.id)) errores.push(r.id + ': id duplicado');
    ids.add(r.id);
    if (!/^\d+\.\d+\.\d+$/.test(r.version || '')) errores.push(r.id + ': sin versión semántica');
    if (!Array.isArray(r.fuentes) || r.fuentes.length === 0) { errores.push(r.id + ': sin fuentes declaradas'); continue; }
    if (!r.fuentes.some(f => f.obligatoria)) errores.push(r.id + ': sin fuente obligatoria');
    for (const f of r.fuentes) if (!fuentes[f.clave]) errores.push(r.id + ': fuente desconocida ' + f.clave);
  }
  return errores;
}

export function exigirMatriz(reglas = REGLAS_V1) {
  const e = verificarMatriz(reglas);
  if (e.length) throw new Error('Matriz regla↔fuente incompleta; el kernel no arranca:\n - ' + e.join('\n - '));
}

/** Filas de regla_fuente para la base (una por regla × fuente). */
export function filasReglaFuente(reglas = REGLAS_V1) {
  return reglas.flatMap(r => r.fuentes.map(f => ({ regla_id: r.id, fuente_clave: f.clave, obligatoria: f.obligatoria ? 1 : 0 })));
}

/** Lista PBC derivada de la matriz: qué pedir al cliente según las reglas que el encargo activa. */
export function listaPBC(reglas = REGLAS_V1) {
  const m = new Map();
  for (const r of reglas) for (const f of r.fuentes) {
    if (!m.has(f.clave)) m.set(f.clave, { clave: f.clave, ...FUENTES[f.clave], obligatoria_para: [], opcional_para: [] });
    m.get(f.clave)[f.obligatoria ? 'obligatoria_para' : 'opcional_para'].push(r.id);
  }
  return [...m.values()];
}

/** Versión del catálogo de reglas: huella de id + versión + fuentes de cada regla. */
export async function versionCatalogoReglas(reglas = REGLAS_V1) {
  const desc = reglas.map(r => ({ id: r.id, version: r.version, fuentes: r.fuentes })).sort((a, b) => a.id.localeCompare(b.id));
  return 'reg-' + (await sha256Hex(jsonCanonico(desc))).slice(0, 16);
}

export function reglaPorId(id, reglas = REGLAS_V1) {
  const r = reglas.find(x => x.id === id);
  if (!r) throw new Error('Regla no registrada: ' + id);
  return r;
}
