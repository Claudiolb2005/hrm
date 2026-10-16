// Utilidades de prueba. Las pruebas sí leen archivos; el kernel no.
import { readFileSync } from 'node:fs';
import { Catalogo, Contexto, reglaPorId } from '../src/index.js';

export function filasSemilla() {
  return JSON.parse(readFileSync(new URL('../data/parametros-2026.json', import.meta.url))).filas;
}
export function catalogoSemilla(extra = []) { return new Catalogo([...filasSemilla(), ...extra]); }
export function correr(cat, id, entrada) {
  const ctx = new Contexto(cat);
  const r = reglaPorId(id).calcular(entrada, ctx);
  return { r, ctx };
}
