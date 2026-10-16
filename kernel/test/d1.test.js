// La migración 0001 y el adaptador D1 contra SQLite local (mismo motor que D1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ejecutar, verificarSello } from '../src/index.js';
import { sembrar, verificarArranque, cargarCatalogo, persistirEjecucion, leerEjecucion } from '../src/d1.js';
import { filasSemilla } from './util.js';

/** Envoltura mínima con la forma de la API de D1 sobre node:sqlite. */
function d1Local() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    run: async () => raw.prepare(sql).run(...args),
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    first: async () => raw.prepare(sql).get(...args) ?? null,
  });
  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try { for (const s of stmts) raw.prepare(s.sql).run(...s.args); raw.exec('COMMIT'); }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

const RAIZ = new URL('../../', import.meta.url);
const criterios = JSON.parse(readFileSync(new URL('kernel/data/criterios.json', RAIZ))).criterios;

async function baseLista() {
  const db = d1Local();
  db.raw.exec(readFileSync(new URL('schema.sql', RAIZ), 'utf8'));          // esquema actual del portal
  for (const m of ['0001_kernel_v1.sql', '0003_ingesta_lotes.sql']) db.raw.exec(readFileSync(new URL('migrations/' + m, RAIZ), 'utf8'));
  db.raw.exec("INSERT INTO empresas (id, nombre, rfc, slug) VALUES (1, 'PRIMEWIRELESS', 'PHO190128QD8', 'prime')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (1,'op@hrm','x','Operador','admin'), (2,'rev@hrm','x','Revisor','admin')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, operador_nomina_usuario_id) VALUES ('enc_prime_2026_08', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', NULL), ('enc_casa', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'la_casa', 1)");
  await sembrar(db, { filasParametros: filasSemilla(), criterios });
  return db;
}

const ITEMS = [{ regla_id: 'CALC-IMSS-001', colaborador_id: '1067513', entrada: { sbc_c: 61588, periodo: { desde: '2026-07-27', hasta: '2026-08-02' }, incapacidades: 0, prima_rt: { pct: '0.50' } } },
  { regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1067513', entrada: { base_gravable_c: 776068, fecha_pago: '2026-08-06' } }];
const FUENTES = { sua_ema: { estado: 'completa', sha256: 'b'.repeat(64) }, prima_rt_registro: { estado: 'completa' }, faltas_incapacidades: { estado: 'completa' },
  prenomina: { estado: 'completa' }, catalogo_conceptos_cliente: { estado: 'completa' } };

test('migración + siembra: 10 reglas activas, ninguna sin fuente obligatoria; catálogo se relee igual', async () => {
  const db = await baseLista();
  assert.deepEqual(await verificarArranque(db), []);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM regla WHERE activa = 1').get().n, 10);
  const cat = await cargarCatalogo(db);
  const semilla = filasSemilla();
  assert.equal(cat.filas.length, semilla.length);
  const { Catalogo } = await import('../src/parametros.js');
  assert.equal(await cat.version(), await new Catalogo(semilla).version(), 'misma versión de parámetros desde D1 que desde la semilla');
});

test('regla: no se da de alta activa ni se activa sin fuente obligatoria', async () => {
  const db = await baseLista();
  assert.throws(() => db.raw.exec("INSERT INTO regla (id, version, rubro, titulo, fundamento, activa) VALUES ('X-1','1.0.0','x','x','x',1)"), /inactiva/);
  db.raw.exec("INSERT INTO regla (id, version, rubro, titulo, fundamento) VALUES ('X-1','1.0.0','x','x','x')");
  assert.throws(() => db.raw.exec("UPDATE regla SET activa = 1 WHERE id = 'X-1'"), /fuente obligatoria/);
  assert.throws(() => db.raw.exec("DELETE FROM regla_fuente WHERE regla_id = 'CALC-INF-001'"), /sin fuente obligatoria/);
});

test('ejecución persistida, releída y con sello válido; calculo_kernel es inmutable', async () => {
  const db = await baseLista();
  const catalogo = await cargarCatalogo(db);
  const r = await ejecutar({ catalogo, encargo_id: 'enc_prime_2026_08', corrida_id: 'SEM31', fuentes: FUENTES, items: ITEMS });
  await persistirEjecucion(db, r, { catalogo, ejercicio: 2026 });
  const leido = await leerEjecucion(db, r.ejecucion.id);
  assert.equal(leido.estado, 'sellada');
  assert.equal(leido.calculos.length, 3);
  assert.equal(await verificarSello(leido), true, 'el sello verifica después de la ida y vuelta por D1');
  assert.throws(() => db.raw.exec('UPDATE calculo_kernel SET valor_calculado_c = 0'), /inmutable/);
  assert.throws(() => db.raw.exec('DELETE FROM calculo_kernel'), /inmutable/);
  assert.throws(() => db.raw.exec("UPDATE ejecucion SET sello = '0'"), /inmutable/);
  assert.throws(() => db.raw.exec("INSERT INTO calculo_kernel (id, ejecucion_id, encargo_id, ejercicio, colaborador_id, rubro, valor_calculado_c, regla_id, regla_version, version_catalogo_reglas, version_parametros, nivel_minimo, limitado, traza_json, calculado_en) SELECT 'x', ejecucion_id, encargo_id, ejercicio, colaborador_id, rubro, 1, regla_id, regla_version, version_catalogo_reglas, version_parametros, nivel_minimo, limitado, traza_json, calculado_en FROM calculo_kernel LIMIT 1"), /sellada/);
  const foto = db.raw.prepare('SELECT filas_json FROM parametro_version WHERE version = ?').get(r.ejecucion.version_parametros);
  assert.ok(JSON.parse(foto.filas_json).length > 0, 'la foto del catálogo queda guardada');
});

test('diferencia: dos referencias, resta derivada en v_diferencia; criterio exige bitácora', async () => {
  const db = await baseLista();
  const catalogo = await cargarCatalogo(db);
  const r = await ejecutar({ catalogo, encargo_id: 'enc_prime_2026_08', corrida_id: 'SEM31', fuentes: FUENTES,
    items: [{ regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1073134', entrada: { base_gravable_c: 220668, fecha_pago: '2026-08-06' } }] });
  await persistirEjecucion(db, r, { catalogo, ejercicio: 2026 });
  db.raw.prepare("INSERT INTO movimiento_nomina (id, encargo_id, corrida_id, colaborador_id, rubro, valor_c, archivo_sha256) VALUES ('mov1','enc_prime_2026_08','SEM31','1073134','isr',2942,'c')").run();
  db.raw.prepare("INSERT INTO diferencia (id, calculo_kernel_id, movimiento_id) VALUES ('d1', ?, 'mov1')").run(r.calculos[0].id);
  assert.equal(db.raw.prepare("SELECT diferencia_c FROM v_diferencia WHERE id = 'd1'").get().diferencia_c, -468);
  assert.throws(() => db.raw.exec("UPDATE diferencia SET cubeta = 'criterio_sin_resolver', motivo = 'x', quien = 'y' WHERE id = 'd1'"), /CHECK/);
  db.raw.exec("UPDATE diferencia SET cubeta = 'proceso_mal', motivo = 'Subsidio 15.59% (hallazgo 1)', quien = 'Rafael González', clasificado_por_usuario_id = 2 WHERE id = 'd1'");
});

test('N1: el título sigue al origen; quien operó no revisa; el origen no cambia después del dictamen', async () => {
  const db = await baseLista();
  const catalogo = await cargarCatalogo(db);
  for (const enc of ['enc_prime_2026_08', 'enc_casa']) {
    const r = await ejecutar({ catalogo, encargo_id: enc, fuentes: FUENTES, items: [ITEMS[1]] });
    await persistirEjecucion(db, r, { catalogo, ejercicio: 2026 });
  }
  const ej = (enc) => db.raw.prepare('SELECT id FROM ejecucion WHERE encargo_id = ?').get(enc).id;
  const ins = (id, enc, tipo, revisor) => db.raw.prepare("INSERT INTO dictamen (id, encargo_id, version, ejecucion_id, tipo_entregable, contenido_json, huella_contenido, revisor_usuario_id, emitido_en) VALUES (?, ?, 1, ?, ?, '{}', 'h', ?, '2026-10-15')").run(id, enc, ej(enc), tipo, revisor);
  assert.throws(() => ins('dx', 'enc_casa', 'dictamen_independiente', 2), /control interno/);
  assert.throws(() => ins('dx', 'enc_casa', 'revision_control_interno', 1), /no puede ser el revisor/);
  ins('dc', 'enc_casa', 'revision_control_interno', 2);
  ins('dp', 'enc_prime_2026_08', 'dictamen_independiente', 2);
  assert.throws(() => db.raw.exec("UPDATE dictamen SET contenido_json = '{\"x\":1}' WHERE id = 'dp'"), /inmutable/);
  assert.throws(() => db.raw.exec("UPDATE encargo SET origen_nomina = 'tercero' WHERE id = 'enc_prime_2026_08'"), /no cambia/);
  assert.throws(() => db.raw.exec("INSERT INTO dictamen (id, encargo_id, version, ejecucion_id, tipo_entregable, contenido_json, huella_contenido, revisor_usuario_id, emitido_en) SELECT 'dp2', encargo_id, 2, ejecucion_id, tipo_entregable, '{}', 'h2', 2, '2026-10-16' FROM dictamen WHERE id = 'dp'"), /CHECK/);
  db.raw.exec("INSERT INTO dictamen (id, encargo_id, version, dictamen_anterior_id, motivo_version, ejecucion_id, tipo_entregable, contenido_json, huella_contenido, revisor_usuario_id, emitido_en) SELECT 'dp2', encargo_id, 2, 'dp', 'Corrección del cliente', ejecucion_id, tipo_entregable, '{}', 'h2', 2, '2026-10-16' FROM dictamen WHERE id = 'dp'");
});
