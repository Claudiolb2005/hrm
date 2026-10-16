-- 0001_kernel_v1.sql — Base del kernel (Revisión del maestro v0.3, T1·T2·T3 aprobadas 13-oct-2026; N1 resuelto)
-- Migración ADITIVA sobre hrm-nomina-portal: no toca ninguna tabla existente.
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0001_kernel_v1.sql
--
-- Principios que fija el esquema (no la disciplina de quien programe):
--   · calculo_kernel, ejecucion, resultado_regla y dictamen son INMUTABLES: sólo agregar.
--   · El hallazgo guarda dos referencias y la diferencia se DERIVA (vista v_diferencia).
--   · Una regla no se activa sin al menos una fila en regla_fuente.
--   · origen_nomina del encargo no cambia después de emitido su primer dictamen (N1).
PRAGMA foreign_keys = ON;

-- ── Encargo (módulo 24) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encargo (
  id              TEXT PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  periodo_id      INTEGER REFERENCES periodos(id),           -- enlace con el portal actual (opcional)
  nivel           TEXT NOT NULL,                              -- A0…A5, B1…B5+
  periodo_desde   TEXT NOT NULL,
  periodo_hasta   TEXT NOT NULL,
  ejercicio       INTEGER NOT NULL,
  -- N1: cliente → dictamen independiente; tercero → dictamen independiente; la_casa → revisión de control interno
  origen_nomina   TEXT NOT NULL CHECK (origen_nomina IN ('cliente','tercero','la_casa')),
  operador_nomina_usuario_id INTEGER REFERENCES usuarios(id), -- quien operó la nómina (escenarios B y D)
  aplica_ajuste_mensual INTEGER NOT NULL DEFAULT 0,          -- perfil del cliente (CALC-ISR-AJM-001)
  estado          TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Parámetros fiscales con vigencia (módulo 4) ──────────────────────
CREATE TABLE IF NOT EXISTS parametro_fiscal (
  id              TEXT PRIMARY KEY,
  clave           TEXT NOT NULL,
  entidad         TEXT,
  tipo            TEXT NOT NULL,
  valor_json      TEXT NOT NULL CHECK (json_valid(valor_json)),
  vigencia_desde  TEXT NOT NULL,
  vigencia_hasta  TEXT,
  base_temporal   TEXT NOT NULL CHECK (base_temporal IN ('fecha_pago','dia_cotizado','mes_causacion','dato_entrada')),
  fundamento      TEXT NOT NULL,
  fuente          TEXT NOT NULL,
  nivel           TEXT NOT NULL CHECK (nivel IN ('A','B','C','D')),
  notas           TEXT,
  cargado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (clave, entidad, vigencia_desde)
);
CREATE INDEX IF NOT EXISTS idx_parametro_clave ON parametro_fiscal (clave, entidad, vigencia_desde);

-- Foto completa del catálogo por versión: lo que se usó en cada ejecución se puede releer siempre.
CREATE TABLE IF NOT EXISTS parametro_version (
  version         TEXT PRIMARY KEY,
  filas_json      TEXT NOT NULL CHECK (json_valid(filas_json)),
  registrado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS parametro_version_inmutable_u BEFORE UPDATE ON parametro_version
BEGIN SELECT RAISE(ABORT, 'parametro_version es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS parametro_version_inmutable_d BEFORE DELETE ON parametro_version
BEGIN SELECT RAISE(ABORT, 'parametro_version es inmutable'); END;

-- ── Reglas y matriz regla ↔ fuente (T3) ──────────────────────────────
CREATE TABLE IF NOT EXISTS fuente (
  clave           TEXT PRIMARY KEY,
  descripcion     TEXT NOT NULL,
  anexo           TEXT                                        -- llave del Anexo C / PBC (por mapear)
);
CREATE TABLE IF NOT EXISTS regla (
  id              TEXT PRIMARY KEY,
  version         TEXT NOT NULL,
  rubro           TEXT NOT NULL,
  titulo          TEXT NOT NULL,
  fundamento      TEXT NOT NULL,
  activa          INTEGER NOT NULL DEFAULT 0 CHECK (activa IN (0,1))
);
CREATE TABLE IF NOT EXISTS regla_fuente (
  regla_id        TEXT NOT NULL REFERENCES regla(id),
  fuente_clave    TEXT NOT NULL REFERENCES fuente(clave),
  obligatoria     INTEGER NOT NULL CHECK (obligatoria IN (0,1)),
  PRIMARY KEY (regla_id, fuente_clave)
);
CREATE TRIGGER IF NOT EXISTS regla_alta_sin_fuentes BEFORE INSERT ON regla WHEN NEW.activa = 1
BEGIN SELECT RAISE(ABORT, 'Una regla se da de alta inactiva; se activa al declarar sus fuentes'); END;
CREATE TRIGGER IF NOT EXISTS regla_activa_sin_fuentes BEFORE UPDATE OF activa ON regla
WHEN NEW.activa = 1 AND NOT EXISTS (SELECT 1 FROM regla_fuente WHERE regla_id = NEW.id AND obligatoria = 1)
BEGIN SELECT RAISE(ABORT, 'Una regla no se activa sin al menos una fuente obligatoria en regla_fuente'); END;
CREATE TRIGGER IF NOT EXISTS regla_fuente_baja_activa BEFORE DELETE ON regla_fuente
WHEN (SELECT activa FROM regla WHERE id = OLD.regla_id) = 1
 AND NOT EXISTS (SELECT 1 FROM regla_fuente WHERE regla_id = OLD.regla_id AND fuente_clave <> OLD.fuente_clave AND obligatoria = 1)
BEGIN SELECT RAISE(ABORT, 'No se puede dejar una regla activa sin fuente obligatoria'); END;

-- ── Ejecución sellada (T2, decisión 5) ───────────────────────────────
CREATE TABLE IF NOT EXISTS ejecucion (
  id                      TEXT PRIMARY KEY,
  encargo_id              TEXT NOT NULL REFERENCES encargo(id),
  kernel_version          TEXT NOT NULL,
  kernel_huella           TEXT NOT NULL,
  version_catalogo_reglas TEXT NOT NULL,
  version_parametros      TEXT NOT NULL REFERENCES parametro_version(version),
  entradas_sha256_json    TEXT NOT NULL CHECK (json_valid(entradas_sha256_json)),
  calculado_en            TEXT NOT NULL,
  n_calculos              INTEGER NOT NULL,
  sello                   TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS ejecucion_inmutable_u BEFORE UPDATE ON ejecucion
BEGIN SELECT RAISE(ABORT, 'ejecucion es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS ejecucion_inmutable_d BEFORE DELETE ON ejecucion
BEGIN SELECT RAISE(ABORT, 'ejecucion es inmutable'); END;

-- ── Lo que el kernel calculó (T2) ────────────────────────────────────
-- Por colaborador y rubro, nunca por total. Sólo agregar: recalcular escribe otra ejecución.
-- Particionado lógico por ejercicio desde el primer día (decisión 7).
CREATE TABLE IF NOT EXISTS calculo_kernel (
  id                      TEXT PRIMARY KEY,
  ejecucion_id            TEXT NOT NULL REFERENCES ejecucion(id),
  encargo_id              TEXT NOT NULL REFERENCES encargo(id),
  ejercicio               INTEGER NOT NULL,
  corrida_id              TEXT,
  colaborador_id          TEXT NOT NULL,                      -- RFC o identificador; sin nombres (N7)
  rubro                   TEXT NOT NULL,                      -- isr, subsidio, imss_obrera, imss_patronal, rcv_patronal, ceav_obrera, infonavit, isn…
  valor_calculado_c       INTEGER,                            -- centavos enteros; NULL sólo si el cálculo quedó limitado sin cifra
  regla_id                TEXT NOT NULL REFERENCES regla(id),
  regla_version           TEXT NOT NULL,
  version_catalogo_reglas TEXT NOT NULL,
  version_parametros      TEXT NOT NULL,
  nivel_minimo            TEXT NOT NULL CHECK (nivel_minimo IN ('A','B','C','D')),
  limitado                INTEGER NOT NULL CHECK (limitado IN (0,1)),
  traza_json              TEXT NOT NULL CHECK (json_valid(traza_json)),
  calculado_en            TEXT NOT NULL,
  CHECK (valor_calculado_c IS NOT NULL OR limitado = 1)
);
CREATE INDEX IF NOT EXISTS idx_calculo_encargo ON calculo_kernel (encargo_id, colaborador_id, rubro);
CREATE INDEX IF NOT EXISTS idx_calculo_ejercicio ON calculo_kernel (ejercicio, encargo_id);
CREATE INDEX IF NOT EXISTS idx_calculo_ejecucion ON calculo_kernel (ejecucion_id);
CREATE TRIGGER IF NOT EXISTS calculo_kernel_inmutable_u BEFORE UPDATE ON calculo_kernel
BEGIN SELECT RAISE(ABORT, 'calculo_kernel es inmutable: recalcular escribe una ejecución nueva'); END;
CREATE TRIGGER IF NOT EXISTS calculo_kernel_inmutable_d BEFORE DELETE ON calculo_kernel
BEGIN SELECT RAISE(ABORT, 'calculo_kernel es inmutable'); END;

-- ── Resultado por regla: tres estados con cobertura declarada (T3) ──
CREATE TABLE IF NOT EXISTS resultado_regla (
  ejecucion_id      TEXT NOT NULL REFERENCES ejecucion(id),
  regla_id          TEXT NOT NULL REFERENCES regla(id),
  regla_version     TEXT NOT NULL,
  estado            TEXT NOT NULL CHECK (estado IN ('completo','universo_parcial','limitacion_alcance')),
  universo_esperado INTEGER NOT NULL,
  universo_efectivo INTEGER NOT NULL,
  excluidos_json    TEXT NOT NULL CHECK (json_valid(excluidos_json)),
  limitaciones_json TEXT NOT NULL CHECK (json_valid(limitaciones_json)),
  PRIMARY KEY (ejecucion_id, regla_id)
);
CREATE TRIGGER IF NOT EXISTS resultado_regla_inmutable_u BEFORE UPDATE ON resultado_regla
BEGIN SELECT RAISE(ABORT, 'resultado_regla es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS resultado_regla_inmutable_d BEFORE DELETE ON resultado_regla
BEGIN SELECT RAISE(ABORT, 'resultado_regla es inmutable'); END;

-- ── Movimiento del cliente (lado «cliente» de la resta; modelo canónico mínimo) ──
CREATE TABLE IF NOT EXISTS movimiento_nomina (
  id                TEXT PRIMARY KEY,
  encargo_id        TEXT NOT NULL REFERENCES encargo(id),
  corrida_id        TEXT,
  colaborador_id    TEXT NOT NULL,
  rubro             TEXT NOT NULL,
  valor_c           INTEGER NOT NULL,
  archivo_sha256    TEXT NOT NULL,                            -- de qué archivo salió
  renglon_origen    TEXT                                      -- hoja/fila/columna de origen
);
CREATE INDEX IF NOT EXISTS idx_movimiento ON movimiento_nomina (encargo_id, colaborador_id, rubro, corrida_id);

-- ── Diferencia kernel vs cliente: dos referencias, resta derivada (T1 nivel 3) ──
CREATE TABLE IF NOT EXISTS diferencia (
  id                 TEXT PRIMARY KEY,
  calculo_kernel_id  TEXT NOT NULL REFERENCES calculo_kernel(id),
  movimiento_id      TEXT NOT NULL REFERENCES movimiento_nomina(id),
  cubeta             TEXT CHECK (cubeta IN ('kernel_mal','proceso_mal','criterio_sin_resolver')),
  motivo             TEXT,
  quien              TEXT,
  clasificado_por_usuario_id INTEGER REFERENCES usuarios(id),
  criterio_id        TEXT REFERENCES bitacora_criterio(id),
  clasificado_en     TEXT,
  CHECK (cubeta IS NULL OR (motivo IS NOT NULL AND quien IS NOT NULL)),
  CHECK (cubeta <> 'criterio_sin_resolver' OR criterio_id IS NOT NULL),
  UNIQUE (calculo_kernel_id, movimiento_id)
);
CREATE VIEW IF NOT EXISTS v_diferencia AS
SELECT d.id, d.cubeta, d.motivo, d.quien, d.criterio_id, c.encargo_id, c.ejercicio, c.corrida_id, c.colaborador_id, c.rubro,
       c.valor_calculado_c AS kernel_c, m.valor_c AS cliente_c, (m.valor_c - c.valor_calculado_c) AS diferencia_c,
       c.regla_id, c.version_parametros, c.ejecucion_id
FROM diferencia d JOIN calculo_kernel c ON c.id = d.calculo_kernel_id JOIN movimiento_nomina m ON m.id = d.movimiento_id;

-- ── Bitácora de criterios (T1): la que responde «el año pasado lo trataron distinto» ──
CREATE TABLE IF NOT EXISTS bitacora_criterio (
  id            TEXT PRIMARY KEY,                             -- C1, C2…
  tema          TEXT NOT NULL,
  decision      TEXT NOT NULL,
  fundamento    TEXT NOT NULL,
  quien         TEXT NOT NULL,
  fecha         TEXT NOT NULL,
  estado        TEXT NOT NULL CHECK (estado IN ('vigente','por_confirmar','abierto')),
  observaciones TEXT
);

-- ── Dictamen firmado contra una ejecución (T2, decisión 6; N1) ───────
CREATE TABLE IF NOT EXISTS dictamen (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  version               INTEGER NOT NULL,
  dictamen_anterior_id  TEXT REFERENCES dictamen(id),
  motivo_version        TEXT,
  ejecucion_id          TEXT NOT NULL REFERENCES ejecucion(id),
  tipo_entregable       TEXT NOT NULL CHECK (tipo_entregable IN ('dictamen_independiente','revision_control_interno')),
  contenido_json        TEXT NOT NULL CHECK (json_valid(contenido_json)),
  huella_contenido      TEXT NOT NULL,
  revisor_usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  emitido_en            TEXT NOT NULL,
  UNIQUE (encargo_id, version),
  CHECK ((version = 1 AND dictamen_anterior_id IS NULL) OR (version > 1 AND dictamen_anterior_id IS NOT NULL AND motivo_version IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS dictamen_inmutable_u BEFORE UPDATE ON dictamen
BEGIN SELECT RAISE(ABORT, 'Un dictamen emitido es inmutable: un reproceso emite una versión nueva'); END;
CREATE TRIGGER IF NOT EXISTS dictamen_inmutable_d BEFORE DELETE ON dictamen
BEGIN SELECT RAISE(ABORT, 'Un dictamen emitido es inmutable'); END;
-- N1 · módulo 19: el título depende del origen de la nómina.
CREATE TRIGGER IF NOT EXISTS dictamen_tipo_segun_origen BEFORE INSERT ON dictamen
WHEN ((SELECT origen_nomina FROM encargo WHERE id = NEW.encargo_id) = 'la_casa') <> (NEW.tipo_entregable = 'revision_control_interno')
BEGIN SELECT RAISE(ABORT, 'Con origen_nomina = la_casa el entregable es revisión de control interno; con cliente o tercero, dictamen independiente'); END;
-- N1 · módulo 24: origen_nomina no cambia después del primer dictamen.
CREATE TRIGGER IF NOT EXISTS encargo_origen_fijo BEFORE UPDATE OF origen_nomina ON encargo
WHEN OLD.origen_nomina <> NEW.origen_nomina AND EXISTS (SELECT 1 FROM dictamen WHERE encargo_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'origen_nomina no cambia después de emitido el primer dictamen'); END;
-- N1 · módulo 27: en un encargo la_casa, quien operó la nómina no revisa ni cierra hallazgos. El sistema lo impide.
CREATE TRIGGER IF NOT EXISTS dictamen_separacion_personas BEFORE INSERT ON dictamen
WHEN NEW.revisor_usuario_id = (SELECT operador_nomina_usuario_id FROM encargo WHERE id = NEW.encargo_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede ser el revisor'); END;
CREATE TRIGGER IF NOT EXISTS diferencia_separacion_personas BEFORE UPDATE OF cubeta ON diferencia
WHEN NEW.clasificado_por_usuario_id IS NOT NULL AND NEW.clasificado_por_usuario_id = (
  SELECT e.operador_nomina_usuario_id FROM calculo_kernel c JOIN encargo e ON e.id = c.encargo_id WHERE c.id = NEW.calculo_kernel_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede clasificar ni cerrar hallazgos'); END;
