// @hrm/kernel — Kernel de cálculo determinista de nómina (modo auditoría, v1).
// Sin estado y sin E/S: recibe datos canónicos y un catálogo de parámetros; devuelve
// cálculos con traza. La persistencia vive en src/d1.js.
export { Exacto, E, pesos } from './exacto.js';
export { Catalogo, Contexto, ParametroFaltante, rangoFechas, NIVELES, BASES_TEMPORALES } from './parametros.js';
export { REGLAS_V1, FUENTES, verificarMatriz, exigirMatriz, filasReglaFuente, listaPBC, versionCatalogoReglas, reglaPorId } from './reglas/index.js';
export { isrPeriodo, subsidioPeriodo } from './reglas/isr.js';
export { aniosServicio } from './reglas/exenciones.js';
export { ejecutar, verificarSello, ESTADOS } from './ejecutar.js';
export { reconciliar, clasificar, aceptacion, resultadoPrueba, CUBETAS } from './reconciliacion.js';
export { sha256Hex, jsonCanonico } from './sello.js';
export { KERNEL_VERSION } from './version.js';
export { KERNEL_HUELLA } from './_huella.js';
export { TOLERANCIA_DEF, toleranciaAgregada, aplicarTolerancia, toleranciaPorGrupo, MATERIALIDAD_DEF, MOTIVOS_CUALITATIVOS, umbralMaterialidad,
  efectoHallazgo, evaluarMaterialidad, MODULOS_FRENTE1, moduloDeRegla, estadoModulos, OPINIONES, ORDEN_OPINION, proponerOpinion, opinionFinal,
  consolidarOpiniones, LIMITE_REPROCESO_DIAS, validarReproceso, transicionHallazgos, NOTA_ALCANCE, fraseOpinion, armarContenido, huellaContenido,
  verificarDictamen } from './dictamen.js';
export { CONTRIBUCION_DE_RUBRO, fechaLimite, mesesDeMora, valuarOmision, sumarValuaciones } from './valuacion.js';
