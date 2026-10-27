-- 0018 — Perfil «carga de documentos» (27-oct-2026).
--
-- Persona del cliente que sube sus documentos y corre las pruebas del sistema sobre su empresa.
-- No cambia el rol: sigue siendo «socio» (cliente), con todo lo que el socio ve en /portal, y el perfil
-- le abre en /kernel la carga (prenómina, XML/metadata, SUA, maestro, calendario) y la ejecución de
-- cruces y reconciliaciones de los encargos ABIERTOS de su empresa. Nunca clasifica diferencias,
-- crea encargos, cambia registros patronales, redacta hallazgos ni emite dictamen: eso es de HRM.
--
-- Se agrega como columna (no se amplía el CHECK de rol) para no reconstruir «usuarios»,
-- que referencian 17 tablas.
ALTER TABLE usuarios ADD COLUMN perfil TEXT CHECK (perfil IS NULL OR perfil IN ('carga'));

CREATE TRIGGER IF NOT EXISTS usuarios_perfil_carga_ins
BEFORE INSERT ON usuarios WHEN NEW.perfil = 'carga' AND (NEW.rol <> 'socio' OR NEW.empresa_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'El perfil carga es de un usuario del cliente: rol socio con empresa'); END;

CREATE TRIGGER IF NOT EXISTS usuarios_perfil_carga_upd
BEFORE UPDATE ON usuarios WHEN NEW.perfil = 'carga' AND (NEW.rol <> 'socio' OR NEW.empresa_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'El perfil carga es de un usuario del cliente: rol socio con empresa'); END;
