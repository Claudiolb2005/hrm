-- Esquema D1 — hrm-nomina-portal
PRAGMA foreign_keys = ON;

CREATE TABLE empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rfc TEXT UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  activa INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('admin','socio')),
  empresa_id INTEGER,
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  mes TEXT NOT NULL,
  anio INTEGER NOT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','procesado','publicado')),
  total_percepciones REAL DEFAULT 0,
  total_deducciones REAL DEFAULT 0,
  total_neto REAL DEFAULT 0,
  total_isn REAL DEFAULT 0,
  total_empleados INTEGER DEFAULT 0,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE reportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  seccion TEXT NOT NULL,
  datos_json TEXT NOT NULL,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (periodo_id) REFERENCES periodos(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (uploaded_by) REFERENCES usuarios(id)
);

CREATE TABLE bases_isn (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  registro_patronal TEXT NOT NULL,
  entidad_federativa TEXT NOT NULL,
  tasa REAL NOT NULL,
  vales_gravado INTEGER DEFAULT 0,
  ptu_gravado INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  UNIQUE(empresa_id, registro_patronal)
);

CREATE TABLE mapeo_columnas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  concepto_hrm TEXT NOT NULL,
  columna_cliente TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK(categoria IN ('identificacion','periodo','percepciones','deducciones','totales','patronales','otros')),
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  UNIQUE(empresa_id, concepto_hrm)
);
