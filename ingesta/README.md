# Ingesta en el servidor (T8)

Lleva el archivo del cliente al kernel sin pasar por el navegador del revisor: el resultado
se calcula en un entorno controlado, con la versión de código sellada en la ejecución.

```
POST /api/kernel/ingestas (archivo) ──► R2 ──► cola en D1 (tabla ingesta)
                                                 │  cron cada minuto + /ingesta/avanzar
                                                 ▼
 pendiente ─► calculando (lotes de 250 renglones) ─► mensual (ajuste mensual, ISN) ─► cerrando ─► terminado
   │ lector XLSX en streaming             │ EXE → ISR por renglón              │ sello + reconciliación
   │ perfil del cliente (mapa)            │ movimientos del cliente            │ diferencias en 3 cubetas
   ▼ lotes canónicos NDJSON en R2         ▼ idempotente (ids deterministas)
```

| Archivo | Qué hace |
|---|---|
| `xlsx.js` | Lector XLSX sin dependencias: ZIP por rango, `DecompressionStream('deflate-raw')`, renglón por renglón. Números como texto exacto, nunca float. Validado contra openpyxl en un archivo real de PRIME: 122,840 celdas, 0 diferencias. |
| `perfiles/prime.js` | Perfil de mapeo declarativo de PrimeWireless (módulo 6): columnas, conceptos y su tipo, columnas del cliente por rubro, corridas. |
| `canonico.js` | Renglón crudo → renglón canónico: centavos exactos, control «suma de conceptos = TOTAL PERCEPCIONES», conceptos no catalogados. |
| `items.js` | Renglón canónico → entradas del kernel (EXE → ISR; ajuste mensual e ISN en la fase mensual) y movimientos del cliente. |
| `trabajos.js` | La cola: fases, candado con vencimiento, reintento desde la fase en que quedó. |

## Lo que nunca hace

- **No adivina columnas.** Un encabezado dentro del bloque de percepciones que no esté en el
  perfil es «concepto no catalogado»: el ISR de los renglones que lo traen queda limitado y la
  fuente `catalogo_conceptos_cliente` se declara incompleta.
- **No inventa fechas.** Una corrida sin calendario se excluye y se declara (`prenomina` incompleta).
- **No infiere la entidad de un registro patronal** de un reporte: viene de `registro_patronal`
  (la tabla vieja `bases_isn` tiene Z33… como San Luis Potosí y es Sinaloa).
- **No da por completo lo que está fuera de la v1:** finiquitos, PTU, conceptos por confirmar (P2).

## Correr agosto 2026 de PrimeWireless

Ya existe el encargo `enc_prime_2026_08` (origen `cliente`, ajuste mensual activo) con el
calendario SEM31–SEM34 y CAT16–CAT17 (fechas de pago por confirmar con PRIME).

1. **Registros patronales**: entidad (clave de 32: CDMX, SIN, CHIH…) y prima de riesgo de cada registro.
   `POST /api/kernel/registros { empresa_id: 1, fuente: "SUA agosto 2026", registros: [...] }`
2. **Subir la prenómina/acumulado de agosto**:
   `POST /api/kernel/ingestas` multipart con `file` y `encargo_id=enc_prime_2026_08`. Arranca sola.
3. **Revisar el reporte** (`GET /api/kernel/ingesta?id=…`): corridas sin calendario (bonos y
   corridas extra: darlas de alta con `ordinaria: false` en `/api/kernel/calendario` y reintentar),
   conceptos no catalogados, resultados por regla y diferencias agrupadas por importe.
4. **Clasificar** cada grupo de diferencias en su cubeta (`/api/kernel/clasificar-grupo`), p. ej. todas
   las de −4.68 en CALC-ISR-SEM-001 → `proceso_mal` (hallazgo 1). Pasa con cero sin clasificar.

IMSS, RCV e INFONAVIT esperan la ingesta del SUA (el SBC se toma del SUA tal como viene, v1);
sin el SUA esas reglas quedan como limitación al alcance, que es lo correcto.
