// Perfil «carga de documentos» (0018): el usuario del cliente que sube los archivos y corre las pruebas.
// Se prueba por el fetch del Worker, con la sesión en un KV de memoria, para cubrir el cableado completo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local } from './util.js';
import worker from '../../worker.js';
import { esCarga, puedeOperar, autorizarCarga, verificarEncargo, PERMISOS_CARGA } from '../../api/permisos.js';

const CARGA = { id: 5, email: 'carga@prime', nombre: 'Carga PRIME', rol: 'socio', perfil: 'carga', empresa_id: 1, empresa_nombre: 'PRIMEWIRELESS' };
const SOCIO = { id: 3, email: 'ana@prime', nombre: 'Ana', rol: 'socio', perfil: null, empresa_id: 1 };
const ADMIN = { id: 2, email: 'rev@hrm', nombre: 'Revisor', rol: 'admin' };

function entorno() {
  const db = baseDatos();
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8'), (2, 'OTRA', 'otra', 'OTR010101AA1')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id, perfil) VALUES (2,'rev@hrm','x','Revisor','admin',NULL,NULL), (3,'ana@prime','x','Ana','socio',1,NULL), (5,'carga@prime','x','Carga PRIME','socio',1,'carga')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES " +
    "('enc_p', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0), ('enc_cerrado', 1, 'B5+', '2026-07-01', '2026-07-31', 2026, 'cliente', 0), ('enc_otra', 2, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0)");
  db.raw.exec("UPDATE encargo SET estado = 'cerrado' WHERE id = 'enc_cerrado'");
  db.raw.exec("INSERT INTO ingesta (id, encargo_id, tipo, perfil, r2_key, estado) VALUES ('ing_p', 'enc_p', 'prenomina', 'prime', 'k1', 'terminado'), ('ing_o', 'enc_otra', 'prenomina', 'prime', 'k2', 'terminado')");
  const sesiones = new Map([['t_carga', CARGA], ['t_socio', SOCIO], ['t_admin', ADMIN]]);
  const env = { DB: db, DOCS: r2Local(), SESSIONS: { get: async (t) => sesiones.has(t) ? JSON.stringify(sesiones.get(t)) : null, put: async () => {}, delete: async () => {} } };
  const pedir = async (tk, m, ruta, cuerpo) => {
    const init = { method: m, headers: { Authorization: 'Bearer ' + tk } };
    if (cuerpo instanceof FormData) init.body = cuerpo;
    else if (cuerpo) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(cuerpo); }
    const r = await worker.fetch(new Request('https://clientes-hrm.com' + ruta, init), env, { waitUntil() {} });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { db, env, pedir };
}

test('perfil: sólo un socio con empresa es «carga»; la base no admite otra combinación', () => {
  assert.equal(esCarga(CARGA), true);
  assert.equal(esCarga(SOCIO), false);
  assert.equal(esCarga({ ...CARGA, empresa_id: null }), false);
  assert.equal(esCarga({ ...ADMIN, perfil: 'carga' }), false);
  assert.equal(puedeOperar(ADMIN) && puedeOperar(CARGA) && !puedeOperar(SOCIO), true);
  const { db } = entorno();
  assert.throws(() => db.raw.exec("INSERT INTO usuarios (email, password_hash, nombre, rol, perfil) VALUES ('a@a','x','A','admin','carga')"), /perfil carga/);
  assert.throws(() => db.raw.exec("INSERT INTO usuarios (email, password_hash, nombre, rol, perfil) VALUES ('b@b','x','B','socio','carga')"), /perfil carga/);
  assert.throws(() => db.raw.exec("UPDATE usuarios SET empresa_id = NULL WHERE id = 5"), /perfil carga/);
  assert.throws(() => db.raw.exec("UPDATE usuarios SET perfil = 'otro' WHERE id = 3"), /CHECK/);
});

test('lista blanca: lo de HRM queda cerrado aunque el encargo sea de su empresa', async () => {
  const { pedir } = entorno();
  const cerradas = [
    ['POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc_p', cubeta: 'explicada', motivo: 'x', rubro: 'isr' }],
    ['POST', '/api/kernel/clasificar', { diferencia_id: 'd', cubeta: 'explicada', motivo: 'x' }],
    ['POST', '/api/kernel/sua/clasificar', { encargo_id: 'enc_p', periodo: '2026-08', causa: 'incapacidad', cubeta: 'explicada', motivo: 'x' }],
    ['POST', '/api/kernel/cruces/clasificar', { ingesta_cfdi_id: 'x', tipo: 'diferencia', cubeta: 'explicada', motivo: 'x' }],
    ['POST', '/api/kernel/afiliacion/clasificar', { carga_id: 'x', tipo: 'pago_despues_de_baja', cubeta: 'explicada', motivo: 'x' }],
    ['POST', '/api/kernel/encargos', { id: 'enc_nuevo', empresa_id: 1 }],
    ['POST', '/api/kernel/registros', { empresa_id: 1, fuente: 'x', registros: [] }],
    ['POST', '/api/kernel/requerimiento/archivo/procesar', { id: 'x' }],
    ['GET', '/api/kernel/requerimiento?encargo_id=enc_p'],
    ['GET', '/api/kernel/hallazgos?encargo_id=enc_p'],
    ['POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc_p' }],
    ['POST', '/api/kernel/encargo/cerrar', { encargo_id: 'enc_p' }],
    ['POST', '/api/kernel/encargo/config', { encargo_id: 'enc_p' }],
    ['GET', '/api/kernel/expediente?encargo_id=enc_p'],
    ['GET', '/api/kernel/cotizaciones'],
  ];
  for (const [m, ruta, b] of cerradas) assert.equal((await pedir('t_carga', m, ruta, b)).status, 403, m + ' ' + ruta);
  // Lo de administración del portal tampoco.
  assert.equal((await pedir('t_carga', 'GET', '/api/usuarios')).status, 403);
  assert.equal((await pedir('t_carga', 'POST', '/api/usuarios', { email: 'x@x', nombre: 'x', password: '12345678', rol: 'admin' })).status, 403);
  assert.equal((await pedir('t_carga', 'GET', '/api/empresas')).status, 403);
  // Ninguna ruta de clasificar, hallazgo, dictamen o encargo está en la lista blanca.
  assert.equal(Object.keys(PERMISOS_CARGA).filter(k => /clasific|hallazgo|dictamen|cerrar|config|requerimiento|expediente|cotiza|POST \/api\/kernel\/(encargos|registros)$/.test(k)).length, 0);
});

test('alcance: sólo su empresa; de otra empresa contesta «no encontrado» sin confirmar que existe', async () => {
  const { pedir } = entorno();
  const enc = await pedir('t_carga', 'GET', '/api/kernel/encargos?empresa_id=1');
  assert.equal(enc.status, 200);
  assert.deepEqual(enc.j.encargos.map(e => e.id).sort(), ['enc_cerrado', 'enc_p']);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/encargos')).status, 400, 'sin empresa no lista todo');
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/encargos?empresa_id=2')).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingestas?encargo_id=enc_p')).status, 200);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingestas?encargo_id=enc_otra')).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingesta?id=ing_p')).status, 200);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingesta?id=ing_o')).status, 404);
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/ingesta/avanzar', { id: 'ing_o' })).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/sua?encargo_id=enc_otra')).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/sua/grupos?encargo_id=enc_otra&periodo=2026-08')).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/registros?empresa_id=2')).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/registros?empresa_id=1')).status, 200);
  // Mezclar un id propio con uno ajeno tampoco pasa.
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/diferencias?encargo_id=enc_p&ejecucion_id=no_existe')).status, 404);
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/reconciliar', { ejecucion_id: 'no_existe', ingesta_id: 'ing_p' })).status, 404);
  // Un id repetido en la URL: la revisión y el módulo podrían leer valores distintos.
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingestas?encargo_id=enc_otra&encargo_id=enc_p')).status, 400);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingesta?id=ing_o&id=ing_p')).status, 400);
  // Un id que no es texto ni número tampoco pasa sin revisar.
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/reconciliar', { ejecucion_id: 'x', ingesta_id: ['ing_o'] })).status, 400);
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/ingesta/avanzar', { id: { a: 1 } })).status, 400);
  // Una ruta con id exige el id.
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/ingesta')).status, 400);
  // El estado del kernel sí, sin los conteos de todo el portal.
  const est = await pedir('t_carga', 'GET', '/api/kernel/estado');
  assert.equal(est.status, 200);
  assert.equal(est.j.conteos, undefined);
  assert.ok(est.j.kernel_version);
  assert.ok((await pedir('t_admin', 'GET', '/api/kernel/estado')).j.conteos, 'el admin conserva los conteos');
});

test('cargas: por formulario, en encargo abierto de su empresa; nunca por referencia a R2', async () => {
  const { pedir, env } = entorno();
  const fd = (encargo_id, nombre = 'prenomina.xlsx', campo = 'file') => { const f = new FormData(); f.append(campo, new File([new Uint8Array([1, 2, 3])], nombre)); f.append('encargo_id', encargo_id); return f; };
  for (const [ruta, nombre, campo] of [['/api/kernel/ingestas', 'prenomina.xlsx', 'file'], ['/api/kernel/cfdi', 'xml.zip', 'file'], ['/api/kernel/maestro', 'maestro.xlsx', 'file'], ['/api/kernel/sua', 'W26.SUA', 'sua']]) {
    assert.equal((await pedir('t_carga', 'POST', ruta, fd('enc_otra', nombre, campo))).status, 404, ruta + ' de otra empresa');
    assert.equal((await pedir('t_carga', 'POST', ruta, fd('enc_cerrado', nombre, campo))).status, 409, ruta + ' en encargo cerrado');
    assert.equal((await pedir('t_carga', 'POST', ruta, fd('no_existe', nombre, campo))).status, 404, ruta + ' sin encargo');
  }
  assert.equal(env.DOCS.mapa.size, 0, 'nada llegó a R2');
  // Su encargo abierto: la prenómina entra a la cola (el contenido inválido falla después, en la lectura).
  const ok = await pedir('t_carga', 'POST', '/api/kernel/ingestas', fd('enc_p'));
  assert.equal(ok.status, 201);
  assert.ok([...env.DOCS.mapa.keys()][0].startsWith('encargos/enc_p/'));
  assert.equal(env.DB.raw.prepare('SELECT creado_por FROM ingesta WHERE id = ?').get(ok.j.id).creado_por, 5, 'queda quién subió');
  // Por referencia a un archivo ya en R2 (podría ser de otro encargo): cerrado.
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/ingestas', { encargo_id: 'enc_p', r2_key: 'encargos/enc_otra/fuentes/x.xlsx' })).status, 403);
  // Movimientos: el perfil no elige el id del renglón; siempre sale de su encargo.
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/movimientos', { encargo_id: 'enc_p', archivo_sha256: 'h', movimientos: [{ id: 'enc_otra|SEM35|1|neto', corrida_id: 'SEM35', colaborador_id: '1', rubro: 'neto', valor_c: 100 }] })).status, 201);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM movimiento_nomina WHERE id LIKE 'enc_otra%'").get().n, 0);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM movimiento_nomina WHERE id = 'enc_p|SEM35|1|neto'").get().n, 1);
  // Calendario: dato del cliente; se captura en su encargo abierto, no en uno cerrado.
  const cor = { corrida_id: 'SEM35', periodicidad: 'semanal', desde: '2026-08-24', hasta: '2026-08-30', fecha_pago: '2026-08-28', ordinaria: true };
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/calendario', { encargo_id: 'enc_p', fuente: 'Calendario PRIME', corridas: [cor] })).status, 200);
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/calendario', { encargo_id: 'enc_cerrado', fuente: 'x', corridas: [cor] })).status, 409);
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/calendario', { encargo_id: 'enc_otra', fuente: 'x', corridas: [cor] })).status, 404);
});

test('el socio sin perfil sigue sin kernel; el portal del cliente funciona igual para ambos', async () => {
  const { pedir } = entorno();
  assert.equal((await pedir('t_socio', 'GET', '/api/kernel/ingestas?encargo_id=enc_p')).status, 403);
  assert.equal((await pedir('t_socio', 'GET', '/api/kernel/estado')).status, 403);
  for (const tk of ['t_socio', 't_carga']) assert.equal((await pedir(tk, 'GET', '/api/encargos')).status, 200);
  assert.equal(await verificarEncargo(null, ADMIN, 'cualquiera'), null);
  assert.equal((await verificarEncargo(null, SOCIO, 'enc_p')).status, 403);
  assert.equal(await autorizarCarga(new Request('https://x/api/encargos'), {}, CARGA), null, 'fuera del kernel decide el portal');
});

test('alta de usuario: «carga» se guarda como socio con perfil y empresa', async () => {
  const { pedir, db } = entorno();
  assert.equal((await pedir('t_admin', 'POST', '/api/usuarios', { email: 'Nuevo@Prime.com ', nombre: 'Nuevo', password: '12345678', rol: 'carga', empresa_id: 1 })).status, 201);
  const u = db.raw.prepare("SELECT rol, perfil, empresa_id FROM usuarios WHERE email = 'nuevo@prime.com'").get();
  assert.deepEqual({ ...u }, { rol: 'socio', perfil: 'carga', empresa_id: 1 });
  assert.equal((await pedir('t_admin', 'POST', '/api/usuarios', { email: 'x@prime.com', nombre: 'X', password: '12345678', rol: 'carga' })).status, 400, 'sin empresa');
  assert.equal((await pedir('t_admin', 'POST', '/api/usuarios', { email: 'y@prime.com', nombre: 'Y', password: '123', rol: 'carga', empresa_id: 1 })).status, 400, 'contraseña corta');
  assert.equal((await pedir('t_admin', 'POST', '/api/usuarios', { email: 'nuevo@prime.com', nombre: 'Otra vez', password: '12345678', rol: 'carga', empresa_id: 1 })).status, 409);
  const l = await pedir('t_admin', 'GET', '/api/usuarios');
  assert.equal(l.j.usuarios.find(x => x.email === 'nuevo@prime.com').perfil, 'carga');
});

test('login: el email no distingue mayúsculas (se guarda en minúsculas al dar de alta)', async () => {
  const { env } = entorno();
  const sha = async (x) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)))].map(b => b.toString(16).padStart(2, '0')).join('');
  env.DB.raw.prepare("INSERT INTO usuarios (email, password_hash, nombre, rol, empresa_id, perfil) VALUES ('luis@prime.com', ?, 'Luis', 'socio', 1, 'carga')").run(await sha('clave-segura-1'));
  let guardado = null;
  env.SESSIONS.put = async (k, v) => { guardado = JSON.parse(v); };
  const r = await worker.fetch(new Request('https://clientes-hrm.com/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ' Luis@Prime.com', password: 'clave-segura-1' }) }), env, {});
  assert.equal(r.status, 200);
  assert.equal(guardado.perfil, 'carga');
  assert.equal(guardado.empresa_id, 1);
});
