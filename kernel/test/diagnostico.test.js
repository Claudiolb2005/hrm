// 0.11.6 · Causa de cada diferencia (ingesta/diagnostico.js) y lo que septiembre 2026 de PRIME sacó a la luz:
// bonos con otro nombre fuera del ajuste mensual, «Impuesto estatal» de los bonos que no es ISN, prima dominical
// de una nómina semanal, archivo de otro mes en el encargo y «volver a calcular». Importes de casos reales, por número.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local, xlsx, catalogoSemilla } from './util.js';
import worker from '../../worker.js';
import { crearIngesta, avanzar, estadoIngesta, recalcular, archivoDeOtroMes } from '../../ingesta/trabajos.js';
import { diagnosticar, describirCausa, diagnosticoEjecucion, explicarDiferencia, MARGEN_C } from '../../ingesta/diagnostico.js';
import { domingosDe, domingosEnPeriodo } from '../../ingesta/items.js';
import prime from '../../ingesta/perfiles/prime.js';

const cat = catalogoSemilla();
const CAL = new Map([
  ['SEM35', { periodicidad: 'semanal', fecha_pago: '2026-09-04', ordinaria: true }], ['SEM36', { periodicidad: 'semanal', fecha_pago: '2026-09-11', ordinaria: true }],
  ['SEM37', { periodicidad: 'semanal', fecha_pago: '2026-09-18', ordinaria: true }], ['SEM38', { periodicidad: 'semanal', fecha_pago: '2026-09-25', ordinaria: true }],
  ['CAT18', { periodicidad: 'catorcenal', fecha_pago: '2026-09-02', ordinaria: true }], ['CAT19', { periodicidad: 'catorcenal', fecha_pago: '2026-09-16', ordinaria: true }],
  ['CAT20', { periodicidad: 'catorcenal', fecha_pago: '2026-09-30', ordinaria: true }],
]);
const ayudas = (conceptos = {}) => ({ catalogo: cat, perfil: prime, calendario: CAL, conceptos: new Map(Object.entries(conceptos)) });
const sem = (colaborador_id, corrida_id, kernel_c, cliente_c, base, extra = {}) => ({ regla_id: 'CALC-ISR-SEM-001', colaborador_id, corrida_id, kernel_c, cliente_c, limitado: false,
  traza: { periodicidad: 'semanal', base_gravable_c: base, base_para_tope_c: base, limitaciones: [] }, ...extra });
const ajm = (colaborador_id, kernel_c, cliente_c, base, previo, extra = {}) => ({ regla_id: 'CALC-ISR-AJM-001', colaborador_id, corrida_id: 'SEM38', kernel_c, cliente_c, limitado: false,
  traza: { base_mes_c: base, base_tope_mes_c: base, isr_retenido_previo_mes_c: previo, limitaciones: [] }, ...extra });
const fondo = (g) => [{ concepto: 'fondo_ahorro_empresa', monto_c: g, exento_c: 0, gravable_c: g }];

test('ISR semanal: el caso que mandó el encargado (393310 SEM 35, −$100.35) es el fondo de ahorro tratado como exento', () => {
  const dx = diagnosticar(sem('393310', 'SEM35', 136276, 126241, 839066), ayudas({ '393310|SEM35': fondo(44484) }));
  assert.deepEqual([dx.causa, dx.recalculo_c], ['fondo_ahorro_exento', 126241], 'sin el fondo la base es $7,945.82 y el ISR $1,262.41 = nómina');
  assert.equal(describirCausa(dx.causa, prime).de, 'criterio');
});

test('ISR semanal: −$4.68 es el subsidio con 15.59 %; fondo y subsidio juntos también se reconocen', () => {
  // Base $2,206.68: ISR $157.44 − subsidio $123.34 = $34.10; la nómina resta $128.02 y retiene $29.42.
  assert.equal(diagnosticar(sem('1073134', 'SEM35', 3410, 2942, 220668), ayudas()).causa, 'subsidio_1559');
  // 393308 SEM 36: con subsidio y con fondo de ahorro.
  assert.equal(diagnosticar(sem('393308', 'SEM36', 6950, 3312, 253199), ayudas({ '393308|SEM36': fondo(29129) })).causa, 'subsidio_1559+fondo_ahorro_exento');
  // El subsidio de la nómina deja la retención en cero (1076461 SEM 36: $0.78 contra $0).
  assert.equal(diagnosticar(sem('1076461', 'SEM36', 78, 0, 190044), ayudas()).causa, 'subsidio_1559');
});

test('ISR semanal limitado por prima dominical: con un domingo exento coincide; con fondo de ahorro además, también', () => {
  const pd = (m) => [{ concepto: 'prima_dominical', monto_c: m, exento_c: 0, gravable_c: m }];
  const lim = { limitado: true };
  const d1 = sem('1068176', 'SEM35', 55409, 53345, 462970, lim);
  d1.traza.limitaciones = [{ motivo: 'base_limitada', detalle: 'dato_faltante: prima_dominical: domingos trabajados' }];
  assert.equal(diagnosticar(d1, ayudas({ '1068176|SEM35': pd(9663) })).causa, 'prima_dominical_un_domingo');
  const d2 = sem('1068078', 'SEM35', 344078, 323601, 1627716, lim);
  const dx2 = diagnosticar(d2, ayudas({ '1068078|SEM35': [...fondo(56527), ...pd(14000)] }));
  assert.equal(dx2.causa, 'fondo_ahorro_exento+prima_dominical_un_domingo');
  assert.ok(Math.abs(dx2.recalculo_c - 323601) <= MARGEN_C);
  // Sin el dato de la prima no se inventa nada: queda como dato faltante, con el motivo.
  const dx3 = diagnosticar(d1, ayudas());
  assert.equal(dx3.causa, 'alcance');
  assert.equal(dx3.detalle, 'Prima dominical: el archivo no dice cuántos domingos se trabajaron');
});

test('ajuste mensual: no reintegrado, subsidio, fondo de ahorro y subsidio que deja la retención en cero', () => {
  // 1071767: en el mes se retuvo de más ($8,997.31 contra $7,975.77 de la tarifa mensual) y la nómina dejó $0.
  assert.equal(diagnosticar(ajm('1071767', -102154, 0, 4518688, 899731), ayudas()).causa, 'ajuste_no_reintegrado');
  // 1073370: $85.41 contra $65.09 = $20.32 del subsidio mensual.
  assert.equal(diagnosticar(ajm('1073370', 8541, 6509, 900776, 0), ayudas()).causa, 'subsidio_1559');
  // 1077880: $11.75 a cargo; con el subsidio de la nómina sale a favor y la nómina dejó $0.
  assert.equal(diagnosticar(ajm('1077880', 1175, 0, 914196, 8826), ayudas()).causa, 'subsidio_1559+ajuste_no_reintegrado');
  // 1068082: fondo de ahorro de las cuatro semanas del mes ($2,227.68).
  const f = Object.fromEntries(['SEM35', 'SEM36', 'SEM37', 'SEM38'].map(c => ['1068082|' + c, fondo(55692)]));
  const dx = diagnosticar(ajm('1068082', 215662, 163267, 4582323, 596882), ayudas(f));
  assert.deepEqual([dx.causa, dx.recalculo_c], ['fondo_ahorro_exento', 163267]);
  // El fondo de las catorcenas no entra al ajuste semanal.
  assert.equal(diagnosticar(ajm('1068082', 215662, 163267, 4582323, 596882), ayudas({ '1068082|CAT19': fondo(222768) })).causa, 'sin_identificar');
});

test('lo que no se reproduce no se atribuye: sin causa, dato faltante, o ejecución que ya no se puede recalcular', () => {
  assert.equal(diagnosticar(sem('1', 'SEM35', 136276, 100000, 839066), ayudas({ '1|SEM35': fondo(44484) })).causa, 'sin_identificar');
  const lim = sem('2', 'SEM35', 136276, 100000, 839066, { limitado: true });
  lim.traza.limitaciones = [{ motivo: 'base_limitada', detalle: 'dato_faltante: prima_vacacional: acumulado anual de exenciones (prima_vacacional)' }];
  assert.equal(diagnosticar(lim, ayudas()).causa, 'alcance');
  // El sello dice 136276 pero con los parámetros de hoy sale otra cosa: no se prueba ninguna hipótesis.
  const viejo = diagnosticar(sem('3', 'SEM35', 999999, 126241, 839066), ayudas({ '3|SEM35': fondo(44484) }));
  assert.equal(viejo.causa, 'sin_identificar');
  assert.match(viejo.detalle, /vuelve a calcular/);
  // Corrida fuera del calendario: tampoco.
  assert.equal(diagnosticar(sem('4', 'SEM99', 136276, 126241, 839066), ayudas()).causa, 'sin_identificar');
});

test('ISN: menor o mayor que el de ley, con la tasa efectiva de la nómina', () => {
  const isn = (k, c) => ({ regla_id: 'CALC-ISN-001', colaborador_id: 'H6832552101', corrida_id: 'MES2026-09', kernel_c: k, cliente_c: c, limitado: true,
    traza: { entidad: 'JAL', base_c: 500000000, tasa_pct: '3', adicionales_c: 0, limitaciones: [{ motivo: 'parametro_nivel_C', detalle: 'x' }] } });
  const m = diagnosticar(isn(15000000, 10000000), ayudas());
  assert.equal(m.causa, 'isn_menor');
  assert.match(m.detalle, /JAL: tasa de ley 3 %; la nómina trae 2\.00 % de la base/);
  assert.equal(diagnosticar(isn(15000000, 16000000), ayudas()).causa, 'isn_mayor');
  assert.equal(describirCausa('isn_menor', prime).de, 'nomina');
});

test('domingos: una nómina semanal sólo tiene un domingo; en la catorcena no se supone', () => {
  assert.equal(domingosEnPeriodo('2026-08-24', '2026-08-30'), 1);
  assert.equal(domingosEnPeriodo('2026-08-20', '2026-09-02'), 2);
  assert.equal(domingosDe({ sd_c: 54316 }, 13580, { desde: '2026-08-24', hasta: '2026-08-30' }).domingos, 1);
  assert.equal(domingosDe({ sd_c: 54316 }, 13580, { desde: '2026-08-20', hasta: '2026-09-02' }).domingos, null);
  assert.equal(domingosDe({}, 9663, { desde: '2026-08-24', hasta: '2026-08-30' }).domingos, 1, 'sin salario diario también');
  assert.equal(domingosDe({ sd_c: 54316 }, 0, { desde: '2026-08-24', hasta: '2026-08-30' }).domingos, null);
});

// ── De punta a punta con un acumulado de septiembre en formato PRIME ──
const ENC = ['SEMANA / CATORCENA', 'NO.', 'Empleado', 'RFC', 'Puesto', 'SD', 'SBC', 'Registro patronal', 'FECHA DE INGRESO', 'Dias trabajados',
  'Sueldo', 'Indemnizacio', 'Bono', 'Fondo ahorro empresa', 'Comisiones', 'Prima dominical', 'TOTAL PERCEPCIONES',
  'I.S.R. (sp)', 'ISR AJUSTE', 'ISR FINIQUITO', 'TOTAL DEDUCCIONES', 'NETO SUELDO FISCAL', 'Imss', 'RCV', 'Infonavit empresa', 'Impuesto estatal'];
const I = Object.fromEntries(ENC.map((h, i) => [h, i]));
function fila(o) {
  const f = new Array(ENC.length).fill(null);
  f[0] = o.corrida; f[1] = o.emp; f[2] = 'Colaborador ' + o.emp; f[3] = 'XAXX010101' + String(o.emp).slice(-3); f[5] = o.sd ?? 400; f[6] = 615.88; f[7] = o.rp ?? 'D1424021106'; f[8] = 45000; f[9] = 7;
  let total = 0;
  for (const [h, v] of Object.entries(o.perc || {})) { f[I[h]] = v; total = Math.round((total + v) * 100) / 100; }
  f[I['TOTAL PERCEPCIONES']] = total; f[I['I.S.R. (sp)']] = o.isr ?? 0; f[I['Impuesto estatal']] = o.isn ?? 0; f[I['NETO SUELDO FISCAL']] = Math.round((total - (o.isr ?? 0)) * 100) / 100;
  return f;
}
const FILAS = [
  ['PRIMEWIRELESS HOLDINGS S DE RL DE CV'], ['ACUMULADO DE NÓMINA SEPTIEMBRE 2026'], [], ENC,
  // 123: tres catorcenas de $13,006 y bono «BONOS CAT SEPTIEMBRE» de $17,185 (ISR $2,820.46). La nómina ajusta con el bono: $3,959.62.
  fila({ corrida: 'CAT 18', emp: 123, perc: { Sueldo: 13006 }, isr: 1908.45, isn: 260.12 }),
  fila({ corrida: 'CAT 19', emp: 123, perc: { Sueldo: 13006 }, isr: 1908.45, isn: 260.12 }),
  fila({ corrida: 'CAT 20', emp: 123, perc: { Sueldo: 13006 }, isr: 3959.62, isn: 260.12 }),
  fila({ corrida: 'BONOS CAT SEPTIEMBRE', emp: 123, perc: { Bono: 17185 }, isr: 2820.46, isn: 5954.60 }),
  // 1078038: bono «BONO» a secas de un semanal ($15,110.46; ISR $1,422.61). La nómina ajusta con el bono: $2,088.80.
  fila({ corrida: 'SEM 35', emp: 1078038, perc: { Sueldo: 13108.90 }, isr: 3496.16 }),
  fila({ corrida: 'SEM 36', emp: 1078038, perc: { Sueldo: 13108.90 }, isr: 3496.16 }),
  fila({ corrida: 'SEM 37', emp: 1078038, perc: { Sueldo: 13108.90 }, isr: 3496.17 }),
  fila({ corrida: 'SEM 38', emp: 1078038, perc: { Sueldo: 13108.90 }, isr: 2088.80 }),
  fila({ corrida: 'BONO', emp: 1078038, perc: { Bono: 15110.46 }, isr: 1422.61 }),
  // 175: bono con nombre propio; la nómina no lo suma al ajuste (CAT 20 cuadra sin él) y su «Impuesto estatal» trae 35 %.
  fila({ corrida: 'CAT 18', emp: 175, perc: { Sueldo: 20000 }, isr: 3664.13, isn: 400 }),
  fila({ corrida: 'CAT 19', emp: 175, perc: { Sueldo: 20000 }, isr: 3664.13, isn: 400 }),
  fila({ corrida: 'CAT 20', emp: 175, perc: { Sueldo: 20000 }, isr: 0, isn: 400 }),
  fila({ corrida: 'BONO ESPELETA', emp: 175, perc: { Bono: 1000000 }, isr: 100000, isn: 350000 }),
  // 393310 SEM 35: fondo de ahorro que la nómina no grava (caso del encargado).
  fila({ corrida: 'SEM 35', emp: 393310, sd: 488.84, perc: { Sueldo: 3421.88, 'Fondo ahorro empresa': 444.84, Comisiones: 4519.04, 'Prima dominical': 122.21 }, isr: 1262.41 }),
  // 1068176 SEM 35: prima dominical que no es 25 % exacto del salario diario; la semana sólo tiene un domingo.
  fila({ corrida: 'SEM 35', emp: 1068176, sd: 400, perc: { Sueldo: 4533.07, 'Prima dominical': 96.63 }, isr: 533.45 }),
  // Finiquito con la columna recortada «Indemnizacio».
  fila({ corrida: 'FINIQUITOS', emp: 9001, perc: { Sueldo: 1000, Indemnizacio: 50000 }, isr: 800, isn: 1020 }),
];
const CALENDARIO = [['CAT18', 'catorcenal', '2026-08-20', '2026-09-02', '2026-09-02'], ['SEM35', 'semanal', '2026-08-24', '2026-08-30', '2026-09-04'], ['SEM36', 'semanal', '2026-08-31', '2026-09-06', '2026-09-11'],
  ['CAT19', 'catorcenal', '2026-09-03', '2026-09-16', '2026-09-16'], ['SEM37', 'semanal', '2026-09-07', '2026-09-13', '2026-09-18'], ['SEM38', 'semanal', '2026-09-14', '2026-09-20', '2026-09-25'],
  ['CAT20', 'catorcenal', '2026-09-17', '2026-09-30', '2026-09-30']];

async function preparar() {
  const db = baseDatos();
  const DOCS = r2Local();
  db.raw.exec("INSERT INTO empresas (id, nombre, slug) VALUES (1, 'PRIMEWIRELESS', 'prime'), (2, 'OTRA', 'otra')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id, perfil) VALUES (2,'rev@hrm','x','Revisor','admin',NULL,NULL), (5,'carga@prime','x','Carga PRIME','socio',1,'carga'), (6,'carga@otra','x','Carga OTRA','socio',2,'carga')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES " +
    "('enc_sep', 1, 'B5+', '2026-09-01', '2026-09-30', 2026, 'cliente', 1), ('enc_ago', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 1)");
  for (const c of CALENDARIO) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_sep',?,?,?,?,?,1,'prueba')").run(...c);
  db.raw.exec("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_ago','SEM31','semanal','2026-07-27','2026-08-02','2026-08-07',1,'prueba'), ('enc_ago','SEM32','semanal','2026-08-03','2026-08-09','2026-08-14',1,'prueba')");
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, fuente) VALUES (1, 'D1424021106', 'MOR', 'prueba')");
  await DOCS.put('sep/acumulado.xlsx', xlsx([{ nombre: 'Hoja1', filas: FILAS }]));
  const sesiones = new Map([['t_admin', { id: 2, email: 'rev@hrm', nombre: 'Revisor', rol: 'admin' }], ['t_carga', { id: 5, email: 'carga@prime', nombre: 'Carga PRIME', rol: 'socio', perfil: 'carga', empresa_id: 1 }],
    ['t_otra', { id: 6, email: 'carga@otra', nombre: 'Carga OTRA', rol: 'socio', perfil: 'carga', empresa_id: 2 }]]);
  const env = { DB: db, DOCS, SESSIONS: { get: async (t) => sesiones.has(t) ? JSON.stringify(sesiones.get(t)) : null, put: async () => {}, delete: async () => {} } };
  const pedir = async (tk, m, ruta, cuerpo) => {
    const init = { method: m, headers: { Authorization: 'Bearer ' + tk } };
    if (cuerpo) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(cuerpo); }
    const r = await worker.fetch(new Request('https://clientes-hrm.com' + ruta, init), env, { waitUntil() {} });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  return { db, DOCS, env, pedir };
}
async function correr(env, encargo_id = 'enc_sep') {
  const id = await crearIngesta(env, { encargo_id, r2_key: 'sep/acumulado.xlsx' });
  let r;
  for (let i = 0; i < 10; i++) { r = await avanzar(env, { ingesta_id: id }); if (['terminado', 'error'].includes(r.estado)) break; }
  return { id, estado: r.estado, st: await estadoIngesta(env.DB, id) };
}

test('septiembre PRIME: «BONOS CAT SEPTIEMBRE» y «BONO» entran al ajuste; «BONO ESPELETA» no y se declara', async () => {
  const { db, env } = await preparar();
  const { estado, st } = await correr(env);
  assert.equal(estado, 'terminado', st.error || '');
  const m = st.reporte.mensual;
  assert.equal(m.ajm_con_extras, 2);
  assert.deepEqual(m.ajm_bonos_fuera, { BONO_ESPELETA: 1 });
  const { results } = await db.prepare("SELECT colaborador_id, corrida_id, valor_calculado_c, traza_json FROM calculo_kernel WHERE regla_id = 'CALC-ISR-AJM-001' ORDER BY colaborador_id").all();
  const por = Object.fromEntries(results.map(x => [x.colaborador_id, x]));
  assert.equal(por['123'].valor_calculado_c, 395962, 'ISR del mes sobre 3 × 13,006 + 17,185 menos lo retenido y el ISR del bono = nómina');
  assert.equal(por['1078038'].valor_calculado_c, 208880, 'el bono a secas toma la periodicidad semanal del colaborador');
  assert.deepEqual(JSON.parse(por['1078038'].traza_json).origen.extras, ['BONO fila 13']);
  assert.equal(JSON.parse(por['175'].traza_json).nominas_en_mes, 3, 'el bono con nombre propio no entra');
  const { results: difs } = await db.prepare("SELECT colaborador_id FROM v_diferencia WHERE encargo_id = 'enc_sep' AND regla_id = 'CALC-ISR-AJM-001' AND colaborador_id IN ('123', '1078038')").all();
  assert.deepEqual(difs, []);
});

test('septiembre PRIME: el «Impuesto estatal» de un bono (35 %) no es ISN: no se suma, se declara y limita el registro', async () => {
  const { db, env } = await preparar();
  const { st } = await correr(env);
  assert.deepEqual(st.reporte.mensual.isn_fuera_de_rango, { renglones: 2, suma_c: 595460 + 35000000, por_corrida: { BONOS_CAT_SEPTIEMBRE: 1, BONO_ESPELETA: 1 } });
  const mov = await db.prepare("SELECT valor_c FROM movimiento_nomina WHERE rubro = 'isn' AND colaborador_id = 'D1424021106'").first();
  assert.equal(mov.valor_c, 3 * 26012 + 3 * 40000 + 102000, 'nóminas y finiquito sí; los dos bonos no');
  const isn = JSON.parse((await db.prepare("SELECT traza_json FROM calculo_kernel WHERE regla_id = 'CALC-ISN-001'").first()).traza_json);
  assert.ok(isn.limitaciones.some(l => l.motivo === 'isn_nomina_fuera_de_rango'));
  assert.deepEqual(isn.origen.isn_nomina_fuera_de_rango, { renglones: 2, suma_c: 35595460 });
  // «Indemnizacio» (encabezado recortado) es la indemnización: ya entra a la base del registro.
  assert.ok(isn.conceptos.some(c => c.concepto === 'indemnizacion' && c.monto_c === 5000000));
  assert.ok(!st.reporte.mapa.no_catalogados.includes('Indemnizacio'));
});

test('septiembre PRIME: prima dominical de una semana se exenta con su único domingo y ya no limita el cálculo', async () => {
  const { db, env } = await preparar();
  await correr(env);
  const c = await db.prepare("SELECT valor_calculado_c, limitado FROM calculo_kernel WHERE regla_id = 'CALC-ISR-SEM-001' AND colaborador_id = '1068176'").first();
  assert.deepEqual([c.valor_calculado_c, c.limitado], [53345, 0]);
  const exe = JSON.parse((await db.prepare("SELECT traza_json FROM calculo_kernel WHERE regla_id = 'CALC-EXE-001' AND colaborador_id = '1068176'").first()).traza_json);
  assert.match(exe.origen.domingos.origen, /sólo tiene un domingo/);
  const dif = await db.prepare("SELECT 1 AS x FROM v_diferencia WHERE encargo_id = 'enc_sep' AND colaborador_id = '1068176'").first();
  assert.equal(dif, null);
});

test('causas por la API: resumen de lo validado, grupos por causa y explicación paso a paso; el perfil carga sólo lee lo suyo', async () => {
  const { env, pedir } = await preparar();
  const { st } = await correr(env);
  const q = '?encargo_id=enc_sep&ejecucion_id=' + st.ejecucion_id;
  const r = await pedir('t_carga', 'GET', '/api/kernel/diferencias/causas' + q);
  assert.equal(r.status, 200);
  const res = Object.fromEntries(r.j.resumen.map(x => [x.regla_id, x]));
  assert.deepEqual([res['CALC-ISR-AJM-001'].calculos, res['CALC-ISR-AJM-001'].coinciden], [3, 2]);
  assert.equal(res['CALC-ISR-SEM-001'].coinciden + res['CALC-ISR-SEM-001'].diferencias, res['CALC-ISR-SEM-001'].calculos);
  const caso = r.j.casos.find(c => c.colaborador_id === '393310');
  assert.deepEqual([caso.causa, caso.diferencia_c, caso.recalculo_c], ['fondo_ahorro_exento', -10035, 126241]);
  const g = r.j.causas.find(c => c.causa === 'fondo_ahorro_exento');
  assert.deepEqual([g.de, g.n, g.suma_c, g.titulo], ['criterio', 1, -10035, 'Fondo de ahorro tratado como exento']);
  assert.ok(r.j.causas.some(c => c.causa === 'isn_menor' || c.causa === 'isn_mayor'));
  assert.deepEqual(r.j.sin_calculo, { BONOS_CAT_SEPTIEMBRE: 1, BONO: 1, BONO_ESPELETA: 1, FINIQUITOS: 1 });
  assert.deepEqual(r.j.avisos.ajm_bonos_fuera, { BONO_ESPELETA: 1 });

  const e = await pedir('t_carga', 'GET', '/api/kernel/diferencias/explicar?encargo_id=enc_sep&diferencia_id=' + caso.id);
  assert.equal(e.status, 200);
  const pasos = e.j.explicacion.pasos;
  assert.deepEqual(pasos.find(p => p.t === 'Base gravable').c, 839066);
  assert.ok(pasos.some(p => p.t === 'Fondo de ahorro (empresa)' && p.v === 'No cumple requisitos: se grava'));
  assert.deepEqual(pasos.filter(p => p.fuerte).map(p => p.c), [839066, 136276, 126241, -10035]);
  assert.match(pasos.at(-1).v, /Recalculado así da \$1,262\.41/);
  // Ajuste mensual: las bases de las tres catorcenas y el bono que entró.
  const a175 = r.j.casos.find(c => c.colaborador_id === '175' && c.regla_id === 'CALC-ISR-AJM-001');
  const ea = await pedir('t_admin', 'GET', '/api/kernel/diferencias/explicar?encargo_id=enc_sep&diferencia_id=' + a175.id);
  assert.deepEqual(ea.j.explicacion.pasos.filter(p => /^Base gravable CAT/.test(p.t)).map(p => p.t), ['Base gravable CAT18', 'Base gravable CAT19', 'Base gravable CAT20']);

  // Alcance: otra empresa no ve nada; una ejecución o diferencia de otro encargo no se cruza.
  assert.equal((await pedir('t_otra', 'GET', '/api/kernel/diferencias/causas' + q)).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/diferencias/causas?encargo_id=enc_ago&ejecucion_id=' + st.ejecucion_id)).status, 404);
  assert.equal((await pedir('t_carga', 'GET', '/api/kernel/diferencias/explicar?encargo_id=enc_ago&diferencia_id=' + caso.id)).status, 404);
  // Clasificar por causa es de HRM.
  const b = { encargo_id: 'enc_sep', ejecucion_id: st.ejecucion_id, causa: 'fondo_ahorro_exento', cubeta: 'criterio_sin_resolver', criterio_id: 'C3', motivo: 'Fondo de ahorro exento (hallazgo 5)' };
  assert.equal((await pedir('t_carga', 'POST', '/api/kernel/clasificar-grupo', b)).status, 403);
  const cl = await pedir('t_admin', 'POST', '/api/kernel/clasificar-grupo', b);
  assert.deepEqual([cl.status, cl.j.clasificadas], [200, 1]);
  const r2 = await pedir('t_admin', 'GET', '/api/kernel/diferencias/causas' + q);
  assert.equal(r2.j.casos.find(c => c.id === caso.id).cubeta, 'criterio_sin_resolver');
  assert.equal(r2.j.sin_clasificar, r.j.sin_clasificar - 1);
});

test('archivo de otro mes: no se calcula y dice por qué; un archivo ya leído así no vuelve a «terminado»', async () => {
  const { db, env } = await preparar();
  const { estado, st } = await correr(env, 'enc_ago');
  assert.equal(estado, 'error');
  assert.match(st.error, /no es de este mes: trae CAT18, CAT19, CAT20, SEM35, SEM36, SEM37, SEM38 y el encargo de 2026-08 tiene SEM31, SEM32/);
  assert.equal(st.ejecucion_id, null, 'no abre ejecución');
  assert.equal(db.raw.prepare('SELECT count(*) n FROM calculo_kernel').get().n, 0);
  // Sin calendario capturado no se puede saber: se lee como antes.
  assert.equal(archivoDeOtroMes({ SEM35: 10 }, new Map(), prime, {}), null);
  // Sólo pagos extra (finiquitos) en un mes con calendario: tampoco se rechaza.
  assert.equal(archivoDeOtroMes({ FINIQUITOS: 3 }, new Map([['SEM31', { ordinaria: true }]]), prime, {}), null);
  assert.equal(archivoDeOtroMes({ SEM31: 3, SEM35: 1 }, new Map([['SEM31', { ordinaria: true }]]), prime, {}), null);
});

test('volver a calcular: otra ingesta del mismo archivo, otra ejecución; la anterior queda como estaba', async () => {
  const { db, env, pedir } = await preparar();
  const a = await correr(env);
  const r = await pedir('t_carga', 'POST', '/api/kernel/ingesta/recalcular', { id: a.id });
  assert.equal(r.status, 201);
  assert.notEqual(r.j.id, a.id);
  // La ruta ya arrancó la lectura (waitUntil): se espera a que termine, avanzando si hace falta.
  for (let i = 0; i < 200; i++) {
    const e = await avanzar(env, { ingesta_id: r.j.id });
    if (['terminado', 'error'].includes(e.estado)) break;
    await new Promise(ok => setTimeout(ok, 10));
  }
  const b = await estadoIngesta(db, r.j.id);
  assert.equal(b.estado, 'terminado', b.error || '');
  assert.notEqual(b.ejecucion_id, a.st.ejecucion_id);
  assert.equal(b.archivo_sha256, a.st.archivo_sha256);
  assert.equal((await estadoIngesta(db, a.id)).estado, 'terminado');
  await assert.rejects(recalcular(env, 'ing_no_existe', 2), /no existe/);
  assert.equal((await pedir('t_otra', 'POST', '/api/kernel/ingesta/recalcular', { id: a.id })).status, 404);
});
