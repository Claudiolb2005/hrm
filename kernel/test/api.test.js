// Rutas /api/kernel/* del Worker contra SQLite local con la forma de la API de D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { rutasKernel } from '../../api/kernel.js';

const RAIZ = new URL('../../', import.meta.url);
function d1Local() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const stmt = (sql, args = []) => ({ sql, args, bind: (...a) => stmt(sql, a),
    run: async () => raw.prepare(sql).run(...args), all: async () => ({ results: raw.prepare(sql).all(...args) }),
    first: async () => raw.prepare(sql).get(...args) ?? null });
  return { raw, prepare: (sql) => stmt(sql), batch: async (ss) => { raw.exec('BEGIN'); try { for (const s of ss) raw.prepare(s.sql).run(...s.args); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } } };
}
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };

async function entorno() {
  const db = d1Local();
  for (const f of ['schema.sql', 'migrations/0001_kernel_v1.sql', 'migrations/0002_semilla_kernel_v1.sql']) db.raw.exec(readFileSync(new URL(f, RAIZ), 'utf8'));
  db.raw.exec("INSERT INTO empresas (id, nombre, slug) VALUES (1, 'PRIMEWIRELESS', 'prime')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (2,'rev@hrm','x','Revisor','admin')");
  const llamar = async (metodo, ruta, body, u = ADMIN) => {
    const r = await rutasKernel(new Request('https://x' + ruta, { method: metodo, body: body ? JSON.stringify(body) : undefined }), { DB: db }, u, {}, J);
    return { status: r.status, json: await r.json() };
  };
  return { db, llamar };
}

test('estado: catálogo en D1 íntegro (= semilla del código) y matriz completa', async () => {
  const { llamar } = await entorno();
  const r = await llamar('GET', '/api/kernel/estado');
  assert.equal(r.status, 200);
  assert.equal(r.json.parametros_integros, true);
  assert.equal(r.json.puede_arrancar, true);
});

test('sólo admin', async () => {
  const { llamar } = await entorno();
  assert.equal((await llamar('GET', '/api/kernel/estado', null, { id: 9, rol: 'socio' })).status, 403);
});

test('flujo completo: encargo → ejecutar → movimientos → reconciliar → clasificar → aceptación', async () => {
  const { llamar } = await entorno();
  assert.equal((await llamar('POST', '/api/kernel/encargos', { id: 'enc1', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', ejercicio: 2026, origen_nomina: 'nomina' })).status, 400);
  assert.equal((await llamar('POST', '/api/kernel/encargos', { id: 'enc1', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', ejercicio: 2026, origen_nomina: 'cliente' })).status, 201);
  const ej = await llamar('POST', '/api/kernel/ejecutar', { encargo_id: 'enc1', corrida_id: 'SEM31',
    fuentes: { prenomina: { estado: 'completa', sha256: 'f'.repeat(64) }, catalogo_conceptos_cliente: { estado: 'completa' } },
    items: [{ regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1073134', entrada: { base_gravable_c: 220668, fecha_pago: '2026-08-06' } },
            { regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1067513', entrada: { base_gravable_c: 776068, fecha_pago: '2026-08-06' } }] });
  assert.equal(ej.status, 201);
  assert.equal(ej.json.resultados[0].estado, 'completo');
  const id = ej.json.ejecucion.id;
  const leida = await llamar('GET', '/api/kernel/ejecucion?id=' + id);
  assert.equal(leida.json.sello_valido, true);
  await llamar('POST', '/api/kernel/movimientos', { encargo_id: 'enc1', archivo_sha256: 'p'.repeat(64), movimientos: [
    { corrida_id: 'SEM31', colaborador_id: '1073134', rubro: 'isr', valor_c: 2942 },
    { corrida_id: 'SEM31', colaborador_id: '1067513', rubro: 'isr', valor_c: 122287 }] });
  const rec = await llamar('POST', '/api/kernel/reconciliar', { ejecucion_id: id });
  assert.deepEqual(rec.json, { coincidencias: 1, diferencias: 1, limitados: 0, sin_par_cliente: 0, sin_par_kernel: 0 });
  let dif = await llamar('GET', '/api/kernel/diferencias?encargo_id=enc1');
  assert.equal(dif.json.diferencias[0].diferencia_c, -468);
  assert.equal(dif.json.aceptacion.aceptado, false);
  await llamar('POST', '/api/kernel/clasificar', { diferencia_id: dif.json.diferencias[0].id, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59% (hallazgo 1)' });
  dif = await llamar('GET', '/api/kernel/diferencias?encargo_id=enc1');
  assert.equal(dif.json.aceptacion.aceptado, true);
});

test('lote demasiado grande se rechaza (se parte en lotes)', async () => {
  const { llamar } = await entorno();
  await llamar('POST', '/api/kernel/encargos', { id: 'enc1', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', ejercicio: 2026, origen_nomina: 'cliente' });
  const items = Array.from({ length: 501 }, (_, i) => ({ regla_id: 'CALC-INF-001', colaborador_id: String(i), entrada: {} }));
  assert.equal((await llamar('POST', '/api/kernel/ejecutar', { encargo_id: 'enc1', items })).status, 413);
});
