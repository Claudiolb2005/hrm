-- 0012_retencion.sql — Retención de archivos fuente (N6): el contrato puede pedir más que el plazo legal.
ALTER TABLE encargo ADD COLUMN retencion_contrato_hasta TEXT;
