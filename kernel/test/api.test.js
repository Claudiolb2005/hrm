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
  for (const f of ['schema.sql', 'migrations/0001_kernel_v1.sql', 'migrations/0002_semilla_kernel_v1.sql', 'migrations/0003_ingesta_lotes.sql', 'migrations/0004_sync_reglas_v1_1.sql', 'migrations/0005_vista_diferencia.sql', 'migrations/0006_hallazgos_dictamen.sql', 'migrations/0007_cfdi_nomina.sql', 'migrations/0008_requerimiento.sql', 'migrations/0009_maestro_afiliacion.sql', 'migrations/0010_parametros_valuacion.sql', 'migrations/0011_cotizacion.sql', 'migrations/0012_retencion.sql', 'migrations/0013_parametros_cotejo_oficial.sql', 'migrations/0014_reglas_174_95_isn_criterios.sql', 'migrations/0015_casos_dorados_c13_c14_c23_criterios.sql']) db.raw.exec(readFileSync(new URL(f, RAIZ), 'utf8'));
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
  assert.deepEqual(rec.json, { coincidencias: 1, coincidencias_limitadas: 0, diferencias: 1, dentro_de_tolerancia: 0, limitados: 0, sin_par_cliente: 0, sin_par_kernel: 0 });
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

// ── Rutas de ingesta, calendario, registros y clasificación en bloque ──
import { r2Local, xlsx as libroXlsx, baseDatos } from './util.js';

async function entornoIngesta() {
  const db = baseDatos();
  const DOCS = r2Local();
  db.raw.exec("INSERT INTO empresas (id, nombre, slug) VALUES (1, 'PRIMEWIRELESS', 'prime')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (2,'rev@hrm','x','Revisor','admin')");
  const pendientes = [];
  const ctx = { waitUntil: (p) => pendientes.push(p) };
  const llamar = async (metodo, ruta, body) => {
    const r = await rutasKernel(new Request('https://x' + ruta, { method: metodo, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json' } }), { DB: db, DOCS }, ADMIN, {}, J, ctx);
    return { status: r.status, json: await r.json() };
  };
  return { db, DOCS, llamar, pendientes };
}

test('estado: la matriz en D1 coincide con la del código (después de 0004)', async () => {
  const { llamar } = await entornoIngesta();
  const r = await llamar('GET', '/api/kernel/estado');
  assert.deepEqual(r.json.matriz_d1_vs_codigo, []);
});

test('registros: valida clave de entidad y formato; calendario: valida fechas', async () => {
  const { llamar } = await entornoIngesta();
  assert.equal((await llamar('POST', '/api/kernel/registros', { empresa_id: 1, fuente: 'x', registros: [{ registro: 'Z3337346103', entidad: 'Sinaloa' }] })).status, 400);
  assert.equal((await llamar('POST', '/api/kernel/registros', { empresa_id: 1, fuente: 'SUA ago-2026', registros: [{ registro: 'Z3337346103', entidad: 'SIN', prima_rt_pct: '0.50' }] })).status, 200);
  await llamar('POST', '/api/kernel/encargos', { id: 'enc1', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', ejercicio: 2026, origen_nomina: 'cliente' });
  assert.equal((await llamar('POST', '/api/kernel/calendario', { encargo_id: 'enc1', fuente: 'x', corridas: [{ corrida_id: 'SEM31', periodicidad: 'semanal', desde: '27/07/2026' }] })).status, 400);
  assert.equal((await llamar('POST', '/api/kernel/calendario', { encargo_id: 'enc1', fuente: 'PRIME', corridas: [{ corrida_id: 'SEM31', periodicidad: 'semanal', desde: '2026-07-27', hasta: '2026-08-02', fecha_pago: '2026-08-06' }] })).status, 200);
  assert.equal((await llamar('GET', '/api/kernel/calendario?encargo_id=enc1')).json.calendario.length, 1);
});

test('ingesta por API: crea, arranca sola, avanza, reporta y clasifica en bloque', async () => {
  const { db, DOCS, llamar, pendientes } = await entornoIngesta();
  await llamar('POST', '/api/kernel/encargos', { id: 'enc1', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', ejercicio: 2026, origen_nomina: 'cliente' });
  await llamar('POST', '/api/kernel/calendario', { encargo_id: 'enc1', fuente: 'prueba', corridas: [
    { corrida_id: 'SEM31', periodicidad: 'semanal', desde: '2026-07-27', hasta: '2026-08-02', fecha_pago: '2026-08-06' },
    { corrida_id: 'SEM34', periodicidad: 'semanal', desde: '2026-08-17', hasta: '2026-08-23', fecha_pago: '2026-08-27' }] });
  const enc = ['SEMANA / CATORCENA', 'NO.', 'RFC', 'SD', 'Registro patronal', 'Sueldo', 'Comisiones', 'TOTAL PERCEPCIONES', 'I.S.R. (sp)', 'TOTAL DEDUCCIONES', 'NETO SUELDO FISCAL', 'Impuesto estatal'];
  const filas = [enc];
  for (let i = 0; i < 30; i++) filas.push(['SEM 31', 3000 + i, 'RFC', 400, 'Y6079749104', 2206.68, 0, 2206.68, 29.42, 29.42, 2177.26, 0]);
  await DOCS.put('encargos/enc1/acum.xlsx', libroXlsx([{ nombre: 'H', filas }]));
  const c = await llamar('POST', '/api/kernel/ingestas', { encargo_id: 'enc1', r2_key: 'encargos/enc1/acum.xlsx' });
  assert.equal(c.status, 201);
  await Promise.all(pendientes);
  let st = (await llamar('GET', '/api/kernel/ingesta?id=' + c.json.id)).json.ingesta;
  for (let i = 0; st.estado !== 'terminado' && i < 5; i++) st = (await llamar('POST', '/api/kernel/ingesta/avanzar', { id: c.json.id })).json.ingesta;
  assert.equal(st.estado, 'terminado', st.error || '');
  assert.equal(st.reporte.reconciliacion.diferencias, 30, 'los 30 con subsidio al 15.59%');
  const g = await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc1', regla_id: 'CALC-ISR-SEM-001', diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59% en lugar de 15.02% (hallazgo 1)' });
  assert.equal(g.json.clasificadas, 30);
  const dif = await llamar('GET', '/api/kernel/diferencias?encargo_id=enc1');
  assert.equal(dif.json.aceptacion.sin_clasificar, 0);
  assert.equal((await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc1', cubeta: 'proceso_mal', motivo: 'x' })).status, 400, 'sin filtro no se clasifica todo');
});

test('página /kernel: un solo <script>, JS del navegador sin errores de sintaxis, todo lo dinámico pasa por esc()', async () => {
  const { paginaKernel } = await import('../../paginas/kernel.js');
  const html = paginaKernel({ CSS: '', LOGO: 'x', AUTH_ADMIN: 'var tk=1,U={};', LOGOUT_FN: 'function logout(){}' });
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  const js = html.split('<script>')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(js));
  assert.ok(!/innerHTML\s*=\s*[^;]*\+\s*(i|x|c|g|r)\.(archivo_nombre|colaborador_id|motivo|fuente|tema)\s*\+/.test(js), 'campos del cliente sin esc()');
});

test('tema: se inyecta una vez en cualquier página, sus scripts compilan y no toca respuestas sin <head>', async () => {
  const { aplicarTema } = await import('../../paginas/tema.js');
  const h = aplicarTema('<!DOCTYPE html><html><head><title>x</title></head><body><div class="top"></div></body></html>');
  assert.equal((h.match(/id="tema-hrm"/g) || []).length, 1);
  for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
  assert.equal(aplicarTema('{"ok":true}'), '{"ok":true}');
});
