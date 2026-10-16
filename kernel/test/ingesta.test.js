// Ingesta de punta a punta (T8 + T1 nivel 3) con un archivo en formato PRIME armado con los
// casos reales de la Revisión v0.3 (agosto 2026). Por número de empleado, sin nombres (N7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local, xlsx } from './util.js';
import { crearIngesta, avanzar, estadoIngesta, reintentar, RENGLONES_POR_LOTE } from '../../ingesta/trabajos.js';
import { abrirLibro, fuenteBuffer } from '../../ingesta/xlsx.js';
import { aCentavos, construirMapa, clasificarCorrida } from '../../ingesta/canonico.js';
import { domingosDe } from '../../ingesta/items.js';
import { leerEjecucion } from '../src/d1.js';
import { verificarSello } from '../src/index.js';
import prime from '../../ingesta/perfiles/prime.js';

const ENC = ['SEMANA / CATORCENA', 'NO.', 'Empleado', 'RFC', 'Puesto', 'SD', 'SBC', 'Registro patronal', 'FECHA DE INGRESO', 'Dias trabajados', 'Faltas',
  'Vacaciones', 'Incapacidades', 'Sueldo', 'Despensa(Informativo)', 'Vacaciones', 'Prima vacacional', 'Aguinaldo', 'Indemnización', 'Prima de antigüedad',
  'Bono', 'Fondo ahorro empresa', 'Comisiones', 'Prima dominical', 'incentivos (MONTO)', 'Premio Especial', 'Subsidio al Empleo (sp)', 'TOTAL PERCEPCIONES',
  'I.S.R. (sp)', 'ISR AJUSTE', 'ISR FINIQUITO', 'I.M.S.S.', 'rcv (MONTO)', 'TOTAL DEDUCCIONES', 'NETO SUELDO FISCAL', 'Imss', 'RCV', 'Infonavit empresa', 'Impuesto estatal'];
const I = Object.fromEntries(ENC.map((h, i) => [h, i])); // primera ocurrencia
const VAC_MONTO = 15;

function fila(o) {
  const f = new Array(ENC.length).fill(null);
  f[0] = o.corrida; f[1] = o.emp; f[2] = 'Colaborador ' + o.emp; f[3] = 'XAXX010101' + String(o.emp).slice(-3); f[4] = 'EJECUTIVO DE VENTAS';
  f[5] = o.sd ?? 400; f[6] = o.sbc ?? 615.88; f[7] = o.rp ?? 'Y6079749104'; f[8] = 45000; f[9] = 7;
  let total = 0;
  for (const [h, v] of Object.entries(o.perc || {})) { f[h === 'VacMonto' ? VAC_MONTO : I[h]] = v; total = Math.round((total + v) * 100) / 100; }
  f[I['TOTAL PERCEPCIONES']] = o.total ?? total;
  f[I['I.S.R. (sp)']] = o.isr ?? 0;
  if (o.isrFin) f[I['ISR FINIQUITO']] = o.isrFin;
  f[I['Impuesto estatal']] = o.isn ?? 0;
  return f;
}

const FILAS = [
  ['PRIMEWIRELESS HOLDINGS S DE RL DE CV'], ['ACUMULADO DE NÓMINA AGOSTO 2026'], [],
  ENC,
  // ISR semanal ordinario: base 7,760.68 → 1,222.87 (= nómina). Prima dominical 78.81 de un domingo (SD 315.24).
  fila({ corrida: 'SEM 31', emp: 1067513, sd: 315.24, perc: { Sueldo: 2206.68, Comisiones: 5486, 'incentivos (MONTO)': 68, 'Prima dominical': 78.81 }, isr: 1222.87, isn: 100 }),
  // Subsidio: la nómina aplicó 15.59% → 29.42; la ley da 34.10 (hallazgo 1).
  fila({ corrida: 'SEM 31', emp: 1073134, perc: { Sueldo: 2206.68 }, isr: 29.42, isn: 50 }),
  // Prima dominical 135.79 (SD 543.16) → 117.31 exentos; base 8,483.53 → 1,384.60 (= nómina).
  fila({ corrida: 'SEM 31', emp: 390062, sd: 543.16, perc: { Sueldo: 8465.05, 'Prima dominical': 135.79 }, isr: 1384.60, isn: 75 }),
  // Finiquito: sin regla en v1 → limitado.
  fila({ corrida: 'SEM 31', emp: 555001, perc: { Sueldo: 1000, 'Indemnización': 30000 }, isr: 100, isrFin: 2500 }),
  // Concepto no catalogado dentro del bloque de percepciones → limitado.
  fila({ corrida: 'SEM 31', emp: 555002, perc: { Sueldo: 3000, 'Premio Especial': 500 }, isr: 250 }),
  // Catorcenal: C1 da 2,207.47; la nómina 2,207.49 (criterio C1).
  fila({ corrida: 'CAT 16', emp: 191, perc: { Sueldo: 14406 }, isr: 2207.49, isn: 400 }),
  // Ajuste mensual en la última catorcena: 2,058.41 (= nómina).
  fila({ corrida: 'CAT 17', emp: 191, perc: { Sueldo: 14406 }, isr: 2058.41, isn: 400 }),
  // Pago extra en corrida aparte: 19,695.34 → 4,466.24 (= nómina).
  fila({ corrida: 'BONO SEM 32', emp: 1071756, perc: { Bono: 19695.34 }, isr: 4466.24 }),
  // Corrida sin calendario → excluida y declarada.
  fila({ corrida: 'SEM 30', emp: 1067513, perc: { Sueldo: 2206.68 }, isr: 100 }),
  ['TOTAL', null, null, null, null, null, null, null, null, null, null, null, null, 99999],
];

async function preparar() {
  const db = baseDatos();
  const DOCS = r2Local();
  const env = { DB: db, DOCS };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug) VALUES (1, 'PRIMEWIRELESS', 'prime')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_ago', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 1)");
  const cal = [['SEM31', 'semanal', '2026-07-27', '2026-08-02', '2026-08-06', 1], ['SEM32', 'semanal', '2026-08-03', '2026-08-09', '2026-08-13', 1],
    ['SEM33', 'semanal', '2026-08-10', '2026-08-16', '2026-08-20', 1], ['SEM34', 'semanal', '2026-08-17', '2026-08-23', '2026-08-27', 1],
    ['CAT16', 'catorcenal', '2026-07-27', '2026-08-09', '2026-08-14', 1], ['CAT17', 'catorcenal', '2026-08-10', '2026-08-23', '2026-08-28', 1],
    ['BONO_SEM_32', 'semanal', '2026-08-03', '2026-08-09', '2026-08-13', 0]];
  for (const c of cal) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_ago',?,?,?,?,?,?,'prueba')").run(...c);
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, fuente) VALUES (1, 'Y6079749104', 'CDMX', 'prueba')");
  const bytes = xlsx([{ nombre: 'Resumen', filas: [['x']] }, { nombre: 'Hoja1', filas: FILAS }]);
  await DOCS.put('empresa-1/agosto/acumulado.xlsx', bytes);
  return { db, DOCS, env };
}

test('importes de Excel a centavos exactos, sin float', () => {
  assert.equal(aCentavos('7760.6800000000003'), 776068);
  assert.equal(aCentavos('1.5E-2'), 2);
  assert.equal(aCentavos('$1,234.50'), 123450);
  assert.equal(aCentavos('(12.005)'), -1200);
  assert.equal(aCentavos(''), 0);
  assert.throws(() => aCentavos('doce'), /inválido/);
});

test('perfil PRIME: corridas, «Vacaciones» duplicada, conceptos no catalogados', () => {
  assert.deepEqual(clasificarCorrida('SEM 31', prime), { corrida_id: 'SEM31', periodicidad: 'semanal', ordinaria: true });
  assert.deepEqual(clasificarCorrida('Catorcena 016', prime), { corrida_id: 'CAT16', periodicidad: 'catorcenal', ordinaria: true });
  assert.equal(clasificarCorrida('BONO SEM 32', prime).ordinaria, false);
  const m = construirMapa(ENC, prime);
  assert.deepEqual(m.faltantes, []);
  assert.equal(m.conceptos.find(c => c.encabezado === 'Vacaciones').j, VAC_MONTO);
  assert.deepEqual(m.no_catalogados.map(c => c.encabezado), ['Premio Especial']);
  assert.equal(m.movimientos.isr.length, 2);
});

test('domingos: columna explícita o prima = domingos × 25% SD exacto; si no, no se deduce', () => {
  assert.deepEqual(domingosDe({ sd_c: 54316 }, 13579), { domingos: 1, origen: 'derivado: prima ÷ (25% × SD)' });
  assert.equal(domingosDe({ sd_c: 54316 }, 13580).domingos, null);
  assert.equal(domingosDe({ domingos: 2 }, 1).domingos, 2);
});

test('ingesta completa: parsea, calcula por lotes, ajusta el mes, sella y reconcilia con cubetas', async () => {
  const { db, env } = await preparar();
  const id = await crearIngesta(env, { encargo_id: 'enc_ago', r2_key: 'empresa-1/agosto/acumulado.xlsx' });
  let r;
  for (let i = 0; i < 10; i++) { r = await avanzar(env, { ingesta_id: id }); if (['terminado', 'error'].includes(r.estado)) break; }
  const st = await estadoIngesta(db, id);
  assert.equal(r.estado, 'terminado', st.error || '');
  const rep = st.reporte;
  assert.equal(rep.hoja, 'Hoja1', 'elige la hoja más grande');
  assert.equal(rep.fila_encabezado, 4);
  assert.equal(rep.renglones, 9);
  assert.deepEqual(rep.sin_calendario, { SEM30: 1 });
  assert.equal(rep.fuentes.prenomina.estado, 'incompleta');
  assert.equal(rep.fuentes.catalogo_conceptos_cliente.estado, 'incompleta');
  assert.deepEqual(rep.mapa.no_catalogados, ['Premio Especial']);

  // Resultados por regla (T3): nada «completo» con fuentes incompletas o renglones limitados.
  const res = Object.fromEntries(rep.resultados.map(x => [x.regla_id, x]));
  assert.equal(res['CALC-ISR-SEM-001'].estado, 'universo_parcial');
  assert.equal(res['CALC-ISN-001'].estado, 'limitacion_alcance', 'cuadro ISN sin fundamento (V8) → nunca conforme');
  assert.deepEqual([res['CALC-EXE-001'].esperado, res['CALC-EXE-001'].efectivo], [9, 8], 'el renglón sin calendario cuenta como no calculado');
  assert.equal(res['CALC-ISR-AJM-001'].esperado, 1);

  // Reconciliación (T1 nivel 3)
  if (process.env.VER) console.log(JSON.stringify({resultados: rep.resultados, reconciliacion: rep.reconciliacion, mensual: rep.mensual}, null, 1));
  const rc = rep.reconciliacion;
  assert.equal(rc.coincidencias, 4, '1067513, 390062, 191 ajuste mensual, bono 1071756');
  const { results: difs } = await db.prepare("SELECT colaborador_id, corrida_id, rubro, kernel_c, cliente_c, diferencia_c, regla_id FROM v_diferencia WHERE encargo_id = 'enc_ago' ORDER BY colaborador_id").all();
  const porEmp = Object.fromEntries(difs.map(d => [d.colaborador_id + '/' + d.corrida_id, d]));
  assert.equal(porEmp['1073134/SEM31'].diferencia_c, -468, 'hallazgo 1: subsidio 15.59%');
  assert.equal(porEmp['191/CAT16'].diferencia_c, 2, 'C1: método catorcenal');
  assert.ok(porEmp['555001/SEM31'], 'el finiquito se compara pero queda limitado');
  assert.ok(rc.limitados >= 2);
  assert.equal(rc.sin_par_kernel, 0);

  // Sello: la ejecución quedó sellada y verifica al releerla.
  const e = await leerEjecucion(db, st.ejecucion_id);
  assert.equal(e.estado, 'sellada');
  assert.equal(await verificarSello(e), true);
  assert.equal(e.ejecucion.entradas_sha256.prenomina, st.archivo_sha256);
});

test('idempotencia: repetir los pasos no duplica cálculos, movimientos ni diferencias', async () => {
  const { db, env } = await preparar();
  const id = await crearIngesta(env, { encargo_id: 'enc_ago', r2_key: 'empresa-1/agosto/acumulado.xlsx' });
  for (let i = 0; i < 10; i++) { const r = await avanzar(env, { ingesta_id: id }); if (r.estado === 'terminado') break; }
  const cuenta = () => ['calculo_kernel', 'movimiento_nomina', 'diferencia', 'ejecucion_lote'].map(t => db.raw.prepare('SELECT count(*) n FROM ' + t).get().n);
  const antes = cuenta();
  // Forzar repetición de la fase de cierre/reconciliación.
  db.raw.exec("UPDATE ingesta SET estado = 'cerrando' WHERE id = '" + id + "'");
  await avanzar(env, { ingesta_id: id });
  assert.deepEqual(cuenta(), antes);
});

test('error visible y reintento: archivo sin el encabezado del perfil', async () => {
  const { db, env, DOCS } = await preparar();
  await DOCS.put('x.xlsx', xlsx([{ nombre: 'H', filas: [['a', 'b'], [1, 2]] }]));
  const id = await crearIngesta(env, { encargo_id: 'enc_ago', r2_key: 'x.xlsx' });
  const r = await avanzar(env, { ingesta_id: id });
  assert.equal(r.estado, 'error');
  assert.match((await estadoIngesta(db, id)).error, /encabezado/);
  assert.equal(await reintentar(db, id), 'pendiente');
});

test('lotes: un archivo de 600 renglones se parte en lotes y el sello cubre todos', async () => {
  const { db, env, DOCS } = await preparar();
  const muchas = [ENC];
  for (let i = 0; i < 600; i++) muchas.push(fila({ corrida: 'SEM 31', emp: 2000000 + i, perc: { Sueldo: 2500 + i }, isr: 0 }));
  await DOCS.put('grande.xlsx', xlsx([{ nombre: 'Hoja1', filas: muchas }]));
  const id = await crearIngesta(env, { encargo_id: 'enc_ago', r2_key: 'grande.xlsx' });
  let r;
  for (let i = 0; i < 20; i++) { r = await avanzar(env, { ingesta_id: id }); if (r.estado === 'terminado') break; }
  const st = await estadoIngesta(db, id);
  assert.equal(st.lotes_total, Math.ceil(600 / RENGLONES_POR_LOTE));
  assert.equal(st.avance, 100);
  const e = await leerEjecucion(db, st.ejecucion_id);
  assert.equal(e.ejecucion.n_lotes, st.lotes_total + 1, 'lotes de renglones + lote mensual');
  assert.equal(await verificarSello(e), true);
});

test('el lector XLSX ignora <rowBreaks> y respeta celdas vacías por referencia', async () => {
  const lib = await abrirLibro(fuenteBuffer(xlsx([{ nombre: 'A', filas: [['x', null, 'z'], [1]] }])));
  const filas = [];
  await lib.recorrer('A', (f) => filas.push(f));
  assert.equal(filas.length, 2);
  assert.equal(filas[0][2], 'z');
  assert.equal(filas[0][1], undefined);
});

test('dos ingestas del mismo archivo en el mismo encargo se reconcilian cada una con sus movimientos', async () => {
  const { db, env } = await preparar();
  const ids = [];
  for (let k = 0; k < 2; k++) {
    const id = await crearIngesta(env, { encargo_id: 'enc_ago', r2_key: 'empresa-1/agosto/acumulado.xlsx' });
    for (let i = 0; i < 10; i++) { const r = await avanzar(env, { ingesta_id: id }); if (r.estado === 'terminado') break; }
    ids.push(id);
  }
  const [a, b] = await Promise.all(ids.map(id => estadoIngesta(db, id)));
  assert.equal(a.reporte.reconciliacion.coincidencias, 4);
  assert.deepEqual(b.reporte.reconciliacion, a.reporte.reconciliacion);
});
