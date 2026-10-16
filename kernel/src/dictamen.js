// dictamen.js — Del resultado del kernel a la opinión (módulos 17–19; T4, T5, T6, T7; D2, D7, D13).
//
// Puro y determinista: no lee la base. Recibe diferencias, hallazgos y resultados de
// regla, y devuelve tolerancia aplicada, materialidad, opinión propuesta y el contenido
// del dictamen con su huella. La base (migración 0006) hace cumplir lo que aquí se
// decide: el dictamen emitido no cambia, un reproceso emite una versión nueva y los
// hallazgos nunca se borran.
//
// El criterio que ordena todo: el sistema nunca afirma más de lo que verificó.
import { sha256Hex, jsonCanonico } from './sello.js';

// ── T4 · Tolerancia (D2 corregida) ──────────────────────────────────
// Individual: $0.50 por colaborador. Agregada: el mayor entre $5.00 y colaboradores × $0.50,
// aplicada sólo a lo que el filtro individual dejó pasar como ruido. Nunca se aplica a
// rubros de entero (retenido contra enterado, cuotas pagadas contra determinadas, ISN
// declarado contra calculado): ahí la diferencia es cero o es hallazgo.
export const TOLERANCIA_DEF = { individual_c: 50, agregado_min_c: 500, agregado_por_colaborador_c: 50 };

export function toleranciaAgregada(colaboradores, { agregado_min_c = 500, agregado_por_colaborador_c = 50 } = {}) {
  return Math.max(agregado_min_c, Math.max(0, colaboradores | 0) * agregado_por_colaborador_c);
}

/**
 * Aplica la tolerancia a las diferencias de un grupo (un rubro de una corrida).
 * La suma del ruido es con signo: el redondeo aleatorio se cancela, el sesgo sistemático no.
 * Si el ruido acumulado rompe el agregado, nada se perdona: todas pasan a diferencias.
 * @param {Array<{diferencia_c:number}>} diferencias
 * @returns {{ fuera: Array, toleradas: number, suma_tolerada_c: number, agregado_c: number, rompe_agregado: boolean, entero: boolean }}
 */
export function aplicarTolerancia(diferencias, { colaboradores = 0, entero = false, individual_c = TOLERANCIA_DEF.individual_c,
  agregado_min_c = TOLERANCIA_DEF.agregado_min_c, agregado_por_colaborador_c = TOLERANCIA_DEF.agregado_por_colaborador_c } = {}) {
  const agregado_c = toleranciaAgregada(colaboradores, { agregado_min_c, agregado_por_colaborador_c });
  if (entero) return { fuera: diferencias.map(d => ({ ...d })), toleradas: 0, suma_tolerada_c: 0, agregado_c: 0, rompe_agregado: false, entero: true };
  const dentro = [], fuera = [];
  for (const d of diferencias) (Math.abs(d.diferencia_c) <= individual_c ? dentro : fuera).push(d);
  const suma = dentro.reduce((s, d) => s + d.diferencia_c, 0);
  if (Math.abs(suma) > agregado_c) {
    return { fuera: [...fuera, ...dentro.map(d => ({ ...d, por_agregado: true }))], toleradas: 0, suma_tolerada_c: suma, agregado_c, rompe_agregado: true, entero: false };
  }
  return { fuera, toleradas: dentro.length, suma_tolerada_c: suma, agregado_c, rompe_agregado: false, entero: false };
}

/** Aplica la tolerancia por grupo rubro × corrida; n colaboradores = distintos en los cálculos del grupo. */
export function toleranciaPorGrupo(diferencias, calculos, op = {}) {
  const enteros = new Set(op.rubros_entero || []);
  const colab = new Map();
  for (const c of calculos) {
    const k = c.rubro + '|' + (c.corrida_id || '');
    if (!colab.has(k)) colab.set(k, new Set());
    colab.get(k).add(c.colaborador_id);
  }
  const grupos = new Map();
  for (const d of diferencias) {
    const k = d.rubro + '|' + (d.corrida_id || '');
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  }
  const fuera = [], resumen = [];
  for (const [k, ds] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [rubro, corrida_id] = k.split('|');
    const r = aplicarTolerancia(ds, { ...op, colaboradores: colab.get(k)?.size || 0, entero: enteros.has(rubro) });
    fuera.push(...r.fuera);
    resumen.push({ rubro, corrida_id: corrida_id || null, colaboradores: colab.get(k)?.size || 0, diferencias: ds.length, fuera: r.fuera.length,
      toleradas: r.toleradas, suma_tolerada_c: r.suma_tolerada_c, agregado_c: r.agregado_c, rompe_agregado: r.rompe_agregado, entero: r.entero });
  }
  return { fuera, resumen, toleradas: resumen.reduce((s, x) => s + x.toleradas, 0) };
}

// ── T5 · Materialidad (D7 ratificada con ajuste) ────────────────────
export const MATERIALIDAD_DEF = { bp: 50, piso_c: 1000000, recurrencia_periodos: 3 }; // 0.5 %, $10,000, 3 periodos

export const MOTIVOS_CUALITATIVOS = {
  retencion_no_enterada: 'Retención no enterada',
  cuota_no_enterada: 'Cuota no enterada',
  pago_sin_cfdi: 'Pago sin CFDI vigente',
  pago_baja_imss: 'Pago a persona sin alta o ya dada de baja ante el IMSS',
  uuid_duplicado: 'UUID duplicado',
};

/**
 * Umbral cuantitativo sobre la carga patronal del PERIODO DICTAMINADO (un mes en iguala,
 * el ejercicio en los niveles A), con piso. Aritmética entera, un redondeo medio hacia arriba.
 */
export function umbralMaterialidad({ carga_patronal_c, bp = MATERIALIDAD_DEF.bp, piso_c = MATERIALIDAD_DEF.piso_c } = {}) {
  if (carga_patronal_c === null || carga_patronal_c === undefined || !Number.isInteger(carga_patronal_c) || carga_patronal_c < 0)
    return { umbral_c: null, porcentaje_c: null, piso_c, bp, manda: null, falta: 'carga_patronal_c del periodo dictaminado' };
  const porcentaje_c = Number((BigInt(carga_patronal_c) * BigInt(bp) * 2n + 10000n) / 20000n);
  return { umbral_c: Math.max(piso_c, porcentaje_c), porcentaje_c, piso_c, bp, manda: porcentaje_c >= piso_c ? 'porcentaje' : 'piso', falta: null };
}

/** Efecto de un hallazgo: el derivado de sus diferencias (Σ|d|) o la valuación capturada, el mayor. */
export function efectoHallazgo(h) {
  // Valuado (módulo 18): la contingencia es contribución + actualización + recargos (mínimo) y más la multa máxima (máximo).
  if (h.valuacion && h.valuacion.valuable) {
    const manual = Number.isInteger(h.efecto_max_c) ? h.efecto_max_c : 0;
    return { efecto_min_c: h.valuacion.contingencia_min_c, efecto_max_c: Math.max(h.valuacion.contingencia_max_c, manual) };
  }
  const der = h.efecto_derivado_c ?? null;
  const max = [h.efecto_max_c, der].filter(x => Number.isInteger(x));
  const min = [h.efecto_min_c ?? der].filter(x => Number.isInteger(x));
  return { efecto_min_c: min.length ? min[0] : null, efecto_max_c: max.length ? Math.max(...max) : null };
}

/**
 * Un hallazgo es material si cumple cualquiera: (a) cualitativo, siempre; (b) efecto máximo ≥ umbral;
 * (c) recurrencia: el mismo hallazgo en N o más periodos (ya no es error, es falla de control).
 */
export function evaluarMaterialidad(h, { umbral_c, periodos = 1, recurrencia_periodos = MATERIALIDAD_DEF.recurrencia_periodos } = {}) {
  const motivos = [];
  if (h.tipo === 'cualitativo') {
    if (!MOTIVOS_CUALITATIVOS[h.motivo_cualitativo]) throw new Error('Hallazgo cualitativo sin motivo reconocido: ' + h.motivo_cualitativo);
    motivos.push('cualitativo: ' + MOTIVOS_CUALITATIVOS[h.motivo_cualitativo]);
  }
  const { efecto_max_c } = efectoHallazgo(h);
  if (umbral_c !== null && umbral_c !== undefined && efecto_max_c !== null && efecto_max_c >= umbral_c) motivos.push('cuantitativo');
  if (periodos >= recurrencia_periodos) motivos.push('recurrencia: ' + periodos + ' periodos');
  const indeterminado = motivos.length === 0 && (umbral_c === null || umbral_c === undefined || efecto_max_c === null);
  return { material: motivos.length > 0, motivos, efecto_max_c, indeterminado };
}

// ── Módulos del frente 1 y semáforo ─────────────────────────────────
export const MODULOS_FRENTE1 = {
  '4.1': 'Integración del periodo', '4.2': 'Conciliación de cuatro vías', '4.3': 'ISR y subsidio', '4.4': 'SBC',
  '4.5': 'IMSS y RCV', '4.6': 'Prima de riesgo', '4.7': 'INFONAVIT y FONACOT', '4.8': 'ISN', '4.9': 'Prestaciones',
  '4.10': 'Incidencias', '4.11': 'Finiquitos', '4.12': 'Movimientos afiliatorios', '4.13': 'Visor SAT',
};
const MODULO_DE_REGLA = [
  [/^CALC-(EXE|SUB|ISR)-/, '4.3'], [/^CALC-(IMSS|RCV)-/, '4.5'], [/^CALC-INF-/, '4.7'], [/^CALC-ISN-/, '4.8'],
];
export function moduloDeRegla(regla_id) {
  for (const [re, m] of MODULO_DE_REGLA) if (re.test(regla_id || '')) return m;
  return null;
}

/**
 * Estado por módulo a partir de los resultados de regla de la ejecución.
 * Peor estado gana: limitacion_alcance > universo_parcial > completo. Un módulo sin reglas
 * en la versión es fuera_de_alcance (se declara; no es salvedad). Limitaciones declaradas
 * por el revisor se suman (p. ej. finiquitos y PTU sin regla en la v1).
 */
export function estadoModulos(resultados, limitaciones = [], extras = []) {
  const rango = { completo: 0, universo_parcial: 1, limitacion_alcance: 2 };
  const out = Object.fromEntries(Object.entries(MODULOS_FRENTE1).map(([k, nombre]) => [k, { modulo: k, nombre, estado: 'fuera_de_alcance', reglas: [], esperado: 0, efectivo: 0, motivos: [] }]));
  for (const r of resultados) {
    const k = moduloDeRegla(r.regla_id);
    if (!k) continue;
    const m = out[k];
    m.reglas.push({ regla_id: r.regla_id, estado: r.estado, esperado: r.esperado ?? r.universo_esperado ?? 0, efectivo: r.efectivo ?? r.universo_efectivo ?? 0 });
    m.esperado += r.esperado ?? r.universo_esperado ?? 0;
    m.efectivo += r.efectivo ?? r.universo_efectivo ?? 0;
    if (m.estado === 'fuera_de_alcance' || rango[r.estado] > rango[m.estado]) m.estado = r.estado;
  }
  // Módulos que no salen de una regla CALC sino de un cruce de fuentes (4.2 nómina ↔ CFDI).
  for (const x of extras) {
    const m = out[x.modulo];
    if (!m) throw new Error('Módulo desconocido: ' + x.modulo);
    m.estado = x.estado; m.esperado = x.esperado || 0; m.efectivo = x.efectivo || 0; m.motivos.push(...(x.motivos || []));
  }
  for (const l of limitaciones) {
    const m = out[l.modulo];
    if (!m) throw new Error('Módulo desconocido en limitación: ' + l.modulo);
    m.estado = 'limitacion_alcance';
    m.motivos.push(l.motivo);
  }
  return Object.values(out);
}

// ── Opinión (módulo 19, D13) ────────────────────────────────────────
export const OPINIONES = {
  conforme: 'Conforme',
  conforme_con_observaciones: 'Conforme con observaciones',
  con_salvedades: 'Con salvedades',
  adverso: 'Adverso',
  sin_opinion: 'Sin opinión',
};
// Para el consolidado de grupo: la peor manda. Sin opinión pesa más que salvedades
// (no se puede afirmar sobre lo que no se revisó) y menos que adverso (que sí es una afirmación).
export const ORDEN_OPINION = ['conforme', 'conforme_con_observaciones', 'con_salvedades', 'sin_opinion', 'adverso'];

/**
 * Árbol de opinión:
 *   1. Falta la nómina (prenomina, B1) o los XML (xml_nomina, B3): sin opinión (D13).
 *   2. Hallazgos materiales generalizados (material en 3+ módulos del frente 1, o en la
 *      conciliación nómina ↔ CFDI a nivel neto): adverso.
 *   3. Al menos un hallazgo material, o un módulo con limitación al alcance o universo parcial: con salvedades.
 *   4. Hallazgos sobre tolerancia, ninguno material: conforme con observaciones.
 *   5. Sin hallazgos sobre tolerancia: conforme.
 * Si algún hallazgo no se puede evaluar (falta la carga patronal), la propuesta queda indeterminada.
 */
export function proponerOpinion({ fuentes = {}, modulos = [], hallazgos = [] }) {
  const semaforo = {};
  for (const m of modulos) {
    const hs = hallazgos.filter(h => h.modulo === m.modulo);
    let color = 'verde', etiqueta = 'Sin hallazgos sobre tolerancia';
    if (m.estado === 'fuera_de_alcance') { color = 'fuera'; etiqueta = hs.length ? 'Con hallazgos fuera del alcance de cálculo' : 'Fuera del alcance de esta versión'; }
    else if (m.estado === 'limitacion_alcance') { color = 'gris'; etiqueta = 'No corrió por limitación al alcance'; }
    if (hs.some(h => h.material)) { color = 'rojo'; etiqueta = 'Al menos un hallazgo material'; }
    else if (hs.length && color !== 'gris') { color = 'amarillo'; etiqueta = 'Hallazgos no materiales'; }
    else if (m.estado === 'universo_parcial' && color === 'verde') { color = 'amarillo'; etiqueta = 'Universo parcial: cobertura ' + m.efectivo + ' de ' + m.esperado; }
    semaforo[m.modulo] = { color, etiqueta };
  }
  const faltan = ['prenomina', 'xml_nomina'].filter(k => !fuentes[k]);
  const materiales = hallazgos.filter(h => h.material);
  const modulosMateriales = [...new Set(materiales.map(h => h.modulo).filter(k => MODULOS_FRENTE1[k]))].sort();
  const generalizado = modulosMateriales.length >= 3 || materiales.some(h => h.alcance_neto);
  const limitados = modulos.filter(m => m.estado === 'limitacion_alcance' || m.estado === 'universo_parcial');
  const indeterminados = hallazgos.filter(h => h.indeterminado).map(h => h.id);
  const salvedades = [
    ...materiales.map(h => ({ tipo: 'hallazgo', modulo: h.modulo, hallazgo_id: h.id, titulo: h.titulo, efecto_max_c: h.efecto_max_c ?? null })),
    ...limitados.map(m => ({ tipo: m.estado, modulo: m.modulo, nombre: m.nombre, esperado: m.esperado, efectivo: m.efectivo, motivos: m.motivos })),
  ];
  let opinion, regla;
  if (faltan.length) { opinion = 'sin_opinion'; regla = 1; }
  else if (generalizado) { opinion = 'adverso'; regla = 2; }
  else if (materiales.length || limitados.length) { opinion = 'con_salvedades'; regla = 3; }
  else if (hallazgos.length) { opinion = 'conforme_con_observaciones'; regla = 4; }
  else { opinion = 'conforme'; regla = 5; }
  if (!modulos.some(m => m.estado !== 'fuera_de_alcance') && opinion !== 'sin_opinion') { opinion = 'sin_opinion'; regla = 1; }
  return { opinion, regla, faltan_fuentes: faltan, generalizado, modulos_materiales: modulosMateriales, salvedades, semaforo,
    indeterminado: indeterminados.length > 0 && regla >= 3, hallazgos_indeterminados: indeterminados };
}

/**
 * El revisor puede cambiar la opinión propuesta sólo con motivo escrito. Nunca de «sin opinión»
 * a una opinión: sin nómina o sin XML no hay sobre qué opinar (D13).
 */
export function opinionFinal(propuesta, { opinion, motivo } = {}) {
  if (!opinion || opinion === propuesta.opinion) return { opinion: propuesta.opinion, cambiada: false, motivo: null };
  if (!OPINIONES[opinion]) throw new Error('Opinión inválida: ' + opinion);
  if (propuesta.opinion === 'sin_opinion') throw new Error('Sin ' + propuesta.faltan_fuentes.join(' ni ') + ' no hay opinión que emitir (D13)');
  if (!motivo || String(motivo).trim().length < 10) throw new Error('Cambiar la opinión propuesta exige el motivo por escrito');
  return { opinion, cambiada: true, motivo: String(motivo).trim() };
}

/** T7 · El consolidado de un grupo es la peor opinión de sus RFC, nombrando cuáles la determinan. No se promedia. */
export function consolidarOpiniones(componentes) {
  if (!componentes.length) throw new Error('Un consolidado necesita al menos un dictamen individual');
  let peor = 0;
  for (const c of componentes) {
    const i = ORDEN_OPINION.indexOf(c.opinion);
    if (i < 0) throw new Error('Opinión inválida en ' + (c.rfc || c.empresa_id));
    peor = Math.max(peor, i);
  }
  const opinion = ORDEN_OPINION[peor];
  return { opinion, determinada_por: componentes.filter(c => c.opinion === opinion).map(c => c.rfc || String(c.empresa_id)),
    componentes: componentes.map(c => ({ ...c })).sort((a, b) => String(a.rfc).localeCompare(String(b.rfc))) };
}

// ── T6 · Reproceso ──────────────────────────────────────────────────
export const LIMITE_REPROCESO_DIAS = 60;

/** Valida que se pueda emitir una versión nueva; lanza con el motivo si no. */
export function validarReproceso({ anterior, encargo, ahora, motivo, disparado_por }) {
  if (!anterior) return { version: 1 };
  if (!motivo || String(motivo).trim().length < 10) throw new Error('Un reproceso declara qué cambió y por qué');
  if (!['cliente', 'hrm'].includes(disparado_por)) throw new Error('Un reproceso lo dispara el cliente (información nueva o corregida) o HRM (error propio)');
  if (encargo.cerrado_en) {
    const dias = (Date.parse(ahora) - Date.parse(encargo.cerrado_en)) / 86400000;
    if (dias > LIMITE_REPROCESO_DIAS) throw new Error('Pasaron ' + Math.floor(dias) + ' días del cierre del encargo: una corrección abre un encargo nuevo, no una versión');
  }
  return { version: anterior.version + 1 };
}

/**
 * Qué pasa con los hallazgos de la versión anterior: nunca se borran. Siguen presentes → confirmado;
 * reemplazados por uno nuevo (supera_a) → superado; ya no aparecen → resuelto_por_reproceso.
 */
export function transicionHallazgos(anteriores, actuales) {
  const vivos = new Set(actuales.map(h => h.id));
  const superados = new Set(actuales.map(h => h.supera_a).filter(Boolean));
  return anteriores.map(h => ({ hallazgo_id: h.id, antes: h.estatus,
    despues: vivos.has(h.id) ? 'confirmado' : superados.has(h.id) ? 'superado' : 'resuelto_por_reproceso' }));
}

// ── Contenido del dictamen ──────────────────────────────────────────
export const NOTA_ALCANCE = 'Este informe es una revisión independiente de carácter privado sobre el cumplimiento de obligaciones en materia de nómina, ' +
  'contratada por el cliente. No constituye ni sustituye el dictamen fiscal previsto en el Código Fiscal de la Federación ni el dictamen sobre el ' +
  'cumplimiento de obligaciones en materia de seguridad social, los cuales únicamente pueden ser emitidos por contador público registrado ante las autoridades correspondientes.';

const pesosTxt = (c) => c === null || c === undefined ? '—' : (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fraseOpinion({ opinion, tipo_entregable, cliente, periodo, salvedades = [], faltan_fuentes = [], modulos_materiales = [] }) {
  const inicio = tipo_entregable === 'revision_control_interno' ? 'Como resultado de la revisión de control interno, la nómina' : 'En nuestra opinión, la nómina';
  const base = ' de ' + cliente + ' por el periodo ' + periodo;
  const rubros = [...new Set(salvedades.map(s => MODULOS_FRENTE1[s.modulo] || s.modulo))].join(', ');
  switch (opinion) {
    case 'conforme': return inicio + base + ' se calculó conforme a las disposiciones aplicables en los rubros revisados.';
    case 'conforme_con_observaciones': return inicio + base + ' se calculó conforme a las disposiciones aplicables en los rubros revisados, con las observaciones no materiales que se detallan en las cédulas de hallazgo.';
    case 'con_salvedades': return 'Excepto por lo señalado en ' + rubros + ', ' + inicio.charAt(0).toLowerCase() + inicio.slice(1) + base + ' se calculó conforme a las disposiciones aplicables en los rubros revisados.';
    case 'adverso': return inicio + base + ' no se calculó conforme a las disposiciones aplicables, por la importancia de los hallazgos en ' +
      (modulos_materiales.map(k => MODULOS_FRENTE1[k]).join(', ') || 'la conciliación a nivel neto') + '.';
    default: return 'No expresamos opinión sobre la nómina' + base + ': no se recibió ' + faltan_fuentes.map(f => ({ prenomina: 'la nómina del periodo (B1)', xml_nomina: 'los XML originales de nómina (B3)' }[f] || f)).join(' ni ') + '.';
  }
}

/**
 * Arma el contenido del dictamen (estructura del módulo 19). Todo lo que no cubre la versión
 * se dice como tal; nada se rellena.
 */
export function armarContenido(e) {
  const tipo = e.encargo.origen_nomina === 'la_casa' ? 'revision_control_interno' : 'dictamen_independiente';
  const periodo = e.encargo.periodo_desde + ' a ' + e.encargo.periodo_hasta;
  const cliente = e.empresa.nombre + (e.empresa.rfc ? ' (' + e.empresa.rfc + ')' : '');
  const exposicion = e.hallazgos.reduce((s, h) => s + (h.efecto_max_c || 0), 0);
  return {
    portada: {
      titulo: tipo === 'revision_control_interno' ? 'Revisión de control interno de nómina' : 'Dictamen de supervisión de nómina',
      tipo_entregable: tipo, cliente, empresa_id: e.empresa.id, rfc: e.empresa.rfc || null, periodo, nivel: e.encargo.nivel, encargo_id: e.encargo.id,
      version: e.version, dictamen_anterior_id: e.anterior_id || null, motivo_version: e.motivo_version || null, disparado_por: e.disparado_por || null,
      independencia: tipo === 'dictamen_independiente' ? 'Revisión independiente: HRM no operó la nómina del periodo.' : 'HRM operó la nómina del periodo; esta revisión no invoca independencia y la hizo una persona distinta de quien la operó.',
      nota_alcance: NOTA_ALCANCE,
      ejecucion_id: e.ejecucion.id, sello_ejecucion: e.ejecucion.sello, kernel_version: e.ejecucion.kernel_version,
      version_catalogo_reglas: e.ejecucion.version_catalogo_reglas, version_parametros: e.ejecucion.version_parametros,
    },
    s1_alcance: {
      fuentes: e.fuentes,
      modulos: e.modulos.map(m => ({ modulo: m.modulo, nombre: m.nombre, estado: m.estado, esperado: m.esperado, efectivo: m.efectivo, motivos: m.motivos })),
      tolerancia: e.tolerancia, materialidad: e.materialidad, cfdi: e.cfdi || null, maestro: e.maestro || null,
      // Limitación al alcance: el documento, quién lo entrega y la fecha en que se pidió (glosario, módulo 1).
      requerimiento_pendiente: e.requerimiento || [],
    },
    s2_base_normativa: e.base_normativa,
    s3_resumen: { semaforo: e.propuesta.semaforo, exposicion_max_c: exposicion, hallazgos: e.hallazgos.length, materiales: e.hallazgos.filter(h => h.material).length },
    s4_frente1: e.modulos.map(m => ({ modulo: m.modulo, nombre: m.nombre, estado: m.estado, semaforo: e.propuesta.semaforo[m.modulo],
      reglas: m.reglas, hallazgos: e.hallazgos.filter(h => h.modulo === m.modulo).map(h => h.id) })),
    s5_frente2: { estado: 'fuera_de_alcance', nota: 'Proceso y sistema del cliente: fuera del alcance de esta versión.' },
    s6_cedulas: e.hallazgos.map(h => ({ id: h.id, numero: h.numero, titulo: h.titulo, modulo: h.modulo, regla_id: h.regla_id || null,
      criterio: h.criterio, condicion: h.condicion, causa: h.causa || null, efecto_min_c: h.efecto_min_c ?? null, efecto_max_c: h.efecto_max_c ?? null,
      valuacion: h.valuacion && h.valuacion.valuable ? {
        omision_c: h.valuacion.omision_c, actualizacion_c: h.valuacion.actualizacion_c, recargos_c: h.valuacion.recargos_c,
        multa_min_c: h.valuacion.multa_min_c, multa_max_c: h.valuacion.multa_max_c, contingencia_min_c: h.valuacion.contingencia_min_c, contingencia_max_c: h.valuacion.contingencia_max_c,
        fecha_calculo: (h.valuacion.periodos.find(p => p.valuable) || {}).fecha_calculo || null, no_valuados: h.valuacion.no_valuados,
        periodos: h.valuacion.periodos.filter(p => p.valuable).map(p => ({ periodo: p.periodo, fecha_limite: p.fecha_limite, factor: p.factor || null, meses_recargos: p.meses_recargos || 0,
          tasa_acumulada_pct: p.tasa_acumulada_pct || null, multa: p.multa || null, omision_c: p.omision_c })),
      } : 'Sin valuación de accesorios' + (h.valuacion && h.valuacion.no_valuados && h.valuacion.no_valuados.length ? ': ' + h.valuacion.no_valuados.join('; ') : ' (no es una contribución omitida o no tiene diferencias que valuar)') + '.',
      riesgo: h.riesgo,
      recomendacion: h.recomendacion || null, responsable: h.responsable || null, fecha_compromiso: h.fecha_compromiso || null, estatus: h.estatus,
      material: h.material, motivos_material: h.motivos_material, diferencias: h.diferencias || 0, supera_a: h.supera_a || null })),
    s7_saldos_a_favor: { estado: 'fuera_de_alcance', nota: 'Saldos a favor y oportunidades de ahorro: versión 2.' },
    s8_analitica: { estado: 'en_el_informe', nota: 'La analítica de gestión sigue en el informe mensual del portal.' },
    s9_opinion: { propuesta: e.propuesta.opinion, regla_aplicada: e.propuesta.regla, opinion: e.final.opinion, cambiada_por_revisor: e.final.cambiada,
      motivo_cambio: e.final.motivo, frase: fraseOpinion({ opinion: e.final.opinion, tipo_entregable: tipo, cliente, periodo, salvedades: e.propuesta.salvedades,
        faltan_fuentes: e.propuesta.faltan_fuentes, modulos_materiales: e.propuesta.modulos_materiales }),
      salvedades: e.propuesta.salvedades, generalizado: e.propuesta.generalizado },
    s10_plan: e.hallazgos.filter(h => !['corregido', 'resuelto_por_reproceso', 'superado'].includes(h.estatus))
      .map(h => ({ hallazgo_id: h.id, titulo: h.titulo, recomendacion: h.recomendacion || null, responsable: h.responsable || null, fecha_compromiso: h.fecha_compromiso || null })),
    transiciones: e.transiciones || [],
  };
}

export async function huellaContenido(contenido) { return sha256Hex(jsonCanonico(contenido)); }

export async function verificarDictamen(d) {
  const contenido = typeof d.contenido_json === 'string' ? JSON.parse(d.contenido_json) : d.contenido;
  return (await huellaContenido(contenido)) === d.huella_contenido;
}

export { pesosTxt };
