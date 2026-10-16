// maestro.js — Maestro de empleados del cliente y cruce de afiliación (D7 cualitativo: pago a persona
// sin alta o ya dada de baja). Puro salvo `leerMaestro`, que sólo lee el libro.
//
// Minimización (N7): del maestro se guarda lo que el cruce necesita —número de empleado, RFC, fechas
// de alta y baja, grupo de nómina—; ni nombres, ni CURP, ni NSS, ni cuentas bancarias.
// Las fechas del maestro son las que declara el cliente, no las del IDSE: el cruce lo dice así.
import { abrirLibro, fuenteBuffer } from './xlsx.js';
import { clave, aFecha } from './canonico.js';

/** Perfil del maestro de PRIME (exportación «HC PRIME … activos»). */
export const PERFIL_MAESTRO_PRIME = {
  id: 'hc_prime', version: '2026-10-15',
  hojas: [
    { patron: /BAJAS/, tipo: 'baja', columnas: {
      num_empleado: ['ID', 'NUMERO DE EMPLEADO'], rfc: ['RFC'], fecha_alta: ['FECHA DE ALTA'], fecha_baja: ['FECHA DE BAJA CALCULO', 'FECHA DE BAJA'], grupo: ['GRUPO NOMINA', 'GRUPO DE NOMINA'] } },
    { patron: /FINIQUITOS/, tipo: 'finiquito', columnas: {
      num_empleado: ['ID', 'NUMERO DE EMPLEADO'], rfc: ['RFC'], fecha_alta: ['FECHA DE ALTA'], fecha_baja: ['FECHA DE BAJA CALCULO', 'FECHA DE BAJA'], grupo: ['GRUPO NOMINA', 'GRUPO DE NOMINA'] } },
  // ACTIVOS al final: «Finiquitos activos» también contiene la palabra.
    { patron: /ACTIVOS/, tipo: 'activo', columnas: {
      num_empleado: ['NUMERO DE EMPLEADO', 'NO. EMPLEADO', 'ID'], rfc: ['RFC'], fecha_alta: ['FECHA DE ALTA'], fecha_antiguedad: ['FECHA DE ANTIGUEDAD'],
      fecha_baja: ['FECHA DE BAJA'], fecha_baja_imss: ['FECHA DE BAJA IMSS'], grupo: ['GRUPO DE NOMINA'] } },
  ],
};

/**
 * Lee el maestro: una fila por empleado. Si aparece en varias hojas, la baja manda sobre el alta
 * (una persona en «Bajas aplicadas» y aún en «Activos» se reporta como inconsistencia).
 */
export async function leerMaestro(bytes, perfil = PERFIL_MAESTRO_PRIME) {
  const libro = await abrirLibro(fuenteBuffer(bytes));
  const porEmp = new Map(), hojasLeidas = [], inconsistencias = [];
  let sinNumero = 0;
  for (const h of libro.hojas) {
    const def = perfil.hojas.find(d => d.patron.test(clave(h.nombre)));
    if (!def) continue;
    let cols = null, n = 0;
    await libro.recorrer(h.nombre, async (fila) => {
      if (!cols) {
        const k = fila.map(clave);
        const pos = {};
        for (const [campo, vs] of Object.entries(def.columnas)) { const j = k.findIndex(x => vs.map(clave).includes(x)); if (j >= 0) pos[campo] = j; }
        if (pos.num_empleado !== undefined && Object.keys(pos).length >= 3) cols = pos;
        return;
      }
      if (fila.every(x => x === null || x === undefined || String(x).trim() === '')) return;
      const v = (c) => (cols[c] !== undefined ? fila[cols[c]] : null);
      const num = v('num_empleado');
      if (num === null || num === undefined || String(num).trim() === '') { sinNumero += 1; return; }
      const id = String(num).trim().replace(/\.0+$/, '');
      if (!/^\w+$/.test(id)) { sinNumero += 1; return; }
      n += 1;
      const r = { num_empleado: id, rfc: v('rfc') ? String(v('rfc')).trim().toUpperCase() : null, fecha_alta: aFecha(v('fecha_alta')),
        fecha_antiguedad: aFecha(v('fecha_antiguedad')), fecha_baja: aFecha(v('fecha_baja')), fecha_baja_imss: aFecha(v('fecha_baja_imss')),
        grupo: v('grupo') ? String(v('grupo')).trim() : null, hoja: def.tipo };
      const prev = porEmp.get(id);
      if (!prev) { porEmp.set(id, r); return; }
      if (prev.hoja === 'activo' && r.hoja !== 'activo' && !prev.fecha_baja) inconsistencias.push({ num_empleado: id, detalle: 'Activo y con baja en «' + h.nombre + '»' });
      porEmp.set(id, { ...prev, ...Object.fromEntries(Object.entries(r).filter(([, x]) => x !== null)), hoja: r.hoja === 'activo' ? prev.hoja : r.hoja });
    });
    hojasLeidas.push({ hoja: h.nombre, tipo: def.tipo, registros: n, encabezado_encontrado: !!cols });
  }
  if (!hojasLeidas.some(h => h.encabezado_encontrado)) throw new Error('No se reconoció ninguna hoja del maestro (se esperaban ACTIVOS, Bajas o Finiquitos con número de empleado y fechas)');
  return { registros: [...porEmp.values()], hojas: hojasLeidas, sin_numero: sinNumero, inconsistencias };
}

/**
 * Cruce de afiliación por renglón pagado:
 *   pago_despues_de_baja  corrida ordinaria que empieza después de la baja (IMSS si la hay; si no, la del maestro),
 *                         sin conceptos de separación en el renglón (el finiquito sí se paga después de la baja)
 *   pago_antes_de_alta    corrida que termina antes de la fecha de alta
 *   sin_maestro           pagado y ausente del maestro: no se puede verificar (cobertura, no hallazgo)
 * @param renglones [{ colaborador_id, corrida_id, total_percepciones_c, percepciones: [{ tipo }] }]
 * @param maestro   Map num_empleado → registro
 * @param calendario Map corrida_id → { desde, hasta, ordinaria }
 */
export function cruzarAfiliacion(renglones, maestro, calendario) {
  const casos = [], sinMaestro = new Set();
  let revisados = 0;
  for (const r of renglones) {
    const cal = calendario.get(r.corrida_id);
    if (!cal || !(r.total_percepciones_c > 0)) continue;
    const id = String(r.colaborador_id).split('#')[0];
    const m = maestro.get(id);
    if (!m) { sinMaestro.add(id); continue; }
    revisados += 1;
    const separacion = (r.percepciones || []).some(p => p.tipo === 'separacion' || p.tipo === 'ptu');
    const baja = m.fecha_baja_imss || m.fecha_baja;
    if (baja && cal.ordinaria && !separacion && cal.desde > baja)
      casos.push({ tipo: 'pago_despues_de_baja', colaborador_id: id, corrida_id: r.corrida_id, fecha_evento: baja, fuente_fecha: m.fecha_baja_imss ? 'baja IMSS' : 'baja', percepciones_c: r.total_percepciones_c });
    if (m.fecha_alta && cal.hasta < m.fecha_alta)
      casos.push({ tipo: 'pago_antes_de_alta', colaborador_id: id, corrida_id: r.corrida_id, fecha_evento: m.fecha_alta, fuente_fecha: 'alta', percepciones_c: r.total_percepciones_c });
  }
  return { casos, revisados, sin_maestro: [...sinMaestro].sort() };
}
