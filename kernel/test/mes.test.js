// Detección del mes de un documento (carga automática por mes, 0019).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesesEnTexto, mesDeFechas, decidirMes, senalesLibro, senalFechas, fechasMetadata, hojasLibro, textosLibro, tipoLibro, atributoXml, anioProbable, limitesMes, FUNCIONES_MES } from '../../ingesta/mes.js';

const HOY = '2026-10-27';
const meses = (t) => mesesEnTexto(t, HOY).map(x => x.mes + ':' + x.fuerza);

test('mes en nombres reales de PRIME y formatos comunes', () => {
  assert.deepEqual(meses('08 AGOSTO 26 SUA.zip'), ['2026-08:fuerte']);
  assert.deepEqual(meses('Prenomina Agosto 2026.xlsx'), ['2026-08:fuerte']);
  assert.deepEqual(meses('ACUMULADO_SEPTIEMBRE_2026.xlsx'), ['2026-09:fuerte']);
  assert.deepEqual(meses('nomina sep-26'), ['2026-09:fuerte']);
  assert.deepEqual(meses('XML 2026-08.zip'), ['2026-08:fuerte']);
  assert.deepEqual(meses('metadata_202609.txt'), ['2026-09:fuerte']);
  assert.deepEqual(meses('HC 09/2026'), ['2026-09:fuerte']);
  assert.deepEqual(meses('Nómina de Octubre del 2026'), ['2026-10:fuerte']);
  assert.deepEqual(meses('Prenomina agosto.xlsx'), ['null:debil'], 'sin año es débil');
});

test('no confunde palabras, días ni identificadores con meses', () => {
  assert.deepEqual(meses('PAGO MARTINEZ MAYORAL'), []);
  assert.deepEqual(meses('MAR'), [], 'abreviatura suelta no cuenta');
  assert.deepEqual(meses('PHO190128QD8'), []);
  assert.deepEqual(meses('NSS 12201608123'), []);
  assert.deepEqual(meses('AGOSTO 15'), ['null:debil'], '«15» es un día, no 2015');
  assert.deepEqual(meses('ENERO 2019'), ['null:debil'], 'años fuera de rango no cuentan');
});

test('año probable: el mes más reciente que no es futuro', () => {
  assert.equal(anioProbable(8, HOY), '2026-08');
  assert.equal(anioProbable(12, HOY), '2025-12');
  assert.deepEqual(limitesMes('2026-02'), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepEqual(limitesMes('2028-02'), { desde: '2028-02-01', hasta: '2028-02-29' });
  assert.equal(limitesMes('2026-13'), null);
});

test('fechas: la moda y cuándo es cierta', () => {
  const f = [...Array(95).fill('2026-08-30'), ...Array(5).fill('2026-09-06')];
  assert.equal(mesDeFechas(f).mes, '2026-08');
  assert.equal(senalFechas(f).fuerza, 'cierta');
  const mitad = [...Array(55).fill('2026-08-30'), ...Array(45).fill('2026-09-06')];
  assert.equal(senalFechas(mitad).fuerza, 'debil');
  assert.equal(mesDeFechas(['x', null]), null);
  assert.equal(atributoXml('<nomina12:Nomina FechaInicialPago="2026-08-24" FechaFinalPago="2026-08-30" />', 'FechaFinalPago'), '2026-08-30');
  assert.deepEqual(fechasMetadata('Uuid~RfcEmisor~FechaEmision~Estatus\nA~X~2026-09-01 10:00:00~1\nB~X~2026-08-28 09:00:00~1'), ['2026-09-01 10:00:00', '2026-08-28 09:00:00']);
});

test('decisión: cierta manda; fuerte sola es segura; conflicto o débil piden confirmación', () => {
  assert.equal(decidirMes([], HOY).seguro, false);
  const sua = decidirMes([{ mes: '2026-08', fuerza: 'cierta', fuente: 'contenido' }, { mes: '2026-09', fuerza: 'fuerte', fuente: 'nombre' }], HOY);
  assert.deepEqual([sua.mes, sua.seguro], ['2026-08', true], 'el contenido gana al nombre');
  const nom = decidirMes([{ mes: '2026-09', fuerza: 'fuerte', fuente: 'nombre' }, { mes: '2026-09', fuerza: 'fuerte', fuente: 'hoja' }], HOY);
  assert.deepEqual([nom.mes, nom.seguro], ['2026-09', true]);
  const choque = decidirMes([{ mes: '2026-09', fuerza: 'fuerte', fuente: 'nombre' }, { mes: '2026-08', fuerza: 'fuerte', fuente: 'titulo' }], HOY);
  assert.equal(choque.seguro, false);
  assert.deepEqual(choque.conflicto.length, 1);
  const debil = decidirMes([{ numero: 8, fuerza: 'debil', fuente: 'nombre' }], HOY);
  assert.deepEqual([debil.mes, debil.seguro], ['2026-08', false]);
});

test('libros: hojas, títulos y tipo', () => {
  const wb = '<workbook><sheets><sheet name="Activos" sheetId="1"/><sheet name="Bajas aplicadas" sheetId="2"/></sheets></workbook>';
  assert.deepEqual(hojasLibro(wb), ['Activos', 'Bajas aplicadas']);
  assert.equal(tipoLibro(hojasLibro(wb)), 'maestro');
  assert.equal(tipoLibro(['ACUMULADO', 'Hoja2']), 'prenomina');
  const ss = '<sst><si><t>PRIMEWIRELESS NOMINA AGOSTO 2026</t></si><si><t>SUELDO</t></si><si><t xml:space="preserve">MARIA MAYO</t></si></sst>';
  assert.deepEqual(textosLibro(ss), ['PRIMEWIRELESS NOMINA AGOSTO 2026', 'SUELDO', 'MARIA MAYO']);
  const s = senalesLibro('acumulado.xlsx', ['ACUMULADO'], textosLibro(ss), HOY);
  assert.deepEqual(s.map(x => x.mes + ':' + x.fuente), ['2026-08:titulo'], 'MAYO suelto en un nombre no cuenta');
  assert.equal(decidirMes(s, HOY).seguro, true);
});

test('las funciones se pueden embeber en el navegador sin importaciones', () => {
  const src = FUNCIONES_MES.map(f => f.toString()).join('\n');
  const ctx = new Function(src + '\nreturn { decidirMes, senalesLibro, textosLibro };')();
  const s = ctx.senalesLibro('08 AGOSTO 26 SUA.zip', [], [], HOY);
  assert.equal(ctx.decidirMes(s, HOY).mes, '2026-08');
  assert.ok(!/\bimport\b|\bexport\b|`/.test(src), 'sin import/export ni backticks');
});

test('la detección embebida en /kernel funciona aunque wrangler meta __name (keepNames)', async () => {
  const vm = await import('node:vm');
  const { paginaKernel } = await import('../../paginas/kernel.js');
  const html = paginaKernel({ CSS: '', LOGO: '', AUTH_ADMIN: '', LOGOUT_FN: '' });
  const a = html.indexOf('var __name'); const b = html.indexOf('function limitesMes');
  assert.ok(a >= 0 && a < html.indexOf('function mesesEnTexto'), 'el ayudante __name va antes de las funciones');
  // Simula el empaquetado: una llamada a __name dentro del cuerpo, como la deja esbuild con keepNames.
  const bloque = html.slice(a, html.indexOf('\n}', b) + 2)
    .replace('function mesesEnTexto(', 'function mesesEnTexto(').replace(/(function mesesEnTexto\([^)]*\)\s*\{)/, '$1 const _p = __name(() => 0, "p");');
  const ctx = vm.createContext({});
  vm.runInContext(bloque, ctx);
  const r = vm.runInContext('JSON.stringify(mesesEnTexto("ACUMULADO AGOSTO 2026 fab.xlsx").map(m => m.mes))', ctx);
  assert.equal(r, '["2026-08"]');
});
