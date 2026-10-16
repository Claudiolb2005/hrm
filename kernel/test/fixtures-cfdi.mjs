// Fixtures sintéticos de CFDI de nómina y prenómina (ningún dato es de un cliente).
import { zipArchivos, xlsx } from './util.js';

const p2 = (c) => (c / 100).toFixed(2);
export function cfdiXml({ uuid, emp, rfc = 'XAXX010101000', ffp, fip, fpago, tipo = 'O', per = '02', percep, isr, otras = 0, prefijo = 'nomina12', total, rp = 'Y6079749104', version = '4.0' }) {
  const ded = isr + otras;
  const tot = total ?? percep - ded;
  const n = prefijo;
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/' + (version === '4.0' ? '4' : '3') + '" xmlns:' + n + '="http://www.sat.gob.mx/nomina12" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" ' +
    'Version="' + version + '" Serie="N" Folio="' + emp + '" Fecha="' + fpago + 'T10:00:00" SubTotal="' + p2(percep) + '" Descuento="' + p2(ded) + '" Total="' + p2(tot) + '" TipoDeComprobante="N" Moneda="MXN">' +
    '<cfdi:Emisor Rfc="PHO190128QD8" Nombre="EMISOR DE PRUEBA" RegimenFiscal="601"/>' +
    '<cfdi:Receptor Rfc="' + rfc + '" Nombre="RECEPTOR ' + emp + '" UsoCFDI="CN01"/>' +
    '<cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111505" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago de nómina" ValorUnitario="' + p2(percep) + '" Importe="' + p2(percep) + '" Descuento="' + p2(ded) + '"/></cfdi:Conceptos>' +
    '<cfdi:Complemento>' +
    '<' + n + ':Nomina Version="1.2" TipoNomina="' + tipo + '" FechaPago="' + fpago + '" FechaInicialPago="' + fip + '" FechaFinalPago="' + ffp + '" NumDiasPagados="7.000" TotalPercepciones="' + p2(percep) + '" TotalDeducciones="' + p2(ded) + '">' +
    '<' + n + ':Emisor RegistroPatronal="' + rp + '"/>' +
    '<' + n + ':Receptor Curp="XEXX010101HNEXXXA4" NumSeguridadSocial="12345678901" NumEmpleado="' + emp + '" PeriodicidadPago="' + per + '" ClaveEntFed="CMX" TipoContrato="01" TipoRegimen="02"/>' +
    '<' + n + ':Percepciones TotalSueldos="' + p2(percep) + '" TotalGravado="' + p2(percep) + '" TotalExento="0.00">' +
    '<' + n + ':Percepcion TipoPercepcion="001" Clave="001" Concepto="Sueldo" ImporteGravado="' + p2(percep) + '" ImporteExento="0.00"/></' + n + ':Percepciones>' +
    '<' + n + ':Deducciones TotalImpuestosRetenidos="' + p2(isr) + '"' + (otras ? ' TotalOtrasDeducciones="' + p2(otras) + '"' : '') + '>' +
    '<' + n + ':Deduccion TipoDeduccion="002" Clave="002" Concepto="ISR" Importe="' + p2(isr) + '"/>' +
    (otras ? '<' + n + ':Deduccion TipoDeduccion="001" Clave="001" Concepto="IMSS" Importe="' + p2(otras) + '"/>' : '') + '</' + n + ':Deducciones>' +
    '</' + n + ':Nomina>' +
    '<tfd:TimbreFiscalDigital Version="1.1" UUID="' + uuid + '" FechaTimbrado="' + fpago + 'T11:00:00" RfcProvCertif="SAT970701NN3"/>' +
    '</cfdi:Complemento></cfdi:Comprobante>';
}
export const U = (n) => '0000000' + n + '-AAAA-4AAA-8AAA-' + String(n).padStart(12, '0');

export const CAL = [{ corrida_id: 'SEM31', periodicidad: 'semanal', desde: '2026-07-27', hasta: '2026-08-02', fecha_pago: '2026-08-06', ordinaria: true },
  { corrida_id: 'CAT16', periodicidad: 'catorcenal', desde: '2026-07-27', hasta: '2026-08-09', fecha_pago: '2026-08-14', ordinaria: true },
  { corrida_id: 'BONO_SEM_32', periodicidad: 'semanal', desde: '2026-08-03', hasta: '2026-08-09', fecha_pago: '2026-08-13', ordinaria: false }];

// ── De punta a punta ──
export const ENC_CFDI = ['SEMANA / CATORCENA', 'NO.', 'Empleado', 'RFC', 'SD', 'SBC', 'Registro patronal', 'FECHA DE INGRESO', 'Dias trabajados', 'Sueldo', 'Bono', 'Comisiones',
  'Prima dominical', 'incentivos (MONTO)', 'TOTAL PERCEPCIONES', 'I.S.R. (sp)', 'TOTAL DEDUCCIONES', 'NETO SUELDO FISCAL', 'Impuesto estatal'];
const I = Object.fromEntries(ENC_CFDI.map((h, i) => [h, i]));
function fila(o) {
  const f = new Array(ENC_CFDI.length).fill(null);
  f[0] = o.corrida; f[1] = o.emp; f[2] = 'Colaborador ' + o.emp; f[3] = 'XAXX010101' + String(o.emp).slice(-3); f[4] = o.sd ?? 400; f[5] = 615.88; f[6] = 'Y6079749104'; f[7] = 45000; f[8] = 7;
  let t = 0;
  for (const [h, v] of Object.entries(o.perc)) { f[I[h]] = v; t = Math.round((t + v) * 100) / 100; }
  f[I['TOTAL PERCEPCIONES']] = t; f[I['I.S.R. (sp)']] = o.isr; f[I['TOTAL DEDUCCIONES']] = o.isr; f[I['NETO SUELDO FISCAL']] = Math.round((t - o.isr) * 100) / 100;
  f[I['Impuesto estatal']] = o.isn ?? 0;
  return f;
}
export const FILAS_CFDI = [['PRIMEWIRELESS'], ['ACUMULADO'], [], ENC_CFDI,
  fila({ corrida: 'SEM 31', emp: 1067513, sd: 315.24, perc: { Sueldo: 2206.68, Comisiones: 5486, 'incentivos (MONTO)': 68, 'Prima dominical': 78.81 }, isr: 1222.87, isn: 1533.69 }), // ISN del mes por registro, igual al del kernel
  fila({ corrida: 'SEM 31', emp: 1073134, perc: { Sueldo: 2206.68 }, isr: 29.42 }),
  fila({ corrida: 'SEM 31', emp: 390062, sd: 543.16, perc: { Sueldo: 8465.05, 'Prima dominical': 135.79 }, isr: 1384.60 }),
  fila({ corrida: 'BONO SEM 32', emp: 1071756, perc: { Bono: 19695.34 }, isr: 4466.24 }),
];
export const S31 = { ffp: '2026-08-02', fip: '2026-07-27', fpago: '2026-08-06' };
export const PAQUETE = {
  'agosto/a.xml': cfdiXml({ uuid: U(1), emp: '1067513', ...S31, percep: 783949, isr: 122287 }),
  'agosto/b.xml': cfdiXml({ uuid: U(2), emp: '1073134', ...S31, percep: 220668, isr: 2800, prefijo: 'n12' }),           // ISR timbrado distinto
  'agosto/c.xml': cfdiXml({ uuid: U(3), emp: '1071756', ffp: '2026-08-09', fip: '2026-08-03', fpago: '2026-08-13', tipo: 'E', per: '99', percep: 1969534, isr: 446624 }),
  'agosto/d.xml': cfdiXml({ uuid: U(4), emp: '999999', ...S31, percep: 10000, isr: 0 }),                                // sin renglón en la nómina
  'agosto/copia-a.xml': cfdiXml({ uuid: U(1), emp: '1067513', ...S31, percep: 783949, isr: 122287 }),                  // UUID repetido
  'agosto/f.xml': cfdiXml({ uuid: U(6), emp: '1067513', ffp: '2026-07-26', fip: '2026-07-20', fpago: '2026-07-30', percep: 100, isr: 0 }), // otra corrida
  'agosto/g.xml': '<hola/>',
  'agosto/h.xml': cfdiXml({ uuid: U(8), emp: '390062', ...S31, percep: 860084, isr: 138460 }),                         // cancelado ante el SAT
  'agosto/leeme.txt': 'no es xml',
};
export const META = 'Uuid~RfcEmisor~NombreEmisor~RfcReceptor~NombreReceptor~RfcPac~FechaEmision~FechaCertificacionSat~Monto~EfectoComprobante~Estatus~FechaCancelacion\n' +
  [[1, 1], [2, 1], [3, 1], [4, 1], [8, 0]].map(([n, e]) => U(n) + '~PHO190128QD8~X~R~Y~P~2026-08-06~2026-08-06~1~N~' + e + '~').join('\n');


export const archivosPrueba = () => ({ prenomina: xlsx([{ nombre: 'Hoja1', filas: FILAS_CFDI }]), zip: zipArchivos(PAQUETE), meta: META });
