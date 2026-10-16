// d1.js — Persistencia del kernel en Cloudflare D1 (migrations/0001_kernel_v1.sql).
//
// El kernel no hace E/S; este adaptador sí. Usa la API de D1 (prepare/bind/run/all/
// first/batch) con parámetros numerados ?1, ?2… — nunca interpola datos en el SQL.
// Escritura en lotes acotados: el volumen grande (archivos de miles de renglones)
// irá por cola con lotes idempotentes (T8); este adaptador es la pieza que la cola llama.
import { Catalogo } from './parametros.js';
import { REGLAS_V1, FUENTES } from './reglas/index.js';
import { jsonCanonico } from './sello.js';

const LOTE = 50;

async function enLotes(db, stmts) {
  for (let i = 0; i < stmts.length; i += LOTE) await db.batch(stmts.slice(i, i + LOTE));
}

/** Siembra idempotente: parámetros, fuentes, reglas (inactivas → fuentes → activas) y criterios. */
export async function sembrar(db, { filasParametros = [], reglas = REGLAS_V1, fuentes = FUENTES, criterios = [] } = {}) {
  const s = [];
  for (const f of filasParametros) {
    s.push(db.prepare('INSERT OR IGNORE INTO parametro_fiscal (id, clave, entidad, tipo, valor_json, vigencia_desde, vigencia_hasta, base_temporal, fundamento, fuente, nivel, notas) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)')
      .bind(f.id, f.clave, f.entidad || null, f.tipo || 'escalar', JSON.stringify(f.valor), f.vigencia_desde, f.vigencia_hasta || null, f.base_temporal, f.fundamento, f.fuente, f.nivel, f.notas || null));
  }
  for (const [clave, f] of Object.entries(fuentes)) {
    s.push(db.prepare('INSERT OR IGNORE INTO fuente (clave, descripcion, anexo) VALUES (?1,?2,?3)').bind(clave, f.descripcion, f.anexo || null));
  }
  for (const r of reglas) {
    s.push(db.prepare('INSERT OR IGNORE INTO regla (id, version, rubro, titulo, fundamento, activa) VALUES (?1,?2,?3,?4,?5,0)').bind(r.id, r.version, r.rubro, r.titulo, r.fundamento));
    s.push(db.prepare('UPDATE regla SET version = ?2, rubro = ?3, titulo = ?4, fundamento = ?5 WHERE id = ?1').bind(r.id, r.version, r.rubro, r.titulo, r.fundamento));
    for (const f of r.fuentes) {
      s.push(db.prepare('INSERT OR IGNORE INTO regla_fuente (regla_id, fuente_clave, obligatoria) VALUES (?1,?2,?3)').bind(r.id, f.clave, f.obligatoria ? 1 : 0));
      s.push(db.prepare('UPDATE regla_fuente SET obligatoria = ?3 WHERE regla_id = ?1 AND fuente_clave = ?2').bind(r.id, f.clave, f.obligatoria ? 1 : 0));
    }
    s.push(db.prepare('UPDATE regla SET activa = 1 WHERE id = ?1 AND activa = 0').bind(r.id));
  }
  for (const c of criterios) {
    s.push(db.prepare('INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
      .bind(c.id, c.tema, c.decision, c.fundamento, c.quien, c.fecha, c.estado, c.observaciones || null));
  }
  await enLotes(db, s);
}

/** Prueba de arranque (T3): reglas activas sin fuente obligatoria. Vacío = puede arrancar. */
export async function verificarArranque(db) {
  const { results } = await db.prepare('SELECT id FROM regla WHERE activa = 1 AND id NOT IN (SELECT regla_id FROM regla_fuente WHERE obligatoria = 1) ORDER BY id').all();
  return results.map(r => r.id);
}

/** La matriz en D1 debe ser idéntica a la que declaran las reglas del código. Devuelve las diferencias. */
export async function compararMatriz(db, reglas = REGLAS_V1) {
  const { results: rs } = await db.prepare('SELECT id, version, activa FROM regla').all();
  const { results: fs } = await db.prepare('SELECT regla_id, fuente_clave, obligatoria FROM regla_fuente').all();
  const dif = [];
  const enD1 = new Map(rs.map(r => [r.id, r]));
  for (const r of reglas) {
    const d = enD1.get(r.id);
    if (!d) { dif.push(r.id + ': no está en D1'); continue; }
    if (d.version !== r.version) dif.push(r.id + ': versión D1 ' + d.version + ' ≠ código ' + r.version);
    if (d.activa !== 1) dif.push(r.id + ': inactiva en D1');
    const fd = new Map(fs.filter(f => f.regla_id === r.id).map(f => [f.fuente_clave, f.obligatoria]));
    for (const f of r.fuentes) if (fd.get(f.clave) !== (f.obligatoria ? 1 : 0)) dif.push(r.id + ': fuente ' + f.clave + ' difiere');
    if (fd.size !== r.fuentes.length) dif.push(r.id + ': D1 declara ' + fd.size + ' fuentes y el código ' + r.fuentes.length);
  }
  return dif;
}

export async function cargarCatalogo(db) {
  const { results } = await db.prepare('SELECT id, clave, entidad, tipo, valor_json, vigencia_desde, vigencia_hasta, base_temporal, fundamento, fuente, nivel, notas FROM parametro_fiscal ORDER BY id').all();
  return new Catalogo(results.map(r => {
    const f = { id: r.id, clave: r.clave, tipo: r.tipo, valor: JSON.parse(r.valor_json), vigencia_desde: r.vigencia_desde,
      vigencia_hasta: r.vigencia_hasta, base_temporal: r.base_temporal, fundamento: r.fundamento, fuente: r.fuente, nivel: r.nivel };
    if (r.entidad) f.entidad = r.entidad;
    if (r.notas) f.notas = r.notas;
    return f;
  }));
}

const CALC_COLS = 'id, ejecucion_id, encargo_id, ejercicio, lote, corrida_id, colaborador_id, rubro, valor_calculado_c, regla_id, regla_version, version_catalogo_reglas, version_parametros, nivel_minimo, limitado, traza_json, calculado_en';
const CALC_N = 17;

/** INSERT multirenglón respetando el límite de 100 parámetros por sentencia de D1. */
export function insertarMultiple(db, tabla, columnas, filas, { ignorar = true } = {}) {
  const n = columnas.split(',').length;
  const porSentencia = Math.max(1, Math.floor(100 / n));
  const out = [];
  for (let i = 0; i < filas.length; i += porSentencia) {
    const grupo = filas.slice(i, i + porSentencia);
    let k = 0;
    const valores = grupo.map(() => '(' + Array.from({ length: n }, () => '?' + (++k)).join(',') + ')').join(',');
    out.push(db.prepare('INSERT ' + (ignorar ? 'OR IGNORE ' : '') + 'INTO ' + tabla + ' (' + columnas + ') VALUES ' + valores).bind(...grupo.flat()));
  }
  return out;
}

/** Abre la ejecución en la base y guarda la foto del catálogo de parámetros (idempotente). */
export async function persistirApertura(db, ejecucion, { catalogo }) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO parametro_version (version, filas_json) VALUES (?1, ?2)').bind(ejecucion.version_parametros, jsonCanonico(catalogo.filasCanonicas())),
    db.prepare('INSERT OR IGNORE INTO ejecucion (id, encargo_id, estado, kernel_version, kernel_huella, version_catalogo_reglas, version_parametros, entradas_sha256_json, abierta_en) VALUES (?1,?2,\'abierta\',?3,?4,?5,?6,?7,?8)')
      .bind(ejecucion.id, ejecucion.encargo_id, ejecucion.kernel_version, ejecucion.kernel_huella, ejecucion.version_catalogo_reglas,
        ejecucion.version_parametros, JSON.stringify(ejecucion.entradas_sha256), ejecucion.abierta_en),
  ]);
}

/** Sentencias para guardar un lote (cálculos + resumen). Idempotente: ids deterministas. */
export function sentenciasLote(db, { lote, calculos }, { ejecucion_id, ejercicio }) {
  if (!Number.isInteger(ejercicio)) throw new Error('sentenciasLote: ejercicio es obligatorio (partición)');
  const filas = calculos.map(c => [c.id, c.ejecucion_id, c.encargo_id, ejercicio, c.lote, c.corrida_id, c.colaborador_id, c.rubro, c.valor_calculado_c,
    c.regla_id, c.regla_version, c.version_catalogo_reglas, c.version_parametros, c.nivel_minimo, c.limitado ? 1 : 0, JSON.stringify(c.traza), c.calculado_en]);
  return [
    ...insertarMultiple(db, 'calculo_kernel', CALC_COLS, filas),
    db.prepare('INSERT OR IGNORE INTO ejecucion_lote (ejecucion_id, n, sello, n_calculos, cobertura_json) VALUES (?1,?2,?3,?4,?5)')
      .bind(ejecucion_id, lote.n, lote.sello, lote.n_calculos, JSON.stringify(lote.cobertura)),
  ];
}

export async function persistirLote(db, r, opciones) {
  const st = sentenciasLote(db, r, opciones);
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
}

export async function leerLotes(db, ejecucion_id) {
  const { results } = await db.prepare('SELECT n, sello, n_calculos, cobertura_json FROM ejecucion_lote WHERE ejecucion_id = ?1 ORDER BY n').bind(ejecucion_id).all();
  return results.map(l => ({ n: l.n, sello: l.sello, n_calculos: l.n_calculos, cobertura: JSON.parse(l.cobertura_json) }));
}

/** Escribe resultados y sella (una sola transacción). */
export async function persistirCierre(db, { ejecucion, resultados }) {
  await db.batch([
    ...resultados.map(r => db.prepare('INSERT INTO resultado_regla (ejecucion_id, regla_id, regla_version, estado, universo_esperado, universo_efectivo, excluidos_json, limitaciones_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
      .bind(ejecucion.id, r.regla_id, r.regla_version, r.estado, r.cobertura.esperado, r.cobertura.efectivo, JSON.stringify(r.cobertura.excluidos), JSON.stringify(r.limitaciones))),
    db.prepare("UPDATE ejecucion SET estado = 'sellada', entradas_sha256_json = ?2, calculado_en = ?3, n_calculos = ?4, n_lotes = ?5, sello = ?6 WHERE id = ?1 AND estado = 'abierta'")
      .bind(ejecucion.id, JSON.stringify(ejecucion.entradas_sha256), ejecucion.calculado_en, ejecucion.n_calculos, ejecucion.n_lotes, ejecucion.sello),
  ]);
}

/** Persiste una ejecución chica (lo que devuelve `ejecutar`). */
export async function persistirEjecucion(db, { ejecucion, calculos, resultados, lotes }, { catalogo, ejercicio }) {
  await persistirApertura(db, ejecucion, { catalogo });
  for (const lote of lotes) await persistirLote(db, { lote, calculos: calculos.filter(c => c.lote === lote.n) }, { ejecucion_id: ejecucion.id, ejercicio });
  await persistirCierre(db, { ejecucion, resultados });
}

/** Relee una ejecución tal como la produjo el kernel (para verificarSello). */
export async function leerEjecucion(db, id) {
  const e = await db.prepare('SELECT * FROM ejecucion WHERE id = ?1').bind(id).first();
  if (!e) return null;
  const { results: cs } = await db.prepare('SELECT * FROM calculo_kernel WHERE ejecucion_id = ?1 ORDER BY lote, rowid').bind(id).all();
  const { results: rs } = await db.prepare('SELECT * FROM resultado_regla WHERE ejecucion_id = ?1 ORDER BY regla_id').bind(id).all();
  const lotes = (await leerLotes(db, id)).map(l => ({ n: l.n, sello: l.sello, n_calculos: l.n_calculos }));
  const ejecucion = { id: e.id, encargo_id: e.encargo_id, kernel_version: e.kernel_version, kernel_huella: e.kernel_huella, version_catalogo_reglas: e.version_catalogo_reglas,
    version_parametros: e.version_parametros, entradas_sha256: JSON.parse(e.entradas_sha256_json), abierta_en: e.abierta_en };
  if (e.estado === 'sellada') Object.assign(ejecucion, { calculado_en: e.calculado_en, n_calculos: e.n_calculos, n_lotes: e.n_lotes, sello: e.sello });
  return {
    estado: e.estado, ejecucion, lotes,
    calculos: cs.map(c => ({ id: c.id, ejecucion_id: c.ejecucion_id, encargo_id: c.encargo_id, lote: c.lote, corrida_id: c.corrida_id, colaborador_id: c.colaborador_id, rubro: c.rubro,
      valor_calculado_c: c.valor_calculado_c, regla_id: c.regla_id, regla_version: c.regla_version, version_catalogo_reglas: c.version_catalogo_reglas,
      version_parametros: c.version_parametros, nivel_minimo: c.nivel_minimo, limitado: c.limitado === 1, traza: JSON.parse(c.traza_json), calculado_en: c.calculado_en })),
    resultados: rs.map(r => ({ regla_id: r.regla_id, regla_version: r.regla_version, estado: r.estado,
      cobertura: { esperado: r.universo_esperado, efectivo: r.universo_efectivo, excluidos: JSON.parse(r.excluidos_json) }, limitaciones: JSON.parse(r.limitaciones_json) })),
  };
}
