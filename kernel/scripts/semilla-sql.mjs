// semilla-sql.mjs — Genera migrations/0002_semilla_kernel_v1.sql desde la semilla de
// parámetros, las reglas v1 y la bitácora de criterios. Idempotente (INSERT OR IGNORE).
// Uso: node scripts/semilla-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { REGLAS_V1, FUENTES } from '../src/index.js';

const q = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const filas = JSON.parse(readFileSync(new URL('../data/parametros-2026.json', import.meta.url))).filas;
const criterios = JSON.parse(readFileSync(new URL('../data/criterios.json', import.meta.url))).criterios;
const out = ['-- 0002_semilla_kernel_v1.sql — Generado por kernel/scripts/semilla-sql.mjs; no editar a mano.',
  '-- Semilla de arranque: parámetros 2026, fuentes, reglas v1 (alta inactiva → fuentes → activa) y bitácora de criterios.'];
const multi = (cab, tuplas) => out.push(cab + ' VALUES\n' + tuplas.map(t => '(' + t.map(q).join(', ') + ')').join(',\n') + ';');
multi('INSERT OR IGNORE INTO parametro_fiscal (id, clave, entidad, tipo, valor_json, vigencia_desde, vigencia_hasta, base_temporal, fundamento, fuente, nivel, notas)',
  filas.map(f => [f.id, f.clave, f.entidad || null, f.tipo || 'escalar', JSON.stringify(f.valor), f.vigencia_desde, f.vigencia_hasta || null, f.base_temporal, f.fundamento, f.fuente, f.nivel, f.notas || null]));
multi('INSERT OR IGNORE INTO fuente (clave, descripcion, anexo)', Object.entries(FUENTES).map(([k, f]) => [k, f.descripcion, f.anexo]));
multi('INSERT OR IGNORE INTO regla (id, version, rubro, titulo, fundamento, activa)', REGLAS_V1.map(r => [r.id, r.version, r.rubro, r.titulo, r.fundamento, 0]));
multi('INSERT OR IGNORE INTO regla_fuente (regla_id, fuente_clave, obligatoria)', REGLAS_V1.flatMap(r => r.fuentes.map(f => [r.id, f.clave, f.obligatoria ? 1 : 0])));
out.push('UPDATE regla SET activa = 1 WHERE activa = 0 AND id IN (' + REGLAS_V1.map(r => q(r.id)).join(', ') + ');');
multi('INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones)',
  criterios.map(c => [c.id, c.tema, c.decision, c.fundamento, c.quien, c.fecha, c.estado, c.observaciones || null]));
writeFileSync(new URL('../../migrations/0002_semilla_kernel_v1.sql', import.meta.url), out.join('\n') + '\n');
console.log('0002_semilla_kernel_v1.sql:', out.length - 2, 'sentencias');
