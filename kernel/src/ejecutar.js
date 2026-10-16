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
import { Contexto } from './parametros.js';
import { REGLAS_V1, reglaPorId, versionCatalogoReglas, exigirMatriz } from './reglas/index.js';
import { sha256Hex, jsonCanonico, nuevoId } from './sello.js';
import { KERNEL_VERSION } from './version.js';
import { KERNEL_HUELLA } from './_huella.js';

export const ESTADOS = ['completo', 'universo_parcial', 'limitacion_alcance'];

/**
 * @param {object} p
 * @param {import('./parametros.js').Catalogo} p.catalogo
 * @param {string} p.encargo_id
 * @param {string} [p.corrida_id]          corrida por omisión de los items
 * @param {object} p.fuentes               { clave: { estado:'completa'|'incompleta', sha256?, universo_esperado?, universo_efectivo?, excluidos? } }
 * @param {Array}  p.items                 [{ regla_id, colaborador_id, corrida_id?, entrada }]
 * @param {string} [p.ahora]               ISO; por omisión, el reloj
 */
export async function ejecutar({ catalogo, reglas = REGLAS_V1, encargo_id, corrida_id = null, fuentes = {}, items = [], ahora }) {
  exigirMatriz(reglas);
  if (!encargo_id) throw new Error('ejecutar: encargo_id es obligatorio');
  const calculado_en = ahora || new Date().toISOString();
  const version_parametros = await catalogo.version();
  const version_catalogo_reglas = await versionCatalogoReglas(reglas);
  const entradas_sha256 = Object.fromEntries(Object.entries(fuentes).filter(([, f]) => f && f.sha256).map(([k, f]) => [k, f.sha256]).sort());
  const ejecucion_id = nuevoId('ejec');

  const porRegla = new Map();
  for (const it of items) {
    const r = reglaPorId(it.regla_id, reglas);
    if (!porRegla.has(r.id)) porRegla.set(r.id, { regla: r, items: [] });
    porRegla.get(r.id).items.push(it);
  }

  const calculos = [];
  const resultados = [];
  for (const { regla, items: its } of porRegla.values()) {
    const faltantes = regla.fuentes.filter(f => f.obligatoria && !fuentes[f.clave]).map(f => f.clave);
    const incompletas = regla.fuentes.filter(f => fuentes[f.clave] && fuentes[f.clave].estado === 'incompleta').map(f => f.clave);
    const limitaciones = faltantes.map(k => ({ motivo: 'fuente_obligatoria_faltante', detalle: k }));
    const excluidos = [];
    let efectivos = 0;

    if (faltantes.length === 0) {
      for (const it of its) {
        const ctx = new Contexto(catalogo);
        let res;
        try {
          res = regla.calcular(it.entrada, ctx);
        } catch (err) {
          excluidos.push({ colaborador_id: it.colaborador_id, motivo: err.name === 'ParametroFaltante' ? 'parametro_faltante' : 'entrada_invalida', detalle: err.message });
          continue;
        }
        if (res.no_aplica) continue;
        const limitado = ctx.limitaciones.length > 0;
        if (limitado) excluidos.push({ colaborador_id: it.colaborador_id, motivo: 'calculo_limitado', detalle: ctx.limitaciones });
        else efectivos += 1;
        const renglones = res.renglones || [{ rubro: regla.rubro, valor_c: res.valor_c }];
        for (const rg of renglones) {
          calculos.push({
            id: nuevoId('calc'), ejecucion_id, encargo_id, corrida_id: it.corrida_id || corrida_id, colaborador_id: it.colaborador_id,
            rubro: rg.rubro, valor_calculado_c: rg.valor_c, regla_id: regla.id, regla_version: regla.version,
            version_catalogo_reglas, version_parametros, nivel_minimo: ctx.nivelMinimo(), limitado,
            traza: { ...res.traza, parametros: ctx.resumenParametros(), criterios: [...ctx.criterios], limitaciones: ctx.limitaciones },
            calculado_en,
          });
        }
      }
    } else {
      for (const it of its) excluidos.push({ colaborador_id: it.colaborador_id, motivo: 'fuente_obligatoria_faltante', detalle: faltantes });
    }

    const universoFuente = regla.fuentes.filter(f => f.obligatoria && fuentes[f.clave] && fuentes[f.clave].universo_esperado != null)
      .map(f => fuentes[f.clave].universo_esperado);
    const esperado = universoFuente.length ? Math.max(...universoFuente) : its.length;
    let estado;
    if (faltantes.length || (its.length > 0 && efectivos === 0)) estado = 'limitacion_alcance';
    else if (incompletas.length || efectivos < esperado) estado = 'universo_parcial';
    else estado = 'completo';
    for (const k of incompletas) limitaciones.push({ motivo: 'fuente_incompleta', detalle: k, excluidos_fuente: fuentes[k].excluidos || [] });

    resultados.push({ regla_id: regla.id, regla_version: regla.version, estado,
      cobertura: { esperado, efectivo: efectivos, excluidos }, limitaciones });
  }

  const ejecucion = { id: ejecucion_id, encargo_id, kernel_version: KERNEL_VERSION, kernel_huella: KERNEL_HUELLA,
    version_catalogo_reglas, version_parametros, entradas_sha256, calculado_en, n_calculos: calculos.length };
  // Sello: huella del contenido completo de la ejecución. Cualquier cambio posterior lo rompe.
  ejecucion.sello = await sha256Hex(jsonCanonico({ ejecucion, calculos, resultados }));
  return { ejecucion, calculos, resultados };
}

/** Recalcula el sello de una ejecución leída de la base para verificar que nada cambió. */
export async function verificarSello({ ejecucion, calculos, resultados }) {
  const { sello, ...resto } = ejecucion;
  const s = await sha256Hex(jsonCanonico({ ejecucion: resto, calculos, resultados }));
  return s === sello;
}
