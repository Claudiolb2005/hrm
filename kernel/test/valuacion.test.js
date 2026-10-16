// Valuación de hallazgos (módulo 18): actualización (CFF 17-A), recargos (CFF 21) y multa (CFF 76 / LSS 304).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaLimite, mesesDeMora, valuarOmision, sumarValuaciones } from '../src/index.js';
import { catalogoSemilla } from './util.js';

const cat = catalogoSemilla();

test('vencimiento: día 17 del mes siguiente; bimestral, al cierre del bimestre', () => {
  assert.equal(fechaLimite('2026-08'), '2026-09-17');
  assert.equal(fechaLimite('2026-12'), '2027-01-17');
  assert.equal(fechaLimite('2026-07', { bimestral: true }), '2026-09-17');
  assert.equal(fechaLimite('2026-08', { bimestral: true }), '2026-09-17');
});

test('recargos por mes o fracción, tope de cinco años', () => {
  assert.equal(mesesDeMora('2026-09-17', '2026-09-17'), 0);
  assert.equal(mesesDeMora('2026-09-17', '2026-09-18'), 1);
  assert.equal(mesesDeMora('2026-09-17', '2026-10-17'), 1);
  assert.equal(mesesDeMora('2026-09-17', '2026-10-18'), 2);
  assert.equal(mesesDeMora('2026-09-17', '2040-01-01'), 60);
});

test('hallazgo 1 de agosto valuado al 16-oct-2026: factor 1.0042, 2.07 % de recargos, multa 55–75 %', () => {
  const v = valuarOmision({ catalogo: cat, omision_c: 375000, rubro: 'isr', periodo: '2026-08', fecha_calculo: '2026-10-16' });
  assert.equal(v.valuable, true);
  assert.equal(v.fecha_limite, '2026-09-17');
  assert.equal(v.inpc_reciente.ym, '2026-09');
  assert.equal(v.inpc_antiguo.ym, '2026-08');
  assert.equal(v.factor, '1.0042', '146.075 / 145.462 = 1.004214… truncado');
  assert.equal(v.actualizacion_c, 1575);
  assert.equal(v.meses_recargos, 1);
  assert.equal(v.recargos_c, 7795, '3,765.75 × 2.07 %');
  assert.equal(v.multa_min_c, 207116);
  assert.equal(v.multa_max_c, 282431);
  assert.equal(v.contingencia_min_c, 384370);
  assert.equal(v.contingencia_max_c, 384370 + 282431);
  assert.deepEqual(v.niveles, ['A', 'B', 'D'].filter(n => v.niveles.includes(n)));
});

test('sin INPC publicado del mes que toca se usa el último; antes del vencimiento no hay accesorios; ISN no se valúa', () => {
  const v = valuarOmision({ catalogo: cat, omision_c: 100000, rubro: 'isr', periodo: '2026-08', fecha_calculo: '2026-11-20' });
  assert.equal(v.inpc_reciente.ym, '2026-09');
  assert.equal(v.inpc_reciente.sustituto_de, '2026-10');
  assert.equal(v.meses_recargos, 3);
  const a = valuarOmision({ catalogo: cat, omision_c: 100000, rubro: 'imss', periodo: '2026-08', fecha_calculo: '2026-09-10' });
  assert.equal(a.contingencia_max_c, 100000);
  assert.equal(valuarOmision({ catalogo: cat, omision_c: 100000, rubro: 'isn', periodo: '2026-08', fecha_calculo: '2026-10-16' }).valuable, false);
  assert.match(valuarOmision({ catalogo: cat, omision_c: 100000, rubro: 'isr', periodo: '2024-01', fecha_calculo: '2026-10-16' }).motivo, /INPC/);
  const s = sumarValuaciones([valuarOmision({ catalogo: cat, omision_c: 375000, rubro: 'isr', periodo: '2026-08', fecha_calculo: '2026-10-16' }),
    valuarOmision({ catalogo: cat, omision_c: 1, rubro: 'isn', periodo: '2026-08', fecha_calculo: '2026-10-16' })]);
  assert.equal(s.contingencia_min_c, 384370);
  assert.equal(s.no_valuados.length, 1);
});
