// huella.mjs — Calcula la huella SHA-256 del código del kernel y la escribe en src/_huella.js.
// Uso: node scripts/huella.mjs            (escribe)
//      node scripts/huella.mjs --check    (falla si la huella está desactualizada)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const raiz = new URL('../src/', import.meta.url).pathname;
const archivos = [];
(function walk(d) {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.js') && n !== '_huella.js') archivos.push(p);
  }
})(raiz);
const h = createHash('sha256');
for (const p of archivos) { h.update(relative(raiz, p) + '\0'); h.update(readFileSync(p)); h.update('\0'); }
const huella = 'krn-' + h.digest('hex').slice(0, 16);
const destino = join(raiz, '_huella.js');
const contenido = '// Generado por scripts/huella.mjs — no editar a mano.\nexport const KERNEL_HUELLA = ' + JSON.stringify(huella) + ';\n';
if (process.argv.includes('--check')) {
  let actual = '';
  try { actual = readFileSync(destino, 'utf8'); } catch {}
  if (actual !== contenido) { console.error('Huella desactualizada: corre `npm run huella`'); process.exit(1); }
  console.log('huella ok', huella);
} else { writeFileSync(destino, contenido); console.log(huella); }
