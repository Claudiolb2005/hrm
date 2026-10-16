-- 0006_hallazgos_dictamen.sql — Hallazgos con cédula, tolerancia y materialidad por encargo,
-- dictamen versionado e inmutable, grupos multi-RFC (Revisión del maestro v0.3: T4, T5, T6, T7; D2, D7, D13).
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0006_hallazgos_dictamen.sql
--
-- Precondición: ningún dictamen emitido (al 15-oct-2026 hay cero). Se recrea `dictamen` para
-- guardar la opinión, quién disparó el reproceso y la regla de los 60 días en la base.
--
-- Lo que la base hace cumplir:
--   · Un dictamen emitido no cambia ni se borra; un reproceso es una versión nueva que referencia a la anterior.
--   · Pasados 60 días del cierre del encargo no se emite versión: se abre un encargo nuevo.
--   · Un hallazgo nunca se borra; su historia queda en la bitácora.
--   · Un hallazgo sólo agrupa diferencias clasificadas como «proceso actual mal».
--   · En un encargo la_casa, quien operó la nómina no cierra hallazgos (N1, módulo 27).
--   · Un cliente pertenece a cero o un grupo; un encargo de grupo agrupa encargos del mismo periodo y nivel.
PRAGMA foreign_keys = ON;

-- ── Tolerancia (T4), materialidad (T5) y cierre del encargo ─────────
ALTER TABLE encargo ADD COLUMN tolerancia_individual_c INTEGER NOT NULL DEFAULT 50;      -- $0.50 por colaborador
ALTER TABLE encargo ADD COLUMN tolerancia_agregada_min_c INTEGER NOT NULL DEFAULT 500;   -- $5.00 mínimo por periodo
ALTER TABLE encargo ADD COLUMN materialidad_bp INTEGER NOT NULL DEFAULT 50;              -- 0.5 % de la carga patronal
ALTER TABLE encargo ADD COLUMN materialidad_piso_c INTEGER NOT NULL DEFAULT 1000000;     -- $10,000
ALTER TABLE encargo ADD COLUMN recurrencia_periodos INTEGER NOT NULL DEFAULT 3;          -- 3+ periodos → material
ALTER TABLE encargo ADD COLUMN carga_patronal_c INTEGER;                                  -- del periodo dictaminado (mes o ejercicio)
ALTER TABLE encargo ADD COLUMN carga_patronal_fuente TEXT;
ALTER TABLE encargo ADD COLUMN cerrado_en TEXT;

-- ── Grupo multi-RFC (T7) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grupo (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Llave primaria en empresa_id: un cliente pertenece a cero o un grupo.
CREATE TABLE IF NOT EXISTS empresa_grupo (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
  grupo_id   TEXT NOT NULL REFERENCES grupo(id)
);
-- Un encargo de grupo es un contenedor de encargos hermanos (uno por RFC) con el mismo periodo y nivel.
CREATE TABLE IF NOT EXISTS encargo_grupo (
  id             TEXT PRIMARY KEY,
  grupo_id       TEXT NOT NULL REFERENCES grupo(id),
  nivel          TEXT NOT NULL,
  periodo_desde  TEXT NOT NULL,
  periodo_hasta  TEXT NOT NULL,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE encargo ADD COLUMN encargo_grupo_id TEXT REFERENCES encargo_grupo(id);
CREATE TRIGGER IF NOT EXISTS encargo_en_grupo BEFORE UPDATE OF encargo_grupo_id ON encargo
WHEN NEW.encargo_grupo_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM encargo_grupo g JOIN empresa_grupo eg ON eg.grupo_id = g.grupo_id
  WHERE g.id = NEW.encargo_grupo_id AND eg.empresa_id = NEW.empresa_id
    AND g.nivel = NEW.nivel AND g.periodo_desde = NEW.periodo_desde AND g.periodo_hasta = NEW.periodo_hasta)
BEGIN SELECT RAISE(ABORT, 'El encargo debe ser de una empresa del grupo, con el mismo periodo y nivel que el encargo de grupo'); END;
CREATE TRIGGER IF NOT EXISTS encargo_en_grupo_unico BEFORE UPDATE OF encargo_grupo_id ON encargo
WHEN NEW.encargo_grupo_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM encargo WHERE encargo_grupo_id = NEW.encargo_grupo_id AND empresa_id = NEW.empresa_id AND id <> NEW.id)
BEGIN SELECT RAISE(ABORT, 'El encargo de grupo ya tiene un encargo para ese RFC'); END;

-- ── Hallazgo con cédula (módulos 17 y 25) ───────────────────────────
-- La diferencia se deriva: el hallazgo apunta a sus diferencias (hallazgo_diferencia) y su
-- efecto derivado es Σ|diferencia| al leer. efecto_*_c es la valuación capturada cuando no hay
-- diferencias que sumar (p. ej. prima de riesgo de Coahuila) o cuando la valuación es mayor.
CREATE TABLE IF NOT EXISTS hallazgo (
  id                 TEXT PRIMARY KEY,
  encargo_id         TEXT NOT NULL REFERENCES encargo(id),
  numero             INTEGER NOT NULL,
  clave_recurrencia  TEXT NOT NULL,                -- mismo hallazgo en otro periodo del mismo cliente (T5)
  modulo             TEXT NOT NULL,                -- 4.1 … 4.13 del frente 1
  regla_id           TEXT,
  rubro              TEXT,
  titulo             TEXT NOT NULL,
  criterio           TEXT NOT NULL,                -- fundamento legal preciso
  condicion          TEXT NOT NULL,                -- lo encontrado, con el dato
  causa              TEXT,
  tipo               TEXT NOT NULL CHECK (tipo IN ('cuantitativo','cualitativo')),
  motivo_cualitativo TEXT CHECK (motivo_cualitativo IN ('retencion_no_enterada','cuota_no_enterada','pago_sin_cfdi','pago_baja_imss','uuid_duplicado')),
  es_entero          INTEGER NOT NULL DEFAULT 0 CHECK (es_entero IN (0,1)),
  alcance_neto       INTEGER NOT NULL DEFAULT 0 CHECK (alcance_neto IN (0,1)),
  efecto_min_c       INTEGER,
  efecto_max_c       INTEGER,
  valuacion_nota     TEXT,
  riesgo             TEXT NOT NULL CHECK (riesgo IN ('alto','medio','bajo')),
  recomendacion      TEXT,
  responsable        TEXT,
  fecha_compromiso   TEXT,
  estatus            TEXT NOT NULL DEFAULT 'abierto' CHECK (estatus IN ('abierto','en_correccion','corregido','confirmado','resuelto_por_reproceso','superado')),
  supera_a           TEXT REFERENCES hallazgo(id),
  creado_por_usuario_id      INTEGER REFERENCES usuarios(id),
  actualizado_por_usuario_id INTEGER REFERENCES usuarios(id),
  creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (encargo_id, numero),
  CHECK ((tipo = 'cualitativo') = (motivo_cualitativo IS NOT NULL)),
  CHECK (efecto_min_c IS NULL OR efecto_max_c IS NULL OR efecto_min_c <= efecto_max_c)
);
CREATE INDEX IF NOT EXISTS idx_hallazgo_recurrencia ON hallazgo (clave_recurrencia);
CREATE TRIGGER IF NOT EXISTS hallazgo_no_se_borra BEFORE DELETE ON hallazgo
BEGIN SELECT RAISE(ABORT, 'Un hallazgo no se borra: cambia de estatus y queda en la bitácora'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_identidad_fija BEFORE UPDATE ON hallazgo
WHEN NEW.id <> OLD.id OR NEW.encargo_id <> OLD.encargo_id OR NEW.numero <> OLD.numero OR NEW.creado_en <> OLD.creado_en
BEGIN SELECT RAISE(ABORT, 'La identidad de un hallazgo no cambia'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_separacion_personas BEFORE UPDATE OF estatus ON hallazgo
WHEN NEW.estatus IN ('corregido','resuelto_por_reproceso','superado') AND NEW.actualizado_por_usuario_id IS NOT NULL
 AND NEW.actualizado_por_usuario_id = (SELECT operador_nomina_usuario_id FROM encargo WHERE id = NEW.encargo_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede clasificar ni cerrar hallazgos'); END;

CREATE TABLE IF NOT EXISTS hallazgo_diferencia (
  hallazgo_id    TEXT NOT NULL REFERENCES hallazgo(id),
  diferencia_id  TEXT NOT NULL REFERENCES diferencia(id),
  PRIMARY KEY (hallazgo_id, diferencia_id)
);
CREATE INDEX IF NOT EXISTS idx_hallazgo_diferencia_dif ON hallazgo_diferencia (diferencia_id);
CREATE TRIGGER IF NOT EXISTS hallazgo_diferencia_proceso_mal BEFORE INSERT ON hallazgo_diferencia
WHEN (SELECT cubeta FROM diferencia WHERE id = NEW.diferencia_id) IS NOT 'proceso_mal'
BEGIN SELECT RAISE(ABORT, 'Sólo una diferencia clasificada como «proceso actual mal» es hallazgo'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_diferencia_mismo_encargo BEFORE INSERT ON hallazgo_diferencia
WHEN (SELECT encargo_id FROM hallazgo WHERE id = NEW.hallazgo_id) <>
     (SELECT c.encargo_id FROM diferencia d JOIN calculo_kernel c ON c.id = d.calculo_kernel_id WHERE d.id = NEW.diferencia_id)
BEGIN SELECT RAISE(ABORT, 'La diferencia es de otro encargo'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_diferencia_no_se_borra BEFORE DELETE ON hallazgo_diferencia
BEGIN SELECT RAISE(ABORT, 'El vínculo hallazgo ↔ diferencia no se borra'); END;
-- Una diferencia ya ligada a un hallazgo no cambia de cubeta en silencio.
CREATE TRIGGER IF NOT EXISTS diferencia_con_hallazgo BEFORE UPDATE OF cubeta ON diferencia
WHEN OLD.cubeta = 'proceso_mal' AND NEW.cubeta IS NOT 'proceso_mal' AND EXISTS (SELECT 1 FROM hallazgo_diferencia WHERE diferencia_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'La diferencia ya sustenta un hallazgo: se resuelve el hallazgo, no se reclasifica la diferencia'); END;

CREATE TABLE IF NOT EXISTS hallazgo_bitacora (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hallazgo_id TEXT NOT NULL REFERENCES hallazgo(id),
  campo       TEXT NOT NULL,
  antes       TEXT,
  despues     TEXT,
  motivo      TEXT,
  usuario_id  INTEGER REFERENCES usuarios(id),
  quien       TEXT,
  en          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS hallazgo_bitacora_inmutable_u BEFORE UPDATE ON hallazgo_bitacora
BEGIN SELECT RAISE(ABORT, 'La bitácora del hallazgo es sólo-agregar'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_bitacora_inmutable_d BEFORE DELETE ON hallazgo_bitacora
BEGIN SELECT RAISE(ABORT, 'La bitácora del hallazgo es sólo-agregar'); END;

CREATE VIEW IF NOT EXISTS v_hallazgo AS
SELECT h.*, e.empresa_id,
  (SELECT count(*) FROM hallazgo_diferencia x WHERE x.hallazgo_id = h.id) AS diferencias,
  (SELECT sum(abs(v.diferencia_c)) FROM hallazgo_diferencia x JOIN v_diferencia v ON v.id = x.diferencia_id WHERE x.hallazgo_id = h.id) AS efecto_derivado_c,
  (SELECT count(DISTINCT h2.encargo_id) FROM hallazgo h2 JOIN encargo e2 ON e2.id = h2.encargo_id
     WHERE h2.clave_recurrencia = h.clave_recurrencia AND e2.empresa_id = e.empresa_id AND e2.periodo_hasta <= e.periodo_hasta
       AND h2.estatus <> 'superado') AS periodos
FROM hallazgo h JOIN encargo e ON e.id = h.encargo_id;

-- ── Dictamen versionado (T6) ────────────────────────────────────────
DROP TRIGGER IF EXISTS dictamen_inmutable_u;
DROP TRIGGER IF EXISTS dictamen_inmutable_d;
DROP TRIGGER IF EXISTS dictamen_tipo_segun_origen;
DROP TRIGGER IF EXISTS dictamen_separacion_personas;
DROP TRIGGER IF EXISTS encargo_origen_fijo;
DROP TABLE IF EXISTS dictamen;
CREATE TABLE dictamen (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  version               INTEGER NOT NULL,
  dictamen_anterior_id  TEXT REFERENCES dictamen(id),
  motivo_version        TEXT,
  disparado_por         TEXT CHECK (disparado_por IN ('cliente','hrm')),
  ejecucion_id          TEXT NOT NULL REFERENCES ejecucion(id),
  tipo_entregable       TEXT NOT NULL CHECK (tipo_entregable IN ('dictamen_independiente','revision_control_interno')),
  opinion_propuesta     TEXT NOT NULL CHECK (opinion_propuesta IN ('conforme','conforme_con_observaciones','con_salvedades','adverso','sin_opinion')),
  opinion               TEXT NOT NULL CHECK (opinion IN ('conforme','conforme_con_observaciones','con_salvedades','adverso','sin_opinion')),
  motivo_cambio_opinion TEXT,
  contenido_json        TEXT NOT NULL CHECK (json_valid(contenido_json)),
  huella_contenido      TEXT NOT NULL,
  revisor_usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  emitido_en            TEXT NOT NULL,
  UNIQUE (encargo_id, version),
  CHECK ((version = 1 AND dictamen_anterior_id IS NULL) OR (version > 1 AND dictamen_anterior_id IS NOT NULL AND motivo_version IS NOT NULL AND disparado_por IS NOT NULL)),
  CHECK (opinion = opinion_propuesta OR motivo_cambio_opinion IS NOT NULL),
  CHECK (opinion_propuesta <> 'sin_opinion' OR opinion = 'sin_opinion')
);
CREATE TRIGGER dictamen_inmutable_u BEFORE UPDATE ON dictamen
BEGIN SELECT RAISE(ABORT, 'Un dictamen emitido es inmutable: un reproceso emite una versión nueva'); END;
CREATE TRIGGER dictamen_inmutable_d BEFORE DELETE ON dictamen
BEGIN SELECT RAISE(ABORT, 'Un dictamen emitido es inmutable'); END;
CREATE TRIGGER dictamen_tipo_segun_origen BEFORE INSERT ON dictamen
WHEN ((SELECT origen_nomina FROM encargo WHERE id = NEW.encargo_id) = 'la_casa') <> (NEW.tipo_entregable = 'revision_control_interno')
BEGIN SELECT RAISE(ABORT, 'Con origen_nomina = la_casa el entregable es revisión de control interno; con cliente o tercero, dictamen independiente'); END;
CREATE TRIGGER encargo_origen_fijo BEFORE UPDATE OF origen_nomina ON encargo
WHEN OLD.origen_nomina <> NEW.origen_nomina AND EXISTS (SELECT 1 FROM dictamen WHERE encargo_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'origen_nomina no cambia después de emitido el primer dictamen'); END;
CREATE TRIGGER dictamen_separacion_personas BEFORE INSERT ON dictamen
WHEN NEW.revisor_usuario_id = (SELECT operador_nomina_usuario_id FROM encargo WHERE id = NEW.encargo_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede ser el revisor'); END;
-- La versión nueva referencia a la inmediata anterior del mismo encargo.
CREATE TRIGGER dictamen_cadena_versiones BEFORE INSERT ON dictamen
WHEN NEW.version > 1 AND NOT EXISTS (SELECT 1 FROM dictamen WHERE id = NEW.dictamen_anterior_id AND encargo_id = NEW.encargo_id AND version = NEW.version - 1)
BEGIN SELECT RAISE(ABORT, 'La versión nueva referencia a la versión inmediata anterior del mismo encargo'); END;
-- T6 regla 5: pasados 60 días del cierre, una corrección abre un encargo nuevo.
CREATE TRIGGER dictamen_limite_reproceso BEFORE INSERT ON dictamen
WHEN NEW.version > 1 AND (SELECT cerrado_en FROM encargo WHERE id = NEW.encargo_id) IS NOT NULL
 AND julianday(NEW.emitido_en) - julianday((SELECT cerrado_en FROM encargo WHERE id = NEW.encargo_id)) > 60
BEGIN SELECT RAISE(ABORT, 'Pasaron más de 60 días del cierre del encargo: una corrección abre un encargo nuevo, no una versión'); END;
-- Un encargo cerrado no se reabre.
CREATE TRIGGER encargo_cierre_fijo BEFORE UPDATE OF cerrado_en ON encargo
WHEN OLD.cerrado_en IS NOT NULL AND NEW.cerrado_en IS NOT OLD.cerrado_en
BEGIN SELECT RAISE(ABORT, 'Un encargo cerrado no se reabre: una corrección posterior abre un encargo nuevo'); END;

-- Foto de los hallazgos en cada versión: qué decía el dictamen de cada uno.
CREATE TABLE IF NOT EXISTS dictamen_hallazgo (
  dictamen_id   TEXT NOT NULL REFERENCES dictamen(id),
  hallazgo_id   TEXT NOT NULL REFERENCES hallazgo(id),
  estatus       TEXT NOT NULL,
  material      INTEGER NOT NULL CHECK (material IN (0,1)),
  motivos_json  TEXT NOT NULL CHECK (json_valid(motivos_json)),
  efecto_max_c  INTEGER,
  PRIMARY KEY (dictamen_id, hallazgo_id)
);
CREATE TRIGGER IF NOT EXISTS dictamen_hallazgo_inmutable_u BEFORE UPDATE ON dictamen_hallazgo
BEGIN SELECT RAISE(ABORT, 'La foto de hallazgos del dictamen es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS dictamen_hallazgo_inmutable_d BEFORE DELETE ON dictamen_hallazgo
BEGIN SELECT RAISE(ABORT, 'La foto de hallazgos del dictamen es inmutable'); END;

-- ── Dictamen consolidado de grupo (T7) ──────────────────────────────
CREATE TABLE IF NOT EXISTS dictamen_consolidado (
  id                    TEXT PRIMARY KEY,
  encargo_grupo_id      TEXT NOT NULL REFERENCES encargo_grupo(id),
  version               INTEGER NOT NULL,
  anterior_id           TEXT REFERENCES dictamen_consolidado(id),
  motivo_version        TEXT,
  opinion               TEXT NOT NULL CHECK (opinion IN ('conforme','conforme_con_observaciones','con_salvedades','adverso','sin_opinion')),
  componentes_json      TEXT NOT NULL CHECK (json_valid(componentes_json)),
  contenido_json        TEXT NOT NULL CHECK (json_valid(contenido_json)),
  huella_contenido      TEXT NOT NULL,
  revisor_usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  emitido_en            TEXT NOT NULL,
  UNIQUE (encargo_grupo_id, version),
  CHECK ((version = 1 AND anterior_id IS NULL) OR (version > 1 AND anterior_id IS NOT NULL AND motivo_version IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS dictamen_consolidado_inmutable_u BEFORE UPDATE ON dictamen_consolidado
BEGIN SELECT RAISE(ABORT, 'Un dictamen consolidado emitido es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS dictamen_consolidado_inmutable_d BEFORE DELETE ON dictamen_consolidado
BEGIN SELECT RAISE(ABORT, 'Un dictamen consolidado emitido es inmutable'); END;

-- ── Criterios nuevos de esta entrega ────────────────────────────────
INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones) VALUES
('C9', 'Tolerancia agregada (T4)', 'La tolerancia se aplica por rubro y corrida. Individual $0.50; agregada = máx($5.00, colaboradores de la corrida × $0.50) sobre la suma CON SIGNO de las diferencias que pasaron el filtro individual. Si la rompe, ninguna se perdona. Nunca aplica a rubros de entero.',
 'Revisión del maestro v0.3, T4 y N9 (D2 corregida)', 'Sistema (por ratificar con HRM)', '2026-10-15', 'por_confirmar',
 'La suma con signo deja que el redondeo aleatorio se cancele y atrapa el sesgo sistemático. Si HRM prefiere suma de absolutos, es un cambio de una línea.'),
('C10', 'Orden de opiniones en el consolidado (T7)', 'La peor opinión manda: conforme < con observaciones < con salvedades < sin opinión < adverso.',
 'Revisión del maestro v0.3, T7', 'Sistema (por ratificar con HRM)', '2026-10-15', 'por_confirmar',
 'Sin opinión pesa más que salvedades porque no se puede afirmar sobre lo no revisado; adverso pesa más porque sí es una afirmación.');
