-- 0003_ingesta_lotes.sql — Ejecución por lotes (abierta → sellada) e ingesta en el servidor (T8).
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0003_ingesta_lotes.sql
--
-- Precondición: ninguna ejecución persistida (al 15-oct-2026 hay cero). Se recrea `ejecucion`
-- porque `sello` deja de ser obligatorio mientras la ejecución está abierta.

-- ── Ejecución: abierta mientras se agregan lotes; sellada e inmutable al cerrar ──
DROP TRIGGER IF EXISTS ejecucion_inmutable_u;
DROP TRIGGER IF EXISTS ejecucion_inmutable_d;
DROP TABLE IF EXISTS ejecucion;
CREATE TABLE ejecucion (
  id                      TEXT PRIMARY KEY,
  encargo_id              TEXT NOT NULL REFERENCES encargo(id),
  estado                  TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','sellada')),
  kernel_version          TEXT NOT NULL,
  kernel_huella           TEXT NOT NULL,
  version_catalogo_reglas TEXT NOT NULL,
  version_parametros      TEXT NOT NULL REFERENCES parametro_version(version),
  entradas_sha256_json    TEXT NOT NULL CHECK (json_valid(entradas_sha256_json)),
  abierta_en              TEXT NOT NULL,
  calculado_en            TEXT,
  n_calculos              INTEGER,
  n_lotes                 INTEGER,
  sello                   TEXT,
  CHECK (estado = 'abierta' OR (sello IS NOT NULL AND calculado_en IS NOT NULL AND n_calculos IS NOT NULL AND n_lotes IS NOT NULL))
);
CREATE TRIGGER ejecucion_solo_sellar BEFORE UPDATE ON ejecucion
WHEN OLD.estado <> 'abierta' OR NEW.estado <> 'sellada'
  OR NEW.id <> OLD.id OR NEW.encargo_id <> OLD.encargo_id OR NEW.kernel_version <> OLD.kernel_version
  OR NEW.kernel_huella <> OLD.kernel_huella OR NEW.version_catalogo_reglas <> OLD.version_catalogo_reglas
  OR NEW.version_parametros <> OLD.version_parametros OR NEW.abierta_en <> OLD.abierta_en
BEGIN SELECT RAISE(ABORT, 'ejecucion: sólo se permite sellar una ejecución abierta; sellada es inmutable'); END;
CREATE TRIGGER ejecucion_inmutable_d BEFORE DELETE ON ejecucion
BEGIN SELECT RAISE(ABORT, 'ejecucion es inmutable'); END;

CREATE TABLE IF NOT EXISTS ejecucion_lote (
  ejecucion_id    TEXT NOT NULL REFERENCES ejecucion(id),
  n               INTEGER NOT NULL,
  sello           TEXT NOT NULL,
  n_calculos      INTEGER NOT NULL,
  cobertura_json  TEXT NOT NULL CHECK (json_valid(cobertura_json)),
  PRIMARY KEY (ejecucion_id, n)
);
CREATE TRIGGER IF NOT EXISTS ejecucion_lote_solo_abierta BEFORE INSERT ON ejecucion_lote
WHEN (SELECT estado FROM ejecucion WHERE id = NEW.ejecucion_id) IS NOT 'abierta'
BEGIN SELECT RAISE(ABORT, 'No se agregan lotes a una ejecución sellada'); END;
CREATE TRIGGER IF NOT EXISTS ejecucion_lote_inmutable_u BEFORE UPDATE ON ejecucion_lote
BEGIN SELECT RAISE(ABORT, 'ejecucion_lote es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS ejecucion_lote_inmutable_d BEFORE DELETE ON ejecucion_lote
BEGIN SELECT RAISE(ABORT, 'ejecucion_lote es inmutable'); END;

-- calculo_kernel: lote de origen y sólo mientras la ejecución está abierta.
ALTER TABLE calculo_kernel ADD COLUMN lote INTEGER NOT NULL DEFAULT 1;
CREATE TRIGGER IF NOT EXISTS calculo_kernel_solo_abierta BEFORE INSERT ON calculo_kernel
WHEN (SELECT estado FROM ejecucion WHERE id = NEW.ejecucion_id) IS NOT 'abierta'
BEGIN SELECT RAISE(ABORT, 'No se agregan cálculos a una ejecución sellada'); END;
CREATE TRIGGER IF NOT EXISTS resultado_regla_solo_abierta BEFORE INSERT ON resultado_regla
WHEN (SELECT estado FROM ejecucion WHERE id = NEW.ejecucion_id) IS NOT 'abierta'
BEGIN SELECT RAISE(ABORT, 'Los resultados se escriben al cerrar, antes de sellar'); END;
-- Un dictamen sólo se firma contra una ejecución sellada (T2, decisión 6).
CREATE TRIGGER IF NOT EXISTS dictamen_ejecucion_sellada BEFORE INSERT ON dictamen
WHEN (SELECT estado FROM ejecucion WHERE id = NEW.ejecucion_id) IS NOT 'sellada'
BEGIN SELECT RAISE(ABORT, 'Un dictamen sólo se firma contra una ejecución sellada'); END;

-- ── Movimientos del cliente: de qué ingesta salieron ──
ALTER TABLE movimiento_nomina ADD COLUMN ingesta_id TEXT;
CREATE INDEX IF NOT EXISTS idx_movimiento_ingesta ON movimiento_nomina (ingesta_id, rubro);

-- ── Ingesta en el servidor: la cola vive en D1; el cron y /avanzar la consumen ──
CREATE TABLE IF NOT EXISTS ingesta (
  id              TEXT PRIMARY KEY,
  encargo_id      TEXT NOT NULL REFERENCES encargo(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('prenomina','sua')),
  perfil          TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  archivo_nombre  TEXT,
  archivo_sha256  TEXT,
  tamano          INTEGER,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','calculando','mensual','cerrando','terminado','error')),
  ejecucion_id    TEXT REFERENCES ejecucion(id),
  lotes_total     INTEGER,
  lotes_hechos    INTEGER NOT NULL DEFAULT 0,
  renglones       INTEGER,
  reporte_json    TEXT CHECK (reporte_json IS NULL OR json_valid(reporte_json)),
  error           TEXT,
  intentos        INTEGER NOT NULL DEFAULT 0,
  tomado_hasta    TEXT,
  creado_por      INTEGER REFERENCES usuarios(id),
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ingesta_estado ON ingesta (estado, actualizado_en);
CREATE TABLE IF NOT EXISTS ingesta_lote (
  ingesta_id  TEXT NOT NULL REFERENCES ingesta(id),
  n           INTEGER NOT NULL,
  r2_key      TEXT NOT NULL,
  renglones   INTEGER NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','hecho')),
  PRIMARY KEY (ingesta_id, n)
);

-- ── Calendario de nómina (módulo 5): sin calendario no hay fecha de pago ni periodicidad ──
CREATE TABLE IF NOT EXISTS calendario_nomina (
  encargo_id    TEXT NOT NULL REFERENCES encargo(id),
  corrida_id    TEXT NOT NULL,
  periodicidad  TEXT NOT NULL CHECK (periodicidad IN ('semanal','decenal','catorcenal','quincenal','mensual')),
  desde         TEXT NOT NULL,
  hasta         TEXT NOT NULL,
  fecha_pago    TEXT NOT NULL,
  ordinaria     INTEGER NOT NULL DEFAULT 1 CHECK (ordinaria IN (0,1)),
  fuente        TEXT NOT NULL,
  PRIMARY KEY (encargo_id, corrida_id)
);

-- ── Registro patronal: entidad del centro de trabajo y prima de riesgo con vigencia ──
-- La entidad nunca se infiere de un reporte (bases_isn tiene Z33… como San Luis Potosí y es Sinaloa).
CREATE TABLE IF NOT EXISTS registro_patronal (
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
  registro      TEXT NOT NULL,
  entidad       TEXT,
  prima_rt_pct  TEXT,
  prima_desde   TEXT,
  prima_hasta   TEXT,
  fuente        TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, registro)
);
