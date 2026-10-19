// delta-sql.mjs — Genera una migración con lo que cambió en parámetros, reglas y criterios entre
// una versión anterior del kernel (git) y el código actual. Lo nuevo entra con INSERT OR IGNORE y lo
// cambiado con UPDATE por id; nada se borra. Las reglas se dan de alta inactivas → fuentes → activas.
// Uso: node scripts/delta-sql.mjs <commit-base> <archivo.sql> "<descripción>"
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { REGLAS_V1 } from '../src/index.js';

const [base, destino, descripcion] = process.argv.slice(2);
if (!base || !destino) throw new Error('Uso: node scripts/delta-sql.mjs <commit-base> <archivo.sql> "<descripción>"');
const git = (ruta) => JSON.parse(execFileSync('git', ['show', base + ':kernel/' + ruta], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const actual = (ruta) => JSON.parse(readFileSync(new URL('../' + ruta, import.meta.url)));
const q = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const out = ['-- ' + destino + ' — Generado por kernel/scripts/delta-sql.mjs (base ' + base + '); no editar a mano.', '-- ' + (descripcion || '')];

// ── Parámetros
const fila = f => [f.id, f.clave, f.entidad || null, f.tipo || 'escalar', JSON.stringify(f.valor), f.vigencia_desde, f.vigencia_hasta || null, f.base_temporal, f.fundamento, f.fuente, f.nivel, f.notas || null];
const antes = new Map(git('data/parametros-2026.json').filas.map(f => [f.id, f]));
const nuevos = [], cambiados = [];
for (const f of actual('data/parametros-2026.json').filas) {
  const a = antes.get(f.id);
  if (!a) nuevos.push(f); else if (JSON.stringify(fila(a)) !== JSON.stringify(fila(f))) cambiados.push(f);
}
for (let i = 0; i < nuevos.length; i += 200) {
  out.push('INSERT OR IGNORE INTO parametro_fiscal (id, clave, entidad, tipo, valor_json, vigencia_desde, vigencia_hasta, base_temporal, fundamento, fuente, nivel, notas) VALUES\n' +
    nuevos.slice(i, i + 200).map(f => '(' + fila(f).map(q).join(', ') + ')').join(',\n') + ';');
}
for (const f of cambiados) {
  const [, clave, entidad, tipo, valor, desde, hasta, bt, fund, fuente, nivel, notas] = fila(f);
  out.push('UPDATE parametro_fiscal SET clave = ' + q(clave) + ', entidad = ' + q(entidad) + ', tipo = ' + q(tipo) + ', valor_json = ' + q(valor) + ', vigencia_desde = ' + q(desde) +
    ', vigencia_hasta = ' + q(hasta) + ', base_temporal = ' + q(bt) + ', fundamento = ' + q(fund) + ', fuente = ' + q(fuente) + ', nivel = ' + q(nivel) + ', notas = ' + q(notas) + ' WHERE id = ' + q(f.id) + ';');
}

// ── Reglas: todas se sincronizan (alta inactiva, fuentes, versión, activa)
for (const r of REGLAS_V1) {
  out.push('INSERT OR IGNORE INTO regla (id, version, rubro, titulo, fundamento, activa) VALUES (' + [r.id, r.version, r.rubro, r.titulo, r.fundamento, 0].map(q).join(', ') + ');');
  for (const f of r.fuentes) {
    out.push('INSERT OR IGNORE INTO regla_fuente (regla_id, fuente_clave, obligatoria) VALUES (' + [r.id, f.clave, f.obligatoria ? 1 : 0].map(q).join(', ') + ');');
    out.push('UPDATE regla_fuente SET obligatoria = ' + (f.obligatoria ? 1 : 0) + ' WHERE regla_id = ' + q(r.id) + ' AND fuente_clave = ' + q(f.clave) + ';');
  }
  out.push('UPDATE regla SET version = ' + q(r.version) + ', rubro = ' + q(r.rubro) + ', titulo = ' + q(r.titulo) + ', fundamento = ' + q(r.fundamento) + ' WHERE id = ' + q(r.id) + ';');
}
out.push('UPDATE regla SET activa = 1 WHERE activa = 0 AND id IN (' + REGLAS_V1.map(r => q(r.id)).join(', ') + ');');

// ── Criterios
const crit = c => [c.id, c.tema, c.decision, c.fundamento, c.quien, c.fecha, c.estado, c.observaciones || null];
const cAntes = new Map(git('data/criterios.json').criterios.map(c => [c.id, c]));
for (const c of actual('data/criterios.json').criterios) {
  const a = cAntes.get(c.id);
  if (!a) out.push('INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones) VALUES (' + crit(c).map(q).join(', ') + ');');
  else if (JSON.stringify(crit(a)) !== JSON.stringify(crit(c))) {
    out.push('UPDATE bitacora_criterio SET tema = ' + q(c.tema) + ', decision = ' + q(c.decision) + ', fundamento = ' + q(c.fundamento) + ', quien = ' + q(c.quien) +
      ', fecha = ' + q(c.fecha) + ', estado = ' + q(c.estado) + ', observaciones = ' + q(c.observaciones || null) + ' WHERE id = ' + q(c.id) + ';');
  }
}
writeFileSync(new URL('../../migrations/' + destino, import.meta.url), out.join('\n') + '\n');
console.log(destino + ': ' + nuevos.length + ' parámetros nuevos, ' + cambiados.length + ' cambiados, ' + REGLAS_V1.length + ' reglas sincronizadas');
