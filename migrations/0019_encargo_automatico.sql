-- 0019 — Encargo del mes abierto por la carga automática (27-oct-2026).
--
-- Quien sube los documentos del cliente ya no elige el encargo: el portal lee de qué mes es cada archivo
-- y lo manda al encargo abierto de ese mes. Si el mes todavía no tiene encargo, lo abre copiando la
-- configuración (nivel, origen de la nómina, tolerancia, materialidad, ajuste mensual) del último encargo
-- MENSUAL de la misma empresa. No copia lo que es del periodo (carga patronal, cierre, grupo).
-- Decisión de Claudio, 27-oct-2026: «que el sistema autodetecte de qué mes es sólo con que suba los documentos».
--
-- La clasificación, los hallazgos y el dictamen siguen siendo de HRM: abrir el encargo del mes no califica nada.
-- Aditiva: el código funciona sin ella (no registra quién abrió); con ella, el encargo dice de dónde salió.
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0019_encargo_automatico.sql
ALTER TABLE encargo ADD COLUMN alta TEXT NOT NULL DEFAULT 'manual' CHECK (alta IN ('manual','automatica'));
ALTER TABLE encargo ADD COLUMN creado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE encargo ADD COLUMN plantilla_encargo_id TEXT REFERENCES encargo(id);
