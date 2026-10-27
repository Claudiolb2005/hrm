// api/dictamen.js — Hallazgos, materialidad, dictamen versionado y grupos (T4–T7; módulos 17, 19, 25).
//
// Admin: /api/kernel/{encargo/config, encargo/cerrar, hallazgos, hallazgos/pendientes, hallazgo,
//         dictamen/propuesta, dictamen/emitir, dictamenes, grupos, encargos-grupo, dictamen/consolidado}
// Cualquier usuario autenticado, limitado a su empresa: /api/dictamenes, /api/dictamen
//
// La propuesta se calcula al vuelo; lo emitido se congela con su huella y no cambia (la base lo impide).
import { esCarga } from './permisos.js';
import { requerimientoDe } from './requerimiento.js';
import { cargarCatalogo } from '../kernel/src/d1.js';
import { REGLAS_V1, valuarOmision, sumarValuaciones, saldosAFavor, umbralMaterialidad, evaluarMaterialidad, efectoHallazgo, estadoModulos, proponerOpinion, opinionFinal, validarReproceso,
  transicionHallazgos, armarContenido, huellaContenido, verificarDictamen, consolidarOpiniones, MODULOS_FRENTE1, MOTIVOS_CUALITATIVOS, OPINIONES,
  NOTA_ALCANCE } from '../kernel/src/index.js';
import { conservarHasta } from '../servicio/expediente.js';

const RIESGOS = ['alto', 'medio', 'bajo'];
const ESTATUS_MANUALES = ['abierto', 'en_correccion', 'corregido'];
const CAMPOS_CEDULA = ['titulo', 'criterio', 'condicion', 'causa', 'recomendacion', 'responsable', 'fecha_compromiso', 'riesgo', 'estatus',
  'efecto_min_c', 'efecto_max_c', 'valuacion_nota', 'alcance_neto'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CONFIG = ['tolerancia_individual_c', 'tolerancia_agregada_min_c', 'materialidad_bp', 'materialidad_piso_c', 'recurrencia_periodos', 'carga_patronal_c'];

async function cuerpo(request) { try { return await request.json(); } catch { return null; } }
const entero = (x) => x === null || x === undefined || x === '' ? null : Number.isInteger(Number(x)) ? Number(x) : NaN;

async function lotes(db, st) { for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50)); }

/** Hallazgos del encargo con su efecto y materialidad evaluada. Si se pasa ejecución, sólo los que aplican a ella. */
async function hallazgosEvaluados(db, enc, ejecucion_id, fecha_calculo) {
  const { results } = await db.prepare('SELECT * FROM v_hallazgo WHERE encargo_id = ?1 ORDER BY numero').bind(enc.id).all();
  let aplican = results;
  if (ejecucion_id) {
    const { results: conEj } = await db.prepare('SELECT DISTINCT x.hallazgo_id FROM hallazgo_diferencia x JOIN v_diferencia v ON v.id = x.diferencia_id ' +
      'JOIN hallazgo h ON h.id = x.hallazgo_id WHERE h.encargo_id = ?1 AND v.ejecucion_id = ?2').bind(enc.id, ejecucion_id).all();
    const { results: conCruce } = await db.prepare('SELECT DISTINCT x.hallazgo_id FROM hallazgo_cruce x JOIN cruce_cfdi c ON c.id = x.cruce_id JOIN ingesta_cfdi i ON i.id = c.ingesta_cfdi_id ' +
      'WHERE c.encargo_id = ?1 AND i.ejecucion_id = ?2 AND c.corte = i.corte_actual').bind(enc.id, ejecucion_id).all();
    const { results: conAfi } = await db.prepare('SELECT DISTINCT x.hallazgo_id FROM hallazgo_afiliacion x JOIN cruce_afiliacion a ON a.id = x.caso_id JOIN maestro_carga m ON m.id = a.carga_id ' +
      'WHERE a.encargo_id = ?1 AND m.ejecucion_id = ?2 AND a.corte = m.corte_actual').bind(enc.id, ejecucion_id).all();
    const s = new Set([...conEj, ...conCruce, ...conAfi].map(r => r.hallazgo_id));
    aplican = results.filter(h => !['resuelto_por_reproceso', 'superado'].includes(h.estatus) && (h.diferencias === 0 || s.has(h.id)));
  }
  const umbral = umbralMaterialidad({ carga_patronal_c: enc.carga_patronal_c, bp: enc.materialidad_bp, piso_c: enc.materialidad_piso_c });
  // Módulo 18: contribución omitida (lo que el kernel calcula de más sobre lo que retuvo o pagó el cliente),
  // por rubro y mes de pago, valuada a la fecha de hoy.
  const { results: om } = await db.prepare("SELECT x.hallazgo_id, v.rubro, coalesce(substr(cal.fecha_pago, 1, 7), ?2) AS periodo, " +
    "sum(CASE WHEN v.kernel_c > v.cliente_c THEN v.kernel_c - v.cliente_c ELSE 0 END) AS omision_c FROM hallazgo_diferencia x JOIN v_diferencia v ON v.id = x.diferencia_id " +
    "LEFT JOIN calendario_nomina cal ON cal.encargo_id = v.encargo_id AND cal.corrida_id = v.corrida_id WHERE v.encargo_id = ?1 GROUP BY 1, 2, 3").bind(enc.id, String(enc.periodo_hasta).slice(0, 7)).all();
  const catalogo = om.length ? await cargarCatalogo(db) : null;
  const hoy = (fecha_calculo || new Date().toISOString()).slice(0, 10);
  const val = new Map();
  for (const o of om) {
    if (!val.has(o.hallazgo_id)) val.set(o.hallazgo_id, []);
    val.get(o.hallazgo_id).push(valuarOmision({ catalogo, omision_c: o.omision_c, rubro: o.rubro, periodo: o.periodo, fecha_calculo: hoy }));
  }
  const hallazgos = aplican.map(h => {
    if (val.has(h.id)) h = { ...h, valuacion: sumarValuaciones(val.get(h.id)) };
    const ef = efectoHallazgo(h);
    const m = evaluarMaterialidad({ ...h, ...ef }, { umbral_c: umbral.umbral_c, periodos: h.periodos || 1, recurrencia_periodos: enc.recurrencia_periodos });
    return { ...h, alcance_neto: h.alcance_neto === 1, es_entero: h.es_entero === 1, ...ef, material: m.material, motivos_material: m.motivos, indeterminado: m.indeterminado };
  });
  return { hallazgos, umbral };
}

/** Todo lo que necesita la opinión, sin escribir nada. */
async function armarPropuesta(db, enc, ejecucion_id, limitaciones = [], fecha_calculo = null) {
  if (fecha_calculo && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_calculo)) return { error: 'fecha_calculo: AAAA-MM-DD', status: 400 };
  const ej = await db.prepare('SELECT * FROM ejecucion WHERE id = ?1').bind(ejecucion_id).first();
  if (!ej || ej.encargo_id !== enc.id) return { error: 'La ejecución no existe o es de otro encargo', status: 404 };
  if (ej.estado !== 'sellada') return { error: 'La ejecución sigue abierta: sólo se dictamina sobre una ejecución sellada', status: 409 };
  const { results: rr } = await db.prepare('SELECT regla_id, estado, universo_esperado, universo_efectivo FROM resultado_regla WHERE ejecucion_id = ?1 ORDER BY regla_id').bind(ej.id).all();
  const entradas = JSON.parse(ej.entradas_sha256_json || '{}');
  // XML de nómina (B3): el paquete cruzado contra la prenómina de esta misma ejecución.
  const cf = await db.prepare("SELECT id, archivo_sha256, corte_actual, reporte_json FROM ingesta_cfdi WHERE encargo_id = ?1 AND tipo = 'xml_nomina' AND estado = 'terminado' AND ejecucion_id = ?2 ORDER BY actualizado_en DESC LIMIT 1")
    .bind(enc.id, ej.id).first();
  const fuentes = { prenomina: !!entradas.prenomina, xml_nomina: !!entradas.xml_nomina || !!cf };
  const extras = [];
  let cfdi = null, cruces = { total: 0, sin_clasificar: 0, proceso_sin_hallazgo: 0 };
  if (cf) {
    const rep = JSON.parse(cf.reporte_json || '{}');
    const m42 = rep.modulo_4_2 || { estado: 'universo_parcial', motivos: ['Cruce sin reporte'] };
    extras.push({ modulo: '4.2', estado: m42.estado, esperado: m42.esperado, efectivo: m42.efectivo, motivos: m42.motivos });
    cfdi = { ingesta_id: cf.id, sha256: cf.archivo_sha256, corte: cf.corte_actual, comprobantes: rep.comprobantes, validos: rep.validos, cancelados: rep.cancelados, sin_estado_sat: rep.sin_estado_sat };
    const t = await db.prepare("SELECT count(*) AS n, sum(cubeta IS NULL) AS p, sum(cubeta = 'proceso_mal' AND id NOT IN (SELECT cruce_id FROM hallazgo_cruce)) AS sh FROM cruce_cfdi WHERE ingesta_cfdi_id = ?1 AND corte = ?2")
      .bind(cf.id, cf.corte_actual).first();
    cruces = { total: t.n || 0, sin_clasificar: t.p || 0, proceso_sin_hallazgo: t.sh || 0 };
  } else if (!entradas.xml_nomina) extras.push({ modulo: '4.2', estado: 'limitacion_alcance', motivos: ['Sin XML de nómina del periodo (B3)'] });
  // Afiliación (D7 cualitativo): maestro cruzado contra la prenómina de esta misma ejecución.
  const mc = await db.prepare('SELECT id, archivo_sha256, corte_actual, reporte_json FROM maestro_carga WHERE encargo_id = ?1 AND ejecucion_id = ?2 ORDER BY creado_en DESC LIMIT 1').bind(enc.id, ej.id).first();
  let afiliacion = { total: 0, sin_clasificar: 0, proceso_sin_hallazgo: 0 }, maestro = null;
  if (mc && mc.corte_actual) {
    const rep = JSON.parse(mc.reporte_json || '{}');
    if (rep.modulo_4_12) extras.push({ modulo: '4.12', ...rep.modulo_4_12 });
    maestro = { carga_id: mc.id, sha256: mc.archivo_sha256, revisados: rep.revisados, casos: rep.casos, sin_maestro: rep.sin_maestro };
    const t = await db.prepare("SELECT count(*) AS n, sum(cubeta IS NULL) AS p, sum(cubeta = 'proceso_mal' AND id NOT IN (SELECT caso_id FROM hallazgo_afiliacion)) AS sh FROM cruce_afiliacion WHERE carga_id = ?1 AND corte = ?2")
      .bind(mc.id, mc.corte_actual).first();
    afiliacion = { total: t.n || 0, sin_clasificar: t.p || 0, proceso_sin_hallazgo: t.sh || 0 };
  }
  const modulos = estadoModulos(rr, limitaciones, extras);
  const { hallazgos, umbral } = await hallazgosEvaluados(db, enc, ej.id, fecha_calculo);
  const propuesta = proponerOpinion({ fuentes, modulos, hallazgos });
  const pend = await db.prepare('SELECT count(*) AS n, sum(cubeta IS NULL) AS sin_clasificar, sum(cubeta = \'proceso_mal\' AND id NOT IN (SELECT diferencia_id FROM hallazgo_diferencia)) AS proceso_sin_hallazgo ' +
    'FROM v_diferencia WHERE ejecucion_id = ?1').bind(ej.id).first();
  const anterior = await db.prepare('SELECT id, version, opinion, emitido_en FROM dictamen WHERE encargo_id = ?1 ORDER BY version DESC LIMIT 1').bind(enc.id).first();
  const bloqueos = [];
  if ((pend.sin_clasificar || 0) > 0) bloqueos.push(pend.sin_clasificar + ' diferencias sin clasificar: el criterio de aceptación es cero sin clasificar (T1)');
  if ((pend.proceso_sin_hallazgo || 0) > 0) bloqueos.push(pend.proceso_sin_hallazgo + ' diferencias de «proceso actual mal» sin hallazgo: cada una debe quedar en una cédula');
  if (cruces.sin_clasificar) bloqueos.push(cruces.sin_clasificar + ' cruces nómina ↔ CFDI sin clasificar');
  if (cruces.proceso_sin_hallazgo) bloqueos.push(cruces.proceso_sin_hallazgo + ' cruces nómina ↔ CFDI de «proceso actual mal» sin hallazgo');
  if (afiliacion.sin_clasificar) bloqueos.push(afiliacion.sin_clasificar + ' pagos a personas sin alta o ya dadas de baja sin clasificar');
  if (afiliacion.proceso_sin_hallazgo) bloqueos.push(afiliacion.proceso_sin_hallazgo + ' pagos de afiliación de «proceso actual mal» sin hallazgo');
  if (propuesta.indeterminado) bloqueos.push('Falta la carga patronal del periodo dictaminado: sin ella no se puede decidir si los hallazgos son materiales (T5)');
  // Sección 7: lo pagado o retenido de más (la otra dirección de la resta).
  const { results: ex } = await db.prepare('SELECT rubro, cubeta, count(*) AS n, sum(cliente_c - kernel_c) AS exceso_c FROM v_diferencia WHERE ejecucion_id = ?1 AND cliente_c > kernel_c GROUP BY rubro, cubeta')
    .bind(ej.id).all();
  const saldos = saldosAFavor(ex);
  // Módulo 25: hallazgos de periodos anteriores del mismo cliente que siguen abiertos.
  const hoyS = new Date().toISOString().slice(0, 10);
  const { results: seg } = await db.prepare("SELECT h.id, h.titulo, h.estatus, h.riesgo, h.responsable, h.fecha_compromiso, e2.periodo_desde || ' a ' || e2.periodo_hasta AS periodo " +
    "FROM hallazgo h JOIN encargo e2 ON e2.id = h.encargo_id WHERE e2.empresa_id = ?1 AND e2.id <> ?2 AND e2.periodo_hasta < ?3 " +
    "AND h.estatus IN ('abierto','en_correccion','confirmado') AND EXISTS (SELECT 1 FROM dictamen_hallazgo x WHERE x.hallazgo_id = h.id) ORDER BY e2.periodo_hasta, h.numero")
    .bind(enc.empresa_id, enc.id, enc.periodo_desde).all();
  const seguimiento = seg.map(h => ({ ...h, vencido: !!(h.fecha_compromiso && h.fecha_compromiso < hoyS) }));
  const requerimiento = (await requerimientoDe(db, enc.id)).filter(r => !['completa', 'no_aplica'].includes(r.estado_efectivo))
    .map(r => ({ fuente: r.fuente_clave, descripcion: r.descripcion, esencial: !!r.esencial, estado: r.estado_efectivo, responsable: r.responsable, solicitado_en: r.solicitado_en, fecha_compromiso: r.fecha_compromiso }));
  return { ejecucion: ej, fuentes, cfdi, cruces, afiliacion, maestro, requerimiento, saldos, seguimiento, modulos, hallazgos, umbral, propuesta, anterior: anterior || null, bloqueos,
    diferencias: { total: pend.n || 0, sin_clasificar: pend.sin_clasificar || 0, proceso_sin_hallazgo: pend.proceso_sin_hallazgo || 0 } };
}

function baseNormativa(modulos) {
  const corrieron = new Set(modulos.filter(m => m.estado !== 'fuera_de_alcance').flatMap(m => m.reglas.map(r => r.regla_id)));
  return REGLAS_V1.filter(r => corrieron.has(r.id)).map(r => ({ regla_id: r.id, version: r.version, titulo: r.titulo, fundamento: r.fundamento }));
}

async function puedeVerEmpresa(u, empresa_id) { return u.rol === 'admin' || Number(u.empresa_id) === Number(empresa_id); }

export async function rutasDictamen(request, env, u, C, J) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;
  const db = env.DB;

  // ── Portal del cliente: sus dictámenes, con todas las versiones y su fecha (T6 regla 6) ──
  if (p === '/api/dictamenes' && m === 'GET') {
    const q = u.rol === 'admin'
      ? db.prepare('SELECT d.id, d.encargo_id, d.version, d.opinion, d.tipo_entregable, d.emitido_en, d.motivo_version, e.empresa_id, e.periodo_desde, e.periodo_hasta, e.nivel, em.nombre AS empresa ' +
          'FROM dictamen d JOIN encargo e ON e.id = d.encargo_id JOIN empresas em ON em.id = e.empresa_id ORDER BY d.emitido_en DESC LIMIT 200')
      : db.prepare('SELECT d.id, d.encargo_id, d.version, d.opinion, d.tipo_entregable, d.emitido_en, d.motivo_version, e.empresa_id, e.periodo_desde, e.periodo_hasta, e.nivel, em.nombre AS empresa ' +
          'FROM dictamen d JOIN encargo e ON e.id = d.encargo_id JOIN empresas em ON em.id = e.empresa_id WHERE e.empresa_id = ?1 ORDER BY e.periodo_hasta DESC, d.version DESC').bind(Number(u.empresa_id));
    return J({ dictamenes: (await q.all()).results }, 200, C);
  }
  if (p === '/api/dictamen' && m === 'GET') {
    const d = await db.prepare('SELECT d.*, e.empresa_id FROM dictamen d JOIN encargo e ON e.id = d.encargo_id WHERE d.id = ?1').bind(url.searchParams.get('id') || '').first();
    if (!d || !(await puedeVerEmpresa(u, d.empresa_id))) return J({ error: 'Dictamen no encontrado' }, 404, C);
    const { results: versiones } = await db.prepare('SELECT id, version, opinion, emitido_en, motivo_version, disparado_por FROM dictamen WHERE encargo_id = ?1 ORDER BY version').bind(d.encargo_id).all();
    return J({ dictamen: { id: d.id, encargo_id: d.encargo_id, version: d.version, opinion: d.opinion, tipo_entregable: d.tipo_entregable, emitido_en: d.emitido_en,
      huella_contenido: d.huella_contenido, contenido: JSON.parse(d.contenido_json) }, integro: await verificarDictamen(d), versiones, opiniones: OPINIONES, modulos: MODULOS_FRENTE1 }, 200, C);
  }

  if (!p.startsWith('/api/kernel/')) return null;
  if (u.rol !== 'admin') return esCarga(u) ? null : J({ error: 'Forbidden' }, 403, C);
  const leerEncargo = async (id) => id ? db.prepare('SELECT * FROM encargo WHERE id = ?1').bind(id).first() : null;

  // ── Configuración del encargo: tolerancia (T4), materialidad (T5) y carga patronal ──
  if (p === '/api/kernel/encargo/config' && m === 'POST') {
    const d = await cuerpo(request);
    const enc = await leerEncargo(d && d.encargo_id);
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    const sets = [], args = [enc.id];
    for (const k of CONFIG) if (k in d) {
      const v = entero(d[k]);
      if (Number.isNaN(v) || (v !== null && v < 0) || (v === null && k !== 'carga_patronal_c')) return J({ error: k + ' debe ser entero ≥ 0 (centavos o puntos base)' }, 400, C);
      args.push(v); sets.push(k + ' = ?' + args.length);
    }
    if ('carga_patronal_fuente' in d) { args.push(d.carga_patronal_fuente || null); sets.push('carga_patronal_fuente = ?' + args.length); }
    if (!sets.length) return J({ error: 'Nada que cambiar' }, 400, C);
    await db.prepare('UPDATE encargo SET ' + sets.join(', ') + ' WHERE id = ?1').bind(...args).run();
    const e2 = await leerEncargo(enc.id);
    return J({ ok: true, encargo: e2, umbral: umbralMaterialidad({ carga_patronal_c: e2.carga_patronal_c, bp: e2.materialidad_bp, piso_c: e2.materialidad_piso_c }) }, 200, C);
  }
  if (p === '/api/kernel/encargo/cerrar' && m === 'POST') {
    const d = await cuerpo(request);
    const enc = await leerEncargo(d && d.encargo_id);
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    if (enc.cerrado_en) return J({ error: 'El encargo ya está cerrado desde ' + enc.cerrado_en }, 409, C);
    const v1 = await db.prepare('SELECT 1 FROM dictamen WHERE encargo_id = ?1').bind(enc.id).first();
    if (!v1) return J({ error: 'Se cierra después de emitir el dictamen' }, 409, C);
    const ahora = new Date().toISOString();
    await db.prepare("UPDATE encargo SET cerrado_en = ?2, estado = 'cerrado' WHERE id = ?1").bind(enc.id, ahora).run();
    return J({ ok: true, cerrado_en: ahora, reproceso_hasta: new Date(Date.parse(ahora) + 60 * 86400000).toISOString() }, 200, C);
  }

  // ── Hallazgos ──
  if (p === '/api/kernel/hallazgos' && m === 'GET') {
    const enc = await leerEncargo(url.searchParams.get('encargo_id'));
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    const r = await hallazgosEvaluados(db, enc, null, url.searchParams.get('fecha_calculo'));
    return J({ ...r, modulos: MODULOS_FRENTE1, motivos_cualitativos: MOTIVOS_CUALITATIVOS }, 200, C);
  }
  // Diferencias de «proceso actual mal» que todavía no están en una cédula, agrupadas por regla, rubro y motivo.
  if (p === '/api/kernel/hallazgos/pendientes' && m === 'GET') {
    const enc = url.searchParams.get('encargo_id');
    const ej = url.searchParams.get('ejecucion_id');
    const { results } = await db.prepare("SELECT v.regla_id, v.rubro, v.motivo, count(*) AS n, count(DISTINCT v.colaborador_id) AS colaboradores, sum(v.diferencia_c) AS suma_c, " +
      "sum(abs(v.diferencia_c)) AS suma_abs_c, min(v.diferencia_c) AS min_c, max(v.diferencia_c) AS max_c, r.fundamento FROM v_diferencia v LEFT JOIN regla r ON r.id = v.regla_id " +
      "WHERE v.encargo_id = ?1 AND v.cubeta = 'proceso_mal' AND v.id NOT IN (SELECT diferencia_id FROM hallazgo_diferencia)" + (ej ? ' AND v.ejecucion_id = ?2' : '') +
      ' GROUP BY v.regla_id, v.rubro, v.motivo ORDER BY suma_abs_c DESC').bind(...(ej ? [enc, ej] : [enc])).all();
    const { results: cr } = await db.prepare("SELECT c.ingesta_cfdi_id, c.tipo, c.rubro, c.motivo, count(*) AS n, count(DISTINCT c.colaborador_llave) AS colaboradores, " +
      "sum(coalesce(c.cfdi_c, 0) - coalesce(c.nomina_c, 0)) AS suma_c, sum(abs(coalesce(c.cfdi_c, 0) - coalesce(c.nomina_c, 0))) AS suma_abs_c FROM cruce_cfdi c JOIN ingesta_cfdi i ON i.id = c.ingesta_cfdi_id " +
      "WHERE c.encargo_id = ?1 AND c.corte = i.corte_actual AND c.cubeta = 'proceso_mal' AND c.id NOT IN (SELECT cruce_id FROM hallazgo_cruce) GROUP BY 1, 2, 3, 4 ORDER BY suma_abs_c DESC").bind(enc).all();
    const { results: af } = await db.prepare("SELECT a.carga_id, a.tipo, a.motivo, count(*) AS n, count(DISTINCT a.colaborador_id) AS colaboradores, sum(a.percepciones_c) AS suma_abs_c " +
      "FROM cruce_afiliacion a JOIN maestro_carga m ON m.id = a.carga_id WHERE a.encargo_id = ?1 AND a.corte = m.corte_actual AND a.cubeta = 'proceso_mal' " +
      "AND a.id NOT IN (SELECT caso_id FROM hallazgo_afiliacion) GROUP BY 1, 2, 3 ORDER BY suma_abs_c DESC").bind(enc).all();
    return J({ pendientes: results, cruces: cr, afiliacion: af }, 200, C);
  }
  if (p === '/api/kernel/hallazgos' && m === 'POST') {
    const d = await cuerpo(request);
    const enc = await leerEncargo(d && d.encargo_id);
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    for (const k of ['titulo', 'criterio', 'condicion', 'modulo', 'tipo', 'riesgo']) if (!d[k]) return J({ error: 'Falta ' + k + ' (la cédula lleva criterio, condición, efecto y riesgo)' }, 400, C);
    if (!MODULOS_FRENTE1[d.modulo]) return J({ error: 'Módulo inválido: usa 4.1 … 4.13' }, 400, C);
    if (!RIESGOS.includes(d.riesgo)) return J({ error: 'Riesgo: alto, medio o bajo' }, 400, C);
    if (d.tipo === 'cualitativo' && !MOTIVOS_CUALITATIVOS[d.motivo_cualitativo]) return J({ error: 'Un hallazgo cualitativo lleva su motivo: ' + Object.keys(MOTIVOS_CUALITATIVOS).join(', ') }, 400, C);
    if (d.fecha_compromiso && !FECHA.test(d.fecha_compromiso)) return J({ error: 'fecha_compromiso: AAAA-MM-DD' }, 400, C);
    const ef = [entero(d.efecto_min_c), entero(d.efecto_max_c)];
    if (ef.some(Number.isNaN)) return J({ error: 'Efecto en centavos enteros' }, 400, C);
    // Filtro de diferencias a ligar (las de proceso_mal sin hallazgo que lo cumplan).
    const f = d.diferencias || null;
    const filtros = ["encargo_id = ?1", "cubeta = 'proceso_mal'", 'id NOT IN (SELECT diferencia_id FROM hallazgo_diferencia)'], fa = [enc.id];
    if (f) for (const k of ['ejecucion_id', 'regla_id', 'rubro', 'motivo', 'corrida_id', 'diferencia_c']) if (f[k] !== undefined && f[k] !== null && f[k] !== '') { fa.push(f[k]); filtros.push(k + ' = ?' + fa.length); }
    if (f && fa.length === 1) return J({ error: 'Para ligar diferencias pon al menos un filtro (regla, rubro, motivo…)' }, 400, C);
    const ligar = f ? (await db.prepare('SELECT id FROM v_diferencia WHERE ' + filtros.join(' AND ')).bind(...fa).all()).results.map(r => r.id) : [];
    if (f && !ligar.length) return J({ error: 'Ninguna diferencia de «proceso actual mal» sin hallazgo cumple el filtro' }, 400, C);
    // Cruces nómina ↔ CFDI (módulo 4.2) del último corte de cada paquete.
    const fc = d.cruces || null;
    let ligarCr = [];
    if (fc) {
      const cf = ["c.encargo_id = ?1", "c.cubeta = 'proceso_mal'", 'c.corte = i.corte_actual', 'c.id NOT IN (SELECT cruce_id FROM hallazgo_cruce)'], ca = [enc.id];
      for (const k of ['ingesta_cfdi_id', 'tipo', 'rubro', 'motivo', 'corrida_id']) if (fc[k] !== undefined && fc[k] !== null && fc[k] !== '') { ca.push(fc[k]); cf.push('c.' + k + ' = ?' + ca.length); }
      if (ca.length === 1) return J({ error: 'Para ligar cruces pon al menos un filtro (tipo, rubro, motivo…)' }, 400, C);
      ligarCr = (await db.prepare('SELECT c.id FROM cruce_cfdi c JOIN ingesta_cfdi i ON i.id = c.ingesta_cfdi_id WHERE ' + cf.join(' AND ')).bind(...ca).all()).results.map(r => r.id);
      if (!ligarCr.length) return J({ error: 'Ningún cruce de «proceso actual mal» sin hallazgo cumple el filtro' }, 400, C);
    }
    const fAf = d.afiliacion || null;
    let ligarAf = [];
    if (fAf) {
      const afF = ["a.encargo_id = ?1", "a.cubeta = 'proceso_mal'", 'a.corte = m.corte_actual', 'a.id NOT IN (SELECT caso_id FROM hallazgo_afiliacion)'], afA = [enc.id];
      for (const k of ['carga_id', 'tipo', 'motivo']) if (fAf[k]) { afA.push(fAf[k]); afF.push('a.' + k + ' = ?' + afA.length); }
      if (afA.length === 1) return J({ error: 'Para ligar casos de afiliación pon al menos un filtro (tipo, motivo…)' }, 400, C);
      ligarAf = (await db.prepare('SELECT a.id FROM cruce_afiliacion a JOIN maestro_carga m ON m.id = a.carga_id WHERE ' + afF.join(' AND ')).bind(...afA).all()).results.map(r => r.id);
      if (!ligarAf.length) return J({ error: 'Ningún caso de afiliación de «proceso actual mal» sin hallazgo cumple el filtro' }, 400, C);
    }
    if (d.tipo === 'cuantitativo' && !ligar.length && !ligarCr.length && !ligarAf.length && ef[1] === null) return J({ error: 'Un hallazgo cuantitativo sin diferencias ligadas lleva su efecto máximo valuado' }, 400, C);
    const n = ((await db.prepare('SELECT max(numero) AS n FROM hallazgo WHERE encargo_id = ?1').bind(enc.id).first()).n || 0) + 1;
    const id = enc.id + '-H' + String(n).padStart(2, '0');
    const clave = d.clave_recurrencia || [d.modulo, d.regla_id || '', d.rubro || '', String(d.titulo).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)].join('|');
    const st = [db.prepare('INSERT INTO hallazgo (id, encargo_id, numero, clave_recurrencia, modulo, regla_id, rubro, titulo, criterio, condicion, causa, tipo, motivo_cualitativo, es_entero, alcance_neto, ' +
      'efecto_min_c, efecto_max_c, valuacion_nota, riesgo, recomendacion, responsable, fecha_compromiso, supera_a, creado_por_usuario_id, actualizado_por_usuario_id) ' +
      'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?24)')
      .bind(id, enc.id, n, clave, d.modulo, d.regla_id || null, d.rubro || null, d.titulo, d.criterio, d.condicion, d.causa || null, d.tipo,
        d.tipo === 'cualitativo' ? d.motivo_cualitativo : null, d.es_entero ? 1 : 0, d.alcance_neto ? 1 : 0, ef[0], ef[1], d.valuacion_nota || null, d.riesgo,
        d.recomendacion || null, d.responsable || null, d.fecha_compromiso || null, d.supera_a || null, u.id),
      db.prepare('INSERT INTO hallazgo_bitacora (hallazgo_id, campo, despues, motivo, usuario_id, quien) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(id, 'alta', d.titulo, ligar.length + ligarCr.length ? (ligar.length ? ligar.length + ' diferencias del kernel' : '') + (ligar.length && ligarCr.length ? ' y ' : '') + (ligarCr.length ? ligarCr.length + ' cruces nómina ↔ CFDI' : '') + ' ligados' : 'sin diferencias ligadas', u.id, u.nombre || u.email)];
    await db.batch(st);
    await lotes(db, [...ligar.map(x => db.prepare('INSERT INTO hallazgo_diferencia (hallazgo_id, diferencia_id) VALUES (?1, ?2)').bind(id, x)),
      ...ligarCr.map(x => db.prepare('INSERT INTO hallazgo_cruce (hallazgo_id, cruce_id) VALUES (?1, ?2)').bind(id, x)),
      ...ligarAf.map(x => db.prepare('INSERT INTO hallazgo_afiliacion (hallazgo_id, caso_id) VALUES (?1, ?2)').bind(id, x))]);
    return J({ ok: true, id, numero: n, diferencias: ligar.length, cruces: ligarCr.length, afiliacion: ligarAf.length }, 201, C);
  }
  if (p === '/api/kernel/hallazgo' && m === 'GET') {
    const h = await db.prepare('SELECT * FROM v_hallazgo WHERE id = ?1').bind(url.searchParams.get('id') || '').first();
    if (!h) return J({ error: 'Hallazgo no existe' }, 404, C);
    const { results: bit } = await db.prepare('SELECT campo, antes, despues, motivo, quien, en FROM hallazgo_bitacora WHERE hallazgo_id = ?1 ORDER BY id').bind(h.id).all();
    const { results: muestra } = await db.prepare('SELECT v.colaborador_id, v.corrida_id, v.rubro, v.kernel_c, v.cliente_c, v.diferencia_c, v.regla_id FROM hallazgo_diferencia x ' +
      'JOIN v_diferencia v ON v.id = x.diferencia_id WHERE x.hallazgo_id = ?1 ORDER BY abs(v.diferencia_c) DESC LIMIT 50').bind(h.id).all();
    const { results: muestraCruces } = await db.prepare('SELECT c.colaborador_llave, c.corrida_id, c.tipo, c.rubro, c.nomina_c, c.cfdi_c, c.uuids FROM hallazgo_cruce x JOIN cruce_cfdi c ON c.id = x.cruce_id ' +
      'WHERE x.hallazgo_id = ?1 ORDER BY abs(coalesce(c.nomina_c,0) - coalesce(c.cfdi_c,0)) DESC LIMIT 50').bind(h.id).all();
    const { results: muestraAfi } = await db.prepare('SELECT a.colaborador_id, a.corrida_id, a.tipo, a.fecha_evento, a.fuente_fecha, a.percepciones_c FROM hallazgo_afiliacion x JOIN cruce_afiliacion a ON a.id = x.caso_id ' +
      'WHERE x.hallazgo_id = ?1 ORDER BY a.percepciones_c DESC LIMIT 50').bind(h.id).all();
    return J({ hallazgo: h, bitacora: bit, muestra, muestra_cruces: muestraCruces, muestra_afiliacion: muestraAfi }, 200, C);
  }
  if (p === '/api/kernel/hallazgo' && m === 'POST') {
    const d = await cuerpo(request);
    const h = d && d.id ? await db.prepare('SELECT * FROM hallazgo WHERE id = ?1').bind(d.id).first() : null;
    if (!h) return J({ error: 'Hallazgo no existe' }, 404, C);
    const cambios = [];
    for (const k of CAMPOS_CEDULA) if (k in d) {
      let v = d[k];
      if (k === 'riesgo' && !RIESGOS.includes(v)) return J({ error: 'Riesgo: alto, medio o bajo' }, 400, C);
      if (k === 'estatus' && !ESTATUS_MANUALES.includes(v)) return J({ error: 'A mano el estatus es abierto, en corrección o corregido; confirmado, resuelto por reproceso y superado los pone el reproceso' }, 400, C);
      if (k === 'fecha_compromiso' && v && !FECHA.test(v)) return J({ error: 'fecha_compromiso: AAAA-MM-DD' }, 400, C);
      if (k === 'efecto_min_c' || k === 'efecto_max_c') { v = entero(v); if (Number.isNaN(v)) return J({ error: k + ' en centavos enteros' }, 400, C); }
      if (k === 'alcance_neto') v = v ? 1 : 0;
      if (['titulo', 'criterio', 'condicion'].includes(k) && !v) return J({ error: k + ' no puede quedar vacío' }, 400, C);
      if (v === '') v = null;
      if (String(v ?? '') !== String(h[k] ?? '')) cambios.push([k, h[k], v]);
    }
    if (!cambios.length) return J({ ok: true, cambios: 0 }, 200, C);
    if (cambios.some(c => c[0] === 'estatus' && c[2] === 'corregido') && !d.motivo) return J({ error: 'Cerrar un hallazgo como corregido exige el motivo (qué evidencia lo respalda)' }, 400, C);
    const args = [h.id, u.id];
    const sets = cambios.map(([k, , v]) => { args.push(v); return k + ' = ?' + args.length; });
    const st = [db.prepare("UPDATE hallazgo SET " + sets.join(', ') + ", actualizado_por_usuario_id = ?2, actualizado_en = datetime('now') WHERE id = ?1").bind(...args),
      ...cambios.map(([k, a, v]) => db.prepare('INSERT INTO hallazgo_bitacora (hallazgo_id, campo, antes, despues, motivo, usuario_id, quien) VALUES (?1,?2,?3,?4,?5,?6,?7)')
        .bind(h.id, k, a === null ? null : String(a), v === null ? null : String(v), d.motivo || null, u.id, u.nombre || u.email))];
    try { await db.batch(st); } catch (e) { return J({ error: e.message }, 409, C); }
    return J({ ok: true, cambios: cambios.length }, 200, C);
  }

  // ── Dictamen ──
  if (p === '/api/kernel/dictamen/propuesta' && (m === 'GET' || m === 'POST')) {
    const d = m === 'POST' ? (await cuerpo(request)) || {} : { encargo_id: url.searchParams.get('encargo_id'), ejecucion_id: url.searchParams.get('ejecucion_id'), fecha_calculo: url.searchParams.get('fecha_calculo') };
    const enc = await leerEncargo(d.encargo_id);
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    let r;
    try { r = await armarPropuesta(db, enc, d.ejecucion_id, d.limitaciones || [], d.fecha_calculo || null); } catch (e) { return J({ error: e.message }, 400, C); }
    if (r.error) return J({ error: r.error }, r.status, C);
    const { ejecucion, ...resto } = r;
    return J({ ...resto, ejecucion: { id: ejecucion.id, sello: ejecucion.sello, calculado_en: ejecucion.calculado_en }, encargo: enc, opiniones: OPINIONES, nota_alcance: NOTA_ALCANCE }, 200, C);
  }
  if (p === '/api/kernel/dictamen/emitir' && m === 'POST') {
    const d = await cuerpo(request);
    const enc = await leerEncargo(d && d.encargo_id);
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    let r;
    try { r = await armarPropuesta(db, enc, d.ejecucion_id, d.limitaciones || [], d.fecha_calculo || null); } catch (e) { return J({ error: e.message }, 400, C); }
    if (r.error) return J({ error: r.error }, r.status, C);
    if (r.bloqueos.length) return J({ error: 'No se puede emitir todavía', bloqueos: r.bloqueos }, 409, C);
    const ahora = new Date().toISOString();
    let final, ver;
    try {
      final = opinionFinal(r.propuesta, { opinion: d.opinion, motivo: d.motivo_cambio });
      ver = validarReproceso({ anterior: r.anterior, encargo: enc, ahora, motivo: d.motivo_version, disparado_por: d.disparado_por });
    } catch (e) { return J({ error: e.message }, 400, C); }
    const empresa = await db.prepare('SELECT id, nombre, rfc FROM empresas WHERE id = ?1').bind(enc.empresa_id).first();
    // T6 regla 3: los hallazgos de la versión anterior cambian de estado; nunca desaparecen.
    let transiciones = [];
    if (r.anterior) {
      const { results: prev } = await db.prepare('SELECT h.id, h.estatus FROM dictamen_hallazgo x JOIN hallazgo h ON h.id = x.hallazgo_id WHERE x.dictamen_id = ?1').bind(r.anterior.id).all();
      transiciones = transicionHallazgos(prev, r.hallazgos);
    }
    const estatusDe = new Map(transiciones.map(t => [t.hallazgo_id, t.despues]));
    const hallazgos = r.hallazgos.map(h => estatusDe.has(h.id) ? { ...h, estatus: estatusDe.get(h.id) } : h);
    const contenido = armarContenido({ encargo: enc, empresa, ejecucion: r.ejecucion, fuentes: r.fuentes, modulos: r.modulos, hallazgos, propuesta: r.propuesta, final,
      version: ver.version, anterior_id: r.anterior ? r.anterior.id : null, motivo_version: d.motivo_version || null, disparado_por: r.anterior ? d.disparado_por : null,
      tolerancia: { individual_c: enc.tolerancia_individual_c, agregada_min_c: enc.tolerancia_agregada_min_c, por_colaborador_c: enc.tolerancia_individual_c, aplica_a_entero: false },
      materialidad: { ...r.umbral, carga_patronal_c: enc.carga_patronal_c, carga_patronal_fuente: enc.carga_patronal_fuente, recurrencia_periodos: enc.recurrencia_periodos },
      base_normativa: baseNormativa(r.modulos), transiciones, cfdi: r.cfdi, maestro: r.maestro, requerimiento: r.requerimiento, saldos: r.saldos, seguimiento: r.seguimiento,
      conservacion: { papeles_de_trabajo: 'permanente', archivos_fuente_hasta: conservarHasta(enc.ejercicio, enc.retencion_contrato_hasta) } });
    const huella = await huellaContenido(contenido);
    const id = 'dic_' + enc.id + '_v' + ver.version;
    const st = [db.prepare('INSERT INTO dictamen (id, encargo_id, version, dictamen_anterior_id, motivo_version, disparado_por, ejecucion_id, tipo_entregable, opinion_propuesta, opinion, ' +
      'motivo_cambio_opinion, contenido_json, huella_contenido, revisor_usuario_id, emitido_en) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)')
      .bind(id, enc.id, ver.version, r.anterior ? r.anterior.id : null, r.anterior ? d.motivo_version : null, r.anterior ? d.disparado_por : null, r.ejecucion.id,
        contenido.portada.tipo_entregable, r.propuesta.opinion, final.opinion, final.motivo, JSON.stringify(contenido), huella, u.id, ahora)];
    for (const h of hallazgos) st.push(db.prepare('INSERT INTO dictamen_hallazgo (dictamen_id, hallazgo_id, estatus, material, motivos_json, efecto_max_c) VALUES (?1,?2,?3,?4,?5,?6)')
      .bind(id, h.id, h.estatus, h.material ? 1 : 0, JSON.stringify(h.motivos_material), h.efecto_max_c));
    for (const t of transiciones) {
      if (t.antes === t.despues) continue;
      st.push(db.prepare("UPDATE hallazgo SET estatus = ?2, actualizado_por_usuario_id = ?3, actualizado_en = datetime('now') WHERE id = ?1").bind(t.hallazgo_id, t.despues, u.id));
      st.push(db.prepare('INSERT INTO hallazgo_bitacora (hallazgo_id, campo, antes, despues, motivo, usuario_id, quien) VALUES (?1,?2,?3,?4,?5,?6,?7)')
        .bind(t.hallazgo_id, 'estatus', t.antes, t.despues, 'Reproceso: dictamen v' + ver.version + ' — ' + d.motivo_version, u.id, u.nombre || u.email));
    }
    // D1 ejecuta el batch como una transacción: o queda todo o nada.
    try { await db.batch(st); } catch (e) { return J({ error: e.message }, 409, C); }
    return J({ ok: true, id, version: ver.version, opinion: final.opinion, huella_contenido: huella, transiciones }, 201, C);
  }
  if (p === '/api/kernel/dictamenes' && m === 'GET') {
    const { results } = await db.prepare('SELECT id, version, opinion_propuesta, opinion, motivo_cambio_opinion, motivo_version, disparado_por, ejecucion_id, emitido_en, huella_contenido ' +
      'FROM dictamen WHERE encargo_id = ?1 ORDER BY version').bind(url.searchParams.get('encargo_id') || '').all();
    return J({ dictamenes: results }, 200, C);
  }

  // ── Grupos multi-RFC (T7) ──
  if (p === '/api/kernel/grupos' && m === 'GET') {
    const { results: gs } = await db.prepare('SELECT * FROM grupo ORDER BY nombre').all();
    const { results: ms } = await db.prepare('SELECT eg.grupo_id, em.id, em.nombre, em.rfc FROM empresa_grupo eg JOIN empresas em ON em.id = eg.empresa_id').all();
    const { results: eg } = await db.prepare('SELECT g.*, (SELECT count(*) FROM encargo e WHERE e.encargo_grupo_id = g.id) AS encargos, ' +
      '(SELECT max(version) FROM dictamen_consolidado c WHERE c.encargo_grupo_id = g.id) AS consolidado_version FROM encargo_grupo g ORDER BY g.periodo_hasta DESC').all();
    return J({ grupos: gs.map(g => ({ ...g, empresas: ms.filter(x => x.grupo_id === g.id), encargos: eg.filter(x => x.grupo_id === g.id) })) }, 200, C);
  }
  if (p === '/api/kernel/grupos' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.id || !d.nombre || !Array.isArray(d.empresas) || d.empresas.length < 2) return J({ error: 'Se espera { id, nombre, empresas: [empresa_id, …] } con al menos dos RFC' }, 400, C);
    const st = [db.prepare('INSERT INTO grupo (id, nombre) VALUES (?1, ?2) ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre').bind(d.id, d.nombre),
      ...d.empresas.map(e => db.prepare('INSERT INTO empresa_grupo (empresa_id, grupo_id) VALUES (?1, ?2)').bind(Number(e), d.id))];
    try { await db.batch(st); } catch (e) { return J({ error: /UNIQUE|PRIMARY/.test(e.message) ? 'Una empresa ya pertenece a un grupo: un cliente pertenece a cero o un grupo' : e.message }, 409, C); }
    return J({ ok: true, id: d.id }, 201, C);
  }
  if (p === '/api/kernel/encargos-grupo' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.id || !d.grupo_id || !d.nivel || !FECHA.test(d.periodo_desde || '') || !FECHA.test(d.periodo_hasta || '') || !Array.isArray(d.encargos) || !d.encargos.length)
      return J({ error: 'Se espera { id, grupo_id, nivel, periodo_desde, periodo_hasta, encargos: [encargo_id, …] }' }, 400, C);
    const st = [db.prepare('INSERT INTO encargo_grupo (id, grupo_id, nivel, periodo_desde, periodo_hasta) VALUES (?1,?2,?3,?4,?5)').bind(d.id, d.grupo_id, d.nivel, d.periodo_desde, d.periodo_hasta),
      ...d.encargos.map(e => db.prepare('UPDATE encargo SET encargo_grupo_id = ?2 WHERE id = ?1').bind(e, d.id))];
    try { await db.batch(st); } catch (e) { return J({ error: e.message }, 409, C); }
    return J({ ok: true, id: d.id }, 201, C);
  }
  if (p === '/api/kernel/dictamen/consolidado' && m === 'POST') {
    const d = await cuerpo(request);
    const g = d && d.encargo_grupo_id ? await db.prepare('SELECT g.*, gr.nombre FROM encargo_grupo g JOIN grupo gr ON gr.id = g.grupo_id WHERE g.id = ?1').bind(d.encargo_grupo_id).first() : null;
    if (!g) return J({ error: 'Encargo de grupo no existe' }, 404, C);
    const { results: hijos } = await db.prepare('SELECT e.id, e.empresa_id, em.rfc, em.nombre FROM encargo e JOIN empresas em ON em.id = e.empresa_id WHERE e.encargo_grupo_id = ?1').bind(g.id).all();
    const { results: miembros } = await db.prepare('SELECT empresa_id FROM empresa_grupo WHERE grupo_id = ?1').bind(g.grupo_id).all();
    const faltan = miembros.filter(x => !hijos.some(h => h.empresa_id === x.empresa_id));
    if (faltan.length) return J({ error: 'Faltan encargos para ' + faltan.length + ' RFC del grupo: el consolidado se arma de todos los individuales' }, 409, C);
    const comps = [];
    for (const h of hijos) {
      const dic = await db.prepare('SELECT id, version, opinion, huella_contenido FROM dictamen WHERE encargo_id = ?1 ORDER BY version DESC LIMIT 1').bind(h.id).first();
      if (!dic) return J({ error: 'Falta el dictamen individual de ' + (h.rfc || h.nombre) }, 409, C);
      comps.push({ empresa_id: h.empresa_id, rfc: h.rfc || String(h.empresa_id), nombre: h.nombre, encargo_id: h.id, dictamen_id: dic.id, version: dic.version, opinion: dic.opinion, huella: dic.huella_contenido });
    }
    const c = consolidarOpiniones(comps);
    const prev = await db.prepare('SELECT id, version FROM dictamen_consolidado WHERE encargo_grupo_id = ?1 ORDER BY version DESC LIMIT 1').bind(g.id).first();
    if (prev && (!d.motivo_version || d.motivo_version.trim().length < 10)) return J({ error: 'Una versión nueva del consolidado declara qué cambió y por qué' }, 400, C);
    const version = prev ? prev.version + 1 : 1;
    const contenido = { titulo: 'Dictamen consolidado de grupo', grupo: g.nombre, periodo: g.periodo_desde + ' a ' + g.periodo_hasta, nivel: g.nivel, version,
      opinion: c.opinion, determinada_por: c.determinada_por, componentes: c.componentes, nota_alcance: NOTA_ALCANCE,
      regla: 'La opinión consolidada es la peor de las individuales; no se promedian opiniones (T7).' };
    const huella = await huellaContenido(contenido);
    const id = 'dcg_' + g.id + '_v' + version;
    await db.prepare('INSERT INTO dictamen_consolidado (id, encargo_grupo_id, version, anterior_id, motivo_version, opinion, componentes_json, contenido_json, huella_contenido, revisor_usuario_id, emitido_en) ' +
      'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)').bind(id, g.id, version, prev ? prev.id : null, prev ? d.motivo_version : null, c.opinion,
        JSON.stringify(c.componentes), JSON.stringify(contenido), huella, u.id, new Date().toISOString()).run();
    return J({ ok: true, id, version, opinion: c.opinion, determinada_por: c.determinada_por }, 201, C);
  }

  return null; // no es ruta de este módulo: sigue rutasKernel
}
