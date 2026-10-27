// Encargo del mes (0019): el portal detecta el mes del archivo y aquí se resuelve o se abre el encargo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local } from './util.js';
import worker from '../../worker.js';
import { encargoDelMes, mesActualMX } from '../../api/kernel.js';

const CARGA = { id: 5, email: 'carga@prime', nombre: 'Carga PRIME', rol: 'socio', perfil: 'carga', empresa_id: 1 };
const ADMIN = { id: 2, email: 'rev@hrm', nombre: 'Revisor', rol: 'admin' };
const SOCIO = { id: 3, email: 'ana@prime', nombre: 'Ana', rol: 'socio', perfil: null, empresa_id: 1 };
const AHORA = new Date('2026-10-27T19:00:00Z');

function entorno() {
  const db = baseDatos();
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8'), (2, 'OTRA', 'otra', 'OTR010101AA1'), (3, 'NUEVA', 'nueva', 'NUE010101AA1')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id, perfil) VALUES (2,'rev@hrm','x','Revisor','admin',NULL,NULL), (3,'ana@prime','x','Ana','socio',1,NULL), (5,'carga@prime','x','Carga PRIME','socio',1,'carga')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual, tolerancia_individual_c, materialidad_bp, carga_patronal_c, carga_patronal_fuente) VALUES " +
    "('enc_prime_2026_08', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 1, 75, 40, 2775600000, 'SUA agosto'), " +
    "('enc_prime_2026_07', 1, 'B5+', '2026-07-01', '2026-07-31', 2026, 'cliente', 0, 50, 50, NULL, NULL), " +
    "('enc_prime_anual', 1, 'A2', '2025-01-01', '2025-12-31', 2025, 'cliente', 0, 50, 50, NULL, NULL), " +
    "('enc_otra_2026_08', 2, 'B5+', '2026-08-01', '2026-08-31', 2026, 'tercero', 0, 50, 50, NULL, NULL)");
  db.raw.exec("UPDATE encargo SET estado = 'cerrado' WHERE id = 'enc_prime_2026_07'");
  const sesiones = new Map([['t_carga', CARGA], ['t_admin', ADMIN], ['t_socio', SOCIO]]);
  const env = { DB: db, DOCS: r2Local(), SESSIONS: { get: async (t) => sesiones.has(t) ? JSON.stringify(sesiones.get(t)) : null, put: async () => {}, delete: async () => {} } };
  const pedir = async (tk, ruta, cuerpo) => {
    const r = await worker.fetch(new Request('https://clientes-hrm.com' + ruta, { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }), env, { waitUntil() {} });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { db, env, pedir };
}

test('mes con encargo abierto: lo devuelve sin crear nada', async () => {
  const { pedir, db } = entorno();
  const r = await pedir('t_carga', '/api/kernel/encargo/mes', { empresa_id: 1, periodo: '2026-08' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.j.encargo.id, r.j.creado], ['enc_prime_2026_08', false]);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM encargo').get().n, 4);
});

test('mes sin encargo: lo abre con la configuración del último encargo mensual, no con la del periodo', async () => {
  const { db } = entorno();
  const r = await encargoDelMes(db, CARGA, 1, '2026-09', AHORA);
  assert.deepEqual([r.status, r.creado, r.encargo.id, r.plantilla], [201, true, 'enc_prime_2026_09', 'enc_prime_2026_08']);
  const e = db.raw.prepare("SELECT * FROM encargo WHERE id = 'enc_prime_2026_09'").get();
  assert.deepEqual([e.periodo_desde, e.periodo_hasta, e.ejercicio, e.nivel, e.origen_nomina, e.aplica_ajuste_mensual, e.tolerancia_individual_c, e.materialidad_bp, e.estado],
    ['2026-09-01', '2026-09-30', 2026, 'B5+', 'cliente', 1, 75, 40, 'abierto']);
  assert.deepEqual([e.carga_patronal_c, e.carga_patronal_fuente, e.cerrado_en, e.encargo_grupo_id], [null, null, null, null], 'lo del periodo no se copia');
  assert.deepEqual([e.alta, e.creado_por, e.plantilla_encargo_id], ['automatica', 5, 'enc_prime_2026_08'], 'queda quién y de dónde');
  // La segunda carga del mismo mes llega al mismo encargo.
  const otra = await encargoDelMes(db, CARGA, 1, '2026-09', AHORA);
  assert.deepEqual([otra.status, otra.encargo.id, otra.creado], [200, 'enc_prime_2026_09', false]);
  // Febrero: último día correcto.
  assert.equal((await encargoDelMes(db, CARGA, 1, '2026-02', AHORA)).encargo.periodo_hasta, '2026-02-28');
});

test('lo que no se abre solo: mes cerrado, mes futuro, empresa sin encargo mensual, periodo inválido', async () => {
  const { db } = entorno();
  const cerrado = await encargoDelMes(db, CARGA, 1, '2026-07', AHORA);
  assert.equal(cerrado.status, 409);
  assert.match(cerrado.error, /está cerrado/);
  assert.equal((await encargoDelMes(db, CARGA, 1, '2026-11', AHORA)).status, 400, 'noviembre aún no ocurre');
  assert.equal(mesActualMX(new Date('2026-11-01T03:00:00Z')), '2026-10', 'a las 21:00 del 31-oct en CDMX sigue siendo octubre');
  const sin = await encargoDelMes(db, ADMIN, 3, '2026-09', AHORA);
  assert.equal(sin.status, 409);
  assert.match(sin.error, /HRM abre el primero/);
  for (const p of ['2026-13', '2026-9', 'agosto', '2019-12']) assert.equal((await encargoDelMes(db, CARGA, 1, p, AHORA)).status, 400, p);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM encargo').get().n, 4, 'nada se creó');
});

test('alcance: el perfil carga sólo resuelve meses de su empresa; el socio sin perfil, nada', async () => {
  const { pedir, db } = entorno();
  assert.equal((await pedir('t_carga', '/api/kernel/encargo/mes', { empresa_id: 2, periodo: '2026-08' })).status, 404);
  assert.equal((await pedir('t_carga', '/api/kernel/encargo/mes', { periodo: '2026-08' })).status, 400, 'exige empresa_id');
  assert.equal((await pedir('t_carga', '/api/kernel/encargo/mes', { empresa_id: [2], periodo: '2026-08' })).status, 400);
  assert.equal((await pedir('t_socio', '/api/kernel/encargo/mes', { empresa_id: 1, periodo: '2026-08' })).status, 403);
  // El admin elige la empresa.
  const a = await pedir('t_admin', '/api/kernel/encargo/mes', { empresa_id: 2, periodo: '2026-08' });
  assert.deepEqual([a.status, a.j.encargo.id], [200, 'enc_otra_2026_08']);
  // El perfil carga no puede pasar campos para elegir nivel u origen: se ignoran.
  const { status, j } = await pedir('t_carga', '/api/kernel/encargo/mes', { empresa_id: 1, periodo: '2026-06', nivel: 'A0', origen_nomina: 'la_casa' });
  if (status === 201) assert.deepEqual([j.encargo.nivel, j.encargo.origen_nomina], ['B5+', 'cliente']);
  else assert.equal(status, 201, 'junio 2026 se abre');
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM encargo WHERE empresa_id = 2").get().n, 1);
});
