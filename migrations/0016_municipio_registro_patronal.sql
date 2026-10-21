-- 0016 — Municipio del centro de trabajo por registro patronal (20-oct-2026).
-- Fuente: cédulas de determinación del SUA de agosto 2026 («Pob., Mun. / Alcaldía»).
-- Lo usa CALC-ISN-001 para señalar contribuciones municipales semestrales (Expo-Chihuahua, Paso del Norte).
ALTER TABLE registro_patronal ADD COLUMN municipio TEXT;
-- Parámetro ISN_ADICIONAL:CHIH: las contribuciones municipales son semestrales (UMA × promedio de empleados ÷ 2).
UPDATE parametro_fiscal SET clave = 'ISN_ADICIONAL', entidad = 'CHIH', tipo = 'objeto', valor_json = '{"descripcion":"Impuesto Universitario 6% del impuesto causado; contribuciones extraordinarias 10% y 5% sobre base × 3% (= 0.30% y 0.15% de la base, no sobre el 4%); Expo-Chihuahua y Fideicomiso Paso del Norte sólo en sus municipios (guía SH-001-26)","componentes":[{"clave":"impuesto_universitario","sobre":"impuesto","pct":"6"},{"clave":"contribucion_extraordinaria_10","sobre":"base","pct":"0.30"},{"clave":"contribucion_extraordinaria_5","sobre":"base","pct":"0.15"}],"municipales":{"municipios":["Chihuahua","Juárez"],"descripcion":"Expo-Chihuahua (municipio de Chihuahua) y Fideicomiso Paso del Norte (municipio de Juárez): UMA × promedio semestral de empleados en el municipio ÷ 2, pago semestral; no forman parte del ISN mensual (guía SH-001-26)"}}', vigencia_desde = '2026-01-01', vigencia_hasta = '2026-12-31', base_temporal = 'mes_causacion', fundamento = 'Código Fiscal y Ley de Ingresos del Estado de Chihuahua 2026; criterio C23', fuente = 'Gobierno de Chihuahua, Guía del Impuesto sobre Nóminas 2026 (SH-001-26), ipagos.chihuahua.gob.mx', nivel = 'B', notas = 'Cada componente se redondea a centavo por separado. Las contribuciones municipales son semestrales y se determinan aparte. Caso dorado D40: 500,000 → 20,000 + 1,200 + 1,500 + 750 = 23,450. Exposición +$15,218 a +$43,751/mes en PRIME.' WHERE id = 'ISN_ADICIONAL:CHIH@2026';
-- Municipio de los 30 registros de PrimeWireless (empresa 1).
UPDATE registro_patronal SET municipio = 'AGUASCALIENTES' WHERE empresa_id = 1 AND registro = 'A0185335104';
UPDATE registro_patronal SET municipio = 'LOS CABOS' WHERE empresa_id = 1 AND registro = 'M6247221105';
UPDATE registro_patronal SET municipio = 'TIJUANA' WHERE empresa_id = 1 AND registro = 'Z3152922103';
UPDATE registro_patronal SET municipio = 'CARMEN' WHERE empresa_id = 1 AND registro = 'A1135270102';
UPDATE registro_patronal SET municipio = 'CUAUHTEMOC' WHERE empresa_id = 1 AND registro = 'Y6079749104';
UPDATE registro_patronal SET municipio = 'TUXTLA GUTIÉRREZ' WHERE empresa_id = 1 AND registro = 'A6859020104';
UPDATE registro_patronal SET municipio = 'CHIHUAHUA' WHERE empresa_id = 1 AND registro = 'Z4225442103';
UPDATE registro_patronal SET municipio = 'MONCLOVA' WHERE empresa_id = 1 AND registro = 'A2734601101';
UPDATE registro_patronal SET municipio = 'MANZANILLO' WHERE empresa_id = 1 AND registro = 'A4833689102';
UPDATE registro_patronal SET municipio = 'DURANGO' WHERE empresa_id = 1 AND registro = 'B2673542109';
UPDATE registro_patronal SET municipio = 'LERMA' WHERE empresa_id = 1 AND registro = 'C5917180106';
UPDATE registro_patronal SET municipio = 'SILAO' WHERE empresa_id = 1 AND registro = 'B5717749101';
UPDATE registro_patronal SET municipio = 'ACAPULCO DE JUAREZ' WHERE empresa_id = 1 AND registro = 'B6176802100';
UPDATE registro_patronal SET municipio = 'TLAJOMULCO DE ZÚÑIGA' WHERE empresa_id = 1 AND registro = 'H6832552101';
UPDATE registro_patronal SET municipio = 'MORELIA' WHERE empresa_id = 1 AND registro = 'Z4514764100';
UPDATE registro_patronal SET municipio = 'CUAUTLA' WHERE empresa_id = 1 AND registro = 'D1424021106';
UPDATE registro_patronal SET municipio = 'TEPIC' WHERE empresa_id = 1 AND registro = 'D3566967104';
UPDATE registro_patronal SET municipio = 'SAN NICOLAS DE LOS GARZA' WHERE empresa_id = 1 AND registro = 'D5480637101';
UPDATE registro_patronal SET municipio = 'OAXACA DE JUAREZ' WHERE empresa_id = 1 AND registro = 'D6868140106';
UPDATE registro_patronal SET municipio = 'PUEBLA' WHERE empresa_id = 1 AND registro = 'Y4650871108';
UPDATE registro_patronal SET municipio = 'CORREGIDORA' WHERE empresa_id = 1 AND registro = 'E2225843101';
UPDATE registro_patronal SET municipio = 'REYNOSA' WHERE empresa_id = 1 AND registro = 'F0151865105';
UPDATE registro_patronal SET municipio = 'SAN LUIS POTOSÍ' WHERE empresa_id = 1 AND registro = 'E3987541107';
UPDATE registro_patronal SET municipio = 'CULIACAN' WHERE empresa_id = 1 AND registro = 'Z3337346103';
UPDATE registro_patronal SET municipio = 'HERMOSILLO' WHERE empresa_id = 1 AND registro = 'Z4125023102';
UPDATE registro_patronal SET municipio = 'CENTRO' WHERE empresa_id = 1 AND registro = 'E7570861103';
UPDATE registro_patronal SET municipio = 'VICTORIA' WHERE empresa_id = 1 AND registro = 'F0547919103';
UPDATE registro_patronal SET municipio = 'HUAMANTLA' WHERE empresa_id = 1 AND registro = 'H4013410108';
UPDATE registro_patronal SET municipio = 'XALAPA' WHERE empresa_id = 1 AND registro = 'F5463492100';
UPDATE registro_patronal SET municipio = 'GUADALUPE' WHERE empresa_id = 1 AND registro = 'H0231015109';
UPDATE regla SET version = '1.2.0', rubro = 'isn', titulo = 'Impuesto sobre nóminas por entidad', fundamento = 'Ley de hacienda o código fiscal de cada entidad; cuadro de conceptos (V8 pendiente); criterios C22 y C23' WHERE id = 'CALC-ISN-001';
