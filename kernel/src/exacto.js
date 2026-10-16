// exacto.js — Aritmética exacta del kernel.
//
// Regla (domain-rules / módulo 8): entradas y salidas en centavos enteros; los
// productos intermedios se calculan con aritmética exacta, nunca con float; un
// solo redondeo al final, a centavo, medio hacia arriba.
//
// Representación: racional n/d con BigInt, siempre reducido y con d > 0.
// Un "Exacto" representa PESOS. Los centavos entran y salen como enteros Number.

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export class Exacto {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error('Exacto: denominador cero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
    Object.freeze(this);
  }

  /** Desde texto decimal ("117.31", "-0.375", "1,234.50") o entero/BigInt. */
  static de(v) {
    if (v instanceof Exacto) return v;
    if (typeof v === 'bigint') return new Exacto(v);
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) throw new Error('Exacto.de: número no entero (' + v + '); pase texto decimal');
      return new Exacto(BigInt(v));
    }
    if (typeof v !== 'string') throw new Error('Exacto.de: tipo no soportado');
    const s = v.replace(/,/g, '').trim();
    const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new Error('Exacto.de: decimal inválido "' + v + '"');
    const ent = m[2] || '0';
    const frac = m[3] || '';
    const n = BigInt(ent + frac) * (m[1] === '-' ? -1n : 1n);
    return new Exacto(n, 10n ** BigInt(frac.length));
  }

  /** Desde centavos enteros (Number o BigInt) a pesos exactos. */
  static centavos(c) {
    if (typeof c === 'number' && !Number.isInteger(c)) throw new Error('Exacto.centavos: no entero ' + c);
    return new Exacto(BigInt(c), 100n);
  }

  /** Desde un porcentaje en texto ("21.36" → 0.2136). */
  static pct(p) { return Exacto.de(p).div(100); }

  static get cero() { return CERO; }

  suma(o) { o = Exacto.de(o); return new Exacto(this.n * o.d + o.n * this.d, this.d * o.d); }
  resta(o) { o = Exacto.de(o); return new Exacto(this.n * o.d - o.n * this.d, this.d * o.d); }
  por(o) { o = Exacto.de(o); return new Exacto(this.n * o.n, this.d * o.d); }
  div(o) { o = Exacto.de(o); if (o.n === 0n) throw new Error('Exacto: división entre cero'); return new Exacto(this.n * o.d, this.d * o.n); }
  cmp(o) { o = Exacto.de(o); const a = this.n * o.d, b = o.n * this.d; return a < b ? -1 : a > b ? 1 : 0; }
  lt(o) { return this.cmp(o) < 0; }
  le(o) { return this.cmp(o) <= 0; }
  gt(o) { return this.cmp(o) > 0; }
  ge(o) { return this.cmp(o) >= 0; }
  eq(o) { return this.cmp(o) === 0; }
  esCero() { return this.n === 0n; }
  esNegativo() { return this.n < 0n; }
  static min(a, b) { a = Exacto.de(a); b = Exacto.de(b); return a.le(b) ? a : b; }
  static max(a, b) { a = Exacto.de(a); b = Exacto.de(b); return a.ge(b) ? a : b; }

  /** Redondeo único a centavos, medio hacia arriba: floor(x·100 + 1/2). Devuelve Number entero. */
  aCentavos() {
    const num = this.n * 200n + this.d;      // (x·100 + 1/2) · 2d
    const den = 2n * this.d;
    let q = num / den;
    if (num % den !== 0n && num < 0n) q -= 1n; // floor para negativos
    return bigANumber(q);
  }

  /** Trunca a dos decimales (criterio C4: veces UMA). Devuelve Exacto. */
  trunc2() {
    let q = (this.n * 100n) / this.d;
    if ((this.n * 100n) % this.d !== 0n && this.n < 0n) q -= 1n;
    return new Exacto(q, 100n);
  }

  /** Texto decimal con hasta `dec` decimales (solo para traza; no para cálculo). */
  texto(dec = 6) {
    const neg = this.n < 0n;
    const n = neg ? -this.n : this.n;
    const esc = 10n ** BigInt(dec);
    const q = (n * esc * 2n + this.d) / (2n * this.d);
    let ent = (q / esc).toString();
    let fr = (q % esc).toString().padStart(dec, '0').replace(/0+$/, '');
    return (neg && q !== 0n ? '-' : '') + ent + (fr ? '.' + fr : '');
  }

  toJSON() { return this.texto(6); }
}

const CERO = new Exacto(0n);

function bigANumber(b) {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('Exacto: importe fuera de rango seguro');
  }
  return Number(b);
}

/** Centavos enteros → texto con dos decimales (solo presentación y traza). */
export function pesos(c) {
  const neg = c < 0;
  const a = Math.abs(c);
  return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
}

export const E = Exacto.de;
