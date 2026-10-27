// api/permisos.js — Perfiles de acceso al portal.
//
// admin  · HRM: todo.
// socio  · cliente: /portal (encargos, requerimiento, hallazgos ya dictaminados, dictámenes) de su empresa.
// socio + perfil «carga» · la persona del cliente que sube los documentos y corre las pruebas:
//          además de lo del socio, en /kernel sube prenómina, XML/metadata del SAT, SUA, maestro y
//          calendario, y ejecuta lecturas, cruces y reconciliaciones, SÓLO de los encargos de su empresa
//          y sólo mientras el encargo está abierto.
//
// Lo que el perfil «carga» nunca hace (separación de funciones: lo que se audita no se califica a sí mismo):
// clasificar diferencias o cruces, crear encargos, cambiar registros patronales, procesar o revisar el
// requerimiento, redactar hallazgos, emitir o cerrar, ver el expediente o el cotizador.
//
// La revisión es por LISTA BLANCA: una ruta del kernel que no está aquí queda cerrada para el perfil, aunque
// el módulo la abra después. Cada identificador que llega (en la URL o en el JSON) se resuelve a su empresa.

export const esCarga = (u) => !!u && u.rol === 'socio' && u.perfil === 'carga' && u.empresa_id != null;
export const puedeOperar = (u) => !!u && (u.rol === 'admin' || esCarga(u));

// Identificador → consulta que da la empresa y el estado del encargo al que pertenece.
const LLAVES = {
  encargo_id: 'SELECT empresa_id, estado FROM encargo WHERE id = ?1',
  ejecucion_id: 'SELECT e.empresa_id, e.estado FROM ejecucion x JOIN encargo e ON e.id = x.encargo_id WHERE x.id = ?1',
  ingesta_id: 'SELECT e.empresa_id, e.estado FROM ingesta x JOIN encargo e ON e.id = x.encargo_id WHERE x.id = ?1',
  ingesta_cfdi_id: 'SELECT e.empresa_id, e.estado FROM ingesta_cfdi x JOIN encargo e ON e.id = x.encargo_id WHERE x.id = ?1',
  ingesta_sua_id: 'SELECT e.empresa_id, e.estado FROM ingesta_sua x JOIN encargo e ON e.id = x.encargo_id WHERE x.id = ?1',
  carga_id: 'SELECT e.empresa_id, e.estado FROM maestro_carga x JOIN encargo e ON e.id = x.encargo_id WHERE x.id = ?1',
  empresa_id: "SELECT id AS empresa_id, 'abierto' AS estado FROM empresas WHERE id = ?1",
};

// Rutas abiertas al perfil. global: no toca datos de un cliente. id: a qué llave corresponde el «id» de esa ruta.
// multipart: el encargo viene en el formulario y lo verifica el módulo (verificarEncargo) al leerlo.
const G = { global: true };
export const PERMISOS_CARGA = {
  'GET /api/kernel/estado': G,
  'GET /api/kernel/pbc': G,
  'GET /api/kernel/criterios': G,
  'GET /api/kernel/encargos': { requiere: 'empresa_id' },
  // Prenómina y reconciliación kernel ↔ nómina
  'POST /api/kernel/ingestas': { multipart: true },
  'GET /api/kernel/ingestas': { requiere: 'encargo_id' },
  'GET /api/kernel/ingesta': { id: 'ingesta_id' },
  'POST /api/kernel/ingesta/avanzar': { id: 'ingesta_id' },
  'POST /api/kernel/ingesta/reintentar': { id: 'ingesta_id' },
  'POST /api/kernel/ejecutar': { requiere: 'encargo_id' },
  'POST /api/kernel/movimientos': { requiere: 'encargo_id' },
  'POST /api/kernel/reconciliar': { requiere: 'ejecucion_id' },
  'GET /api/kernel/ejecuciones': { requiere: 'encargo_id' },
  'GET /api/kernel/ejecucion': { id: 'ejecucion_id' },
  'GET /api/kernel/diferencias': { requiere: 'encargo_id' },
  'GET /api/kernel/diferencias/grupos': { requiere: 'encargo_id' },
  // Calendario (dato del cliente); registros patronales sólo lectura
  'GET /api/kernel/calendario': { requiere: 'encargo_id' },
  'POST /api/kernel/calendario': { requiere: 'encargo_id' },
  'GET /api/kernel/registros': { requiere: 'empresa_id' },
  // XML de nómina, metadata del SAT y cruce nómina ↔ CFDI
  'POST /api/kernel/cfdi': { multipart: true },
  'GET /api/kernel/cfdi': { requiere: 'encargo_id' },
  'GET /api/kernel/cfdi/ingesta': { id: 'ingesta_cfdi_id' },
  'POST /api/kernel/cfdi/avanzar': { id: 'ingesta_cfdi_id' },
  'POST /api/kernel/cfdi/reintentar': { id: 'ingesta_cfdi_id' },
  'GET /api/kernel/cruces/grupos': { requiere: 'ingesta_cfdi_id' },
  'GET /api/kernel/cruces': { requiere: 'ingesta_cfdi_id' },
  // SUA ↔ emisión del IMSS ↔ pago
  'POST /api/kernel/sua': { multipart: true },
  'GET /api/kernel/sua': { requiere: 'encargo_id' },
  'GET /api/kernel/sua/lectura': { id: 'ingesta_sua_id' },
  'GET /api/kernel/sua/grupos': { requiere: 'encargo_id' },
  'GET /api/kernel/sua/cruces': { requiere: 'encargo_id' },
  // Maestro de empleados y cruce de afiliación
  'POST /api/kernel/maestro': { multipart: true },
  'GET /api/kernel/maestro': { requiere: 'encargo_id' },
  'POST /api/kernel/maestro/cruzar': { id: 'carga_id' },
  'GET /api/kernel/afiliacion': { requiere: 'carga_id' },
};

const NO = (status, error) => ({ status, error });

async function empresaDe(db, llave, valor) {
  const sql = LLAVES[llave];
  if (!sql) return null;
  const v = llave === 'empresa_id' ? Number(valor) : String(valor);
  if (llave === 'empresa_id' && !Number.isInteger(v)) return null;
  return db.prepare(sql).bind(v).first();
}

/**
 * Revisa una petición del perfil «carga» a /api/kernel/*. Devuelve null si pasa o { status, error }.
 * Fuera de /api/kernel/ no decide: ahí el usuario se comporta como cualquier socio.
 */
export async function autorizarCarga(request, env, u) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method;
  if (!p.startsWith('/api/kernel/')) return null;
  if (!esCarga(u)) return NO(403, 'Forbidden');
  const regla = PERMISOS_CARGA[m + ' ' + p];
  if (!regla) return NO(403, 'Tu perfil (carga de documentos) no tiene acceso a esta función; es de HRM');
  if (regla.global) return null;
  const tipo = request.headers.get('Content-Type') || '';
  if (regla.multipart && tipo.includes('multipart/form-data')) return null; // el módulo verifica el encargo del formulario
  if (regla.multipart) return NO(403, 'Tu perfil sube el archivo directamente (formulario), no por referencia a R2');

  // Identificadores que llegan: URL y, en POST con JSON, el cuerpo (sólo el primer nivel).
  // Un parámetro repetido haría que la revisión mire un valor y el módulo use otro: se rechaza.
  const valores = {};
  for (const k of new Set(url.searchParams.keys())) {
    if (url.searchParams.getAll(k).length > 1) return NO(400, 'Parámetro repetido: ' + k);
    valores[k] = url.searchParams.get(k);
  }
  if (m !== 'GET') {
    if (!tipo.includes('application/json')) return NO(415, 'Se espera JSON');
    const b = await request.clone().json().catch(() => null);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return NO(400, 'JSON inválido');
    for (const [k, v] of Object.entries(b)) {
      const llave = k === 'id' || k in LLAVES;
      if (llave && v !== null && !['string', 'number'].includes(typeof v)) return NO(400, k + ' inválido');
      if (v === null || ['string', 'number'].includes(typeof v)) valores[k] = v;
    }
  }
  const ids = [];
  if (regla.id) {
    if (valores.id === undefined || valores.id === null || valores.id === '') return NO(400, 'id requerido');
    ids.push([regla.id, valores.id]);
  }
  for (const k of Object.keys(LLAVES)) if (valores[k] !== undefined && valores[k] !== null && valores[k] !== '') ids.push([k, valores[k]]);
  if (regla.requiere && !ids.some(([k]) => k === regla.requiere)) return NO(400, regla.requiere + ' requerido');
  if (!ids.length) return NO(400, 'Falta el encargo');
  for (const [k, v] of ids) {
    const r = await empresaDe(env.DB, k, v);
    // 404 y no 403: no se confirma que exista algo de otra empresa.
    if (!r || Number(r.empresa_id) !== Number(u.empresa_id)) return NO(404, 'No encontrado');
    if (m !== 'GET' && r.estado !== 'abierto') return NO(409, 'El encargo está cerrado: ya no recibe archivos ni corridas');
  }
  return null;
}

/**
 * Para las cargas multipart: el encargo del formulario tiene que ser de la empresa del usuario y estar abierto.
 * Devuelve null si pasa o { status, error }. Al admin no lo limita.
 */
export async function verificarEncargo(db, u, encargo_id) {
  if (u && u.rol === 'admin') return null;
  if (!esCarga(u)) return NO(403, 'Forbidden');
  const e = encargo_id ? await db.prepare('SELECT empresa_id, estado FROM encargo WHERE id = ?1').bind(String(encargo_id)).first() : null;
  if (!e || Number(e.empresa_id) !== Number(u.empresa_id)) return NO(404, 'Encargo no encontrado');
  if (e.estado !== 'abierto') return NO(409, 'El encargo está cerrado: ya no recibe archivos ni corridas');
  return null;
}
