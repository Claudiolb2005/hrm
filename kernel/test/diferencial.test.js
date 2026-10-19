// Prueba diferencial contra el oráculo independiente (kernel/oraculo). Muestra de
// 3,000 casos en cada `npm test`; la corrida grande es `node oraculo/diferencial.mjs 30000`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generarCasos, correrKernel, correrOraculo, comparar } from '../oraculo/diferencial.mjs';

const hayPython = spawnSync('python3', ['--version']).status === 0;

test('Kernel = oráculo independiente al centavo en 3,000 casos (9 reglas)', { skip: !hayPython && 'sin python3' }, () => {
  const casos = generarCasos(3000, 20261019);
  const { porRegla, difs } = comparar(casos, correrKernel(casos), correrOraculo(casos));
  assert.equal(Object.keys(porRegla).length, 9);
  assert.deepEqual(difs.slice(0, 3), [], difs.length + ' diferencias');
});
