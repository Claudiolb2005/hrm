// Casos dorados (T1): el kernel contra las cifras que Rafael calcula a mano.
// Si la cifra de Rafael y la del kernel difieren, gana Rafael — salvo que la
// diferencia sea de criterio, y entonces se anota en data/criterios.json y aquí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CASOS_DORADOS, SALIDAS } from '../data/casos-dorados.mjs';
import { catalogoSemilla, correr } from './util.js';

const RUTA = new URL('../data/casos-dorados-esperados.json', import.meta.url);
const esperados = existsSync(RUTA) ? JSON.parse(readFileSync(RUTA, 'utf8')).casos : {};
const cat = catalogoSemilla();

test('Casos dorados: definición completa (ID único, regla y salida conocidas, el kernel los corre)', () => {
  const ids = new Set();
  for (const c of CASOS_DORADOS) {
    assert.ok(!ids.has(c.id), 'ID repetido ' + c.id); ids.add(c.id);
    assert.ok(SALIDAS[c.salida], c.id + ': salida desconocida');
    const { r } = correr(cat, c.regla, structuredClone(c.entrada));
    const v = SALIDAS[c.salida].leer(r);
    assert.ok(v === null || Number.isInteger(v), c.id + ': el kernel no da un importe');
  }
  assert.ok(CASOS_DORADOS.length >= 40);
});

const capturados = CASOS_DORADOS.filter(c => esperados[c.id] && esperados[c.id].esperado_c !== null && esperados[c.id].esperado_c !== undefined);

test('Casos dorados: kernel = cifra de Rafael al centavo (' + capturados.length + ' capturados de ' + CASOS_DORADOS.length + ')',
  { skip: capturados.length === 0 && 'aún sin cifras capturadas' }, () => {
    const difs = [];
    for (const c of capturados) {
      const { r } = correr(cat, c.regla, structuredClone(c.entrada));
      const k = SALIDAS[c.salida].leer(r), e = esperados[c.id].esperado_c;
      if (k !== e) difs.push(c.id + ' ' + c.titulo + ': kernel ' + (k / 100).toFixed(2) + ' vs esperado ' + (e / 100).toFixed(2) + ' (' + (esperados[c.id].como || 's/f') + ')');
    }
    assert.deepEqual(difs, []);
  });
