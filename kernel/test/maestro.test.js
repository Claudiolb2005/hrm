// Maestro de empleados y cruce de afiliación: pago a persona sin alta o ya dada de baja (D7 cualitativo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local, xlsx } from './util.js';
import { archivosPrueba, CAL } from './fixtures-cfdi.mjs';
import { leerMaestro, cruzarAfiliacion } from '../../ingesta/maestro.js';
import { crearIngesta, avanzar } from '../../ingesta/trabajos.js';
import { rutasMaestro } from '../../api/maestro.js';
import { rutasDictamen } from '../../api/dictamen.js';
import { rutasKernel } from '../../api/kernel.js';
import { rutasRequerimiento } from '../../api/requerimiento.js';

const ACT = ['Número de empleado', 'Nombre', 'RFC', 'CURP', 'Fecha de alta', 'Fecha de antigüedad', 'Fecha de baja', 'Fecha de baja IMSS', 'Grupo de nómina', 'Número de cuenta'];
const BAJ = ['ID', 'RFC', 'NOMBRE', 'GRUPO NÓMINA', 'FECHA DE ALTA', 'FECHA DE BAJA CÁLCULO', 'TIPO DE BAJA'];
const serial = (iso) => (Date.parse(iso + 'T00:00:00Z') / 86400000) + 25569;
const MAESTRO = xlsx([
  { nombre: 'ACTIVOS', filas: [ACT,
    [1067513, 'Persona A', 'XAXX010101513', 'X', serial('2023-07-17'), serial('2023-07-17'), null, null, 'Semanal', '0000'],
    [390062, 'Persona B', 'XAXX010101062', 'X', serial('2026-08-10'), serial('2026-08-10'), null, null, 'Semanal', '0000'],
    [null, null, null, null, null, null, null, null, null, null]] },
  { nombre: 'Bajas aplicadas', filas: [BAJ, [1073134, 'XAXX010101134', 'Persona C', 'SEMANAL', serial('2022-05-02'), serial('2026-07-20'), 'RENUNCIA']] },
]);

test('lee el maestro sin guardar nombres ni cuentas; la baja manda sobre el alta', async () => {
  const m = await leerMaestro(MAESTRO);
  assert.equal(m.registros.length, 3);
  const c = m.registros.find(r => r.num_empleado === '1073134');
  assert.deepEqual([c.hoja, c.fecha_baja, c.rfc], ['baja', '2026-07-20', 'XAXX010101134']);
  assert.equal(m.registros.find(r => r.num_empleado === '390062').fecha_alta, '2026-08-10');
  for (const r of m.registros) assert.deepEqual(Object.keys(r).sort(), ['fecha_alta', 'fecha_antiguedad', 'fecha_baja', 'fecha_baja_imss', 'grupo', 'hoja', 'num_empleado', 'rfc']);
  await assert.rejects(leerMaestro(xlsx([{ nombre: 'Otra', filas: [['x']] }])), /No se reconoció/);
});

test('cruce: después de la baja (salvo finiquito), antes del alta, y sin maestro como cobertura', () => {
  const cal = new Map([['SEM31', { desde: '2026-07-27', hasta: '2026-08-02', ordinaria: true }]]);
  const maestro = new Map([['1', { fecha_alta: '2020-01-01', fecha_baja_imss: '2026-07-20' }], ['2', { fecha_alta: '2026-08-10' }], ['3', { fecha_alta: '2020-01-01', fecha_baja: '2026-07-20' }]]);
  const r = cruzarAfiliacion([
    { colaborador_id: '1', corrida_id: 'SEM31', total_percepciones_c: 100, percepciones: [] },
    { colaborador_id: '2', corrida_id: 'SEM31', total_percepciones_c: 100, percepciones: [] },
    { colaborador_id: '3', corrida_id: 'SEM31', total_percepciones_c: 900, percepciones: [{ tipo: 'separacion' }] },
    { colaborador_id: '4', corrida_id: 'SEM31', total_percepciones_c: 100, percepciones: [] },
    { colaborador_id: '1', corrida_id: 'SEM31', total_percepciones_c: 0, percepciones: [] },
  ], maestro, cal);
  assert.deepEqual(r.casos.map(c => [c.tipo, c.colaborador_id, c.fuente_fecha]), [['pago_despues_de_baja', '1', 'baja IMSS'], ['pago_antes_de_alta', '2', 'alta']]);
  assert.deepEqual(r.sin_maestro, ['4']);
});

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };

test('de punta a punta: el pago después de la baja bloquea hasta clasificarse y, como hallazgo, es material', async () => {
  const db = baseDatos(), DOCS = r2Local(), env = { DB: db, DOCS };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (2,'rev@hrm','x','Revisor','admin')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_m', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0)");
  for (const c of CAL) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_m',?,?,?,?,?,?,'prueba')")
    .run(c.corrida_id, c.periodicidad, c.desde, c.hasta, c.fecha_pago, c.ordinaria ? 1 : 0);
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, fuente) VALUES (1, 'Y6079749104', 'CDMX', 'prueba')");
  const llamar = async (metodo, ruta, body) => {
    const init = { method: metodo };
    if (body instanceof FormData) init.body = body; else if (body) init.body = JSON.stringify(body);
    const req = new Request('https://x' + ruta, init);
    const r = (await rutasMaestro(req.clone(), env, ADMIN, {}, J)) || (await rutasRequerimiento(req.clone(), env, ADMIN, {}, J)) || (await rutasDictamen(req.clone(), env, ADMIN, {}, J)) || (await rutasKernel(req, env, ADMIN, {}, J));
    return { status: r.status, json: await r.json() };
  };
  const fd = () => { const f = new FormData(); f.append('encargo_id', 'enc_m'); f.append('file', new Blob([MAESTRO]), 'HC agosto.xlsx'); return f; };
  // Sin prenómina se carga, pero no se cruza.
  const m0 = await llamar('POST', '/api/kernel/maestro', fd());
  assert.equal(m0.status, 201);
  assert.equal(m0.json.cruzado, false);
  await DOCS.put('p.xlsx', archivosPrueba().prenomina);
  const pre = await crearIngesta(env, { encargo_id: 'enc_m', r2_key: 'p.xlsx' });
  for (let i = 0; i < 10; i++) { const r = await avanzar(env, { ingesta_id: pre }); if (['terminado', 'error'].includes(r.estado)) break; }
  const cz = await llamar('POST', '/api/kernel/maestro/cruzar', { id: m0.json.id });
  assert.equal(cz.status, 200, JSON.stringify(cz.json));
  assert.deepEqual(cz.json.reporte.por_tipo, { pago_despues_de_baja: 1, pago_antes_de_alta: 1 });
  assert.equal(cz.json.reporte.sin_maestro, 1, 'el del bono no está en el maestro');

  await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc_m', diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59 %' });
  await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc_m', titulo: 'Subsidio', modulo: '4.3', tipo: 'cuantitativo', riesgo: 'medio', criterio: 'Decreto', condicion: '15.59 %', diferencias: { rubro: 'isr' } });
  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: 'enc_m', carga_patronal_c: 2775600000, carga_patronal_fuente: 'prueba' });
  const ej = db.raw.prepare("SELECT ejecucion_id FROM ingesta WHERE encargo_id = 'enc_m'").get().ejecucion_id;
  let pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc_m&ejecucion_id=' + ej);
  assert.match(pr.json.bloqueos.join(' '), /2 pagos a personas sin alta o ya dadas de baja sin clasificar/);
  assert.equal(pr.json.modulos.find(x => x.modulo === '4.12').estado, 'universo_parcial');

  await llamar('POST', '/api/kernel/afiliacion/clasificar', { carga_id: m0.json.id, tipo: 'pago_antes_de_alta', cubeta: 'explicada', motivo: 'Reingreso: el alta del maestro es la del reingreso' });
  await llamar('POST', '/api/kernel/afiliacion/clasificar', { carga_id: m0.json.id, tipo: 'pago_despues_de_baja', cubeta: 'proceso_mal', motivo: 'Sueldo pagado después de la baja' });
  const pend = await llamar('GET', '/api/kernel/hallazgos/pendientes?encargo_id=enc_m');
  assert.equal(pend.json.afiliacion.length, 1);
  const h = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc_m', titulo: 'Pago a persona ya dada de baja', modulo: '4.12', tipo: 'cualitativo', motivo_cualitativo: 'pago_baja_imss',
    riesgo: 'alto', criterio: 'LSS arts. 15 y 27', condicion: 'Sueldo de la semana 31 pagado a una persona dada de baja el 20-jul', afiliacion: { carga_id: m0.json.id, tipo: 'pago_despues_de_baja' } });
  assert.equal(h.json.afiliacion, 1);
  pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc_m&ejecucion_id=' + ej);
  assert.deepEqual(pr.json.bloqueos, []);
  assert.equal(pr.json.propuesta.semaforo['4.12'].color, 'rojo');
  const hz = pr.json.hallazgos.find(x => x.modulo === '4.12');
  assert.equal(hz.efecto_derivado_c, 220668, 'el efecto es lo pagado en la corrida');
  assert.equal(hz.material, true);
  const rq = await llamar('POST', '/api/kernel/requerimiento/generar', { encargo_id: 'enc_m' });
  assert.equal(rq.json.requerimiento.find(r => r.fuente_clave === 'maestro_empleados').estado_efectivo, 'incompleta', 'un pagado no está en el maestro');
});
