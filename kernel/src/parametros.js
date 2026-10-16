// parametros.js — Catálogo de parámetros fiscales con vigencia (módulo 4).
//
// Reglas base que implementa:
//  · Los parámetros se CARGAN con vigencia; no se programan. El kernel recibe el
//    catálogo como dato (filas de parametro_fiscal) y nunca lee archivos.
//  · Cada parámetro declara su BASE TEMPORAL: fecha_pago (ISR, subsidio),
//    dia_cotizado (IMSS, RCV, INFONAVIT: una semana 26-ene→1-feb lleva seis días
//    con UMA 2025 y uno con UMA 2026), mes_causacion (ISN) o dato_entrada
//    (prima de riesgo por registro, vigente 1-mar → último de febrero).
//  · Nivel de verificación A/B/C/D viaja con cada uso. Un cálculo que toca un
//    parámetro en nivel C no puede dar «conforme» (T3): «nada en C a producción»
//    se cumple por construcción.

import { sha256Hex, jsonCanonico } from './sello.js';

export const NIVELES = ['A', 'B', 'C', 'D'];
export const BASES_TEMPORALES = ['fecha_pago', 'dia_cotizado', 'mes_causacion', 'dato_entrada'];

export class ParametroFaltante extends Error {
  constructor(clave, fecha, entidad) {
    super('Parámetro sin vigencia: ' + clave + (entidad ? ' [' + entidad + ']' : '') + ' en ' + fecha);
    this.name = 'ParametroFaltante';
    this.clave = clave; this.fecha = fecha; this.entidad = entidad || null;
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class Catalogo {
  /** @param {Array<object>} filas  renglones de parametro_fiscal */
  constructor(filas) {
    if (!Array.isArray(filas)) throw new Error('Catalogo: se esperan filas');
    this.filas = filas.map(validarFila);
    // Sin traslapes de vigencia para la misma clave + entidad.
    const grupos = new Map();
    for (const f of this.filas) {
      const k = f.clave + '|' + (f.entidad || '');
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(f);
    }
    for (const [k, fs] of grupos) {
      fs.sort((a, b) => a.vigencia_desde.localeCompare(b.vigencia_desde));
      for (let i = 1; i < fs.length; i++) {
        const prev = fs[i - 1];
        if (!prev.vigencia_hasta || prev.vigencia_hasta >= fs[i].vigencia_desde) {
          throw new Error('Catalogo: vigencias traslapadas en ' + k + ' (' + prev.id + ' / ' + fs[i].id + ')');
        }
      }
    }
    this._grupos = grupos;
    this._version = null;
    Object.freeze(this.filas);
  }

  /** Huella SHA-256 del contenido: es la «versión de parámetros» que viaja en cada cálculo. */
  async version() {
    // Sólo los campos que determinan el cálculo y su soporte; notas y metadatos no cambian la versión.
    if (!this._version) this._version = 'par-' + (await sha256Hex(jsonCanonico(this.filasCanonicas()))).slice(0, 16);
    return this._version;
  }

  filasCanonicas() {
    return [...this.filas].sort((a, b) => a.id.localeCompare(b.id)).map(f => ({ id: f.id, clave: f.clave, entidad: f.entidad, tipo: f.tipo || 'escalar',
      valor: f.valor, vigencia_desde: f.vigencia_desde, vigencia_hasta: f.vigencia_hasta, base_temporal: f.base_temporal,
      fundamento: f.fundamento, fuente: f.fuente, nivel: f.nivel }));
  }

  buscar(clave, fecha, entidad) {
    if (!FECHA.test(fecha)) throw new Error('Catalogo.buscar: fecha inválida ' + fecha);
    const fs = this._grupos.get(clave + '|' + (entidad || ''));
    if (!fs) return null;
    for (const f of fs) {
      if (f.vigencia_desde <= fecha && (!f.vigencia_hasta || fecha <= f.vigencia_hasta)) return f;
    }
    return null;
  }

  obtener(clave, fecha, entidad) {
    const f = this.buscar(clave, fecha, entidad);
    if (!f) throw new ParametroFaltante(clave, fecha, entidad);
    return f;
  }
}

function validarFila(f) {
  const req = ['id', 'clave', 'vigencia_desde', 'base_temporal', 'nivel', 'fundamento', 'fuente'];
  for (const r of req) if (f[r] === undefined || f[r] === null || f[r] === '') throw new Error('Parámetro ' + (f.id || '?') + ': falta ' + r);
  if (!('valor' in f)) throw new Error('Parámetro ' + f.id + ': falta valor');
  if (!NIVELES.includes(f.nivel)) throw new Error('Parámetro ' + f.id + ': nivel inválido ' + f.nivel);
  if (!BASES_TEMPORALES.includes(f.base_temporal)) throw new Error('Parámetro ' + f.id + ': base_temporal inválida ' + f.base_temporal);
  if (!FECHA.test(f.vigencia_desde) || (f.vigencia_hasta && !FECHA.test(f.vigencia_hasta))) throw new Error('Parámetro ' + f.id + ': vigencia inválida');
  return Object.freeze({ ...f, entidad: f.entidad || null, vigencia_hasta: f.vigencia_hasta || null });
}

/**
 * Contexto de un cálculo: registra qué parámetros se usaron (con su nivel) para
 * la traza y para decidir si el resultado puede darse por bueno.
 */
export class Contexto {
  constructor(catalogo) {
    this.catalogo = catalogo;
    this.usados = new Map();       // id → {id, clave, entidad, nivel, valor}
    this.limitaciones = [];        // {motivo, detalle}
    this.criterios = new Set();    // criterios de bitácora invocados (C1…)
  }

  param(clave, fecha, entidad) {
    const f = this.catalogo.obtener(clave, fecha, entidad);
    this._registrar(f);
    return f;
  }

  /** Busca sin lanzar; si falta, registra limitación y devuelve null. */
  paramOpcional(clave, fecha, entidad, motivo) {
    const f = this.catalogo.buscar(clave, fecha, entidad);
    if (!f) { this.limitar(motivo || 'parametro_faltante', clave + (entidad ? ' [' + entidad + ']' : '') + ' en ' + fecha); return null; }
    this._registrar(f);
    return f;
  }

  _registrar(f) {
    if (!this.usados.has(f.id)) this.usados.set(f.id, { id: f.id, clave: f.clave, entidad: f.entidad, nivel: f.nivel });
    if (f.nivel === 'C') this.limitar('parametro_nivel_C', f.id);
  }

  limitar(motivo, detalle) {
    if (!this.limitaciones.some(l => l.motivo === motivo && l.detalle === detalle)) this.limitaciones.push({ motivo, detalle });
  }

  criterio(id) { this.criterios.add(id); }

  /**
   * Parámetro con base temporal «día cotizado»: devuelve los tramos de días
   * del periodo agrupados por renglón vigente.
   * @param {string[]} dias  fechas YYYY-MM-DD cotizadas
   */
  porDia(clave, dias, entidad) {
    const tramos = [];
    for (const dia of dias) {
      const f = this.param(clave, dia, entidad);
      const t = tramos.find(x => x.fila.id === f.id);
      if (t) { t.dias += 1; } else tramos.push({ fila: f, dias: 1 });
    }
    return tramos;
  }

  nivelMinimo() {
    let peor = 'A';
    for (const u of this.usados.values()) if (NIVELES.indexOf(u.nivel) > NIVELES.indexOf(peor) && u.nivel !== 'D') peor = u.nivel;
    return peor;
  }

  resumenParametros() { return [...this.usados.values()]; }
}

/** Fechas consecutivas desde→hasta inclusive (YYYY-MM-DD, UTC). */
export function rangoFechas(desde, hasta) {
  const out = [];
  let t = Date.parse(desde + 'T00:00:00Z');
  const fin = Date.parse(hasta + 'T00:00:00Z');
  if (!(t <= fin)) throw new Error('rangoFechas: rango inválido ' + desde + '→' + hasta);
  while (t <= fin) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
  return out;
}
