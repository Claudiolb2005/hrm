// diagnostico.js — Por qué difiere cada cálculo del kernel de lo que retuvo la nómina.
//
// La reconciliación dice CUÁNTO difiere cada renglón; no dice por qué. Quien sube los documentos veía
// 1,600 «diferencias» sin explicación y las leía como errores del sistema. Aquí cada diferencia se
// vuelve a calcular con las causas conocidas de esa nómina (perfil_fiscal.hipotesis): si con una de
// ellas el resultado es exactamente lo que retuvo la nómina, la diferencia queda explicada por esa causa.
//
// Reglas de este módulo:
//  · No cambia ningún cálculo ni clasifica nada: sólo explica. La cubeta la sigue poniendo HRM.
//  · Una causa se asigna únicamente si el recálculo reproduce la retención de la nómina (± MARGEN_C).
//    Lo que no se reproduce queda «por revisar» o «dato faltante»: nunca se adivina.
//  · Todo sale de la traza sellada del cálculo y del catálogo de parámetros: no lee archivos.
import { Contexto } from '../kernel/src/parametros.js';
import { isrPeriodo, CALC_ISR_AJM_001 } from '../kernel/src/reglas/isr.js';
import { E } from '../kernel/src/exacto.js';

/** Centavos de margen entre el recálculo con una causa y la retención de la nómina (redondeos del cliente). */
export const MARGEN_C = 2;

/** De quién es la diferencia: es lo que la pantalla le dice a quien la consulta. */
export const DE = {
  nomina: 'La nómina calcula distinto',
  criterio: 'Criterio de la revisión',
  alcance: 'Falta un dato',
  hrm: 'Por revisar (HRM)',
};

const CAUSAS_FIJAS = {
  ajuste_no_reintegrado: { de: 'nomina', titulo: 'Ajuste mensual a favor no reintegrado',
    explicacion: 'En el mes se retuvo más ISR del que resulta con la tarifa mensual. El ajuste da un saldo a favor del trabajador y la nómina dejó la retención en $0 sin reintegrarlo.' },
  isn_menor: { de: 'nomina', titulo: 'ISN de la nómina menor al de ley',
    explicacion: 'El impuesto sobre nóminas que trae la prenómina para el registro es menor al que resulta de aplicar la tasa vigente de la entidad (y sus adicionales) a las erogaciones del mes.' },
  isn_mayor: { de: 'hrm', titulo: 'ISN de la nómina mayor al calculado',
    explicacion: 'La prenómina trae más impuesto sobre nóminas que el que resulta de la tasa de la entidad sobre las erogaciones catalogadas del mes. Suele venir de conceptos que la entidad no grava o de columnas sin catalogar.' },
  alcance: { de: 'alcance', titulo: 'Cálculo limitado: falta un dato',
    explicacion: 'El sistema no tiene un dato que la ley pide para este renglón (lo dice en cada caso). El importe es una referencia y no cuenta como error de la nómina ni del sistema hasta tener el dato.' },
  sin_identificar: { de: 'hrm', titulo: 'Sin causa identificada',
    explicacion: 'Ninguna de las causas conocidas reproduce lo que retuvo la nómina. HRM revisa estos casos uno por uno.' },
};

/** Catálogo de causas: las fijas más las que declara el perfil del cliente. Las combinadas se arman al vuelo. */
export function catalogoCausas(perfil) {
  const c = { ...CAUSAS_FIJAS };
  for (const h of hipotesisDe(perfil)) c[h.id] = { de: h.de || 'nomina', titulo: h.titulo, explicacion: h.explicacion };
  return c;
}

export function describirCausa(id, perfil) {
  const cat = catalogoCausas(perfil);
  if (cat[id]) return { id, ...cat[id] };
  const partes = String(id).split('+').map(p => cat[p]).filter(Boolean);
  if (!partes.length) return { id, ...CAUSAS_FIJAS.sin_identificar };
  // Quien responde por una causa combinada: la nómina si alguna parte es suya; si no, el criterio; si no, el dato.
  const de = ['nomina', 'criterio', 'alcance', 'hrm'].find(d => partes.some(p => p.de === d));
  return { id, de, titulo: partes.map(p => p.titulo).join(' + '), explicacion: partes.map(p => p.explicacion).join(' ') };
}

const hipotesisDe = (perfil) => ((perfil && perfil.perfil_fiscal && perfil.perfil_fiscal.hipotesis) || []);

/** Contexto que sustituye el valor de un parámetro para probar una hipótesis (no toca el catálogo). */
class ContextoHipotesis extends Contexto {
  constructor(catalogo, sustituye) { super(catalogo); this.sustituye = sustituye || {}; }
  param(clave, fecha, entidad) {
    const f = super.param(clave, fecha, entidad);
    return Object.prototype.hasOwnProperty.call(this.sustituye, clave) ? { ...f, valor: this.sustituye[clave] } : f;
  }
}

const subconjuntos = (l, max) => {
  const out = [];
  const rec = (i, act) => { if (act.length) out.push(act); if (act.length >= max) return; for (let k = i; k < l.length; k++) rec(k + 1, [...act, l[k]]); };
  rec(0, []);
  return out.sort((a, b) => a.length - b.length);
};

/** Corridas del mismo mes de pago y periodicidad que la corrida dada (las que entran a su ajuste mensual). */
function corridasDelAjuste(corrida_id, calendario) {
  const c = calendario.get(corrida_id);
  if (!c) return [corrida_id];
  return [...calendario.entries()].filter(([, x]) => x.ordinaria !== false && x.periodicidad === c.periodicidad && String(x.fecha_pago).slice(0, 7) === String(c.fecha_pago).slice(0, 7)).map(([id]) => id);
}

/**
 * Efecto de una hipótesis sobre la base del cálculo: cuánto baja la base gravable (centavos ≥ 0) y qué
 * parámetros sustituye. null si la hipótesis no aplica a este renglón.
 */
function efecto(h, d, a, corridas) {
  if (h.tipo === 'subsidio_monto') return { baja_c: 0, sustituye: { SUBSIDIO_MONTO_MENSUAL: h.monto_mensual } };
  const filas = corridas.flatMap(c => (a.conceptos.get(d.colaborador_id + '|' + c) || []).filter(x => x.concepto === h.concepto).map(x => ({ ...x, corrida_id: c })));
  if (!filas.length) return null;
  if (h.tipo === 'concepto_exento') {
    const baja = filas.reduce((s, x) => s + (x.gravable_c || 0), 0);
    return baja > 0 ? { baja_c: baja, sustituye: {} } : null;
  }
  if (h.tipo === 'exento_hasta_uma') {
    let baja = 0;
    for (const x of filas) {
      const cal = a.calendario.get(x.corrida_id);
      const uma = cal ? a.catalogo.buscar('UMA_DIARIA', cal.fecha_pago) : null;
      if (!uma) continue;
      const tope = E(uma.valor).por(h.veces || 1).aCentavos();
      baja += Math.max(0, Math.min(x.monto_c || 0, tope) - (x.exento_c || 0));
    }
    return baja > 0 ? { baja_c: baja, sustituye: {} } : null;
  }
  return null;
}

/** Recalcula el ISR del renglón bajando la base y sustituyendo parámetros. null si no se puede (sin fecha de pago). */
function recalcular(d, a, { baja_c = 0, sustituye = {} } = {}) {
  const cal = a.calendario.get(d.corrida_id);
  if (!cal || !cal.fecha_pago) return null;
  const ctx = new ContextoHipotesis(a.catalogo, sustituye);
  const t = d.traza;
  try {
    if (d.regla_id === 'CALC-ISR-AJM-001') {
      if (!Number.isInteger(t.base_mes_c) || !Number.isInteger(t.isr_retenido_previo_mes_c)) return null;
      const tope = t.base_tope_mes_c != null ? t.base_tope_mes_c : t.base_mes_c;
      return CALC_ISR_AJM_001.calcular({ bases_mes_c: [t.base_mes_c - baja_c], bases_tope_mes_c: [tope - baja_c], isr_retenido_previo_mes_c: t.isr_retenido_previo_mes_c,
        fecha_pago: cal.fecha_pago, aplica_ajuste_mensual: true }, ctx).valor_c;
    }
    if (d.regla_id === 'CALC-ISR-SEM-001' || d.regla_id === 'CALC-ISR-CAT-001') {
      if (!Number.isInteger(t.base_gravable_c)) return null;
      const per = d.regla_id === 'CALC-ISR-CAT-001' ? 'catorcenal' : (t.periodicidad || cal.periodicidad || 'semanal');
      return isrPeriodo(ctx, { base_gravable_c: t.base_gravable_c - baja_c, base_para_tope_c: (t.base_para_tope_c ?? t.base_gravable_c) - baja_c, periodicidad: per, fecha_pago: cal.fecha_pago }).isr_retenido_c;
    }
  } catch { return null; }
  return null;
}

/** Limitaciones del cálculo en palabras de quien consulta (sin claves internas ni repetidas). */
function textoLimitaciones(l) {
  const out = new Set();
  for (const x of l || []) {
    const d = String(x.detalle || '').replace(/^(SEM|CAT)\d+: /, '').replace(/^(dato_faltante|criterio_pendiente|parametro_nivel_C): /, '');
    if (/^EXENCION:|^ISN_|@\d{4}/.test(d) || x.motivo === 'parametro_nivel_C') continue; // nivel del parámetro: lo ve HRM en la traza
    if (/prima_dominical: domingos/.test(d)) out.add('Prima dominical: el archivo no dice cuántos domingos se trabajaron');
    else if (/acumulado anual de exenciones/.test(d)) out.add(nombreConcepto(d.split(':')[0]) + ': falta lo exento ya usado en el año');
    else if (/subsidio_incapacidad/.test(d)) out.add('Subsidio por incapacidad: criterio pendiente de decisión');
    else if (/fechas de ingreso y baja/.test(d)) out.add('Pago por separación: faltan las fechas de ingreso y baja');
    else if (x.motivo === 'concepto_no_catalogado') out.add('Concepto sin catalogar: ' + d);
    else if (x.motivo === 'concepto_opaco') out.add('Concepto por confirmar: ' + d);
    else if (x.motivo === 'control_renglon') out.add('La suma de los conceptos no da el total de percepciones del renglón');
    else if (d) out.add(d.replace(/_/g, ' '));
  }
  return [...out];
}

/**
 * Diagnóstico de una diferencia.
 * @param d { regla_id, corrida_id, colaborador_id, kernel_c, cliente_c, limitado, traza }
 *          traza: lo que el cálculo dejó sellado (para ISR: bases y retenido previo; para ISN: base, tasa, adicionales).
 * @param a { catalogo, perfil, calendario: Map corrida → { periodicidad, fecha_pago, ordinaria },
 *            conceptos: Map 'colaborador|corrida' → [{ concepto, monto_c, exento_c, gravable_c }] }
 * @returns { causa, recalculo_c, detalle }  causa: id del catálogo (o varias unidas con «+»)
 */
export function diagnosticar(d, a) {
  const lim = textoLimitaciones(d.traza && d.traza.limitaciones);
  if (d.regla_id === 'CALC-ISN-001') {
    const t = d.traza || {};
    const pct = t.base_c ? (100 * d.cliente_c / t.base_c) : null;
    const fuera = t.origen && t.origen.isn_nomina_fuera_de_rango;
    return { causa: d.cliente_c < d.kernel_c ? 'isn_menor' : 'isn_mayor', recalculo_c: null,
      detalle: (t.entidad || '') + ': tasa de ley ' + (t.tasa_pct ?? '—') + ' %' + (t.adicionales_c ? ' más adicionales' : '') + '; la nómina trae ' + (pct === null ? '—' : pct.toFixed(2)) + ' % de la base' +
        (fuera ? '. ' + fuera.renglones + ' renglones con «Impuesto estatal» fuera de rango no se sumaron' : '') };
  }
  const esAjuste = d.regla_id === 'CALC-ISR-AJM-001';
  const base = recalcular(d, a);
  // Si el recálculo sin hipótesis ya no da lo que selló el kernel (cambió el calendario o un parámetro), no se prueba nada.
  const reproducible = base !== null && base === d.kernel_c;
  if (reproducible) {
    if (esAjuste && d.kernel_c < 0 && d.cliente_c === 0) return { causa: 'ajuste_no_reintegrado', recalculo_c: d.kernel_c, detalle: null };
    const corridas = esAjuste ? corridasDelAjuste(d.corrida_id, a.calendario) : [d.corrida_id];
    const aplicables = hipotesisDe(a.perfil).map(h => ({ h, e: efecto(h, d, a, corridas) })).filter(x => x.e);
    for (const grupo of subconjuntos(aplicables, 3)) {
      const baja_c = grupo.reduce((s, x) => s + x.e.baja_c, 0);
      const sustituye = Object.assign({}, ...grupo.map(x => x.e.sustituye));
      const v = recalcular(d, a, { baja_c, sustituye });
      if (v === null || v === d.kernel_c) continue; // la hipótesis no mueve este renglón: no lo explica
      const ids = grupo.map(x => x.h.id);
      if (Math.abs(v - d.cliente_c) <= MARGEN_C) return { causa: ids.join('+'), recalculo_c: v, detalle: null };
      if (esAjuste && v < 0 && d.cliente_c === 0) return { causa: [...ids, 'ajuste_no_reintegrado'].join('+'), recalculo_c: v, detalle: null };
    }
  }
  if (d.limitado || lim.length) return { causa: 'alcance', recalculo_c: null, detalle: lim.join('; ') || null };
  return { causa: 'sin_identificar', recalculo_c: null, detalle: reproducible ? null : 'El calendario o los parámetros cambiaron después de esta ejecución: vuelve a calcular el archivo' };
}

// ───────────────────────────── Explicación paso a paso ─────────────────────────────

const NOMBRES = { sueldo: 'Sueldo', vales_despensa: 'Despensa', vacaciones: 'Vacaciones', prima_vacacional: 'Prima vacacional', aguinaldo: 'Aguinaldo', gratificacion: 'Gratificación',
  indemnizacion: 'Indemnización', prima_antiguedad: 'Prima de antigüedad', liquidacion: 'Liquidación', ptu: 'PTU', bono: 'Bono', fondo_ahorro_empresa: 'Fondo de ahorro (empresa)',
  comisiones: 'Comisiones', prima_dominical: 'Prima dominical', dia_festivo: 'Día festivo', dia_descanso: 'Día de descanso', subsidio_incapacidad: 'Subsidio por incapacidad',
  retroactivo: 'Retroactivo', ajuste_sueldo: 'Ajuste de sueldo', incentivos: 'Incentivos' };
export function nombreConcepto(c) { return NOMBRES[c] || String(c || '').replace(/_/g, ' '); }

const mxn = (c) => { if (c == null) return '—'; const n = Math.abs(Number(c)); return (Number(c) < 0 ? '-' : '') + '$' + Math.floor(n / 100).toLocaleString('en-US') + '.' + String(n % 100).padStart(2, '0'); };
const num = (s) => { const [e, d = ''] = String(s).split('.'); return '$' + Number(e).toLocaleString('en-US') + '.' + (d + '00').slice(0, 2); };

function pasoTarifa(t, nombre) {
  if (!t || t.renglon == null) return { t: 'Tarifa ' + nombre, v: 'Base en cero: sin impuesto', c: 0 };
  return { t: 'Tarifa ' + nombre + ' (renglón ' + t.renglon + ')', v: 'Cuota fija ' + num(t.cuota_fija) + ' + ' + t.tasa_pct + ' % sobre el excedente de ' + num(t.limite_inferior) + ' (' + num(t.excedente) + ')' + (t.metodo ? ' · por día × 14' : ''),
    c: E(t.isr_periodo_exacto || t.isr_exacto).aCentavos() };
}
function pasoSubsidio(s) {
  if (!s) return null;
  return { t: 'Subsidio para el empleo', v: s.aplica ? 'La base (' + num(s.base_comparada) + ') no pasa del tope (' + num(s.tope_comparado) + '): se resta' : 'La base (' + num(s.base_comparada) + ') pasa del tope (' + num(s.tope_comparado) + '): no aplica',
    c: s.aplica ? -s.subsidio_c : 0 };
}

/**
 * Pasos del cálculo de una diferencia, en palabras, para que quien consulta pueda validarlo contra su nómina.
 * @param d   como en diagnosticar, con la traza completa
 * @param exe [{ corrida_id, traza }]  trazas de CALC-EXE-001 de las corridas que entran al cálculo
 * @returns [{ t: título, v: texto, c?: centavos, fuerte?: bool }]
 */
export function explicar(d, exe, dx, perfil) {
  const t = d.traza || {};
  const pasos = [];
  if (d.regla_id === 'CALC-ISN-001') {
    for (const c of t.conceptos || []) pasos.push({ t: nombreConcepto(c.concepto), v: c.trato === 'exento' ? 'No causa ISN en ' + t.entidad : 'Grava', c: c.monto_c });
    pasos.push({ t: 'Base del mes en ' + (t.entidad || 'la entidad'), v: 'Erogaciones gravadas del registro ' + (t.registro || ''), c: t.base_c, fuerte: true });
    pasos.push({ t: 'Tasa de la entidad', v: (t.tasa_pct ?? '—') + ' % sobre la base', c: t.impuesto_c });
    if (t.adicionales_c) pasos.push({ t: 'Adicionales', v: (t.adicional && t.adicional.descripcion) || 'Contribuciones adicionales de la entidad', c: t.adicionales_c });
  } else if (d.regla_id === 'CALC-ISR-AJM-001') {
    for (const x of exe || []) pasos.push({ t: 'Base gravable ' + x.corrida_id, v: (x.traza.conceptos || []).filter(c => c.gravable_c).map(c => nombreConcepto(c.concepto) + ' ' + mxn(c.gravable_c)).join(' + ') || 'Sin percepciones gravadas', c: x.traza.base_gravable_c });
    for (const x of (t.origen && t.origen.extras) || []) pasos.push({ t: 'Pago extra en el ajuste', v: String(x), c: null });
    pasos.push({ t: 'Base del mes', v: 'Suma de las ' + (t.nominas_en_mes || '') + ' nóminas pagadas en el mes', c: t.base_mes_c, fuerte: true });
    pasos.push(pasoTarifa(t.tarifa, 'mensual'));
    const s = pasoSubsidio(t.subsidio_mensual); if (s) pasos.push(s);
    pasos.push({ t: 'ISR del mes', v: 'Tarifa mensual menos subsidio', c: t.isr_mes_c });
    pasos.push({ t: 'ISR ya retenido en el mes', v: 'Lo que la nómina retuvo en las nóminas anteriores del mes', c: -t.isr_retenido_previo_mes_c });
  } else {
    const x = (exe || []).find(e => e.corrida_id === d.corrida_id);
    for (const c of (x && x.traza.conceptos) || []) {
      const nota = c.nota ? String(c.nota).replace(' (perfil)', '').replace(/: grava$/, ': se grava') : '';
      pasos.push({ t: nombreConcepto(c.concepto), v: c.exento_c ? 'Exento ' + mxn(c.exento_c) + ' · gravado ' + mxn(c.gravable_c) + (nota ? ' (' + nota + ')' : '') : (nota || 'Gravado'), c: c.monto_c });
    }
    pasos.push({ t: 'Base gravable', v: 'Percepciones menos su parte exenta', c: t.base_gravable_c, fuerte: true });
    pasos.push(pasoTarifa(t.tarifa, d.regla_id === 'CALC-ISR-CAT-001' ? 'catorcenal' : (t.periodicidad || 'semanal')));
    const s = pasoSubsidio(t.subsidio); if (s) pasos.push(s);
  }
  pasos.push({ t: 'El sistema calcula', v: d.regla_id === 'CALC-ISN-001' ? 'ISN del registro en el mes' : 'ISR a retener en ' + d.corrida_id, c: d.kernel_c, fuerte: true });
  pasos.push({ t: 'La nómina trae', v: d.regla_id === 'CALC-ISN-001' ? 'Suma de «Impuesto estatal» del registro' : 'ISR retenido en el renglón', c: d.cliente_c, fuerte: true });
  pasos.push({ t: 'Diferencia', v: 'Nómina menos sistema', c: d.cliente_c - d.kernel_c, fuerte: true });
  const causa = describirCausa(dx.causa, perfil);
  pasos.push({ t: 'Por qué: ' + causa.titulo, v: causa.explicacion + (dx.detalle ? ' ' + dx.detalle + '.' : '') + (dx.recalculo_c != null && dx.causa !== 'ajuste_no_reintegrado' ? ' Recalculado así da ' + mxn(dx.recalculo_c) + '.' : ''), c: null, causa: true });
  return pasos;
}

// ───────────────────────────── Lectura desde D1 ─────────────────────────────

const J = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** Lo que necesita `diagnosticar` de una ejecución: calendario y conceptos de las hipótesis del perfil. */
async function ayudas(db, { encargo_id, ejecucion_id, perfil, catalogo, colaborador_id }) {
  const { results: cal } = await db.prepare('SELECT corrida_id, periodicidad, fecha_pago, ordinaria FROM calendario_nomina WHERE encargo_id = ?1').bind(encargo_id).all();
  const calendario = new Map(cal.map(c => [c.corrida_id, { periodicidad: c.periodicidad, fecha_pago: c.fecha_pago, ordinaria: c.ordinaria === 1 }]));
  const cs = [...new Set(hipotesisDe(perfil).map(h => h.concepto).filter(Boolean))];
  const conceptos = new Map();
  if (cs.length) {
    const ph = cs.map((_, i) => '?' + (i + 2)).join(',');
    const { results } = await db.prepare("SELECT c.colaborador_id, c.corrida_id, json_extract(j.value, '$.concepto') AS concepto, json_extract(j.value, '$.monto_c') AS monto_c, " +
      "json_extract(j.value, '$.exento_c') AS exento_c, json_extract(j.value, '$.gravable_c') AS gravable_c FROM calculo_kernel c, json_each(c.traza_json, '$.conceptos') j " +
      "WHERE c.ejecucion_id = ?1 AND c.regla_id = 'CALC-EXE-001' AND json_extract(j.value, '$.gravable_c') > 0 AND json_extract(j.value, '$.concepto') IN (" + ph + ')' + (colaborador_id ? ' AND c.colaborador_id = ?' + (cs.length + 2) : ''))
      .bind(ejecucion_id, ...cs, ...(colaborador_id ? [colaborador_id] : [])).all();
    for (const r of results) {
      const k = r.colaborador_id + '|' + r.corrida_id;
      if (!conceptos.has(k)) conceptos.set(k, []);
      conceptos.get(k).push(r);
    }
  }
  return { catalogo, perfil, calendario, conceptos };
}

const COLS_DX = "d.id, d.cubeta, c.regla_id, c.rubro, c.corrida_id, c.colaborador_id, c.valor_calculado_c AS kernel_c, m.valor_c AS cliente_c, c.limitado, m.renglon_origen, " +
  "json_extract(c.traza_json, '$.periodicidad') AS periodicidad, json_extract(c.traza_json, '$.base_gravable_c') AS base_gravable_c, json_extract(c.traza_json, '$.base_para_tope_c') AS base_para_tope_c, " +
  "json_extract(c.traza_json, '$.base_mes_c') AS base_mes_c, json_extract(c.traza_json, '$.subsidio_mensual.base_comparada') AS tope_mes, json_extract(c.traza_json, '$.isr_retenido_previo_mes_c') AS previo_c, " +
  "json_extract(c.traza_json, '$.base_c') AS base_c, json_extract(c.traza_json, '$.tasa_pct') AS tasa_pct, json_extract(c.traza_json, '$.adicionales_c') AS adicionales_c, json_extract(c.traza_json, '$.entidad') AS entidad, " +
  "json_extract(c.traza_json, '$.limitaciones') AS limitaciones, json_extract(c.traza_json, '$.origen.isn_nomina_fuera_de_rango') AS isn_fuera";

/** Traza mínima para el diagnóstico a partir de las columnas extraídas en SQL (sin traer el JSON completo). */
function trazaMinima(r) {
  return { periodicidad: r.periodicidad, base_gravable_c: r.base_gravable_c, base_para_tope_c: r.base_para_tope_c, base_mes_c: r.base_mes_c,
    base_tope_mes_c: r.tope_mes != null ? E(String(r.tope_mes)).aCentavos() : null, isr_retenido_previo_mes_c: r.previo_c,
    base_c: r.base_c, tasa_pct: r.tasa_pct, adicionales_c: r.adicionales_c, entidad: r.entidad, limitaciones: J(r.limitaciones) || [],
    origen: r.isn_fuera ? { isn_nomina_fuera_de_rango: J(r.isn_fuera) } : {} };
}

/**
 * Todas las diferencias de una ejecución con su causa, el resumen de lo validado por regla y los grupos por causa.
 * Se calcula al leer (no guarda nada): mejora el diagnóstico y mejora lo ya ejecutado.
 */
export async function diagnosticoEjecucion(db, { encargo_id, ejecucion_id, perfil, catalogo }) {
  const { results: filas } = await db.prepare('SELECT ' + COLS_DX + ' FROM diferencia d JOIN calculo_kernel c ON c.id = d.calculo_kernel_id JOIN movimiento_nomina m ON m.id = d.movimiento_id ' +
    'WHERE c.ejecucion_id = ?1 AND c.encargo_id = ?2').bind(ejecucion_id, encargo_id).all();
  const a = filas.length ? await ayudas(db, { encargo_id, ejecucion_id, perfil, catalogo }) : null;
  const casos = filas.map(r => {
    const d = { regla_id: r.regla_id, corrida_id: r.corrida_id, colaborador_id: r.colaborador_id, kernel_c: r.kernel_c, cliente_c: r.cliente_c, limitado: r.limitado === 1, traza: trazaMinima(r) };
    const dx = diagnosticar(d, a);
    return { id: r.id, regla_id: r.regla_id, rubro: r.rubro, corrida_id: r.corrida_id, colaborador_id: r.colaborador_id, kernel_c: r.kernel_c, cliente_c: r.cliente_c,
      diferencia_c: r.cliente_c - r.kernel_c, limitado: r.limitado === 1, cubeta: r.cubeta || null, renglon_origen: r.renglon_origen, causa: dx.causa, recalculo_c: dx.recalculo_c, detalle: dx.detalle };
  });
  // Grupos por causa y regla.
  const grupos = new Map();
  for (const c of casos) {
    const k = c.causa + '|' + c.regla_id;
    let g = grupos.get(k);
    if (!g) { g = { ...describirCausa(c.causa, perfil), causa: c.causa, regla_id: c.regla_id, rubro: c.rubro, n: 0, pendientes: 0, suma_c: 0, min_c: c.diferencia_c, max_c: c.diferencia_c }; delete g.id; grupos.set(k, g); }
    g.n += 1; g.suma_c += c.diferencia_c; if (!c.cubeta) g.pendientes += 1;
    if (c.diferencia_c < g.min_c) g.min_c = c.diferencia_c; if (c.diferencia_c > g.max_c) g.max_c = c.diferencia_c;
  }
  const orden = { nomina: 0, criterio: 1, alcance: 2, hrm: 3 };
  const causas = [...grupos.values()].sort((x, y) => (orden[x.de] - orden[y.de]) || (y.n - x.n));
  // Lo que se validó: cálculos comparados contra la nómina por regla, con o sin diferencia.
  const { results: res } = await db.prepare("SELECT c.regla_id, count(*) AS calculos, sum(c.limitado) AS limitados, sum(d.id IS NOT NULL) AS diferencias, " +
    "sum(CASE WHEN d.id IS NOT NULL THEN abs(m.valor_c - c.valor_calculado_c) ELSE 0 END) AS suma_abs_c " +
    "FROM calculo_kernel c LEFT JOIN diferencia d ON d.calculo_kernel_id = c.id LEFT JOIN movimiento_nomina m ON m.id = d.movimiento_id " +
    "WHERE c.ejecucion_id = ?1 AND c.rubro IN ('isr', 'isn') GROUP BY c.regla_id ORDER BY c.regla_id").bind(ejecucion_id).all();
  const resumen = res.map(r => ({ regla_id: r.regla_id, calculos: r.calculos, coinciden: r.calculos - (r.diferencias || 0), diferencias: r.diferencias || 0, limitados: r.limitados || 0, suma_abs_c: r.suma_abs_c || 0 }));
  const ing = await db.prepare("SELECT id, archivo_nombre, reporte_json FROM ingesta WHERE ejecucion_id = ?1 ORDER BY creado_en DESC LIMIT 1").bind(ejecucion_id).first();
  const rep = ing ? J(ing.reporte_json) || {} : {};
  return { casos, causas, resumen, de: DE, sin_calculo: rep.sin_calendario || {}, archivo: ing ? ing.archivo_nombre : null, ingesta_id: ing ? ing.id : null,
    avisos: { ajm_bonos_fuera: (rep.mensual && rep.mensual.ajm_bonos_fuera) || null, isn_fuera_de_rango: (rep.mensual && rep.mensual.isn_fuera_de_rango) || null },
    total: casos.length, sin_clasificar: casos.filter(c => !c.cubeta).length };
}

/** Explicación completa de una diferencia: pasos del cálculo con la traza sellada y la causa. */
export async function explicarDiferencia(db, { encargo_id, diferencia_id, perfil, catalogo }) {
  const r = await db.prepare('SELECT d.id, d.cubeta, d.motivo, c.ejecucion_id, c.regla_id, c.rubro, c.corrida_id, c.colaborador_id, c.valor_calculado_c AS kernel_c, m.valor_c AS cliente_c, c.limitado, m.renglon_origen, c.traza_json ' +
    'FROM diferencia d JOIN calculo_kernel c ON c.id = d.calculo_kernel_id JOIN movimiento_nomina m ON m.id = d.movimiento_id WHERE d.id = ?1 AND c.encargo_id = ?2').bind(diferencia_id, encargo_id).first();
  if (!r) return null;
  const traza = J(r.traza_json) || {};
  if (traza.subsidio_mensual && traza.subsidio_mensual.base_comparada != null) traza.base_tope_mes_c = E(String(traza.subsidio_mensual.base_comparada)).aCentavos();
  const d = { regla_id: r.regla_id, corrida_id: r.corrida_id, colaborador_id: r.colaborador_id, kernel_c: r.kernel_c, cliente_c: r.cliente_c, limitado: r.limitado === 1, traza };
  const a = await ayudas(db, { encargo_id, ejecucion_id: r.ejecucion_id, perfil, catalogo, colaborador_id: r.colaborador_id });
  const dx = diagnosticar(d, a);
  let exe = [];
  if (r.regla_id !== 'CALC-ISN-001') {
    const corridas = r.regla_id === 'CALC-ISR-AJM-001' ? corridasDelAjuste(r.corrida_id, a.calendario) : [r.corrida_id];
    const { results } = await db.prepare("SELECT corrida_id, traza_json FROM calculo_kernel WHERE ejecucion_id = ?1 AND regla_id = 'CALC-EXE-001' AND encargo_id = ?2 AND colaborador_id = ?3").bind(r.ejecucion_id, encargo_id, r.colaborador_id).all();
    const orden = (id) => { const c = a.calendario.get(id); return c ? c.fecha_pago : ''; };
    exe = results.filter(x => corridas.includes(x.corrida_id)).map(x => ({ corrida_id: x.corrida_id, traza: J(x.traza_json) || {} })).sort((x, y) => orden(x.corrida_id).localeCompare(orden(y.corrida_id)));
  }
  return { id: r.id, regla_id: r.regla_id, corrida_id: r.corrida_id, colaborador_id: r.colaborador_id, kernel_c: r.kernel_c, cliente_c: r.cliente_c, diferencia_c: r.cliente_c - r.kernel_c,
    limitado: r.limitado === 1, renglon_origen: r.renglon_origen, cubeta: r.cubeta || null, causa: { ...describirCausa(dx.causa, perfil), detalle: dx.detalle, recalculo_c: dx.recalculo_c },
    pasos: explicar(d, exe, dx, perfil) };
}
