// El revisor de informes publicados (nivel 2) detecta lo que dice detectar. Datos sintéticos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisarInforme } from '../scripts/no-regresion-reporte.mjs';
import { filasSemilla } from './util.js';

const informe = () => ({
  periodo: { mes: 'febrero', anio: 2025, total_isn: 3000.00 },
  sec1: { percepciones: 1000.00, deducciones: 200.00, total_neto: 800.00, cfdi_total: 800.00, cfdi_dif: 0, disp_total: 799.50, disp_dif: 0.50 },
  sec2: [{ p: 'SEM 05', nom: 500.00, cfdi: 500.00, disp: 499.50 }, { p: 'SEM 06', nom: 300.00, cfdi: 300.00, disp: 300.00 }],
  sec8: { periodos: [{ p: 'SEM 05', imss: 10, rcv: 5, info: 5, isn: 3000.00, total: 3020.00 }], isn_total: 3000.00, total_imss: 10, total_rcv: 5, total_info: 5, total_patron: 3020.00 },
  sec9: [{ rp: 'A1', e: 'Colima', emp: 3, t: 10 }, { rp: 'A2', e: 'Colima', emp: 3, t: 10 }],
  sec10: [{ e: 'COLIMA', emp: 3, base: 100000.00, tasa: 2.00, imp: 2000.00 }, { e: 'MORELOS', emp: 2, base: 40000.00, tasa: 2.50, imp: 1000.00 }],
});

test('No-regresión de informe: ISN por el kernel, cuadres y duplicados', () => {
  const r = revisarInforme(informe(), filasSemilla());
  assert.equal(r.isn.length, 2);
  assert.ok(r.isn.every(x => x.dif_c === 0));
  assert.deepEqual(r.tasas.map(t => t.catalogo), ['2', '2.5'], 'tasas 2025 del catálogo');
  const pruebas = r.hallazgos.map(h => h.prueba);
  assert.ok(pruebas.includes('sec9: registro con cifras idénticas a otro'));
  assert.ok(!pruebas.some(p => p.startsWith('sec1')), 'sec1 cuadra');
});

test('No-regresión de informe: tasa distinta al catálogo e impuesto mal multiplicado', () => {
  const inf = informe();
  inf.sec10[0].tasa = 3.00; inf.sec10[0].imp = 3000.01;
  const r = revisarInforme(inf, filasSemilla());
  const pruebas = r.hallazgos.map(h => h.prueba);
  assert.ok(pruebas.includes('ISN · tasa del informe ≠ catálogo'));
  assert.ok(pruebas.includes('ISN COLIMA: base × tasa (kernel)'));
});
