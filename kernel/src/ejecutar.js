// ejecutar.js — Corre reglas del kernel y produce renglones de calculo_kernel (T2)
// con tres estados de resultado y cobertura declarada (T3).
//
// Principio rector: el sistema nunca afirma más de lo que verificó.
//   completo            todas las fuentes obligatorias presentes e íntegras, y ningún
//                       cálculo tocó un parámetro en nivel C ni quedó limitado.
//   universo_parcial    la fuente llegó pero está incompleta, o parte del universo
//                       quedó limitado: se declara universo esperado, efectivo y excluidos.
//   limitacion_alcance  falta una fuente obligatoria, o nada del universo se pudo
//                       calcular sin limitación.
// «Conforme» no lo da el kernel: lo da la reconciliación cuando además no hay diferencias.
//
// Ciclo de vida (T8, archivos grandes por lotes):
//   abrirEjecucion → calcularLote (n veces, idempotente) → cerrarEjecucion (sella).
// El sello final encadena el sello de cada lote: cualquier cambio posterior lo rompe.
// `ejecutar` hace las tres cosas de una vez para entradas chicas.
import { Contexto } from './parametros.js';
import { REGLAS_V1, reglaPorId, versionCatalogoReglas, exigirMatriz } from './reglas/index.js';
import { sha256Hex, jsonCanonico, nuevoId } from './sello.js';
import { KERNEL_VERSION } from './version.js';
import { KERNEL_HUELLA } from './_huella.js';

export const ESTADOS = ['completo', 'universo_parcial', 'limitacion_alcance'];
const MUESTRA_EXCLUIDOS = 200;

const huellasEntradas = (fuentes) => Object.fromEntries(Object.entries(fuentes || {})
  .filter(([, f]) => f && f.sha256).map(([k, f]) => [k, f.sha256]).sort());

/** Abre una ejecución: fija versiones de código, reglas y parámetros, y las huellas de entrada. */
export async function abrirEjecucion({ catalogo, reglas = REGLAS_V1, encargo_id, fuentes = {}, ahora, id }) {
  exigirMatriz(reglas);
  if (!encargo_id) throw new Error('abrirEjecucion: encargo_id es obligatorio');
  return {
    id: id || nuevoId('ejec'), encargo_id, kernel_version: KERNEL_VERSION, kernel_huella: KERNEL_HUELLA,
    version_catalogo_reglas: await versionCatalogoReglas(reglas), version_parametros: await catalogo.version(),
    entradas_sha256: huellasEntradas(fuentes), abierta_en: ahora || new Date().toISOString(),
  };
}

async function idCalculo(ejecucion_id, regla_id, colaborador_id, corrida_id, rubro) {
  return 'calc_' + (await sha256Hex([ejecucion_id, regla_id, colaborador_id, corrida_id || '', rubro].join('|'))).slice(0, 24);
}

/**
 * Calcula un lote de entradas dentro de una ejecución abierta. Determinista e
 * idempotente: el mismo lote produce los mismos ids, la misma cobertura y el mismo sello.
 * @param {Array} p.items  [{ regla_id, colaborador_id, corrida_id?, entrada, limitaciones? }]
 *   `limitaciones` las pone la ingesta cuando sabe que el renglón está fuera del alcance
 *   de la regla (p. ej. un finiquito sin regla en v1): se registran y el cálculo queda limitado.
 */
export async function calcularLote({ catalogo, reglas = REGLAS_V1, ejecucion, fuentes = {}, items = [], lote = 1, corrida_id = null, ahora }) {
  if ((await catalogo.version()) !== ejecucion.version_parametros) throw new Error('calcularLote: el catálogo cambió desde que se abrió la ejecución');
  if ((await versionCatalogoReglas(reglas)) !== ejecucion.version_catalogo_reglas) throw new Error('calcularLote: las reglas cambiaron desde que se abrió la ejecución');
  const calculado_en = ahora || new Date().toISOString();
  const cobertura = {};
  const calculos = [];
  for (const it of items) {
    const regla = reglaPorId(it.regla_id, reglas);
    const cv = cobertura[regla.id] || (cobertura[regla.id] = { items: 0, efectivos: 0, no_aplica: 0, excluidos: [] });
    cv.items += 1;
    const faltantes = regla.fuentes.filter(f => f.obligatoria && !fuentes[f.clave]).map(f => f.clave);
    if (faltantes.length) { cv.excluidos.push({ colaborador_id: it.colaborador_id, corrida_id: it.corrida_id || corrida_id, motivo: 'fuente_obligatoria_faltante', detalle: faltantes }); continue; }
    const ctx = new Contexto(catalogo);
    for (const l of it.limitaciones || []) ctx.limitar(l.motivo, l.detalle);
    let res;
    try {
      res = regla.calcular(it.entrada, ctx);
    } catch (err) {
      cv.excluidos.push({ colaborador_id: it.colaborador_id, corrida_id: it.corrida_id || corrida_id, motivo: err.name === 'ParametroFaltante' ? 'parametro_faltante' : 'entrada_invalida', detalle: err.message });
      continue;
    }
    if (res.no_aplica) { cv.no_aplica += 1; continue; }
    const limitado = ctx.limitaciones.length > 0;
    if (limitado) cv.excluidos.push({ colaborador_id: it.colaborador_id, corrida_id: it.corrida_id || corrida_id, motivo: 'calculo_limitado', detalle: ctx.limitaciones });
    else cv.efectivos += 1;
    const renglones = res.renglones || [{ rubro: regla.rubro, valor_c: res.valor_c }];
    for (const rg of renglones) {
      const corrida = it.corrida_id || corrida_id;
      calculos.push({
        id: await idCalculo(ejecucion.id, regla.id, it.colaborador_id, corrida, rg.rubro), ejecucion_id: ejecucion.id, encargo_id: ejecucion.encargo_id,
        lote, corrida_id: corrida, colaborador_id: it.colaborador_id, rubro: rg.rubro, valor_calculado_c: rg.valor_c,
        regla_id: regla.id, regla_version: regla.version, version_catalogo_reglas: ejecucion.version_catalogo_reglas,
        version_parametros: ejecucion.version_parametros, nivel_minimo: ctx.nivelMinimo(), limitado,
        traza: { ...res.traza, origen: it.origen, parametros: ctx.resumenParametros(), criterios: [...ctx.criterios], limitaciones: ctx.limitaciones },
        calculado_en,
      });
    }
  }
  const sello = await sha256Hex(jsonCanonico({ ejecucion_id: ejecucion.id, lote, calculos }));
  return { lote: { n: lote, sello, n_calculos: calculos.length, cobertura }, calculos };
}

function resumirExcluidos(lista) {
  const por_motivo = {};
  for (const x of lista) por_motivo[x.motivo] = (por_motivo[x.motivo] || 0) + 1;
  return { total: lista.length, por_motivo, muestra: lista.slice(0, MUESTRA_EXCLUIDOS) };
}

/**
 * Cierra y sella. `lotes`: los resúmenes que devolvió calcularLote (sin los cálculos).
 * Los resultados por regla se agregan de la cobertura de todos los lotes.
 */
export async function cerrarEjecucion({ ejecucion, lotes, fuentes = {}, reglas = REGLAS_V1, ahora }) {
  const ordenados = [...lotes].sort((a, b) => a.n - b.n);
  const agg = new Map();
  for (const l of ordenados) for (const [rid, c] of Object.entries(l.cobertura)) {
    const a = agg.get(rid) || { items: 0, efectivos: 0, no_aplica: 0, excluidos: [] };
    a.items += c.items; a.efectivos += c.efectivos; a.no_aplica += c.no_aplica || 0; a.excluidos.push(...c.excluidos);
    agg.set(rid, a);
  }
  const resultados = [];
  for (const [rid, a] of [...agg.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    const regla = reglaPorId(rid, reglas);
    const faltantes = regla.fuentes.filter(f => f.obligatoria && !fuentes[f.clave]).map(f => f.clave);
    const incompletas = regla.fuentes.filter(f => fuentes[f.clave] && fuentes[f.clave].estado === 'incompleta').map(f => f.clave);
    // Universo esperado: lo declara la fuente (por regla o general); si no, los ítems aplicables.
    const universoFuente = regla.fuentes.filter(f => f.obligatoria && fuentes[f.clave])
      .map(f => fuentes[f.clave].universo_por_regla?.[rid] ?? fuentes[f.clave].universo_esperado).filter(n => n != null);
    const aplicables = a.items - a.no_aplica;
    const esperado = universoFuente.length ? Math.max(...universoFuente) : aplicables;
    let estado;
    if (faltantes.length || (aplicables > 0 && a.efectivos === 0)) estado = 'limitacion_alcance';
    else if (incompletas.length || a.efectivos < esperado) estado = 'universo_parcial';
    else estado = 'completo';
    const limitaciones = [...faltantes.map(k => ({ motivo: 'fuente_obligatoria_faltante', detalle: k })),
      ...incompletas.map(k => ({ motivo: 'fuente_incompleta', detalle: k, excluidos_fuente: fuentes[k].excluidos || [] }))];
    resultados.push({ regla_id: regla.id, regla_version: regla.version, estado,
      cobertura: { esperado, efectivo: a.efectivos, excluidos: resumirExcluidos(a.excluidos) }, limitaciones });
  }
  const n_calculos = ordenados.reduce((s, l) => s + l.n_calculos, 0);
  const sellada = { ...ejecucion, entradas_sha256: { ...ejecucion.entradas_sha256, ...huellasEntradas(fuentes) },
    calculado_en: ahora || new Date().toISOString(), n_calculos, n_lotes: ordenados.length };
  sellada.sello = await sha256Hex(jsonCanonico({ ejecucion: sellada, lotes: ordenados.map(l => ({ n: l.n, sello: l.sello, n_calculos: l.n_calculos })), resultados }));
  return { ejecucion: sellada, resultados };
}

/** Atajo para entradas chicas: abre, calcula un lote y sella. */
export async function ejecutar({ catalogo, reglas = REGLAS_V1, encargo_id, corrida_id = null, fuentes = {}, items = [], ahora }) {
  const abierta = await abrirEjecucion({ catalogo, reglas, encargo_id, fuentes, ahora });
  const { lote, calculos } = await calcularLote({ catalogo, reglas, ejecucion: abierta, fuentes, items, lote: 1, corrida_id, ahora });
  const { ejecucion, resultados } = await cerrarEjecucion({ ejecucion: abierta, lotes: [lote], fuentes, reglas, ahora });
  return { ejecucion, calculos, resultados, lotes: [lote] };
}

/**
 * Verifica el sello: recalcula el sello de cada lote desde sus cálculos y el sello final
 * desde los sellos de lote y los resultados. Cualquier alteración posterior lo rompe.
 * `lotes`: números de lote de la ejecución ([{ n }]); un lote puede no tener cálculos.
 */
export async function verificarSello({ ejecucion, calculos, resultados, lotes }) {
  const porLote = new Map();
  for (const c of calculos) { if (!porLote.has(c.lote)) porLote.set(c.lote, []); porLote.get(c.lote).push(c); }
  const numeros = new Set([...(lotes || []).map(l => l.n), ...porLote.keys()]);
  const recalculados = [];
  for (const n of [...numeros].sort((a, b) => a - b)) {
    const cs = porLote.get(n) || [];
    recalculados.push({ n, sello: await sha256Hex(jsonCanonico({ ejecucion_id: ejecucion.id, lote: n, calculos: cs })), n_calculos: cs.length });
  }
  const { sello, ...resto } = ejecucion;
  return (await sha256Hex(jsonCanonico({ ejecucion: resto, lotes: recalculados, resultados }))) === sello;
}
