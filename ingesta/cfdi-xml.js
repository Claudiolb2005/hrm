// cfdi-xml.js — Lectura de un CFDI de nómina (CFDI 3.3/4.0 con complemento Nómina 1.2). Sin dependencias.
//
// Los Workers no traen DOMParser. Este lector no valida el XML contra el XSD: extrae los
// atributos que la conciliación necesita, resolviendo cada prefijo por su espacio de nombres
// (un emisor de CFDI puede usar otro prefijo distinto de «cfdi:» o «nomina12:»).
// Importes como texto exacto → centavos con aCentavos; nunca float.
// Lo que no cuadra dentro del propio comprobante se reporta en `errores`; no se corrige.
import { aCentavos } from './canonico.js';
import { desescapar } from './xlsx.js';

const NS = {
  'http://www.sat.gob.mx/cfd/4': 'cfdi', 'http://www.sat.gob.mx/cfd/3': 'cfdi',
  'http://www.sat.gob.mx/nomina12': 'nomina',
  'http://www.sat.gob.mx/TimbreFiscalDigital': 'tfd',
};

/** c_PeriodicidadPago → periodicidad del calendario. */
export const PERIODICIDAD_SAT = { '01': 'diaria', '02': 'semanal', '03': 'catorcenal', '04': 'quincenal', '05': 'mensual', '10': 'decenal', '99': 'otra' };

function atributos(s) {
  const out = {};
  const re = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = desescapar(m[2] !== undefined ? m[2] : m[3]);
  return out;
}

const centavos = (v, que, errores) => {
  if (v === undefined || v === null || v === '') return null;
  try { return aCentavos(v); } catch { errores.push(que + ': importe inválido «' + v + '»'); return null; }
};

/**
 * @param {string} xml texto del comprobante
 * @returns {{ uuid, version, tipo_comprobante, ..., errores: string[] }}
 */
export function leerCfdi(xml) {
  const texto = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const prefijos = new Map();
  for (const m of texto.matchAll(/xmlns:([\w.-]+)\s*=\s*["']([^"']+)["']/g)) if (NS[m[2]]) prefijos.set(m[1], NS[m[2]]);
  const elementos = [];
  for (const m of texto.matchAll(/<([\w.-]+):([\w.-]+)\b([^>]*?)\/?>/g)) {
    const ns = prefijos.get(m[1]);
    if (ns) elementos.push({ ns, nombre: m[2], a: atributos(m[3]) });
  }
  const uno = (ns, nombre) => elementos.find(e => e.ns === ns && e.nombre === nombre)?.a || null;
  const todos = (ns, nombre) => elementos.filter(e => e.ns === ns && e.nombre === nombre).map(e => e.a);
  const errores = [];

  const comp = uno('cfdi', 'Comprobante');
  if (!comp) throw new Error('No es un CFDI: falta el nodo Comprobante');
  const emisor = uno('cfdi', 'Emisor') || {};
  const receptor = uno('cfdi', 'Receptor') || {};
  const tfd = uno('tfd', 'TimbreFiscalDigital');
  const nominas = todos('nomina', 'Nomina');
  if (!tfd || !tfd.UUID) errores.push('Sin timbre fiscal (UUID)');
  if (comp.TipoDeComprobante !== 'N') errores.push('TipoDeComprobante ' + (comp.TipoDeComprobante || '—') + ', no N (nómina)');
  if (nominas.length !== 1) errores.push(nominas.length ? 'Más de un complemento de nómina' : 'Sin complemento de nómina 1.2');
  const nom = nominas[0] || {};
  const nEmisor = uno('nomina', 'Emisor') || {};
  const nReceptor = uno('nomina', 'Receptor') || {};
  const deducs = uno('nomina', 'Deducciones') || {};
  const percs = uno('nomina', 'Percepciones') || {};

  // ISR retenido: deducciones tipo 002. Si el nodo trae TotalImpuestosRetenidos, deben coincidir.
  let isr = 0;
  for (const d of todos('nomina', 'Deduccion')) if (d.TipoDeduccion === '002') isr += centavos(d.Importe, 'Deducción 002', errores) || 0;
  const tir = centavos(deducs.TotalImpuestosRetenidos, 'TotalImpuestosRetenidos', errores);
  if (tir !== null && tir !== isr) errores.push('TotalImpuestosRetenidos ' + tir + ' ≠ suma de deducciones 002 ' + isr);

  // Subsidio causado: OtroPago 002 → SubsidioAlEmpleo.
  let subsidio = null;
  for (const s of todos('nomina', 'SubsidioAlEmpleo')) subsidio = (subsidio || 0) + (centavos(s.SubsidioCausado, 'SubsidioCausado', errores) || 0);
  let otrosPagosSubsidio = 0;
  for (const o of todos('nomina', 'OtroPago')) if (o.TipoOtroPago === '002') otrosPagosSubsidio += centavos(o.Importe, 'OtroPago 002', errores) || 0;

  const relacionados = todos('cfdi', 'CfdiRelacionado').map(r => (r.UUID || '').toUpperCase()).filter(Boolean);
  const tipoRelacion = uno('cfdi', 'CfdiRelacionados')?.TipoRelacion || null;

  const r = {
    uuid: tfd && tfd.UUID ? tfd.UUID.toUpperCase() : null,
    version: comp.Version || null,
    tipo_comprobante: comp.TipoDeComprobante || null,
    serie: comp.Serie || null, folio: comp.Folio || null,
    fecha_emision: comp.Fecha || null,
    fecha_timbrado: tfd ? tfd.FechaTimbrado || null : null,
    rfc_emisor: (emisor.Rfc || '').toUpperCase() || null,
    rfc_receptor: (receptor.Rfc || '').toUpperCase() || null,
    curp: (nReceptor.Curp || '').toUpperCase() || null,
    nss: nReceptor.NumSeguridadSocial || null,
    num_empleado: nReceptor.NumEmpleado ? String(nReceptor.NumEmpleado).trim() : null,
    registro_patronal: (nEmisor.RegistroPatronal || '').toUpperCase() || null,
    entidad_sat: nReceptor.ClaveEntFed || null,
    periodicidad_pago: nReceptor.PeriodicidadPago || null,
    tipo_nomina: nom.TipoNomina || null,
    fecha_pago: nom.FechaPago || null,
    fecha_inicial_pago: nom.FechaInicialPago || null,
    fecha_final_pago: nom.FechaFinalPago || null,
    num_dias_pagados: nom.NumDiasPagados || null,
    total_percepciones_c: centavos(nom.TotalPercepciones, 'TotalPercepciones', errores) ?? 0,
    total_deducciones_c: centavos(nom.TotalDeducciones, 'TotalDeducciones', errores) ?? 0,
    total_otros_pagos_c: centavos(nom.TotalOtrosPagos, 'TotalOtrosPagos', errores) ?? 0,
    total_gravado_c: centavos(percs.TotalGravado, 'TotalGravado', errores),
    total_exento_c: centavos(percs.TotalExento, 'TotalExento', errores),
    isr_retenido_c: isr,
    subsidio_causado_c: subsidio,
    subsidio_entregado_c: otrosPagosSubsidio,
    subtotal_c: centavos(comp.SubTotal, 'SubTotal', errores),
    descuento_c: centavos(comp.Descuento, 'Descuento', errores) ?? 0,
    total_c: centavos(comp.Total, 'Total', errores),
    tipo_relacion: tipoRelacion,
    relacionados,
    errores,
  };
  // Cuadres internos del comprobante (Anexo 20 y guía de llenado de nómina).
  const esperadoTotal = r.total_percepciones_c + r.total_otros_pagos_c - r.total_deducciones_c;
  if (r.total_c !== null && r.total_c !== esperadoTotal) errores.push('Total ' + r.total_c + ' ≠ percepciones + otros pagos − deducciones ' + esperadoTotal);
  if (r.subtotal_c !== null && r.subtotal_c !== r.total_percepciones_c + r.total_otros_pagos_c) errores.push('SubTotal ≠ percepciones + otros pagos');
  if (r.descuento_c !== r.total_deducciones_c) errores.push('Descuento ≠ TotalDeducciones');
  if (r.total_gravado_c !== null && r.total_exento_c !== null) {
    const sueldos = centavos(percs.TotalSueldos, 'TotalSueldos', errores) || 0, sep = centavos(percs.TotalSeparacionIndemnizacion, 'TotalSeparacionIndemnizacion', errores) || 0,
      jub = centavos(percs.TotalJubilacionPensionRetiro, 'TotalJubilacionPensionRetiro', errores) || 0;
    if (r.total_gravado_c + r.total_exento_c !== sueldos + sep + jub) errores.push('Gravado + exento ≠ sueldos + separación + jubilación');
    if (r.total_percepciones_c !== sueldos + sep + jub) errores.push('TotalPercepciones ≠ sueldos + separación + jubilación');
  }
  if (r.tipo_nomina === 'E' && r.periodicidad_pago && r.periodicidad_pago !== '99') errores.push('Nómina extraordinaria con periodicidad ' + r.periodicidad_pago + ' (debe ser 99)');
  return r;
}

/**
 * D5 · Corrida del calendario a la que pertenece el comprobante. El corte es FechaFinalPago contra el
 * calendario del cliente, no FechaPago ni la fecha de timbrado. Sin coincidencia única no se adivina.
 * @param calendario [{ corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria }]
 * @returns {{ corrida_id: string|null, motivo?: string }}
 */
export function asignarCorrida(c, calendario) {
  if (!c.fecha_final_pago) return { corrida_id: null, motivo: 'sin FechaFinalPago' };
  if (c.tipo_nomina === 'O') {
    const per = PERIODICIDAD_SAT[c.periodicidad_pago];
    const xs = calendario.filter(k => k.ordinaria && k.hasta === c.fecha_final_pago && (!per || k.periodicidad === per));
    if (xs.length === 1) return { corrida_id: xs[0].corrida_id };
    return { corrida_id: null, motivo: xs.length ? 'varias corridas ordinarias con FechaFinalPago ' + c.fecha_final_pago : 'ninguna corrida ordinaria ' + (per || '') + ' termina el ' + c.fecha_final_pago };
  }
  if (c.tipo_nomina === 'E') {
    const extra = calendario.filter(k => !k.ordinaria);
    let xs = extra.filter(k => k.fecha_pago === c.fecha_pago && k.hasta === c.fecha_final_pago);
    if (xs.length !== 1) xs = extra.filter(k => k.fecha_pago === c.fecha_pago);
    if (xs.length === 1) return { corrida_id: xs[0].corrida_id };
    return { corrida_id: null, motivo: xs.length ? 'varias corridas extra pagadas el ' + c.fecha_pago : 'ninguna corrida extra pagada el ' + c.fecha_pago };
  }
  return { corrida_id: null, motivo: 'TipoNomina desconocido' };
}

/**
 * Metadata del SAT (descarga masiva, texto separado por «~»): Uuid~RfcEmisor~…~Estatus~FechaCancelacion.
 * Estatus 1 = vigente, 0 = cancelado.
 */
export function leerMetadataSat(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) throw new Error('Metadata vacía');
  const enc = lineas[0].split('~').map(x => x.trim().toLowerCase());
  const iU = enc.indexOf('uuid'), iE = enc.indexOf('estatus'), iF = enc.indexOf('fechacancelacion'), iR = enc.indexOf('rfcemisor');
  if (iU < 0 || iE < 0) throw new Error('La metadata no trae columnas Uuid y Estatus');
  const out = [], errores = [];
  for (let i = 1; i < lineas.length; i++) {
    const p = lineas[i].split('~');
    const uuid = (p[iU] || '').trim().toUpperCase();
    const est = (p[iE] || '').trim();
    if (!/^[0-9A-F-]{36}$/.test(uuid) || !['0', '1'].includes(est)) { errores.push('línea ' + (i + 1)); continue; }
    out.push({ uuid, estatus: est === '1' ? 'vigente' : 'cancelado', fecha_cancelacion: iF >= 0 ? (p[iF] || '').trim() || null : null, rfc_emisor: iR >= 0 ? (p[iR] || '').trim().toUpperCase() : null });
  }
  return { registros: out, errores };
}
