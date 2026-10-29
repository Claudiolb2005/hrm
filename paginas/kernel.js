// paginas/kernel.js — Panel de auditoría del kernel (/kernel, sólo admin).
//
// Encargo → archivos (ingesta en el servidor, avance) → reporte (fuentes, resultados por regla)
// → diferencias agrupadas por importe y clasificación en cubetas → aceptación.
// Todo lo que viene de un archivo del cliente se escapa antes de pintarse (esc()).
// El JS del navegador va sin backticks ni ${…} para no chocar con el template literal.

import { FUNCIONES_MES } from '../ingesta/mes.js';

// Detección del mes (ingesta/mes.js): las mismas funciones que prueba el servidor, embebidas por toString.
// Al desplegar, wrangler empaqueta con keepNames y mete llamadas a __name(...) dentro de las funciones;
// en el navegador ese ayudante no existe («__name is not defined»), así que se define aquí, inofensivo.
const SHIM_NAME = 'var __name = __name || function (f) { return f; };';
const JS_MES = SHIM_NAME + '\n' + FUNCIONES_MES.map(f => f.toString()).join('\n');

export function paginaKernel({ CSS, LOGO, AUTH_ADMIN, LOGOUT_FN }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditoría — HRM</title>
<style>
${CSS}
*{box-sizing:border-box}
.k-wrap{max-width:1240px;margin:0 auto;padding:22px 24px 60px}
.k-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.k-hd h1{font-size:21px;font-weight:800;color:#1a2e3a;letter-spacing:-.01em}
.k-hd .sub{font-size:12px;color:#8ba5b2}
.k-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.k-card{background:#fff;border:1px solid #d4e5eb;border-radius:14px;padding:18px 20px;margin-bottom:16px}
.k-card h2{font-size:13px;font-weight:800;color:#1a2e3a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
.k-card h3{font-size:13px;font-weight:700;color:#3d5a6b;margin:14px 0 8px}
.k-sel,.k-in{padding:8px 11px;font-size:13px;border:1px solid #c8dfe8;border-radius:8px;background:#f8fbfc;color:#1a2e3a;font-family:inherit;outline:none}
.k-sel:focus,.k-in:focus{border-color:#1a8a8a;background:#fff}
.k-btn{padding:8px 16px;background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
.k-btn:disabled{opacity:.45;cursor:default}
.k-btn.sec{background:#fff;color:#1a8a8a;border:1px solid #1a8a8a}
.k-btn.peq{padding:5px 10px;font-size:11px}
.k-tabs{display:flex;gap:4px;background:#fff;border:1px solid #d4e5eb;border-radius:12px;padding:4px;margin-bottom:16px;overflow-x:auto}
.k-tab{flex:1;min-width:110px;padding:9px 10px;text-align:center;border-radius:9px;font-size:12px;font-weight:700;color:#8ba5b2;cursor:pointer;white-space:nowrap}
.k-tab.act{background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff}
.k-tab .n{display:inline-block;margin-left:5px;padding:0 6px;border-radius:9px;font-size:10px;background:rgba(26,138,138,.12);color:#1a8a8a}
.k-tab.act .n{background:rgba(255,255,255,.25);color:#fff}
.k-tbl{width:100%;border-collapse:collapse;font-size:12px}
.k-tbl th{text-align:left;font-size:10px;font-weight:800;color:#8ba5b2;text-transform:uppercase;letter-spacing:.06em;padding:8px 10px;border-bottom:1px solid #e3eef2;white-space:nowrap}
.k-tbl td{padding:8px 10px;border-bottom:1px solid #eef5f7;color:#1a2e3a;vertical-align:middle}
.k-tbl tr.click{cursor:pointer}
.k-tbl tr.click:hover td{background:#f4fafb}
.k-tbl tr.sel td{background:#e8f5f5}
.num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:11px}
.b{display:inline-block;padding:2px 9px;border-radius:10px;font-size:10px;font-weight:800;letter-spacing:.02em;white-space:nowrap}
.b-ok{background:#e3f6ee;color:#11795a}.b-par{background:#fff4dc;color:#946200}.b-lim{background:#fde8e8;color:#b42318}
.b-neu{background:#eef3f6;color:#5a7a8a}.b-run{background:#e6f2fb;color:#1f6fb2}
.bar{height:6px;border-radius:4px;background:#e3eef2;overflow:hidden;min-width:90px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#1a8a8a,#20a0a0)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.kpi{border:1px solid #e3eef2;border-radius:10px;padding:10px 12px;background:#fbfdfe}
.kpi .l{font-size:10px;font-weight:700;color:#8ba5b2;text-transform:uppercase;letter-spacing:.06em}
.kpi .v{font-size:20px;font-weight:800;color:#1a2e3a;font-variant-numeric:tabular-nums}
.chipl{display:flex;flex-wrap:wrap;gap:6px}
.chipl span{background:#f4f8fa;border:1px solid #e3eef2;border-radius:14px;padding:3px 10px;font-size:11px;color:#3d5a6b}
.aviso{border-left:3px solid #e0a100;background:#fffaf0;padding:9px 12px;border-radius:6px;font-size:12px;color:#5c4a12;margin:8px 0}
.aviso.err{border-color:#b42318;background:#fff5f5;color:#7a1c13}
.aviso.ok{border-color:#11795a;background:#f2fbf7;color:#0d5c44}
.vacio{color:#8ba5b2;font-size:12px;padding:14px 0}
.frm{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end;margin-top:10px}
.frm label{display:block;font-size:10px;font-weight:700;color:#8ba5b2;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
.frm .k-in,.frm .k-sel{width:100%}
.sem{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin:8px 0 14px}
.sem div{border:1px solid #e3eef2;border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.35;background:#fbfdfe}
.sem b{display:block;font-size:12px;color:#1a2e3a}
.sem .verde{border-left:4px solid #11795a}.sem .amarillo{border-left:4px solid #e0a100}.sem .rojo{border-left:4px solid #b42318}
.sem .gris{border-left:4px solid #8ba5b2;background:#f3f6f7}.sem .fuera{border-left:4px dashed #c8d6dc;color:#8ba5b2}
.op{border:1px solid #d4e5eb;border-radius:12px;padding:14px 16px;margin:10px 0;background:#f8fbfc}
.op .t{font-size:18px;font-weight:700;color:#0D2B31}
.op .r{font-size:12px;color:#5a7a8a;margin-top:4px}
.blq li{font-size:12px;color:#7a1c13;margin:3px 0 3px 18px}
html body .k-row>label{display:inline-flex;align-items:center;gap:6px;margin:0;font-size:12px;font-weight:500;color:#3d5a6b}
html body .k-row>label input{width:auto;margin:0}
.oculto{display:none}
.drop{border:2px dashed #c8dfe8;border-radius:12px;padding:16px;text-align:center;font-size:12px;color:#5a7a8a;background:#f8fbfc}
.drop.on{border-color:#1a8a8a;background:#eef8f8}
.scroll{overflow-x:auto}
.scroll.alto{max-height:460px;overflow-y:auto}
.scroll.alto thead th{position:sticky;top:0;background:#fff}
.modo-carga .solo-admin{display:none!important}
.solo-carga{display:none}
.modo-carga .solo-carga{display:block}
.modo-carga a.solo-carga{display:inline-flex}
</style></head><body>
<div class="top"><div class="top-l"><img src="${LOGO}" alt="HRM"><span style="color:#1a8a8a;font-weight:700">Auditoría · Kernel</span></div>
<div class="top-r"><span id="uN" style="color:#5a7a8a;font-size:13px"></span><a href="/admin" class="bo solo-admin">← Administrador</a><a href="/portal" class="bo solo-carga">← Portal</a><button class="bo br" onclick="logout()">Salir</button></div></div>
<div class="k-wrap">
  <div class="k-hd">
    <div><h1>Auditoría de nómina</h1><div class="sub" id="kEstado">Cargando estado del kernel…</div></div>
    <div class="k-row">
      <select id="selEnc" class="k-sel" onchange="cambiarEncargo()"></select>
      <button class="k-btn sec solo-admin" onclick="toggle('frmEnc')">Nuevo encargo</button>
    </div>
  </div>

  <div id="frmEnc" class="k-card oculto solo-admin">
    <h2>Nuevo encargo</h2>
    <div class="frm">
      <div><label>Empresa</label><select id="eEmp" class="k-sel"></select></div>
      <div><label>Clave</label><input id="eId" class="k-in" placeholder="enc_prime_2026_09"></div>
      <div><label>Nivel</label><input id="eNiv" class="k-in" value="B5+"></div>
      <div><label>Desde</label><input id="eDes" class="k-in" type="date"></div>
      <div><label>Hasta</label><input id="eHas" class="k-in" type="date"></div>
      <div><label>Origen de la nómina</label><select id="eOri" class="k-sel"><option value="cliente">Cliente (dictamen)</option><option value="tercero">Tercero (dictamen)</option><option value="la_casa">La casa (control interno)</option></select></div>
      <div><label>Ajuste mensual ISR</label><select id="eAju" class="k-sel"><option value="1">Sí</option><option value="0">No</option></select></div>
      <div><button class="k-btn" onclick="crearEncargo()">Crear</button></div>
    </div>
    <div class="sub" style="margin-top:8px;font-size:11px;color:#8ba5b2">Con origen «la casa» el entregable es revisión de control interno y quien operó la nómina no puede revisar (N1).</div>
  </div>

  <div class="k-card solo-carga" style="border-left:4px solid #1a8a8a">
    <h2>Carga de documentos y pruebas</h2>
    <div class="sub" style="font-size:12px;color:#3d5a6b">Arrastra todos los archivos del mes en <b>Sube los documentos del mes</b> (prenómina o acumulado, ZIP de XML, metadata del SAT, maestro y ZIP del SUA): el sistema detecta de qué mes es cada uno y los manda al encargo de ese mes; si el mes todavía no tiene encargo, lo abre. Si no está seguro del mes, te pide confirmarlo. El sistema los lee en el servidor, corre el kernel y deja listos los cruces y las diferencias, que puedes consultar. La clasificación de diferencias, los hallazgos y el dictamen los hace HRM. Sólo ves los encargos de tu empresa, y un encargo cerrado ya no recibe archivos.</div>
  </div>
  <div class="k-tabs" id="tabs">
    <div class="k-tab act" data-t="archivos">Archivos</div>
    <div class="k-tab solo-admin" data-t="requerimiento">Requerimiento <span class="n" id="nReq">0</span></div>
    <div class="k-tab" data-t="diferencias">Diferencias <span class="n" id="nPend">0</span></div>
    <div class="k-tab" data-t="cfdi">Nómina ↔ CFDI <span class="n" id="nCru">0</span></div>
    <div class="k-tab" data-t="sua">SUA ↔ IMSS <span class="n" id="nSua">0</span></div>
    <div class="k-tab solo-admin" data-t="dictamen">Hallazgos y dictamen <span class="n" id="nHal">0</span></div>
    <div class="k-tab" data-t="calendario">Calendario</div>
    <div class="k-tab" data-t="registros">Registros patronales</div>
    <div class="k-tab" data-t="criterios">Criterios</div>
    <div class="k-tab solo-admin" data-t="cotizador">Cotizador</div>
    <div class="k-tab solo-admin" data-t="expediente">Expediente</div>
  </div>

  <section id="t-archivos">
    <div class="k-card" style="border-left:4px solid #1a8a8a">
      <h2>Sube los documentos del mes</h2>
      <div class="drop" id="dropA">Arrastra aquí todos los archivos juntos (prenómina .xlsx, maestro .xlsx, .zip de XML, .txt de metadata del SAT, .zip del SUA) o <a href="#" onclick="document.getElementById('fAuto').click();return false" style="color:#1a8a8a;font-weight:700">elígelos</a>. El sistema detecta de qué mes es cada uno y lo manda a su encargo; no necesitas elegir el encargo.<input type="file" id="fAuto" multiple accept=".xlsx,.zip,.txt,.csv" class="oculto" onchange="analizarAuto(this.files)"></div>
      <div id="msgAuto"></div>
      <div id="detAuto"></div>
    </div>
    <div class="k-card">
      <h2>Subir prenómina / acumulado</h2>
      <div class="drop" id="drop">Arrastra aquí el Excel o <a href="#" onclick="document.getElementById('fArch').click();return false" style="color:#1a8a8a;font-weight:700">elígelo</a>. Se procesa en el servidor; puedes cerrar esta pestaña.<input type="file" id="fArch" accept=".xlsx" class="oculto" onchange="subir(this.files[0])"></div>
      <div id="msgSubir"></div>
    </div>
    <div class="k-card">
      <h2>Ingestas del encargo</h2>
      <div class="scroll"><table class="k-tbl"><thead><tr><th>Archivo</th><th>Estado</th><th>Avance</th><th class="num">Renglones</th><th>Actualizado</th><th></th></tr></thead><tbody id="tbIng"></tbody></table></div>
    </div>
    <div class="k-card oculto" id="detIng"></div>
    <div class="k-card">
      <h2>XML de nómina y estado ante el SAT</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">Los XML originales del periodo en un .zip (no el export de One Facture) y, para saber cuáles siguen vigentes, el .txt de metadata de la descarga masiva del SAT. Sin los XML el dictamen sale sin opinión (D13).</div>
      <div class="frm" style="margin:0 0 10px"><div><label>Cruzar por</label><select id="cLla" class="k-sel"><option value="num_empleado">Número de empleado</option><option value="rfc">RFC del receptor</option></select></div></div>
      <div class="drop" id="dropC">Arrastra aquí el .zip de XML o el .txt de metadata, o <a href="#" onclick="document.getElementById('fCfdi').click();return false" style="color:#1a8a8a;font-weight:700">elígelo</a>.<input type="file" id="fCfdi" accept=".zip,.txt" class="oculto" onchange="subirCfdi(this.files[0])"></div>
      <div id="msgCfdi"></div>
      <div class="scroll" style="margin-top:10px"><table class="k-tbl"><thead><tr><th>Archivo</th><th>Tipo</th><th>Estado</th><th>Avance</th><th class="num">Entradas</th><th>Actualizado</th></tr></thead><tbody id="tbCfdi"></tbody></table></div>
    </div>
    <div class="k-card oculto" id="detCfdi"></div>
    <div class="k-card">
      <h2>Maestro de empleados</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">Fechas de alta y baja por trabajador para detectar pagos a personas sin alta o ya dadas de baja (siempre material). Sólo se guardan número de empleado, RFC, fechas y grupo de nómina.</div>
      <div class="drop" id="dropM">Arrastra aquí el .xlsx del maestro (HC con hojas de activos, bajas y finiquitos) o <a href="#" onclick="document.getElementById('fMae').click();return false" style="color:#1a8a8a;font-weight:700">elígelo</a>.<input type="file" id="fMae" accept=".xlsx" class="oculto" onchange="subirMaestro(this.files[0])"></div>
      <div id="msgMae"></div>
      <div id="detMae"></div>
    </div>
  </section>

  <section id="t-cfdi" class="oculto">
    <div class="k-card">
      <h2>Cruce nómina ↔ CFDI</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">Percepciones, ISR retenido y neto del CFDI contra la nómina, por colaborador y corrida, al centavo (criterio C11). Lo que coincide no aparece.</div>
      <div id="aceptC"></div>
      <div class="k-row" style="margin:6px 0 10px"><label style="font-size:12px;color:#5a7a8a">Paquete</label><select id="selCf" class="k-sel" onchange="cargarCruces()"></select></div>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Tipo</th><th>Rubro</th><th class="num">CFDI − nómina</th><th>Corrida</th><th class="num">Casos</th><th class="num">Pendientes</th><th>Cubeta</th></tr></thead><tbody id="tbCru"></tbody></table></div>
    </div>
    <div class="k-card oculto" id="clasC">
      <h2 id="clasCT">Clasificar</h2>
      <div class="frm solo-admin">
        <div><label>Cubeta</label><select id="xCub" class="k-sel" onchange="document.getElementById('xCritW').classList.toggle('oculto', this.value!=='criterio_sin_resolver')">
          <option value="proceso_mal">Proceso actual mal (hallazgo)</option><option value="explicada">Explicada (no es incumplimiento)</option><option value="criterio_sin_resolver">Criterio sin resolver</option></select></div>
        <div id="xCritW" class="oculto"><label>Criterio de la bitácora</label><select id="xCrit" class="k-sel"></select></div>
        <div style="grid-column:span 2"><label>Motivo</label><input id="xMotC" class="k-in" placeholder="Ej. ISR timbrado distinto del retenido"></div>
        <div><button class="k-btn" onclick="clasificarCruces()">Clasificar grupo</button></div>
      </div>
      <h3>Casos</h3>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Colaborador</th><th>Corrida</th><th class="num">Nómina</th><th class="num">CFDI</th><th>UUID</th><th></th></tr></thead><tbody id="tbCruC"></tbody></table></div>
    </div>
  </section>

  <section id="t-sua" class="oculto">
    <div class="k-card">
      <h2>SUA contra la emisión del IMSS</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">Por trabajador y rama: lo que <b>calcula el kernel</b> (tramos de SBC de la emisión del IMSS e incapacidades del SUA, criterio C26), lo que <b>emitió el IMSS</b> (EMA/EBA) y lo que <b>se pagó</b> en el archivo .SUA. Al centavo, sin tolerancia (C24). Lo que coincide en los tres lados no aparece.</div>
      <div class="drop" id="dropS">Arrastra aquí el .zip del SUA del mes (también sirve el paquete completo) o <a href="#" onclick="document.getElementById('fSua').click();return false" style="color:#1a8a8a;font-weight:700">elígelo</a>. Se abre en tu navegador y al servidor sólo suben, por registro patronal, el .SUA y los archivos de la emisión (CDEMMO99, CDEBMO99, CDEMPA99).<input type="file" id="fSua" accept=".zip" class="oculto" onchange="subirSua(this.files[0])"></div>
      <div id="msgSua"></div>
      <div class="k-row" style="margin:10px 0"><label style="font-size:12px;color:#5a7a8a">Periodo</label><select id="selSuaPer" class="k-sel" onchange="pintarSua()"></select></div>
      <div id="kpiSua"></div>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Registro</th><th>Entidad</th><th class="num">Trab.</th><th class="num">Pagado SUA</th><th class="num">Kernel</th><th class="num">Emitido IMSS</th><th class="num">Pagado − kernel</th><th class="num">Pagado − emitido</th><th class="num">Pendientes</th><th>Cuadre</th></tr></thead><tbody id="tbSua"></tbody></table></div>
    </div>
    <div class="k-card">
      <h2>Diferencias por causa y rama</h2>
      <div id="aceptS"></div>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Causa</th><th>Rama</th><th class="num">Casos</th><th class="num">Registros</th><th class="num">Pagado − kernel</th><th class="num">Pagado − emitido</th><th class="num">Pendientes</th><th>Cubeta</th></tr></thead><tbody id="tbSuaG"></tbody></table></div>
    </div>
    <div class="k-card oculto" id="clasS">
      <h2 id="clasST">Clasificar</h2>
      <div class="frm solo-admin">
        <div><label>Cubeta</label><select id="sCub" class="k-sel" onchange="document.getElementById('sCritW').classList.toggle('oculto', this.value!=='criterio_sin_resolver')">
          <option value="explicada">Explicada (no es incumplimiento)</option><option value="proceso_mal">Proceso actual mal (hallazgo)</option><option value="criterio_sin_resolver">Criterio sin resolver</option></select></div>
        <div id="sCritW" class="oculto"><label>Criterio de la bitácora</label><select id="sCrit" class="k-sel"></select></div>
        <div style="grid-column:span 2"><label>Motivo</label><input id="sMot" class="k-in" placeholder="Ej. La emisión no descuenta incapacidades (C26)"></div>
        <div><button class="k-btn" onclick="clasificarSua()">Clasificar grupo</button></div>
      </div>
      <h3>Casos (los de mayor importe primero)</h3>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Registro</th><th>Colaborador</th><th>NSS</th><th class="num">Kernel</th><th class="num">Emitido</th><th class="num">Pagado</th><th class="num">Días / incap.</th><th class="num">Tramos</th><th></th></tr></thead><tbody id="tbSuaC"></tbody></table></div>
    </div>
  </section>

  <section id="t-requerimiento" class="oculto">
    <div class="k-card">
      <div class="k-row" style="justify-content:space-between"><h2 style="margin:0">Requerimiento de información</h2><a class="k-btn sec peq" id="verCliente" target="_blank" rel="noopener" style="text-decoration:none">Ver como el cliente</a></div>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin:8px 0">La lista sale de la matriz regla ↔ fuente: se pide lo que las reglas del encargo necesitan. La prenómina y los XML se marcan solos al leerse.</div>
      <div class="frm" id="frmGen"><div style="grid-column:span 2"><label>Responsable del cliente</label><input id="qRes" class="k-in" placeholder="Nombre y puesto"></div><div><label>Entrega comprometida</label><input id="qFec" class="k-in" type="date"></div><div><button class="k-btn" onclick="generarReq()">Generar requerimiento</button></div></div>
      <div id="msgReq"></div>
      <div class="scroll" style="margin-top:10px"><table class="k-tbl"><thead><tr><th>Documento</th><th>Estado</th><th>Responsable</th><th>Compromiso</th><th>Archivos del cliente</th><th></th></tr></thead><tbody id="tbReq"></tbody></table></div>
    </div>
  </section>

  <section id="t-diferencias" class="oculto">
    <div class="k-card">
      <h2>Diferencias kernel vs nómina</h2>
      <div id="acept"></div>
      <div class="k-row" style="margin:6px 0 10px"><label style="font-size:12px;color:#5a7a8a">Ejecución</label><select id="selEj" class="k-sel" onchange="cargarGrupos()"></select></div>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Regla</th><th>Rubro</th><th class="num">Diferencia</th><th class="num">Casos</th><th class="num">Pendientes</th><th>Cubeta</th><th></th></tr></thead><tbody id="tbGr"></tbody></table></div>
    </div>
    <div class="k-card oculto" id="clasif">
      <h2 id="clasifT">Clasificar</h2>
      <div class="frm solo-admin">
        <div><label>Cubeta</label><select id="cCub" class="k-sel" onchange="document.getElementById('cCritW').classList.toggle('oculto', this.value!=='criterio_sin_resolver')">
          <option value="proceso_mal">Proceso actual mal (hallazgo)</option><option value="kernel_mal">Kernel mal (se corrige)</option><option value="criterio_sin_resolver">Criterio sin resolver</option></select></div>
        <div id="cCritW" class="oculto"><label>Criterio de la bitácora</label><select id="cCrit" class="k-sel"></select></div>
        <div style="grid-column:span 2"><label>Motivo</label><input id="cMot" class="k-in" placeholder="Ej. subsidio al 15.59% en lugar de 15.02% (hallazgo 1)"></div>
        <div><button class="k-btn" onclick="clasificarGrupo()">Clasificar grupo</button></div>
      </div>
      <h3>Casos del grupo</h3>
      <div class="scroll alto"><table class="k-tbl"><thead><tr><th>Colaborador</th><th>Corrida</th><th class="num">Kernel</th><th class="num">Nómina</th><th class="num">Diferencia</th><th>Origen</th><th></th></tr></thead><tbody id="tbCasos"></tbody></table></div>
    </div>
  </section>

  <section id="t-dictamen" class="oculto">
    <div class="k-card">
      <h2>Materialidad y tolerancia del encargo</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a">El umbral se mide sobre la carga patronal del periodo dictaminado: un mes en iguala, el ejercicio en los niveles A (T5). La tolerancia nunca aplica a entero (T4).</div>
      <div class="frm">
        <div><label>Carga patronal del periodo</label><input id="mCar" class="k-in" placeholder="27,756,000.00"></div>
        <div style="grid-column:span 2"><label>Fuente de la carga</label><input id="mFue" class="k-in" placeholder="SUA + ISN declarado, agosto 2026"></div>
        <div><label>Materialidad %</label><input id="mBp" class="k-in" placeholder="0.50"></div>
        <div><label>Piso</label><input id="mPis" class="k-in" placeholder="10,000.00"></div>
        <div><label>Recurrencia (periodos)</label><input id="mRec" class="k-in" placeholder="3"></div>
        <div><label>Tolerancia por colaborador</label><input id="mTol" class="k-in" placeholder="0.50"></div>
        <div><button class="k-btn" onclick="guardarConfig()">Guardar</button></div>
      </div>
      <div id="msgCfg"></div>
    </div>

    <div class="k-card">
      <h2>Diferencias de proceso sin cédula</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">Cada diferencia clasificada como «proceso actual mal» tiene que quedar en una cédula de hallazgo antes de emitir.</div>
      <div class="scroll"><table class="k-tbl"><thead><tr><th>Regla</th><th>Rubro</th><th>Motivo</th><th class="num">Casos</th><th class="num">Colaboradores</th><th class="num">Efecto</th><th></th></tr></thead><tbody id="tbPenH"></tbody></table></div>
    </div>

    <div class="k-card oculto" id="frmHal">
      <h2 id="frmHalT">Nueva cédula de hallazgo</h2>
      <div class="frm">
        <div style="grid-column:span 2"><label>Título</label><input id="hTit" class="k-in"></div>
        <div><label>Módulo</label><select id="hMod" class="k-sel"></select></div>
        <div><label>Tipo</label><select id="hTip" class="k-sel" onchange="document.getElementById('hMotW').classList.toggle('oculto',this.value!=='cualitativo')"><option value="cuantitativo">Cuantitativo</option><option value="cualitativo">Cualitativo (siempre material)</option></select></div>
        <div id="hMotW" class="oculto"><label>Motivo cualitativo</label><select id="hMot" class="k-sel"></select></div>
        <div><label>Riesgo</label><select id="hRie" class="k-sel"><option value="alto">Alto</option><option value="medio" selected>Medio</option><option value="bajo">Bajo</option></select></div>
        <div style="grid-column:1/-1"><label>Criterio (fundamento legal)</label><input id="hCri" class="k-in"></div>
        <div style="grid-column:1/-1"><label>Condición (lo encontrado, con el dato)</label><input id="hCon" class="k-in"></div>
        <div style="grid-column:span 2"><label>Causa</label><input id="hCau" class="k-in"></div>
        <div style="grid-column:span 2"><label>Recomendación ejecutable</label><input id="hRec" class="k-in" placeholder="Pantalla, campo o parámetro a corregir"></div>
        <div><label>Responsable</label><input id="hRes" class="k-in"></div>
        <div><label>Fecha compromiso</label><input id="hFec" class="k-in" type="date"></div>
        <div><label>Efecto mínimo</label><input id="hEmi" class="k-in" placeholder="Opcional"></div>
        <div><label>Efecto máximo</label><input id="hEma" class="k-in" placeholder="Sin diferencias: obligatorio"></div>
        <div><label>A nivel neto</label><select id="hNet" class="k-sel"><option value="0">No</option><option value="1">Sí (CFDI ↔ nómina)</option></select></div>
        <div><button class="k-btn" onclick="crearHallazgo()">Guardar cédula</button></div>
      </div>
      <div id="hFil" class="sub" style="font-size:12px;color:#5a7a8a;margin-top:8px"></div>
      <div id="msgHal"></div>
    </div>

    <div class="k-card">
      <div class="k-row" style="justify-content:space-between"><h2 style="margin:0">Hallazgos</h2><button class="k-btn sec peq" onclick="nuevaCedula(null)">Hallazgo sin diferencias</button></div>
      <div id="umbralTxt" class="sub" style="font-size:12px;color:#5a7a8a;margin:8px 0"></div>
      <div class="scroll"><table class="k-tbl"><thead><tr><th>#</th><th>Hallazgo</th><th>Módulo</th><th class="num">Efecto máx.</th><th>Materialidad</th><th>Riesgo</th><th>Estatus</th></tr></thead><tbody id="tbHal"></tbody></table></div>
    </div>

    <div class="k-card oculto" id="detHal"></div>

    <div class="k-card">
      <h2>Dictamen</h2>
      <div class="frm">
        <div style="grid-column:span 2"><label>Ejecución sellada</label><select id="dEj" class="k-sel"></select></div>
        <div style="grid-column:span 2"><label>Limitaciones declaradas (módulo, motivo; una por renglón)</label><textarea id="dLim" class="k-in" style="min-height:38px" placeholder="4.11, Finiquitos, liquidaciones y PTU sin regla en la versión 1"></textarea></div>
        <div><button class="k-btn" onclick="proponer()">Calcular propuesta</button></div>
      </div>
      <div id="dProp"></div>
      <h3>Versiones emitidas</h3>
      <div class="scroll"><table class="k-tbl"><thead><tr><th>Versión</th><th>Opinión</th><th>Emitido</th><th>Motivo de la versión</th><th>Huella</th><th></th></tr></thead><tbody id="tbDic"></tbody></table></div>
      <div class="k-row" style="margin-top:10px"><button class="k-btn sec peq" onclick="cerrarEncargo()">Cerrar encargo</button><span class="sub" style="font-size:11px;color:#8ba5b2">Después del cierre hay 60 días para emitir versiones; pasado ese plazo una corrección abre un encargo nuevo.</span></div>
    </div>
  </section>

  <section id="t-calendario" class="oculto">
    <div class="k-card">
      <h2>Calendario de nómina</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">Sin calendario no hay fecha de pago ni periodicidad: los renglones de una corrida sin calendario se excluyen y se declaran.</div>
      <div class="scroll"><table class="k-tbl"><thead><tr><th>Corrida</th><th>Periodicidad</th><th>Desde</th><th>Hasta</th><th>Pago</th><th>Tipo</th><th>Fuente</th></tr></thead><tbody id="tbCal"></tbody></table></div>
      <h3>Agregar o corregir corrida</h3>
      <div class="frm">
        <div><label>Corrida</label><input id="kCor" class="k-in" placeholder="SEM35 o BONO_SEM_32"></div>
        <div><label>Periodicidad</label><select id="kPer" class="k-sel"><option>semanal</option><option>catorcenal</option><option>quincenal</option><option>decenal</option><option>mensual</option></select></div>
        <div><label>Desde</label><input id="kDes" class="k-in" type="date"></div>
        <div><label>Hasta</label><input id="kHas" class="k-in" type="date"></div>
        <div><label>Fecha de pago</label><input id="kPag" class="k-in" type="date"></div>
        <div><label>Tipo</label><select id="kOrd" class="k-sel"><option value="1">Ordinaria</option><option value="0">Extra (corrida aparte)</option></select></div>
        <div style="grid-column:span 2"><label>Fuente</label><input id="kFue" class="k-in" placeholder="Calendario de pagos PRIME 2026"></div>
        <div><button class="k-btn" onclick="guardarCorrida()">Guardar</button></div>
      </div>
    </div>
  </section>

  <section id="t-registros" class="oculto">
    <div class="k-card">
      <h2>Registros patronales</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin-bottom:8px">La entidad es la del centro de trabajo; nunca se infiere de un reporte. Claves: <span class="mono">AGS BC BCS CAMP CHIS CHIH CDMX COAH COL DGO GTO GRO HGO JAL MEX MICH MOR NAY NL OAX PUE QRO QROO SLP SIN SON TAB TAMS TLAX VER YUC ZAC</span></div>
      <div class="scroll"><table class="k-tbl"><thead><tr><th>Registro</th><th>Entidad</th><th class="num">Prima RT %</th><th>Vigencia</th><th>Fuente</th></tr></thead><tbody id="tbReg"></tbody></table></div>
      <div class="solo-admin">
      <h3>Cargar (uno por renglón: registro, entidad, prima %, desde, hasta)</h3>
      <textarea id="rTxt" class="k-in" style="width:100%;min-height:110px;font-family:ui-monospace,Menlo,monospace;font-size:12px" placeholder="Y6079749104, CDMX, 0.50, 2026-03-01, 2027-02-28&#10;Z3337346103, SIN, 0.50, 2026-03-01, 2027-02-28"></textarea>
      <div class="frm"><div style="grid-column:span 3"><label>Fuente</label><input id="rFue" class="k-in" placeholder="SUA agosto 2026"></div><div><button class="k-btn" onclick="guardarRegistros()">Guardar registros</button></div></div>
      <div id="msgReg"></div>
      </div>
    </div>
  </section>

  <section id="t-cotizador" class="oculto">
    <div class="k-card">
      <div class="k-row" style="justify-content:space-between"><h2 style="margin:0">Cotizador de honorarios</h2><button class="k-btn sec peq" onclick="tomarPerfil()">Tomar del encargo</button></div>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin:8px 0">Tarifa de Nómina Verificada v2 con las recomendaciones N2, N3 y T7 (por ratificar). Los porcentajes se dicen contra su base.</div>
      <div class="frm">
        <div><label>Colaboradores</label><input id="zC" class="k-in" type="number" min="0"></div>
        <div><label>Registros patronales</label><input id="zR" class="k-in" type="number" min="0"></div>
        <div><label>Corridas al mes</label><input id="zK" class="k-in" type="number" min="0"></div>
        <div><label>Carga patronal mensual</label><input id="zCar" class="k-in" placeholder="27,755,641.00"></div>
        <div><label>Percepciones mensuales</label><input id="zPer" class="k-in" placeholder="114,250,000.00"></div>
        <div><label>RFC adicionales</label><input id="zRfc" class="k-in" type="number" min="0" value="0"></div>
        <div><label>Ejercicios anteriores</label><input id="zEj" class="k-in" type="number" min="0" value="0"></div>
        <div><label>Horas de requerimiento</label><input id="zHr" class="k-in" type="number" min="0" value="0"></div>
        <div><label>Saldos a favor a recuperar</label><input id="zSal" class="k-in" placeholder="0.00"></div>
      </div>
      <div class="k-row" style="margin:10px 0;font-size:12px;color:#3d5a6b;gap:16px"><label><input type="checkbox" id="zPrev"> Modalidad preventiva</label><label><input type="checkbox" id="zRepse"> REPSE, ICSOE o SISUB</label><label><input type="checkbox" id="zCc"> Contrato colectivo o turnos</label><label><input type="checkbox" id="zSbc"> Reconstrucción de SBC variable</label></div>
      <div class="k-row"><button class="k-btn" onclick="cotizarAhora(false)">Cotizar</button><input id="zPro" class="k-in" placeholder="Prospecto (si no es la empresa del encargo)" style="flex:1;min-width:200px"><button class="k-btn sec" onclick="cotizarAhora(true)">Guardar cotización</button></div>
      <div id="msgCot"></div>
      <div id="resCot"></div>
    </div>
    <div class="k-card"><h2>Cotizaciones guardadas</h2><div class="scroll"><table class="k-tbl"><thead><tr><th>Fecha</th><th>Cliente</th><th class="num">Iguala mensual</th><th class="num">Diagnóstico</th><th>Tarifa</th></tr></thead><tbody id="tbCot"></tbody></table></div></div>
  </section>

  <section id="t-expediente" class="oculto">
    <div class="k-card">
      <h2>Expediente de defensa</h2>
      <div class="sub" style="font-size:12px;color:#5a7a8a;margin:4px 0 10px">Los papeles de trabajo del sistema se conservan siempre. Los archivos que entrega el cliente se guardan cinco años después de la última declaración del ejercicio, o más si el contrato lo pide (N6).</div>
      <div class="frm"><div><label>El contrato pide conservar hasta</label><input id="xCon" class="k-in" type="date"></div><div><button class="k-btn sec" onclick="guardarRetencion()">Guardar plazo del contrato</button></div></div>
      <div id="msgExp"></div>
      <div id="resExp"></div>
    </div>
    <div class="k-card"><h2>Archivos fuente</h2><div class="scroll"><table class="k-tbl"><thead><tr><th>Archivo</th><th>Tipo</th><th class="num">Tamaño</th><th>Subido</th><th>Conservar hasta</th></tr></thead><tbody id="tbExp"></tbody></table></div></div>
    <div class="k-card"><h2>Datos personales que trata el sistema</h2><div class="scroll"><table class="k-tbl"><thead><tr><th>Categoría</th><th>Datos</th><th>Dónde</th><th>Plazo</th></tr></thead><tbody id="tbInv"></tbody></table></div></div>
  </section>

  <section id="t-criterios" class="oculto">
    <div class="k-card"><h2>Bitácora de criterios</h2><div class="scroll"><table class="k-tbl"><thead><tr><th>#</th><th>Tema</th><th>Decisión</th><th>Estado</th><th>Quién</th></tr></thead><tbody id="tbCrit"></tbody></table></div></div>
  </section>
</div>
<script>
${AUTH_ADMIN}
${LOGOUT_FN}
document.getElementById('uN').textContent = (U.nombre || U.email || '') + (U.rol !== 'admin' && U.empresa_nombre ? ' · ' + U.empresa_nombre.split(' ')[0] : '');
var CARGA = U.rol !== 'admin';
if (CARGA) document.body.classList.add('modo-carga');
var ENC = null, ENCS = [], ING = null, POLL = null, GRUPO = null, CRITS = [];
var REGLAS = {'CALC-EXE-001':'Exenciones y base','CALC-SUB-001':'Subsidio','CALC-ISR-SEM-001':'ISR semanal','CALC-ISR-CAT-001':'ISR catorcenal','CALC-ISR-AJM-001':'Ajuste mensual ISR','CALC-ISR-EXT-001':'ISR pagos extra','CALC-IMSS-001':'IMSS','CALC-RCV-001':'RCV','CALC-INF-001':'INFONAVIT','CALC-ISN-001':'ISN'};
var CUBETAS = {proceso_mal:'Hallazgo',kernel_mal:'Kernel mal',criterio_sin_resolver:'Criterio'};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pesos(c){if(c==null)return '—';var n=Number(c),s=n<0?'-':'';n=Math.abs(n);return s+'$'+Math.floor(n/100).toLocaleString('es-MX')+'.'+String(n%100).padStart(2,'0')}
function fecha(s){return s?String(s).replace('T',' ').slice(0,16):'—'}
function toggle(id){document.getElementById(id).classList.toggle('oculto')}
function api(m,p,b){
  var o={method:m,headers:{'Authorization':'Bearer '+tk}};
  if(b instanceof FormData)o.body=b;else if(b){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b)}
  return fetch(p,o).then(function(r){
    if(r.status===401){localStorage.removeItem('hrm_token');localStorage.removeItem('hrm_user');window.location.href='/';return Promise.reject(new Error('Sesión vencida'))}
    return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j});
  });
}
function aviso(id,txt,tipo){document.getElementById(id).innerHTML=txt?'<div class="aviso '+(tipo||'')+'">'+esc(txt)+'</div>':''}
function badgeEstado(e){
  var m={completo:['b-ok','Completo'],universo_parcial:['b-par','Universo parcial'],limitacion_alcance:['b-lim','Limitación al alcance'],
    terminado:['b-ok','Terminado'],error:['b-lim','Error'],pendiente:['b-run','En cola'],calculando:['b-run','Calculando'],mensual:['b-run','Ajuste mensual'],cerrando:['b-run','Sellando']};
  var x=m[e]||['b-neu',e];return '<span class="b '+x[0]+'">'+esc(x[1])+'</span>';
}

document.querySelectorAll('.k-tab').forEach(function(t){t.addEventListener('click',function(){
  document.querySelectorAll('.k-tab').forEach(function(x){x.classList.toggle('act',x===t)});
  ['archivos','requerimiento','diferencias','cfdi','sua','dictamen','calendario','registros','criterios','cotizador','expediente'].forEach(function(s){document.getElementById('t-'+s).classList.toggle('oculto',s!==t.dataset.t)});
  if(t.dataset.t==='diferencias')cargarEjecuciones();
  if(t.dataset.t==='requerimiento')cargarReq();
  if(t.dataset.t==='cfdi')cargarPaquetes();
  if(t.dataset.t==='sua')cargarSua();
  if(t.dataset.t==='dictamen')cargarDictamen();
  if(t.dataset.t==='calendario')cargarCalendario();
  if(t.dataset.t==='registros')cargarRegistros();
  if(t.dataset.t==='criterios')cargarCriterios();
  if(t.dataset.t==='cotizador')cargarCotizaciones();
  if(t.dataset.t==='expediente')cargarExpediente();
})});

var drop=document.getElementById('drop');
['dragenter','dragover'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('on')})});
['dragleave','drop'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('on')})});
drop.addEventListener('drop',function(ev){if(ev.dataTransfer.files[0])subir(ev.dataTransfer.files[0])});

function cargarEstado(){
  api('GET','/api/kernel/estado').then(function(e){
    var ok=e.puede_arrancar&&e.parametros_integros&&(!e.matriz_d1_vs_codigo||!e.matriz_d1_vs_codigo.length);
    document.getElementById('kEstado').innerHTML='Kernel '+esc(e.kernel_version)+' · '+esc(e.kernel_huella)+' · parámetros '+esc(e.version_parametros_d1)+' · '+
      (ok?'<span class="b b-ok">Íntegro</span>':'<span class="b b-lim">Revisar integridad</span>');
  }).catch(function(err){document.getElementById('kEstado').textContent='Estado no disponible: '+err.message});
}

function cargarEncargos(sel){
  var pEmp=CARGA?Promise.resolve({empresas:[{id:U.empresa_id,nombre:U.empresa_nombre||'Mi empresa'}]}):api('GET','/api/empresas');
  return Promise.all([api('GET','/api/kernel/encargos'+(CARGA?'?empresa_id='+encodeURIComponent(U.empresa_id):'')),pEmp]).then(function(r){
    ENCS=r[0].encargos||[];var emps=r[1].empresas||[];
    var nom={};emps.forEach(function(e){nom[e.id]=e.nombre});
    document.getElementById('eEmp').innerHTML=emps.map(function(e){return '<option value="'+e.id+'">'+esc(e.nombre)+'</option>'}).join('');
    var s=document.getElementById('selEnc');
    s.innerHTML=ENCS.length?ENCS.map(function(e){return '<option value="'+esc(e.id)+'">'+esc((nom[e.empresa_id]||'Empresa '+e.empresa_id).split(' ')[0]+' · '+e.periodo_desde.slice(0,7)+' · '+e.id)+'</option>'}).join(''):'<option value="">Sin encargos</option>';
    var guardado=null;try{guardado=localStorage.getItem('hrm_kernel_enc')}catch(x){}
    var elegido=sel||guardado;if(elegido&&ENCS.some(function(e){return e.id===elegido}))s.value=elegido;
    cambiarEncargo();
  });
}
function cambiarEncargo(){
  var id=document.getElementById('selEnc').value;ENC=ENCS.filter(function(e){return e.id===id})[0]||null;
  try{if(ENC)localStorage.setItem('hrm_kernel_enc',ENC.id)}catch(x){}
  ING=null;document.getElementById('detIng').classList.add('oculto');
  cargarIngestas();cargarCfdi();cargarMaestro();cargarSua();
  var act=document.querySelector('.k-tab.act');if(act&&act.dataset.t!=='archivos')act.click();
}
function crearEncargo(){
  var b={id:document.getElementById('eId').value.trim(),empresa_id:Number(document.getElementById('eEmp').value),nivel:document.getElementById('eNiv').value.trim(),
    periodo_desde:document.getElementById('eDes').value,periodo_hasta:document.getElementById('eHas').value,ejercicio:Number((document.getElementById('eDes').value||'').slice(0,4)),
    origen_nomina:document.getElementById('eOri').value,aplica_ajuste_mensual:document.getElementById('eAju').value==='1'};
  if(b.origen_nomina==='la_casa'){var op=prompt('Id de usuario que operó la nómina (no podrá revisar):');if(!op)return;b.operador_nomina_usuario_id=Number(op)}
  api('POST','/api/kernel/encargos',b).then(function(){toggle('frmEnc');cargarEncargos(b.id)}).catch(function(e){alert(e.message)});
}

// ── SUA ↔ emisión del IMSS
var SUAL=[],GSUA=null;
var CAUSAS={incapacidad:'Incapacidad: la emisión no la descuenta',sua_distinto_imss:'SUA distinto al IMSS (días o SBC)',calculo_limitado:'Cálculo limitado',kernel_distinto:'Kernel distinto de ambos',sin_emision:'Pagado sin emisión',sin_pago:'Emitido sin pago'};
var RAMASN={cuota_fija:'Cuota fija',excedente:'Excedente 3 UMA',dinero:'Prest. en dinero',gmp:'Gastos médicos pens.',rt:'Riesgo de trabajo',iv:'Invalidez y vida',guarderias:'Guarderías',retiro:'Retiro',ceav_patronal:'CEAV patronal',ceav_obrera:'CEAV obrera',infonavit:'INFONAVIT'};
var CUBS={proceso_mal:'Hallazgo',explicada:'Explicada',criterio_sin_resolver:'Criterio'};
function cargarJSZip(){if(window.JSZip)return Promise.resolve();return new Promise(function(ok,mal){var sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';sc.onload=ok;sc.onerror=mal;document.head.appendChild(sc)})}
function latin(u8){var s='';for(var i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return s}
async function juntarZip(z,ruta,prof,out){
  var nombres=Object.keys(z.files);
  for(var i=0;i<nombres.length;i++){
    var e=z.files[nombres[i]];if(e.dir)continue;
    var base=e.name.split('/').pop();
    if(/\\.zip$/i.test(base)&&prof<3){
      try{var z2=await JSZip.loadAsync(await e.async('uint8array'));await juntarZip(z2,ruta+e.name+'/',prof+1,out)}catch(x){}
    }else if(/\\.sua$/i.test(base)){
      var b=await e.async('uint8array');if(b[0]===48&&b[1]===50)out.push({k:'sua',reg10:latin(b.subarray(2,12)),reg:latin(b.subarray(2,13)),per:latin(b.subarray(26,30))+'-'+latin(b.subarray(30,32)),nombre:base,bytes:b,grupo:ruta});
    }else{
      var m=/^(CDEMMO99|CDEBMO99|CDEMPA99)\\.txt$/i.exec(base);
      if(m){var b2=await e.async('uint8array');var t=latin(b2.subarray(0,500));var k={CDEMMO99:'ema',CDEBMO99:'eba',CDEMPA99:'ema_pa'}[m[1].toUpperCase()];
        var per=null;if(k==='ema_pa'){var mp=/C\\d{9}(\\d{2})(\\d{4})\\d{2}\\.\\d{5}/.exec(t);if(mp)per=mp[2]+'-'+mp[1]}
        out.push({k:k,reg10:t.slice(0,10),per:per,nombre:base,bytes:b2,grupo:ruta})}
    }
  }
}
// destino(per) → id del encargo de ese mes (carga por mes); sin destino, el encargo elegido. out: el ZIP ya leído.
async function subirSua(f,destino,out){
  if(!destino&&!ENC){aviso('msgSua','Primero crea o elige un encargo','err');return {ok:0,errores:['Sin encargo']}}
  if(!f)return {ok:0,errores:[]};
  try{await cargarJSZip()}catch(x){aviso('msgSua','No cargó el lector de ZIP; revisa la conexión y recarga','err');return {ok:0,errores:['Sin lector de ZIP']}}
  aviso('msgSua','Abriendo '+f.name+' en tu navegador…');
  try{
    if(!out){out=[];await juntarZip(await JSZip.loadAsync(f),'',0,out)}
    var suas=out.filter(function(x){return x.k==='sua'});
    if(!suas.length){aviso('msgSua','El ZIP no trae archivos .SUA','err');return {ok:0,errores:['El ZIP no trae archivos .SUA']}}
    var periodoDe={};out.forEach(function(x){if(x.k==='ema_pa')periodoDe[x.grupo]=x.per});
    var regs=suas.map(function(s){
      var mismos=out.filter(function(x){return x.k!=='sua'&&x.reg10===s.reg10});
      var del=function(k){var c=mismos.filter(function(x){return x.k===k&&(!periodoDe[x.grupo]||periodoDe[x.grupo]===s.per)});return c[0]||null};
      var ema=del('ema');var pa=ema?mismos.filter(function(x){return x.k==='ema_pa'&&x.grupo===ema.grupo})[0]:null;
      return {reg:s.reg,per:s.per,sua:s,ema:ema,eba:del('eba'),ema_pa:pa||del('ema_pa')};
    });
    var ok=0,errores=[];
    for(var i=0;i<regs.length;i++){
      var r=regs[i];aviso('msgSua','Registro '+(i+1)+' de '+regs.length+': '+r.reg+' ('+r.per+')…');
      if(!r.ema){errores.push(r.reg+': falta la emisión mensual (CDEMMO99)');continue}
      var eid=destino?destino(r.per):ENC.id;if(!eid){errores.push(r.reg+' ('+r.per+'): sin encargo para ese mes');continue}
      var fd=new FormData();fd.append('encargo_id',eid);
      ['sua','ema','eba','ema_pa'].forEach(function(k){if(r[k])fd.append(k,new Blob([r[k].bytes]),r[k].nombre)});
      try{await api('POST','/api/kernel/sua',fd);ok++}catch(x){errores.push(r.reg+': '+x.message)}
    }
    document.getElementById('fSua').value='';
    document.getElementById('msgSua').innerHTML='<div class="aviso '+(errores.length?'err':'ok')+'">Leídos '+ok+' de '+regs.length+' registros.'+(errores.length?'<br>'+errores.map(esc).join('<br>'):'')+'</div>';
    cargarSua();
    return {ok:ok,total:regs.length,errores:errores};
  }catch(x){aviso('msgSua',x.message,'err');return {ok:0,errores:[x.message]}}
}
function cargarSua(){
  if(!ENC)return;
  Promise.all([api('GET','/api/kernel/sua?encargo_id='+encodeURIComponent(ENC.id)),api('GET','/api/kernel/criterios')]).then(function(r){
    SUAL=r[0].lecturas||[];
    document.getElementById('sCrit').innerHTML=(r[1].criterios||[]).map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.id+' · '+c.tema)+'</option>'}).join('');
    var pers=[];SUAL.forEach(function(l){if(pers.indexOf(l.periodo)<0)pers.push(l.periodo)});
    var s=document.getElementById('selSuaPer'),prev=s.value;
    s.innerHTML=pers.length?pers.map(function(p){return '<option>'+esc(p)+'</option>'}).join(''):'<option value="">Sin SUA leído</option>';
    if(pers.indexOf(prev)>=0)s.value=prev;
    document.getElementById('nSua').textContent=SUAL.reduce(function(a,l){return a+(l.pendientes||0)},0);
    pintarSua();
  });
}
function pintarSua(){
  var per=document.getElementById('selSuaPer').value;document.getElementById('clasS').classList.add('oculto');GSUA=null;
  var l=SUAL.filter(function(x){return x.periodo===per});
  if(!l.length){document.getElementById('tbSua').innerHTML='<tr><td colspan="10" class="vacio">Sube el .zip del SUA del mes.</td></tr>';document.getElementById('kpiSua').innerHTML='';document.getElementById('tbSuaG').innerHTML='';document.getElementById('aceptS').innerHTML='';return}
  var T={p:0,k:0,e:0,n:0,pen:0,c:0};
  document.getElementById('tbSua').innerHTML=l.map(function(x){var t=x.totales||{};T.p+=t.pagado_c||0;T.k+=t.kernel_c||0;T.e+=t.emitido_c||0;T.n+=x.trabajadores;T.pen+=x.pendientes||0;T.c+=x.cuadre_interno?1:0;
    return '<tr><td class="mono"><b>'+esc(x.registro)+'</b></td><td>'+esc(x.entidad||'—')+'</td><td class="num">'+x.trabajadores+'</td><td class="num">'+pesos(t.pagado_c)+'</td><td class="num">'+pesos(t.kernel_c)+'</td><td class="num">'+pesos(t.emitido_c)+'</td><td class="num">'+pesos((t.pagado_c||0)-(t.kernel_c||0))+'</td><td class="num">'+pesos((t.pagado_c||0)-(t.emitido_c||0))+'</td><td class="num">'+(x.pendientes||0)+'</td><td>'+(x.cuadre_interno?'<span class="b b-ok">03 = 05</span>':'<span class="b b-lim">No cuadra</span>')+(x.prima_distinta?' <span class="b b-par">Prima RT distinta</span>':'')+'</td></tr>'}).join('');
  document.getElementById('kpiSua').innerHTML='<div class="kpis">'+[['Registros',l.length],['Trabajadores',T.n.toLocaleString('es-MX')],['Pagado SUA',pesos(T.p)],['Kernel',pesos(T.k)],['Emitido IMSS',pesos(T.e)],['Pagado − kernel',pesos(T.p-T.k)],['Pagado − emitido',pesos(T.p-T.e)],['Cuadre interno',T.c+' de '+l.length]].map(function(k){return '<div class="kpi"><div class="l">'+k[0]+'</div><div class="v" style="font-size:16px">'+k[1]+'</div></div>'}).join('')+'</div>'+
    '<div class="sub" style="font-size:11px;color:#8ba5b2">Importes sin amortización de créditos INFONAVIT ni actualizaciones. «Pagado − kernel» negativo: el SUA pagó menos de lo que la ley pide con los datos del IMSS.</div>';
  api('GET','/api/kernel/sua/grupos?encargo_id='+encodeURIComponent(ENC.id)+'&periodo='+encodeURIComponent(per)).then(function(r){
    var a=r.aceptacion;window.SUAG=r.grupos;
    document.getElementById('aceptS').innerHTML=r.total===0?'<div class="aviso ok">Kernel, emisión y pago coinciden en todo.</div>':(a.aceptado?'<div class="aviso ok">Todo el cruce está clasificado.</div>':'<div class="aviso">Faltan <b>'+a.sin_clasificar+'</b> de '+r.total+' por clasificar.</div>');
    document.getElementById('tbSuaG').innerHTML=r.grupos.map(function(g,i){return '<tr class="click" data-i="'+i+'"><td>'+esc(CAUSAS[g.causa]||g.causa)+'</td><td>'+esc(RAMASN[g.rama]||g.rama)+'</td><td class="num">'+g.n+'</td><td class="num">'+g.registros+'</td><td class="num">'+pesos(g.pagado_menos_kernel_c)+'</td><td class="num">'+pesos(g.pagado_menos_emitido_c)+'</td><td class="num">'+g.pendientes+'</td><td>'+(g.cubeta?'<span class="b b-neu">'+esc(CUBS[g.cubeta])+'</span>':'')+'</td></tr>'}).join('');
    document.querySelectorAll('#tbSuaG tr.click').forEach(function(tr){tr.addEventListener('click',function(){verGrupoSua(window.SUAG[Number(tr.dataset.i)],tr)})});
  }).catch(function(e){document.getElementById('aceptS').innerHTML='<div class="aviso err">'+esc(e.message)+'</div>'});
}
function verGrupoSua(g,tr){
  GSUA=g;document.querySelectorAll('#tbSuaG tr').forEach(function(x){x.classList.toggle('sel',x===tr)});
  document.getElementById('clasS').classList.remove('oculto');
  document.getElementById('clasST').textContent='Clasificar: '+(CAUSAS[g.causa]||g.causa)+' · '+(RAMASN[g.rama]||g.rama)+' ('+g.n+' casos)';
  var sug={incapacidad:'La emisión no descuenta incapacidades; el SUA sí (C26)',sua_distinto_imss:'El SUA trae días o SBC distintos a la emisión del IMSS',calculo_limitado:'Incapacidad sin fechas con cambio de SBC: falta el detalle de incapacidades'};
  document.getElementById('sMot').value=sug[g.causa]||'';
  document.getElementById('sCub').value=g.causa==='sua_distinto_imss'||g.causa==='sin_pago'?'proceso_mal':'explicada';
  var per=document.getElementById('selSuaPer').value;
  api('GET','/api/kernel/sua/cruces?encargo_id='+encodeURIComponent(ENC.id)+'&periodo='+encodeURIComponent(per)+'&causa='+encodeURIComponent(g.causa)+'&rama='+encodeURIComponent(g.rama)).then(function(r){
    document.getElementById('tbSuaC').innerHTML=r.cruces.map(function(x){var d=x.detalle||{};return '<tr><td class="mono">'+esc(x.registro)+'</td><td class="mono">'+esc(x.colaborador_id)+'</td><td class="mono">…'+esc(x.nss_final)+'</td><td class="num">'+pesos(x.kernel_c)+'</td><td class="num">'+pesos(x.emitido_c)+'</td><td class="num">'+pesos(x.pagado_c)+'</td><td class="num">'+(d.dias_mes==null?'—':d.dias_mes)+' / '+(['retiro','ceav_patronal','ceav_obrera','infonavit'].indexOf(x.rama)>=0?d.incapacidades_bim:d.incapacidades_mes)+'</td><td class="num">'+(d.tramos||0)+'</td><td>'+(x.limitado?'<span class="b b-lim">Limitado</span>':'')+(x.cubeta?' <span class="b b-neu">'+esc(CUBS[x.cubeta])+'</span>':'')+'</td></tr>'}).join('');
  });
}
function clasificarSua(){
  if(!GSUA)return;
  var b={encargo_id:ENC.id,periodo:document.getElementById('selSuaPer').value,causa:GSUA.causa,rama:GSUA.rama,cubeta:document.getElementById('sCub').value,motivo:document.getElementById('sMot').value.trim()};
  if(b.cubeta==='criterio_sin_resolver')b.criterio_id=document.getElementById('sCrit').value;
  if(!b.motivo){alert('Escribe el motivo');return}
  api('POST','/api/kernel/sua/clasificar',b).then(function(r){cargarSua()}).catch(function(e){alert(e.message)});
}

// ── Archivos / ingestas
function subir(f,eid){
  eid=eid||(ENC&&ENC.id);
  if(!eid){aviso('msgSubir','Primero crea o elige un encargo','err');return Promise.reject(new Error('Sin encargo'))}
  if(!f)return Promise.resolve();
  if(!/\\.xlsx$/i.test(f.name)){aviso('msgSubir','Sólo .xlsx','err');return Promise.reject(new Error('Sólo .xlsx'))}
  var fd=new FormData();fd.append('file',f);fd.append('encargo_id',eid);
  aviso('msgSubir','Subiendo '+f.name+'…');
  return api('POST','/api/kernel/ingestas',fd).then(function(r){aviso('msgSubir','Recibido. Procesando en el servidor…','ok');document.getElementById('fArch').value='';if(ENC&&ENC.id===eid)cargarIngestas(r.id);return r})
    .catch(function(e){aviso('msgSubir',e.message,'err');throw e});
}
function cargarIngestas(abrir){
  if(!ENC){document.getElementById('tbIng').innerHTML='<tr><td colspan="6" class="vacio">Sin encargo</td></tr>';return}
  api('GET','/api/kernel/ingestas?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    var l=r.ingestas||[];
    document.getElementById('tbIng').innerHTML=l.length?l.map(function(i){
      var av=i.lotes_total?Math.round(100*i.lotes_hechos/i.lotes_total):0;
      return '<tr class="click'+(ING&&ING.id===i.id?' sel':'')+'" data-id="'+esc(i.id)+'"><td>'+esc(i.archivo_nombre)+'</td><td>'+badgeEstado(i.estado)+'</td><td><div class="bar"><i style="width:'+av+'%"></i></div></td><td class="num">'+(i.renglones==null?'—':Number(i.renglones).toLocaleString('es-MX'))+'</td><td>'+fecha(i.actualizado_en)+'</td><td class="mono">'+esc(i.id)+'</td></tr>';
    }).join(''):'<tr><td colspan="6" class="vacio">Todavía no hay archivos en este encargo.</td></tr>';
    document.querySelectorAll('#tbIng tr.click').forEach(function(tr){tr.addEventListener('click',function(){verIngesta(tr.dataset.id)})});
    var activa=l.filter(function(i){return ['pendiente','calculando','mensual','cerrando'].indexOf(i.estado)>=0})[0];
    if(abrir)verIngesta(abrir);else if(!ING&&l[0])verIngesta(l[0].id);
    clearTimeout(POLL);if(activa)POLL=setTimeout(function(){cargarIngestas()},4000);
  }).catch(function(e){document.getElementById('tbIng').innerHTML='<tr><td colspan="6" class="vacio">'+esc(e.message)+'</td></tr>'});
}
function verIngesta(id){
  api('GET','/api/kernel/ingesta?id='+encodeURIComponent(id)).then(function(r){ING=r.ingesta;pintarIngesta();cargarPendientes();
    document.querySelectorAll('#tbIng tr.click').forEach(function(tr){tr.classList.toggle('sel',tr.dataset.id===id)})});
}
function avanzar(){api('POST','/api/kernel/ingesta/avanzar',{id:ING.id}).then(function(r){ING=r.ingesta;pintarIngesta();cargarIngestas()}).catch(function(e){alert(e.message)})}
function reintentar(){api('POST','/api/kernel/ingesta/reintentar',{id:ING.id}).then(function(){cargarIngestas(ING.id)}).catch(function(e){alert(e.message)})}
function pintarIngesta(){
  var i=ING,d=document.getElementById('detIng'),rep=i.reporte||{},h='';
  d.classList.remove('oculto');
  h+='<div class="k-row" style="justify-content:space-between"><h2 style="margin:0">'+esc(i.archivo_nombre)+'</h2><div class="k-row">'+badgeEstado(i.estado)+
    (['pendiente','calculando','mensual','cerrando'].indexOf(i.estado)>=0?'<button class="k-btn peq" onclick="avanzar()">Avanzar ahora</button>':'')+
    (i.estado==='error'?'<button class="k-btn peq" onclick="reintentar()">Reintentar</button>':'')+'</div></div>';
  h+='<div class="sub mono" style="color:#8ba5b2;margin:4px 0 12px;word-break:break-all">SHA-256 '+esc(i.archivo_sha256||'—')+(i.ejecucion_id?' · ejecución '+esc(i.ejecucion_id):'')+'</div>';
  if(i.error)h+='<div class="aviso err">'+esc(String(i.error).split('\\n')[0])+'</div>';
  if(i.lotes_total)h+='<div class="k-row" style="margin-bottom:12px"><div class="bar" style="flex:1"><i style="width:'+i.avance+'%"></i></div><span class="num" style="font-size:12px;color:#5a7a8a">'+i.lotes_hechos+' / '+i.lotes_total+' lotes</span></div>';
  if(rep.renglones!=null){
    h+='<div class="kpis"><div class="kpi"><div class="l">Renglones</div><div class="v">'+Number(rep.renglones).toLocaleString('es-MX')+'</div></div>'+
      '<div class="kpi"><div class="l">Columnas</div><div class="v">'+esc(rep.columnas_archivo)+'</div></div>'+
      '<div class="kpi"><div class="l">Hoja · encabezado</div><div class="v" style="font-size:14px">'+esc(rep.hoja)+' · fila '+esc(rep.fila_encabezado)+'</div></div></div>';
    var sinCal=Object.keys(rep.sin_calendario||{});
    if(sinCal.length)h+='<div class="aviso">Corridas sin calendario (sus renglones no se calcularon): '+sinCal.map(function(c){return '<b>'+esc(c)+'</b> ('+rep.sin_calendario[c]+')'}).join(', ')+'. Dalas de alta en la pestaña Calendario y reintenta con el mismo archivo.</div>';
    if(rep.mapa&&rep.mapa.no_catalogados&&rep.mapa.no_catalogados.length)h+='<div class="aviso">Conceptos no catalogados en el perfil (limitan el ISR de los renglones que los traen): '+rep.mapa.no_catalogados.map(esc).join(', ')+'</div>';
    if(rep.mapa&&rep.mapa.ambiguos&&rep.mapa.ambiguos.length)h+='<div class="aviso">Columnas ambiguas: '+rep.mapa.ambiguos.map(function(a){return esc(a.encabezado)}).join(', ')+'</div>';
    if(rep.fuentes){h+='<h3>Fuentes declaradas</h3><div class="chipl">'+Object.keys(rep.fuentes).map(function(k){var f=rep.fuentes[k];return '<span>'+esc(k)+' · '+(f.estado==='completa'?'completa':'<b style="color:#946200">'+esc(f.estado)+'</b>')+'</span>'}).join('')+'</div>'}
  }
  if(rep.resultados){
    h+='<h3>Resultado por regla</h3><div class="scroll"><table class="k-tbl"><thead><tr><th>Regla</th><th>Estado</th><th class="num">Esperado</th><th class="num">Efectivo</th><th>Excluidos</th></tr></thead><tbody>'+
      rep.resultados.map(function(r){var pm=r.por_motivo||{};return '<tr><td>'+esc(REGLAS[r.regla_id]||r.regla_id)+' <span class="mono" style="color:#8ba5b2">'+esc(r.regla_id)+'</span></td><td>'+badgeEstado(r.estado)+'</td><td class="num">'+r.esperado+'</td><td class="num">'+r.efectivo+'</td><td>'+Object.keys(pm).map(function(k){return esc(k)+': '+pm[k]}).join(' · ')+'</td></tr>'}).join('')+'</tbody></table></div>';
  }
  if(rep.reconciliacion){
    var rc=rep.reconciliacion;
    h+='<h3>Reconciliación contra la nómina</h3><div class="kpis">'+[['Coinciden',rc.coincidencias],['Coinciden (limitados)',rc.coincidencias_limitadas],['Diferencias',rc.diferencias],['Limitados',rc.limitados],['Sin par en nómina',rc.sin_par_cliente],['Sin par en kernel',rc.sin_par_kernel]]
      .map(function(x){return '<div class="kpi"><div class="l">'+x[0]+'</div><div class="v">'+Number(x[1]||0).toLocaleString('es-MX')+'</div></div>'}).join('')+'</div>';
    h+='<button class="k-btn sec" onclick="irDiferencias()">'+(CARGA?'Ver diferencias →':'Clasificar diferencias →')+'</button>';
  }
  d.innerHTML=h;
}
function irDiferencias(){document.querySelector('.k-tab[data-t="diferencias"]').click()}

// ── Diferencias
// Pendientes de la ejecución de la ingesta que se está viendo (la aceptación es por ejecución).
function cargarPendientes(){
  if(!ENC||!ING||!ING.ejecucion_id){document.getElementById('nPend').textContent='0';return}
  api('GET','/api/kernel/diferencias/grupos?encargo_id='+encodeURIComponent(ENC.id)+'&ejecucion_id='+encodeURIComponent(ING.ejecucion_id)).then(function(r){document.getElementById('nPend').textContent=r.aceptacion.sin_clasificar})
}
function cargarEjecuciones(){
  if(!ENC)return;
  Promise.all([api('GET','/api/kernel/ejecuciones?encargo_id='+encodeURIComponent(ENC.id)),api('GET','/api/kernel/criterios')]).then(function(r){
    CRITS=r[1].criterios||[];
    document.getElementById('cCrit').innerHTML=CRITS.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.id+' · '+c.tema)+'</option>'}).join('');
    var l=r[0].ejecuciones||[];var s=document.getElementById('selEj');
    s.innerHTML=l.length?l.map(function(e){return '<option value="'+esc(e.id)+'">'+esc(fecha(e.calculado_en)+' · '+Number(e.n_calculos||0).toLocaleString('es-MX')+' cálculos · '+e.id)+'</option>'}).join(''):'<option value="">Sin ejecuciones selladas</option>';
    if(ING&&ING.ejecucion_id&&l.some(function(e){return e.id===ING.ejecucion_id}))s.value=ING.ejecucion_id;
    cargarGrupos();
  });
}
function cargarGrupos(){
  var ej=document.getElementById('selEj').value;
  document.getElementById('clasif').classList.add('oculto');GRUPO=null;
  if(!ej){document.getElementById('tbGr').innerHTML='<tr><td colspan="7" class="vacio">Sin ejecuciones.</td></tr>';document.getElementById('acept').innerHTML='';return}
  api('GET','/api/kernel/diferencias/grupos?encargo_id='+encodeURIComponent(ENC.id)+'&ejecucion_id='+encodeURIComponent(ej)).then(function(r){
    var a=r.aceptacion;
    document.getElementById('acept').innerHTML=r.total===0?'<div class="aviso ok">Sin diferencias en esta ejecución.</div>':
      (a.aceptado?'<div class="aviso ok">Todas las diferencias están clasificadas: la ejecución pasa el criterio de aceptación.</div>':'<div class="aviso">Faltan <b>'+a.sin_clasificar.toLocaleString('es-MX')+'</b> de '+r.total.toLocaleString('es-MX')+' diferencias por clasificar. Pasa con cero sin clasificar.</div>');
    document.getElementById('tbGr').innerHTML=(r.grupos||[]).map(function(g,i){
      return '<tr class="click" data-i="'+i+'"><td>'+esc(REGLAS[g.regla_id]||g.regla_id)+'</td><td>'+esc(g.rubro)+'</td><td class="num">'+pesos(g.diferencia_c)+'</td><td class="num">'+g.n+(g.limitados?' <span class="b b-par">'+g.limitados+' lim.</span>':'')+'</td><td class="num">'+(g.pendientes||0)+'</td><td>'+(g.cubeta?'<span class="b b-neu">'+esc(CUBETAS[g.cubeta]||g.cubeta)+'</span>':'—')+'</td><td><button class="k-btn peq sec">Ver</button></td></tr>';
    }).join('')||'<tr><td colspan="7" class="vacio">Sin diferencias.</td></tr>';
    document.querySelectorAll('#tbGr tr.click').forEach(function(tr){tr.addEventListener('click',function(){abrirGrupo(r.grupos[Number(tr.dataset.i)],tr)})});
    document.getElementById('nPend').textContent=a.sin_clasificar;
  });
}
function abrirGrupo(g,tr){
  GRUPO=g;document.querySelectorAll('#tbGr tr').forEach(function(x){x.classList.toggle('sel',x===tr)});
  document.getElementById('clasif').classList.remove('oculto');
  document.getElementById('clasifT').textContent='Clasificar · '+(REGLAS[g.regla_id]||g.regla_id)+' · '+pesos(g.diferencia_c)+' · '+g.pendientes+' pendientes de '+g.n;
  var ej=document.getElementById('selEj').value;
  api('GET','/api/kernel/diferencias?encargo_id='+encodeURIComponent(ENC.id)+'&ejecucion_id='+encodeURIComponent(ej)+'&regla_id='+encodeURIComponent(g.regla_id)+'&rubro='+encodeURIComponent(g.rubro)+'&diferencia_c='+g.diferencia_c+'&limit=200').then(function(r){
    document.getElementById('tbCasos').innerHTML=r.diferencias.map(function(x){
      return '<tr><td class="mono">'+esc(x.colaborador_id)+'</td><td>'+esc(x.corrida_id)+'</td><td class="num">'+pesos(x.kernel_c)+'</td><td class="num">'+pesos(x.cliente_c)+'</td><td class="num">'+pesos(x.diferencia_c)+'</td><td>'+esc(x.renglon_origen||'')+(x.limitado?' <span class="b b-par">limitado</span>':'')+'</td><td>'+(x.cubeta?'<span class="b b-neu">'+esc(CUBETAS[x.cubeta])+'</span>':'')+'</td></tr>';
    }).join('');
  });
}
function clasificarGrupo(){
  if(!GRUPO)return;
  var b={encargo_id:ENC.id,ejecucion_id:document.getElementById('selEj').value,regla_id:GRUPO.regla_id,rubro:GRUPO.rubro,diferencia_c:GRUPO.diferencia_c,
    cubeta:document.getElementById('cCub').value,motivo:document.getElementById('cMot').value.trim()};
  if(b.cubeta==='criterio_sin_resolver')b.criterio_id=document.getElementById('cCrit').value;
  if(!b.motivo){alert('Escribe el motivo');return}
  api('POST','/api/kernel/clasificar-grupo',b).then(function(r){document.getElementById('cMot').value='';cargarGrupos()}).catch(function(e){alert(e.message)});
}

// ── Calendario
function cargarCalendario(){
  if(!ENC)return;
  api('GET','/api/kernel/calendario?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    document.getElementById('tbCal').innerHTML=(r.calendario||[]).map(function(c){
      return '<tr class="click" data-c="'+esc(JSON.stringify(c))+'"><td><b>'+esc(c.corrida_id)+'</b></td><td>'+esc(c.periodicidad)+'</td><td>'+esc(c.desde)+'</td><td>'+esc(c.hasta)+'</td><td>'+esc(c.fecha_pago)+'</td><td>'+(c.ordinaria?'Ordinaria':'<span class="b b-neu">Extra</span>')+'</td><td style="font-size:11px;color:#5a7a8a">'+esc(c.fuente)+'</td></tr>';
    }).join('')||'<tr><td colspan="7" class="vacio">Sin calendario.</td></tr>';
    document.querySelectorAll('#tbCal tr.click').forEach(function(tr){tr.addEventListener('click',function(){var c=JSON.parse(tr.dataset.c);
      document.getElementById('kCor').value=c.corrida_id;document.getElementById('kPer').value=c.periodicidad;document.getElementById('kDes').value=c.desde;
      document.getElementById('kHas').value=c.hasta;document.getElementById('kPag').value=c.fecha_pago;document.getElementById('kOrd').value=c.ordinaria?'1':'0';document.getElementById('kFue').value=c.fuente})});
  });
}
function guardarCorrida(){
  var c={corrida_id:document.getElementById('kCor').value.trim().toUpperCase(),periodicidad:document.getElementById('kPer').value,desde:document.getElementById('kDes').value,
    hasta:document.getElementById('kHas').value,fecha_pago:document.getElementById('kPag').value,ordinaria:document.getElementById('kOrd').value==='1'};
  var fuente=document.getElementById('kFue').value.trim();
  if(!fuente){alert('Indica la fuente (de dónde sale la fecha)');return}
  api('POST','/api/kernel/calendario',{encargo_id:ENC.id,fuente:fuente,corridas:[c]}).then(cargarCalendario).catch(function(e){alert(e.message)});
}

// ── Registros patronales
function cargarRegistros(){
  if(!ENC)return;
  api('GET','/api/kernel/registros?empresa_id='+ENC.empresa_id).then(function(r){
    document.getElementById('tbReg').innerHTML=(r.registros||[]).map(function(x){
      return '<tr><td class="mono">'+esc(x.registro)+'</td><td>'+(x.entidad?esc(x.entidad):'<span class="b b-lim">Falta</span>')+'</td><td class="num">'+esc(x.prima_rt_pct||'—')+'</td><td>'+esc((x.prima_desde||'')+(x.prima_hasta?' → '+x.prima_hasta:''))+'</td><td style="font-size:11px;color:#5a7a8a">'+esc(x.fuente)+'</td></tr>';
    }).join('')||'<tr><td colspan="5" class="vacio">Sin registros: el ISN queda como limitación al alcance hasta cargarlos.</td></tr>';
  });
}
function guardarRegistros(){
  var fuente=document.getElementById('rFue').value.trim();if(!fuente){aviso('msgReg','Indica la fuente','err');return}
  var regs=[],errores=[];
  document.getElementById('rTxt').value.split('\\n').map(function(l){return l.trim()}).filter(Boolean).forEach(function(l,i){
    var p=l.split(/[,;\\t]/).map(function(x){return x.trim()});
    if(!p[0]){errores.push('renglón '+(i+1));return}
    regs.push({registro:p[0].toUpperCase(),entidad:(p[1]||'').toUpperCase()||undefined,prima_rt_pct:p[2]||undefined,prima_desde:p[3]||undefined,prima_hasta:p[4]||undefined});
  });
  if(!regs.length){aviso('msgReg','Nada que guardar','err');return}
  api('POST','/api/kernel/registros',{empresa_id:ENC.empresa_id,fuente:fuente,registros:regs}).then(function(r){aviso('msgReg',r.registros+' registros guardados','ok');document.getElementById('rTxt').value='';cargarRegistros()})
    .catch(function(e){aviso('msgReg',e.message,'err')});
}

// ── Criterios
function cargarCriterios(){
  api('GET','/api/kernel/criterios').then(function(r){
    var est={vigente:'b-ok',por_confirmar:'b-par',abierto:'b-lim'};
    document.getElementById('tbCrit').innerHTML=(r.criterios||[]).map(function(c){
      return '<tr><td><b>'+esc(c.id)+'</b></td><td>'+esc(c.tema)+'</td><td style="max-width:520px">'+esc(c.decision)+(c.observaciones?'<div style="font-size:11px;color:#8ba5b2;margin-top:3px">'+esc(c.observaciones)+'</div>':'')+'</td><td><span class="b '+(est[c.estado]||'b-neu')+'">'+esc(c.estado.replace('_',' '))+'</span></td><td style="font-size:11px">'+esc(c.quien)+'</td></tr>';
    }).join('');
  });
}

// ── Requerimiento de información (módulo 23)
var ESTR={pendiente:['b-par','Pendiente'],entregada:['b-run','Entregada'],completa:['b-ok','Completa'],incompleta:['b-lim','Incompleta'],no_aplica:['b-neu','No aplica']};
var REQ=[];
function cargarReq(){
  if(!ENC)return;
  document.getElementById('verCliente').href='/encargo?id='+encodeURIComponent(ENC.id);
  api('GET','/api/kernel/requerimiento?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    REQ=r.requerimiento||[];
    document.getElementById('nReq').textContent=REQ.filter(function(x){return x.estado_efectivo==='pendiente'||x.estado_efectivo==='incompleta'||x.archivos.some(function(a){return !a.revision})}).length;
    document.getElementById('tbReq').innerHTML=REQ.length?REQ.map(function(x,i){
      var e=ESTR[x.estado_efectivo]||['b-neu',x.estado_efectivo];
      var ar=x.archivos.map(function(a){return '<div style="margin:2px 0">'+esc(a.nombre)+' <span style="color:#8ba5b2">'+fecha(a.subido_en)+'</span> '+
        (a.revision?'<span class="b '+(a.revision==='aceptado'?'b-ok':'b-lim')+'">'+a.revision+'</span>':((x.fuente_clave==='prenomina'||x.fuente_clave==='xml_nomina')?'<button class="k-btn peq" data-p="'+esc(a.id)+'">Procesar</button> ':'')+'<button class="k-btn peq sec" data-a="'+esc(a.id)+'">Aceptar</button> <button class="k-btn peq sec" data-r="'+esc(a.id)+'">Rechazar</button>')+
        (a.ingesta_id?' <span class="mono" style="color:#8ba5b2">'+esc(a.ingesta_id)+'</span>':'')+'</div>'}).join('');
      return '<tr><td><b>'+esc(x.descripcion)+'</b>'+(x.esencial?' <span class="b b-lim">indispensable</span>':x.obligatoria?'':' <span class="b b-neu">opcional</span>')+'<div class="mono" style="color:#8ba5b2">'+esc(x.fuente_clave)+'</div>'+
        (x.evidencia?'<div style="font-size:11px;color:#5a7a8a">'+esc(x.evidencia.por)+(x.evidencia.detalle&&x.evidencia.detalle.length?': '+esc(x.evidencia.detalle.join('; ')):'')+'</div>':'')+'</td>'+
        '<td><span class="b '+e[0]+'">'+e[1]+'</span>'+(x.vencida?' <span class="b b-lim">vencida</span>':'')+'<div style="margin-top:4px"><select class="k-sel" data-e="'+i+'" style="padding:4px 6px;font-size:11px">'+['pendiente','entregada','completa','incompleta','no_aplica'].map(function(k){return '<option value="'+k+'"'+(x.estado===k?' selected':'')+'>'+ESTR[k][1]+'</option>'}).join('')+'</select></div></td>'+
        '<td><input class="k-in" data-res="'+i+'" value="'+esc(x.responsable||'')+'" style="width:150px"></td><td><input class="k-in" type="date" data-fec="'+i+'" value="'+esc(x.fecha_compromiso||'')+'"></td><td>'+(ar||'<span style="color:#8ba5b2">—</span>')+'</td>'+
        '<td><button class="k-btn peq sec" data-g="'+i+'">Guardar</button></td></tr>'}).join(''):'<tr><td colspan="6" class="vacio">Sin requerimiento: genéralo con el responsable y la fecha comprometida.</td></tr>';
    document.querySelectorAll('#tbReq [data-g]').forEach(function(b){b.addEventListener('click',function(){guardarReq(Number(b.dataset.g))})});
    document.querySelectorAll('#tbReq [data-p]').forEach(function(b){b.addEventListener('click',function(){api('POST','/api/kernel/requerimiento/archivo/procesar',{id:b.dataset.p,llave:document.getElementById('cLla').value}).then(function(r){aviso('msgReq','Procesando: '+r.ingesta_id+'. Sigue el avance en Archivos.','ok');cargarReq();cargarIngestas();cargarCfdi()}).catch(function(e){aviso('msgReq',e.message,'err')})})});
    document.querySelectorAll('#tbReq [data-a]').forEach(function(b){b.addEventListener('click',function(){api('POST','/api/kernel/requerimiento/archivo/revisar',{id:b.dataset.a,revision:'aceptado'}).then(cargarReq)})});
    document.querySelectorAll('#tbReq [data-r]').forEach(function(b){b.addEventListener('click',function(){var n=prompt('¿Por qué se rechaza? (lo verá el cliente)');if(!n)return;api('POST','/api/kernel/requerimiento/archivo/revisar',{id:b.dataset.r,revision:'rechazado',nota:n}).then(cargarReq).catch(function(e){alert(e.message)})})});
  });
}
function generarReq(){
  api('POST','/api/kernel/requerimiento/generar',{encargo_id:ENC.id,responsable:document.getElementById('qRes').value.trim()||null,fecha_compromiso:document.getElementById('qFec').value||null})
    .then(function(){aviso('msgReq','Requerimiento listo. El cliente lo ve en su portal.','ok');cargarReq()}).catch(function(e){aviso('msgReq',e.message,'err')});
}
function guardarReq(i){
  var x=REQ[i],b={encargo_id:ENC.id,fuente_clave:x.fuente_clave,estado:document.querySelector('[data-e="'+i+'"]').value,responsable:document.querySelector('[data-res="'+i+'"]').value.trim(),fecha_compromiso:document.querySelector('[data-fec="'+i+'"]').value||null};
  if(b.estado==='no_aplica'&&!x.nota){var n=prompt('¿Por qué no aplica?');if(!n)return;b.nota=n}
  api('POST','/api/kernel/requerimiento/item',b).then(function(){aviso('msgReq','Guardado','ok');cargarReq()}).catch(function(e){aviso('msgReq',e.message,'err')});
}

// ── Cotizador (módulo 26)
function mxn(n){return '$'+Number(n||0).toLocaleString('es-MX',{maximumFractionDigits:0})}
function tomarPerfil(){
  if(!ENC)return;
  api('GET','/api/kernel/cotizador/perfil?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){var p=r.perfil;
    if(p.colaboradores!=null)document.getElementById('zC').value=p.colaboradores;if(p.registros!=null)document.getElementById('zR').value=p.registros;
    document.getElementById('zK').value=p.corridas_mes;if(p.carga_patronal_mensual_c!=null)document.getElementById('zCar').value=centTxt(p.carga_patronal_mensual_c);
    if(p.percepciones_mensuales_c!=null)document.getElementById('zPer').value=centTxt(p.percepciones_mensuales_c);
    aviso('msgCot','Tomado de: '+(p.fuente.join(', ')||'calendario del encargo')+(p.colaboradores==null?'. Sin prenómina terminada: captura colaboradores y registros.':''),'ok');
  }).catch(function(e){aviso('msgCot',e.message,'err')});
}
function insumosCot(){
  var n=function(id){return Number(document.getElementById(id).value||0)},c=function(id){return document.getElementById(id).checked};
  return {colaboradores:n('zC'),registros:n('zR'),corridas_mes:n('zK'),carga_patronal_mensual_c:aCent(document.getElementById('zCar').value)||0,percepciones_mensuales_c:aCent(document.getElementById('zPer').value)||0,
    rfc_adicionales:n('zRfc'),ejercicios_anteriores:n('zEj'),horas_requerimiento:n('zHr'),saldos_recuperados_c:aCent(document.getElementById('zSal').value)||0,
    preventiva:c('zPrev'),repse:c('zRepse'),contrato_colectivo:c('zCc'),sbc_variable:c('zSbc')};
}
function cotizarAhora(guardar){
  var b={insumos:insumosCot()};
  if(guardar){var pro=document.getElementById('zPro').value.trim();b.guardar=true;if(pro)b.prospecto=pro;else if(ENC){b.empresa_id=ENC.empresa_id;b.encargo_id=ENC.id}}
  api('POST','/api/kernel/cotizador',b).then(function(r){pintarCot(r.cotizacion);if(guardar){aviso('msgCot','Cotización guardada.','ok');cargarCotizaciones()}else aviso('msgCot','')}).catch(function(e){aviso('msgCot',e.message,'err')});
}
function pintarCot(q){
  var ra=q.ratios,h='<div class="op"><div class="t">'+esc(q.nivel)+' · iguala '+mxn(q.iguala_mensual)+' al mes</div><div class="r">'+esc(q.frecuencia)+' · diagnóstico (niveles A) '+mxn(q.diagnostico)+' ('+esc(q.k_diagnostico)+' × la iguala)</div>'+
    '<div class="r">'+mxn(ra.iguala_por_colaborador)+' por colaborador'+(ra.iguala_pct_carga_patronal?' · '+esc(ra.iguala_pct_carga_patronal)+' % de la carga patronal':'')+(ra.iguala_pct_costo_total?' · '+esc(ra.iguala_pct_costo_total)+' % del costo total de nómina':'')+
    (ra.diagnostico_pct_costo_total_anual?' · diagnóstico = '+esc(ra.diagnostico_pct_costo_total_anual)+' % del costo anual':'')+'</div></div>';
  if(q.complementos_mensuales.length)h+='<h3>Complementos mensuales</h3>'+q.complementos_mensuales.map(function(c){return '<div style="font-size:12.5px">'+esc(c.concepto)+': '+mxn(c.importe)+'</div>'}).join('');
  if(q.una_vez.length)h+='<h3>Montos de una vez</h3>'+q.una_vez.map(function(c){return '<div style="font-size:12.5px">'+esc(c.concepto)+': '+mxn(c.importe)+'</div>'}).join('');
  h+='<h3>Cómo se calculó</h3><div style="font-size:12px;color:#5a7a8a">'+q.traza.map(esc).join('<br>')+'<br>Piso: '+mxn(q.piso.importe)+' (el mayor de $50 por colaborador y 0.85 % de la carga patronal mensual). Base de los porcentajes: '+esc(ra.base)+'. Tarifa '+esc(q.tarifa)+'.</div>';
  document.getElementById('resCot').innerHTML=h;
}
function cargarCotizaciones(){
  api('GET','/api/kernel/cotizaciones').then(function(r){
    document.getElementById('tbCot').innerHTML=(r.cotizaciones||[]).map(function(c){return '<tr><td>'+fecha(c.creado_en)+'</td><td>'+esc(c.empresa||c.prospecto||'—')+'</td><td class="num">'+mxn(c.iguala_mensual)+'</td><td class="num">'+mxn(c.diagnostico)+'</td><td style="font-size:11px;color:#5a7a8a">'+esc(c.tarifa)+'</td></tr>'}).join('')||'<tr><td colspan="5" class="vacio">Sin cotizaciones guardadas.</td></tr>';
  });
}

// ── Expediente de defensa (N6) e inventario de datos (N7.3)
var CATX={prenomina:'Prenómina',xml_y_metadata:'XML y metadata SAT',maestro_empleados:'Maestro de empleados',entregado_por_el_cliente:'Entregado en el requerimiento',renglones_canonicos:'Renglones normalizados',otro:'Otro'};
var PAPX={ejecuciones:'Ejecuciones selladas',calculos:'Cálculos',diferencias:'Diferencias',cruces_cfdi:'Cruces con CFDI',comprobantes:'Comprobantes leídos',casos_afiliacion:'Casos de afiliación',hallazgos:'Hallazgos',bitacora_hallazgos:'Movimientos de hallazgos',dictamenes:'Versiones de dictamen'};
function tam(b){b=Number(b||0);return b>1048576?(b/1048576).toFixed(1)+' MB':b>1024?Math.round(b/1024)+' KB':b+' B'}
function cargarExpediente(){
  if(!ENC)return;
  api('GET','/api/kernel/expediente?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    var a=r.archivos_fuente,pp=r.papeles_de_trabajo.conteos;
    document.getElementById('xCon').value=r.encargo.retencion_contrato_hasta||'';
    document.getElementById('resExp').innerHTML='<div class="op"><div class="t">Archivos fuente: conservar hasta el '+esc(a.conservar_hasta)+'</div><div class="r">'+esc(a.regla)+'</div>'+
      '<div class="r">'+a.total+' archivos'+(a.vencidos?' · '+a.vencidos+' ya cumplieron su plazo':'')+' · '+Object.keys(a.por_categoria).map(function(k){var c=a.por_categoria[k];return esc(CATX[k]||k)+': '+c.archivos+' ('+tam(c.bytes)+')'}).join(' · ')+'</div></div>'+
      '<h3>Papeles de trabajo (permanentes)</h3><div style="font-size:12.5px">'+Object.keys(pp).map(function(k){return esc(PAPX[k]||k)+': '+Number(pp[k]).toLocaleString('es-MX')}).join(' · ')+'</div>';
    document.getElementById('tbExp').innerHTML=a.archivos.map(function(f){return '<tr><td class="mono" style="font-size:11px">'+esc(f.key.split('/').pop())+'</td><td>'+esc(CATX[f.categoria]||f.categoria)+'</td><td class="num">'+tam(f.tamano)+'</td><td>'+fecha(f.subido)+'</td><td>'+esc(f.conservar_hasta)+'</td></tr>'}).join('')||'<tr><td colspan="5" class="vacio">Sin archivos en este encargo.</td></tr>';
    document.getElementById('tbInv').innerHTML=r.inventario.map(function(i){return '<tr><td><b>'+esc(i.categoria)+'</b></td><td>'+esc(i.datos)+'</td><td>'+esc(i.donde)+'</td><td>'+esc(i.plazo)+'</td></tr>'}).join('');
  }).catch(function(e){aviso('msgExp',e.message,'err')});
}
function guardarRetencion(){
  if(!ENC)return;
  api('POST','/api/kernel/expediente/retencion',{encargo_id:ENC.id,retencion_contrato_hasta:document.getElementById('xCon').value||null}).then(function(){aviso('msgExp','Plazo guardado.','ok');cargarExpediente()}).catch(function(e){aviso('msgExp',e.message,'err')});
}

// ── Maestro de empleados y afiliación
var TIPOA={pago_despues_de_baja:'Pago después de la baja',pago_antes_de_alta:'Pago antes del alta'};
var MAE=null;
var dropM=document.getElementById('dropM');
['dragenter','dragover'].forEach(function(e){dropM.addEventListener(e,function(ev){ev.preventDefault();dropM.classList.add('on')})});
['dragleave','drop'].forEach(function(e){dropM.addEventListener(e,function(ev){ev.preventDefault();dropM.classList.remove('on')})});
dropM.addEventListener('drop',function(ev){if(ev.dataTransfer.files[0])subirMaestro(ev.dataTransfer.files[0])});
function subirMaestro(f,eid){
  eid=eid||(ENC&&ENC.id);
  if(!eid){aviso('msgMae','Primero elige un encargo','err');return Promise.reject(new Error('Sin encargo'))}
  if(!f)return Promise.resolve();if(!/\\.xlsx$/i.test(f.name)){aviso('msgMae','El maestro va en .xlsx','err');return Promise.reject(new Error('El maestro va en .xlsx'))}
  var fd=new FormData();fd.append('file',f);fd.append('encargo_id',eid);aviso('msgMae','Leyendo '+f.name+'…');
  return api('POST','/api/kernel/maestro',fd).then(function(r){aviso('msgMae',r.registros.toLocaleString('es-MX')+' empleados leídos'+(r.cruzado?'. Cruzado con la prenómina.':'. '+(r.motivo||'')),'ok');document.getElementById('fMae').value='';cargarMaestro();return r}).catch(function(e){aviso('msgMae',e.message,'err');throw e});
}
function cargarMaestro(){
  if(!ENC)return;
  api('GET','/api/kernel/maestro?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    MAE=(r.cargas||[])[0]||null;var d=document.getElementById('detMae');
    if(!MAE){d.innerHTML='';return}
    var rep=MAE.reporte||{},h='<div class="sub mono" style="color:#8ba5b2;margin:10px 0">'+esc(MAE.archivo_nombre)+' · '+Number(MAE.registros).toLocaleString('es-MX')+' empleados · SHA-256 '+esc(MAE.archivo_sha256.slice(0,16))+'…</div>';
    if(rep.revisados!=null){
      h+='<div class="kpis">'+[['Pagos revisados',rep.revisados],['Después de la baja',(rep.por_tipo||{}).pago_despues_de_baja],['Antes del alta',(rep.por_tipo||{}).pago_antes_de_alta],['Pagados sin maestro',rep.sin_maestro],['Activos con baja (inconsistencia)',rep.inconsistencias]]
        .map(function(x){return '<div class="kpi"><div class="l">'+x[0]+'</div><div class="v">'+Number(x[1]||0).toLocaleString('es-MX')+'</div></div>'}).join('')+'</div>';
      h+='<div class="k-row" style="margin-bottom:8px"><button class="k-btn peq sec" onclick="recruzarMaestro()">Volver a cruzar</button></div><div id="tbAfiW"></div>';
    } else h+='<div class="aviso">Falta la prenómina terminada para cruzar. <button class="k-btn peq sec" onclick="recruzarMaestro()">Cruzar ahora</button></div>';
    d.innerHTML=h;
    if(rep.revisados!=null)cargarAfiliacion();
  });
}
function recruzarMaestro(){api('POST','/api/kernel/maestro/cruzar',{id:MAE.id}).then(cargarMaestro).catch(function(e){aviso('msgMae',e.message,'err')})}
function cargarAfiliacion(){
  api('GET','/api/kernel/afiliacion?carga_id='+encodeURIComponent(MAE.id)).then(function(r){
    var l=r.casos||[],w=document.getElementById('tbAfiW');if(!w)return;
    if(!l.length){w.innerHTML='<div class="aviso ok">Ningún pago a personas sin alta o ya dadas de baja.</div>';return}
    w.innerHTML=(r.aceptacion.aceptado?'<div class="aviso ok">Todos los casos están clasificados.</div>':'<div class="aviso">Faltan <b>'+r.aceptacion.sin_clasificar+'</b> casos por clasificar.</div>')+
      '<div class="scroll alto"><table class="k-tbl"><thead><tr><th>Caso</th><th>Colaborador</th><th>Corrida</th><th>Fecha</th><th class="num">Percepciones</th><th>Cubeta</th></tr></thead><tbody>'+
      l.map(function(c){return '<tr><td>'+esc(TIPOA[c.tipo])+'</td><td class="mono">'+esc(c.colaborador_id)+'</td><td>'+esc(c.corrida_id)+'</td><td>'+esc(c.fuente_fecha+' '+c.fecha_evento)+'</td><td class="num">'+pesos(c.percepciones_c)+'</td><td>'+(c.cubeta?'<span class="b b-neu">'+esc(CUBC[c.cubeta])+'</span> <span style="font-size:11px;color:#5a7a8a">'+esc(c.motivo)+'</span>':'—')+'</td></tr>'}).join('')+'</tbody></table></div>'+
      '<div class="frm solo-admin"><div><label>Casos</label><select id="aTip" class="k-sel"><option value="pago_despues_de_baja">Pagos después de la baja</option><option value="pago_antes_de_alta">Pagos antes del alta</option></select></div>'+
      '<div><label>Cubeta</label><select id="aCub" class="k-sel"><option value="proceso_mal">Proceso actual mal (hallazgo)</option><option value="explicada">Explicada (no es incumplimiento)</option></select></div>'+
      '<div style="grid-column:span 2"><label>Motivo</label><input id="aMot" class="k-in" placeholder="Ej. sueldo pagado después de la baja ante el IMSS"></div><div><button class="k-btn" onclick="clasificarAfi()">Clasificar</button></div></div>';
  });
}
function clasificarAfi(){
  var b={carga_id:MAE.id,tipo:document.getElementById('aTip').value,cubeta:document.getElementById('aCub').value,motivo:document.getElementById('aMot').value.trim()};
  if(!b.motivo){alert('Escribe el motivo');return}
  api('POST','/api/kernel/afiliacion/clasificar',b).then(cargarAfiliacion).catch(function(e){alert(e.message)});
}

// ── XML de nómina, metadata del SAT y cruce (módulo 4.2)
var CFI=null,POLLC=null,GCRU=null;
var TIPOC={diferencia:'Diferencia',sin_cfdi:'Pago sin CFDI',sin_nomina:'CFDI sin nómina'};
var CUBC={proceso_mal:'Hallazgo',explicada:'Explicada',criterio_sin_resolver:'Criterio'};
var dropC=document.getElementById('dropC');
['dragenter','dragover'].forEach(function(e){dropC.addEventListener(e,function(ev){ev.preventDefault();dropC.classList.add('on')})});
['dragleave','drop'].forEach(function(e){dropC.addEventListener(e,function(ev){ev.preventDefault();dropC.classList.remove('on')})});
dropC.addEventListener('drop',function(ev){if(ev.dataTransfer.files[0])subirCfdi(ev.dataTransfer.files[0])});
function subirCfdi(f,eid){
  eid=eid||(ENC&&ENC.id);
  if(!eid){aviso('msgCfdi','Primero crea o elige un encargo','err');return Promise.reject(new Error('Sin encargo'))}
  if(!f)return Promise.resolve();
  var tipo=/\\.zip$/i.test(f.name)?'xml_nomina':/\\.(txt|csv)$/i.test(f.name)?'metadata_sat':null;
  if(!tipo){aviso('msgCfdi','Sube un .zip con los XML o el .txt de metadata del SAT','err');return Promise.reject(new Error('Formato no reconocido'))}
  var fd=new FormData();fd.append('file',f);fd.append('encargo_id',eid);fd.append('tipo',tipo);fd.append('llave',document.getElementById('cLla').value);
  aviso('msgCfdi','Subiendo '+f.name+'…');
  return api('POST','/api/kernel/cfdi',fd).then(function(r){aviso('msgCfdi','Recibido. Se lee en el servidor; puedes cerrar esta pestaña.','ok');document.getElementById('fCfdi').value='';if(ENC&&ENC.id===eid)cargarCfdi(r.id);return r})
    .catch(function(e){aviso('msgCfdi',e.message,'err');throw e});
}
function badgeC(e){var m={pendiente:['b-run','En cola'],leyendo:['b-run','Leyendo'],cruzando:['b-run','Cruzando'],terminado:['b-ok','Terminado'],error:['b-lim','Error']};var x=m[e]||['b-neu',e];return '<span class="b '+x[0]+'">'+x[1]+'</span>'}
function cargarCfdi(abrir){
  if(!ENC){document.getElementById('tbCfdi').innerHTML='';return}
  api('GET','/api/kernel/cfdi?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    var l=r.ingestas||[];
    document.getElementById('tbCfdi').innerHTML=l.length?l.map(function(i){var av=i.lotes_total?Math.round(100*i.lotes_hechos/i.lotes_total):0;
      return '<tr class="click'+(CFI&&CFI.id===i.id?' sel':'')+'" data-id="'+esc(i.id)+'"><td>'+esc(i.archivo_nombre)+'</td><td>'+(i.tipo==='xml_nomina'?'XML de nómina':'Metadata SAT')+'</td><td>'+badgeC(i.estado)+'</td><td><div class="bar"><i style="width:'+av+'%"></i></div></td><td class="num">'+(i.entradas==null?'—':Number(i.entradas).toLocaleString('es-MX'))+'</td><td>'+fecha(i.actualizado_en)+'</td></tr>'}).join('')
      :'<tr><td colspan="6" class="vacio">Sin XML ni metadata en este encargo.</td></tr>';
    document.querySelectorAll('#tbCfdi tr.click').forEach(function(tr){tr.addEventListener('click',function(){verCfdi(tr.dataset.id)})});
    if(abrir)verCfdi(abrir);
    var activa=l.some(function(i){return ['pendiente','leyendo','cruzando'].indexOf(i.estado)>=0});
    clearTimeout(POLLC);if(activa)POLLC=setTimeout(function(){cargarCfdi(CFI&&CFI.id)},4000);
  });
}
function verCfdi(id){api('GET','/api/kernel/cfdi/ingesta?id='+encodeURIComponent(id)).then(function(r){CFI=r.ingesta;pintarCfdi();
  document.querySelectorAll('#tbCfdi tr.click').forEach(function(tr){tr.classList.toggle('sel',tr.dataset.id===id)})})}
function accionCfdi(ruta,b){api('POST',ruta,b).then(function(){cargarCfdi(CFI.id)}).catch(function(e){alert(e.message)})}
function pintarCfdi(){
  var i=CFI,rep=i.reporte||{},d=document.getElementById('detCfdi'),h='';d.classList.remove('oculto');
  h+='<div class="k-row" style="justify-content:space-between"><h2 style="margin:0">'+esc(i.archivo_nombre)+'</h2><div class="k-row">'+badgeC(i.estado)+
    (['pendiente','leyendo','cruzando'].indexOf(i.estado)>=0?'<button class="k-btn peq" onclick="accionCfdi(&#39;/api/kernel/cfdi/avanzar&#39;,{id:CFI.id})">Avanzar ahora</button>':'')+
    (i.estado==='error'?'<button class="k-btn peq" onclick="accionCfdi(&#39;/api/kernel/cfdi/reintentar&#39;,{id:CFI.id})">Reintentar</button>':'')+
    (i.tipo==='xml_nomina'&&i.lotes_total&&i.lotes_hechos>=i.lotes_total&&['terminado','error'].indexOf(i.estado)>=0?'<button class="k-btn peq sec" onclick="accionCfdi(&#39;/api/kernel/cfdi/reintentar&#39;,{id:CFI.id,recruzar:true})">Volver a cruzar</button>':'')+'</div></div>';
  h+='<div class="sub mono" style="color:#8ba5b2;margin:4px 0 12px;word-break:break-all">SHA-256 '+esc(i.archivo_sha256||'—')+(i.tipo==='xml_nomina'?' · cruce por '+(i.llave==='rfc'?'RFC':'número de empleado'):'')+'</div>';
  if(i.error)h+='<div class="aviso err">'+esc(String(i.error).split('\\n')[0])+'</div>';
  if(i.tipo==='metadata_sat'&&rep.registros!=null){
    h+='<div class="kpis">'+[['UUID',rep.registros],['Vigentes',rep.vigentes],['Cancelados',rep.cancelados],['Renglones sin leer',rep.lineas_invalidas]].map(function(x){return '<div class="kpi"><div class="l">'+x[0]+'</div><div class="v">'+Number(x[1]||0).toLocaleString('es-MX')+'</div></div>'}).join('')+'</div>';
    h+='<div class="sub" style="font-size:12px;color:#5a7a8a">Para que los paquetes de XML ya cruzados usen este estado, vuelve a cruzarlos.</div>';
  }
  if(rep.cruce){
    var c=rep.cruce,m=rep.modulo_4_2||{};
    h+='<div class="kpis">'+[['Comprobantes',rep.comprobantes],['Válidos',rep.validos],['Cancelados (fuera)',rep.cancelados],['Repetidos',rep.duplicados],['Sin estado SAT',rep.sin_estado_sat],['Coinciden',c.coincidencias],['Con diferencia',c.con_diferencia],['Pago sin CFDI',(c.por_tipo||{}).sin_cfdi],['CFDI sin nómina',(c.por_tipo||{}).sin_nomina]]
      .map(function(x){return '<div class="kpi"><div class="l">'+x[0]+'</div><div class="v">'+Number(x[1]||0).toLocaleString('es-MX')+'</div></div>'}).join('')+'</div>';
    h+='<div class="'+(m.estado==='completo'?'aviso ok':'aviso')+'">Módulo 4.2: '+(m.estado==='completo'?'universo completo':'universo parcial — '+esc((m.motivos||[]).join('; ')))+'</div>';
    var sc=Object.keys(rep.sin_corrida||{});
    if(sc.length)h+='<h3>Fuera del calendario o inválidos</h3><div class="chipl">'+sc.map(function(k){return '<span>'+esc(k)+' · '+rep.sin_corrida[k]+'</span>'}).join('')+'</div>';
    var pc=c.por_corrida||{};
    h+='<h3>Por corrida</h3><div class="scroll"><table class="k-tbl"><thead><tr><th>Corrida</th><th class="num">Nómina</th><th class="num">CFDI</th><th class="num">Diferencias</th><th class="num">Pago sin CFDI</th><th class="num">CFDI sin nómina</th></tr></thead><tbody>'+
      Object.keys(pc).sort().map(function(k){var x=pc[k];return '<tr><td><b>'+esc(k)+'</b></td><td class="num">'+x.nomina+'</td><td class="num">'+x.cfdi+'</td><td class="num">'+x.diferencias+'</td><td class="num">'+x.sin_cfdi+'</td><td class="num">'+x.sin_nomina+'</td></tr>'}).join('')+'</tbody></table></div>';
    if(rep.muestra_errores&&rep.muestra_errores.length)h+='<h3>Comprobantes que no cuadran por dentro</h3><div style="font-size:12px;color:#5a7a8a">'+rep.muestra_errores.map(function(e){return esc(e.archivo+': '+e.errores.join('; '))}).join('<br>')+'</div>';
    h+='<button class="k-btn sec" style="margin-top:10px" onclick="document.querySelector(&#39;.k-tab[data-t=cfdi]&#39;).click()">Clasificar el cruce →</button>';
  }
  d.innerHTML=h;
}
function cargarPaquetes(){
  if(!ENC)return;
  Promise.all([api('GET','/api/kernel/cfdi?encargo_id='+encodeURIComponent(ENC.id)),api('GET','/api/kernel/criterios')]).then(function(r){
    var l=(r[0].ingestas||[]).filter(function(i){return i.tipo==='xml_nomina'&&i.estado==='terminado'});
    document.getElementById('xCrit').innerHTML=(r[1].criterios||[]).map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.id+' · '+c.tema)+'</option>'}).join('');
    var s=document.getElementById('selCf');
    s.innerHTML=l.length?l.map(function(i){return '<option value="'+esc(i.id)+'">'+esc(i.archivo_nombre+' · '+fecha(i.actualizado_en))+'</option>'}).join(''):'<option value="">Sin paquetes de XML cruzados</option>';
    if(CFI&&l.some(function(i){return i.id===CFI.id}))s.value=CFI.id;
    cargarCruces();
  });
}
function cargarCruces(){
  var id=document.getElementById('selCf').value;document.getElementById('clasC').classList.add('oculto');GCRU=null;
  if(!id){document.getElementById('tbCru').innerHTML='<tr><td colspan="7" class="vacio">Sube el .zip de XML en Archivos.</td></tr>';document.getElementById('aceptC').innerHTML='';return}
  api('GET','/api/kernel/cruces/grupos?ingesta_cfdi_id='+encodeURIComponent(id)).then(function(r){
    var a=r.aceptacion;document.getElementById('nCru').textContent=a.sin_clasificar;
    document.getElementById('aceptC').innerHTML=r.total===0?'<div class="aviso ok">La nómina y los CFDI coinciden en todo lo cruzado.</div>':(a.aceptado?'<div class="aviso ok">Todo el cruce está clasificado.</div>':'<div class="aviso">Faltan <b>'+a.sin_clasificar+'</b> de '+r.total+' por clasificar.</div>');
    document.getElementById('tbCru').innerHTML=(r.grupos||[]).map(function(g,i){return '<tr class="click" data-i="'+i+'"><td>'+esc(TIPOC[g.tipo])+'</td><td>'+esc(g.rubro)+'</td><td class="num">'+(g.dif_c==null?'—':pesos(g.dif_c))+'</td><td>'+esc(g.corrida_id||'—')+'</td><td class="num">'+g.n+'</td><td class="num">'+(g.pendientes||0)+'</td><td>'+(g.cubeta?'<span class="b b-neu">'+esc(CUBC[g.cubeta])+'</span>':'—')+'</td></tr>'}).join('')||'<tr><td colspan="7" class="vacio">Sin cruces pendientes.</td></tr>';
    document.querySelectorAll('#tbCru tr.click').forEach(function(tr){tr.addEventListener('click',function(){abrirCruce(r.grupos[Number(tr.dataset.i)],tr)})});
  });
}
function filtroGrupoC(g){var f={ingesta_cfdi_id:document.getElementById('selCf').value,tipo:g.tipo,rubro:g.rubro};if(g.dif_c!=null)f.dif_c=g.dif_c;if(g.corrida_id)f.corrida_id=g.corrida_id;return f}
function abrirCruce(g,tr){
  GCRU=g;document.querySelectorAll('#tbCru tr').forEach(function(x){x.classList.toggle('sel',x===tr)});
  document.getElementById('clasC').classList.remove('oculto');
  document.getElementById('clasCT').textContent='Clasificar · '+TIPOC[g.tipo]+' · '+g.rubro+(g.dif_c!=null?' · '+pesos(g.dif_c):'')+(g.corrida_id?' · '+g.corrida_id:'')+' · '+(g.pendientes||0)+' pendientes de '+g.n;
  var f=filtroGrupoC(g),q=Object.keys(f).map(function(k){return k+'='+encodeURIComponent(f[k])}).join('&');
  api('GET','/api/kernel/cruces?'+q).then(function(r){
    document.getElementById('tbCruC').innerHTML=r.cruces.map(function(x){return '<tr><td class="mono">'+esc(x.colaborador_llave)+'</td><td>'+esc(x.corrida_id)+'</td><td class="num">'+pesos(x.nomina_c)+'</td><td class="num">'+pesos(x.cfdi_c)+'</td><td class="mono" style="max-width:260px">'+esc(x.uuids||'—')+'</td><td>'+(x.cubeta?'<span class="b b-neu">'+esc(CUBC[x.cubeta])+'</span>':'')+'</td></tr>'}).join('');
  });
}
function clasificarCruces(){
  if(!GCRU)return;
  var b=filtroGrupoC(GCRU);b.cubeta=document.getElementById('xCub').value;b.motivo=document.getElementById('xMotC').value.trim();
  if(b.cubeta==='criterio_sin_resolver')b.criterio_id=document.getElementById('xCrit').value;
  if(!b.motivo){alert('Escribe el motivo');return}
  api('POST','/api/kernel/cruces/clasificar',b).then(function(){document.getElementById('xMotC').value='';cargarCruces()}).catch(function(e){alert(e.message)});
}

// ── Hallazgos y dictamen (T4–T7)
var OPS={conforme:'Conforme',conforme_con_observaciones:'Conforme con observaciones',con_salvedades:'Con salvedades',adverso:'Adverso',sin_opinion:'Sin opinión'};
var ESTH={abierto:'Abierto',en_correccion:'En corrección',corregido:'Corregido',confirmado:'Confirmado',resuelto_por_reproceso:'Resuelto por reproceso',superado:'Superado'};
var MODS={},MOTC={},FILTRO=null,PROP=null,HAL=null;
// Pesos escritos → centavos sin pasar por float.
function aCent(t){t=String(t||'').replace(/[\\s$,]/g,'');if(!t)return null;var m=t.match(/^(-?)(\\d+)(?:\\.(\\d{1,2}))?$/);if(!m)return NaN;return (m[1]?-1:1)*(Number(m[2])*100+Number(((m[3]||'')+'00').slice(0,2)))}
function centTxt(c){return c==null?'':(c<0?'-':'')+Math.floor(Math.abs(c)/100)+'.'+String(Math.abs(c)%100).padStart(2,'0')}
function bpTxt(b){return b==null?'':(b/100).toFixed(2)}
function cargarDictamen(){
  if(!ENC)return;
  document.getElementById('mCar').value=ENC.carga_patronal_c==null?'':centTxt(ENC.carga_patronal_c);
  document.getElementById('mFue').value=ENC.carga_patronal_fuente||'';
  document.getElementById('mBp').value=bpTxt(ENC.materialidad_bp);document.getElementById('mPis').value=centTxt(ENC.materialidad_piso_c);
  document.getElementById('mRec').value=ENC.recurrencia_periodos||3;document.getElementById('mTol').value=centTxt(ENC.tolerancia_individual_c);
  cargarHallazgos();cargarPendH();cargarDictamenes();
  api('GET','/api/kernel/ejecuciones?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    var l=(r.ejecuciones||[]).filter(function(e){return e.sello});
    document.getElementById('dEj').innerHTML=l.length?l.map(function(e){return '<option value="'+esc(e.id)+'">'+esc(fecha(e.calculado_en)+' · '+Number(e.n_calculos||0).toLocaleString('es-MX')+' cálculos · '+e.id)+'</option>'}).join(''):'<option value="">Sin ejecuciones selladas</option>';
    if(ING&&ING.ejecucion_id&&l.some(function(e){return e.id===ING.ejecucion_id}))document.getElementById('dEj').value=ING.ejecucion_id;
  });
}
function guardarConfig(){
  var bp=String(document.getElementById('mBp').value).trim(),b={encargo_id:ENC.id,carga_patronal_c:aCent(document.getElementById('mCar').value),carga_patronal_fuente:document.getElementById('mFue').value.trim()||null,
    materialidad_piso_c:aCent(document.getElementById('mPis').value),recurrencia_periodos:Number(document.getElementById('mRec').value||3),tolerancia_individual_c:aCent(document.getElementById('mTol').value)};
  var bpc=aCent(bp);if(bpc!=null)b.materialidad_bp=bpc;
  if([b.carga_patronal_c,b.materialidad_piso_c,b.tolerancia_individual_c,b.materialidad_bp].some(function(x){return typeof x==='number'&&isNaN(x)})){aviso('msgCfg','Escribe los importes como 1234.56','err');return}
  if(b.carga_patronal_c!=null&&!b.carga_patronal_fuente){aviso('msgCfg','Indica de dónde sale la carga patronal','err');return}
  ['materialidad_piso_c','tolerancia_individual_c'].forEach(function(k){if(b[k]==null)delete b[k]});
  api('POST','/api/kernel/encargo/config',b).then(function(r){
    ENCS=ENCS.map(function(e){return e.id===ENC.id?r.encargo:e});ENC=r.encargo;
    aviso('msgCfg',r.umbral.umbral_c==null?'Guardado. Falta la carga patronal para calcular el umbral.':'Guardado. Umbral de materialidad: '+pesos(r.umbral.umbral_c)+' (manda '+(r.umbral.manda==='piso'?'el piso':'el porcentaje')+').','ok');cargarHallazgos();
  }).catch(function(e){aviso('msgCfg',e.message,'err')});
}
function cargarPendH(){
  api('GET','/api/kernel/hallazgos/pendientes?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    var l=(r.pendientes||[]).concat((r.afiliacion||[]).map(function(a){return {afiliacion:true,carga_id:a.carga_id,regla_id:'Afiliación',rubro:TIPOA[a.tipo],tipo:a.tipo,motivo:a.motivo,n:a.n,colaboradores:a.colaboradores,suma_abs_c:a.suma_abs_c,suma_c:a.suma_abs_c}})).concat((r.cruces||[]).map(function(c){return {cruce:true,ingesta_cfdi_id:c.ingesta_cfdi_id,regla_id:'Cruce nómina ↔ CFDI',rubro:c.rubro,motivo:c.motivo,tipo:c.tipo,n:c.n,colaboradores:c.colaboradores,suma_abs_c:c.suma_abs_c,suma_c:c.suma_c}}));window.PENH=l;
    document.getElementById('tbPenH').innerHTML=l.length?l.map(function(g,i){return '<tr><td>'+esc(REGLAS[g.regla_id]||g.regla_id)+(g.cruce?' · '+esc(TIPOC[g.tipo]):'')+'</td><td>'+esc(g.rubro)+'</td><td>'+esc(g.motivo)+'</td><td class="num">'+g.n+'</td><td class="num">'+g.colaboradores+'</td><td class="num">'+pesos(g.suma_abs_c)+'</td><td><button class="k-btn peq" data-i="'+i+'">Crear cédula</button></td></tr>'}).join('')
      :'<tr><td colspan="7" class="vacio">Ninguna: toda diferencia de proceso ya está en una cédula.</td></tr>';
    document.querySelectorAll('#tbPenH button').forEach(function(b){b.addEventListener('click',function(){nuevaCedula(l[Number(b.dataset.i)])})});
  });
}
function nuevaCedula(g){
  FILTRO=g?(g.afiliacion?{afiliacion:{carga_id:g.carga_id,tipo:g.tipo,motivo:g.motivo}}:g.cruce?{cruces:{ingesta_cfdi_id:g.ingesta_cfdi_id,tipo:g.tipo,rubro:g.rubro,motivo:g.motivo}}:{diferencias:{regla_id:g.regla_id,rubro:g.rubro,motivo:g.motivo}}):null;
  var f=document.getElementById('frmHal');f.classList.remove('oculto');
  document.getElementById('hMod').innerHTML=Object.keys(MODS).map(function(k){return '<option value="'+k+'">'+k+' · '+esc(MODS[k])+'</option>'}).join('');
  document.getElementById('hMot').innerHTML=Object.keys(MOTC).map(function(k){return '<option value="'+k+'">'+esc(MOTC[k])+'</option>'}).join('');
  ['hTit','hCri','hCon','hCau','hRec','hRes','hFec','hEmi','hEma'].forEach(function(id){document.getElementById(id).value=''});
  if(g){
    var mod=g.afiliacion?'4.12':g.cruce?'4.2':/^CALC-(IMSS|RCV)/.test(g.regla_id)?'4.5':/^CALC-INF/.test(g.regla_id)?'4.7':/^CALC-ISN/.test(g.regla_id)?'4.8':'4.3';
    document.getElementById('hMod').value=mod;document.getElementById('hTit').value=g.motivo||'';document.getElementById('hCri').value=g.fundamento||'';
    document.getElementById('hCon').value=g.cruce?g.n+' casos ('+TIPOC[g.tipo]+', '+g.rubro+') en '+g.colaboradores+' colaboradores; efecto '+pesos(g.suma_abs_c)+'.':g.n+' diferencias en '+g.colaboradores+' colaboradores; suma '+pesos(g.suma_c)+' (de '+pesos(g.min_c)+' a '+pesos(g.max_c)+' por caso).';
    if(g.afiliacion){document.getElementById('hTip').value='cualitativo';document.getElementById('hMotW').classList.remove('oculto');document.getElementById('hMot').value='pago_baja_imss';document.getElementById('hCri').value='LSS arts. 15 fr. I y 27; RLSSMACERF';document.getElementById('hCon').value=g.n+' pagos ('+g.rubro+') a '+g.colaboradores+' colaboradores por '+pesos(g.suma_abs_c)+'.';}
    if(g.cruce&&g.tipo==='sin_cfdi'){document.getElementById('hTip').value='cualitativo';document.getElementById('hMotW').classList.remove('oculto');document.getElementById('hMot').value='pago_sin_cfdi';}
    document.getElementById('hFil').textContent='Se ligan los '+g.n+' casos de '+(g.cruce?'cruce nómina ↔ CFDI':(REGLAS[g.regla_id]||g.regla_id))+' · '+g.rubro+' con el motivo «'+g.motivo+'». El efecto se deriva de ellos.';
  } else document.getElementById('hFil').textContent='Sin diferencias ligadas: el efecto máximo valuado es obligatorio en un hallazgo cuantitativo.';
  document.getElementById('frmHalT').textContent=g?'Nueva cédula desde diferencias':'Nueva cédula sin diferencias';
  aviso('msgHal','');f.scrollIntoView({behavior:'smooth',block:'start'});
}
function crearHallazgo(){
  var v=function(id){return document.getElementById(id).value.trim()};
  var b={encargo_id:ENC.id,titulo:v('hTit'),modulo:v('hMod'),tipo:v('hTip'),riesgo:v('hRie'),criterio:v('hCri'),condicion:v('hCon'),causa:v('hCau'),recomendacion:v('hRec'),
    responsable:v('hRes'),fecha_compromiso:v('hFec')||null,efecto_min_c:aCent(v('hEmi')),efecto_max_c:aCent(v('hEma')),alcance_neto:v('hNet')==='1'};
  if(b.tipo==='cualitativo')b.motivo_cualitativo=v('hMot');
  if(FILTRO&&FILTRO.diferencias){b.diferencias=FILTRO.diferencias;b.regla_id=FILTRO.diferencias.regla_id;b.rubro=FILTRO.diferencias.rubro}
  if(FILTRO&&FILTRO.cruces){b.cruces=FILTRO.cruces;b.rubro=FILTRO.cruces.rubro}
  if(FILTRO&&FILTRO.afiliacion){b.afiliacion=FILTRO.afiliacion}
  if(isNaN(b.efecto_min_c)||isNaN(b.efecto_max_c)){aviso('msgHal','Efecto: escribe el importe como 1234.56','err');return}
  api('POST','/api/kernel/hallazgos',b).then(function(r){aviso('msgHal','Cédula '+r.id+' guardada'+(r.diferencias||r.cruces||r.afiliacion?' con '+((r.diferencias||0)+(r.cruces||0)+(r.afiliacion||0))+' casos ligados':'')+'.','ok');
    document.getElementById('frmHal').classList.add('oculto');cargarHallazgos();cargarPendH()}).catch(function(e){aviso('msgHal',e.message,'err')});
}
function cargarHallazgos(){
  api('GET','/api/kernel/hallazgos?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    MODS=r.modulos||{};MOTC=r.motivos_cualitativos||{};
    var u=r.umbral;document.getElementById('umbralTxt').innerHTML=u.umbral_c==null?'<span class="b b-lim">Sin umbral</span> Captura la carga patronal del periodo para decidir materialidad.':
      'Umbral de materialidad <b>'+pesos(u.umbral_c)+'</b> · '+(u.bp/100).toFixed(2)+'% de la carga = '+pesos(u.porcentaje_c)+' · piso '+pesos(u.piso_c)+'. Cualitativos y recurrentes son materiales siempre.';
    var l=r.hallazgos||[];document.getElementById('nHal').textContent=l.filter(function(h){return ['abierto','en_correccion','confirmado'].indexOf(h.estatus)>=0}).length;
    var rie={alto:'b-lim',medio:'b-par',bajo:'b-neu'};
    document.getElementById('tbHal').innerHTML=l.length?l.map(function(h){
      var mat=h.indeterminado?'<span class="b b-neu">Por decidir</span>':h.material?'<span class="b b-lim">Material</span> <span style="font-size:11px;color:#5a7a8a">'+esc(h.motivos_material.join(' · '))+'</span>':'<span class="b b-ok">No material</span>';
      return '<tr class="click" data-id="'+esc(h.id)+'"><td class="num">'+h.numero+'</td><td><b>'+esc(h.titulo)+'</b>'+(h.diferencias?'<div style="font-size:11px;color:#8ba5b2">'+h.diferencias+' diferencias'+(h.periodos>1?' · '+h.periodos+' periodos':'')+'</div>':'')+'</td><td>'+esc(h.modulo+' · '+(MODS[h.modulo]||''))+'</td><td class="num">'+pesos(h.efecto_max_c)+'</td><td>'+mat+'</td><td><span class="b '+(rie[h.riesgo]||'b-neu')+'">'+esc(h.riesgo)+'</span></td><td>'+esc(ESTH[h.estatus]||h.estatus)+'</td></tr>';
    }).join(''):'<tr><td colspan="7" class="vacio">Sin hallazgos en este encargo.</td></tr>';
    document.querySelectorAll('#tbHal tr.click').forEach(function(tr){tr.addEventListener('click',function(){verHallazgo(tr.dataset.id)})});
  });
}
function verHallazgo(id){
  api('GET','/api/kernel/hallazgo?id='+encodeURIComponent(id)).then(function(r){
    HAL=r.hallazgo;var h=HAL,d=document.getElementById('detHal');d.classList.remove('oculto');
    var x='<div class="k-row" style="justify-content:space-between"><h2 style="margin:0">Hallazgo '+h.numero+' · '+esc(h.titulo)+'</h2><span class="mono" style="color:#8ba5b2">'+esc(h.id)+'</span></div>';
    x+='<div style="font-size:12px;color:#3d5a6b;margin:8px 0"><b>Criterio:</b> '+esc(h.criterio)+'<br><b>Condición:</b> '+esc(h.condicion)+'</div>';
    x+='<div class="frm"><div><label>Estatus</label><select id="xEst" class="k-sel">'+['abierto','en_correccion','corregido'].map(function(k){return '<option value="'+k+'"'+(h.estatus===k?' selected':'')+'>'+ESTH[k]+'</option>'}).join('')+(['abierto','en_correccion','corregido'].indexOf(h.estatus)<0?'<option selected value="">'+esc(ESTH[h.estatus])+'</option>':'')+'</select></div>'+
      '<div style="grid-column:span 2"><label>Causa</label><input id="xCau" class="k-in" value="'+esc(h.causa||'')+'"></div>'+
      '<div style="grid-column:span 2"><label>Recomendación</label><input id="xRec" class="k-in" value="'+esc(h.recomendacion||'')+'"></div>'+
      '<div><label>Responsable</label><input id="xRes" class="k-in" value="'+esc(h.responsable||'')+'"></div>'+
      '<div><label>Fecha compromiso</label><input id="xFec" type="date" class="k-in" value="'+esc(h.fecha_compromiso||'')+'"></div>'+
      '<div style="grid-column:span 2"><label>Motivo del cambio</label><input id="xMot" class="k-in" placeholder="Obligatorio al cerrar: evidencia de la corrección"></div>'+
      '<div><button class="k-btn" onclick="guardarHallazgo()">Guardar</button></div></div><div id="msgX"></div>';
    if(r.muestra.length)x+='<h3>Casos (los 50 mayores)</h3><div class="scroll alto"><table class="k-tbl"><thead><tr><th>Colaborador</th><th>Corrida</th><th class="num">Kernel</th><th class="num">Nómina</th><th class="num">Diferencia</th></tr></thead><tbody>'+
      r.muestra.map(function(m){return '<tr><td class="mono">'+esc(m.colaborador_id)+'</td><td>'+esc(m.corrida_id)+'</td><td class="num">'+pesos(m.kernel_c)+'</td><td class="num">'+pesos(m.cliente_c)+'</td><td class="num">'+pesos(m.diferencia_c)+'</td></tr>'}).join('')+'</tbody></table></div>';
    if(r.muestra_afiliacion&&r.muestra_afiliacion.length)x+='<h3>Pagos de afiliación</h3><div class="scroll alto"><table class="k-tbl"><thead><tr><th>Colaborador</th><th>Corrida</th><th>Caso</th><th>Fecha</th><th class="num">Percepciones</th></tr></thead><tbody>'+
      r.muestra_afiliacion.map(function(m){return '<tr><td class="mono">'+esc(m.colaborador_id)+'</td><td>'+esc(m.corrida_id)+'</td><td>'+esc(TIPOA[m.tipo])+'</td><td>'+esc(m.fuente_fecha+' '+m.fecha_evento)+'</td><td class="num">'+pesos(m.percepciones_c)+'</td></tr>'}).join('')+'</tbody></table></div>';
    if(r.muestra_cruces&&r.muestra_cruces.length)x+='<h3>Cruces nómina ↔ CFDI (los 50 mayores)</h3><div class="scroll alto"><table class="k-tbl"><thead><tr><th>Colaborador</th><th>Corrida</th><th>Tipo</th><th class="num">Nómina</th><th class="num">CFDI</th></tr></thead><tbody>'+
      r.muestra_cruces.map(function(m){return '<tr><td class="mono">'+esc(m.colaborador_llave)+'</td><td>'+esc(m.corrida_id)+'</td><td>'+esc(TIPOC[m.tipo]+' · '+m.rubro)+'</td><td class="num">'+pesos(m.nomina_c)+'</td><td class="num">'+pesos(m.cfdi_c)+'</td></tr>'}).join('')+'</tbody></table></div>';
    x+='<h3>Bitácora</h3><div class="scroll"><table class="k-tbl"><thead><tr><th>Cuándo</th><th>Quién</th><th>Campo</th><th>Antes</th><th>Después</th><th>Motivo</th></tr></thead><tbody>'+
      r.bitacora.map(function(b){return '<tr><td>'+fecha(b.en)+'</td><td>'+esc(b.quien)+'</td><td>'+esc(b.campo)+'</td><td>'+esc(b.antes||'')+'</td><td>'+esc(b.despues||'')+'</td><td>'+esc(b.motivo||'')+'</td></tr>'}).join('')+'</tbody></table></div>';
    d.innerHTML=x;d.scrollIntoView({behavior:'smooth',block:'start'});
  });
}
function guardarHallazgo(){
  var v=function(id){return document.getElementById(id).value.trim()};
  var b={id:HAL.id,causa:v('xCau'),recomendacion:v('xRec'),responsable:v('xRes'),fecha_compromiso:v('xFec')||null,motivo:v('xMot')||undefined};
  if(v('xEst'))b.estatus=v('xEst');
  api('POST','/api/kernel/hallazgo',b).then(function(r){aviso('msgX',r.cambios?'Guardado ('+r.cambios+' cambios en bitácora).':'Sin cambios.','ok');cargarHallazgos();verHallazgo(HAL.id)}).catch(function(e){aviso('msgX',e.message,'err')});
}
function limitacionesDeclaradas(){
  return document.getElementById('dLim').value.split('\\n').map(function(l){return l.trim()}).filter(Boolean).map(function(l){var i=l.indexOf(',');return {modulo:(i<0?l:l.slice(0,i)).trim(),motivo:(i<0?'Limitación declarada por el revisor':l.slice(i+1)).trim()}});
}
function proponer(){
  var ej=document.getElementById('dEj').value;if(!ej){aviso('dProp','Primero sella una ejecución (sube el archivo del periodo).','err');return}
  api('POST','/api/kernel/dictamen/propuesta',{encargo_id:ENC.id,ejecucion_id:ej,limitaciones:limitacionesDeclaradas()}).then(function(r){PROP=r;pintarPropuesta()}).catch(function(e){aviso('dProp',e.message,'err')});
}
function pintarPropuesta(){
  var r=PROP,p=r.propuesta,x='';
  x+='<div class="sem">'+r.modulos.map(function(m){var s=p.semaforo[m.modulo];return '<div class="'+s.color+'"><b>'+m.modulo+' · '+esc(m.nombre)+'</b>'+esc(s.etiqueta)+'</div>'}).join('')+'</div>';
  var reglas={1:'Falta la nómina o los XML originales (D13)',2:'Hallazgos materiales generalizados',3:'Hallazgo material o limitación en un rubro',4:'Hallazgos sobre tolerancia, ninguno material',5:'Sin hallazgos sobre tolerancia'};
  x+='<div class="op"><div class="t">Opinión propuesta: '+esc(OPS[p.opinion])+'</div><div class="r">Regla '+p.regla+': '+esc(reglas[p.regla])+(p.faltan_fuentes.length?' · falta '+esc(p.faltan_fuentes.join(', ')):'')+'</div>'+
    (p.salvedades.length?'<div class="r">Salvedades: '+p.salvedades.map(function(s){return esc(s.modulo+' '+(s.titulo||s.nombre||''))+(s.tipo==='universo_parcial'?' (cobertura '+s.efectivo+' de '+s.esperado+')':'')}).join(' · ')+'</div>':'')+'</div>';
  if(r.saldos&&r.saldos.partidas&&r.saldos.partidas.length)x+='<div class="r" style="font-size:12.5px;margin:6px 0">Saldos a favor: '+r.saldos.partidas.map(function(s){return esc(s.descripcion)+' '+pesos(s.importe_c)}).join(' · ')+'</div>';
  if(r.seguimiento&&r.seguimiento.length)x+='<div class="r" style="font-size:12.5px;margin:6px 0">Abiertos de periodos anteriores: '+r.seguimiento.length+(r.seguimiento.filter(function(s){return s.vencido}).length?' ('+r.seguimiento.filter(function(s){return s.vencido}).length+' con fecha vencida)':'')+'. Van al dictamen en «Seguimiento».</div>';
  if(r.bloqueos.length)x+='<div class="aviso err"><b>Todavía no se puede emitir:</b><ul class="blq">'+r.bloqueos.map(function(b){return '<li>'+esc(b)+'</li>'}).join('')+'</ul></div>';
  var sig=r.anterior?r.anterior.version+1:1;
  x+='<div class="frm">'+(p.opinion==='sin_opinion'?'':'<div><label>Opinión a emitir</label><select id="dOp" class="k-sel">'+Object.keys(OPS).filter(function(k){return k!=='sin_opinion'}).map(function(k){return '<option value="'+k+'"'+(k===p.opinion?' selected':'')+'>'+OPS[k]+'</option>'}).join('')+'</select></div>'+
    '<div style="grid-column:span 2"><label>Motivo si cambias la propuesta</label><input id="dMot" class="k-in"></div>')+
    (r.anterior?'<div style="grid-column:span 2"><label>Qué cambió y por qué (versión '+sig+')</label><input id="dMv" class="k-in"></div><div><label>Lo dispara</label><select id="dDis" class="k-sel"><option value="cliente">El cliente (información nueva)</option><option value="hrm">HRM (error propio)</option></select></div>':'')+
    '<div><button class="k-btn" '+(r.bloqueos.length?'disabled':'')+' onclick="emitir()">Emitir versión '+sig+'</button></div></div><div id="msgEm"></div>';
  document.getElementById('dProp').innerHTML=x;
}
function emitir(){
  var b={encargo_id:ENC.id,ejecucion_id:document.getElementById('dEj').value,limitaciones:limitacionesDeclaradas()};
  var op=document.getElementById('dOp');if(op&&op.value!==PROP.propuesta.opinion){b.opinion=op.value;b.motivo_cambio=document.getElementById('dMot').value.trim()}
  if(PROP.anterior){b.motivo_version=document.getElementById('dMv').value.trim();b.disparado_por=document.getElementById('dDis').value}
  if(!confirm('Un dictamen emitido no se puede modificar: una corrección será una versión nueva. ¿Emitir?'))return;
  api('POST','/api/kernel/dictamen/emitir',b).then(function(r){aviso('msgEm','Emitido '+r.id+' · '+OPS[r.opinion],'ok');cargarDictamenes();cargarHallazgos()}).catch(function(e){aviso('msgEm',e.message,'err')});
}
function cargarDictamenes(){
  api('GET','/api/kernel/dictamenes?encargo_id='+encodeURIComponent(ENC.id)).then(function(r){
    var l=r.dictamenes||[];
    document.getElementById('tbDic').innerHTML=l.length?l.map(function(d){return '<tr><td><b>v'+d.version+'</b></td><td>'+esc(OPS[d.opinion])+(d.opinion!==d.opinion_propuesta?' <span class="b b-par">cambiada por el revisor</span>':'')+'</td><td>'+fecha(d.emitido_en)+'</td><td>'+esc(d.motivo_version||'—')+(d.disparado_por?' <span class="b b-neu">'+esc(d.disparado_por)+'</span>':'')+'</td><td class="mono">'+esc(d.huella_contenido.slice(0,12))+'…</td><td><a class="k-btn peq sec" href="/dictamen?id='+encodeURIComponent(d.id)+'" target="_blank" rel="noopener" style="text-decoration:none">Ver</a></td></tr>'}).join('')
      :'<tr><td colspan="6" class="vacio">Sin dictamen emitido.</td></tr>';
  });
}
function cerrarEncargo(){
  if(!confirm('Cerrar el encargo inicia el plazo de 60 días para versiones. No se reabre. ¿Cerrar?'))return;
  api('POST','/api/kernel/encargo/cerrar',{encargo_id:ENC.id}).then(function(r){alert('Cerrado. Versiones posibles hasta '+r.reproceso_hasta.slice(0,10)+'.')}).catch(function(e){alert(e.message)});
}

// ── Carga por mes: el sistema detecta el mes de cada archivo y lo manda a su encargo (0019)
${JS_MES}
var HOY=new Date(Date.now()-6*3600e3).toISOString().slice(0,10);
var AUTO=[];
var TIPOS={prenomina:'Prenómina / acumulado',maestro:'Maestro de empleados',xml:'XML de nómina',metadata:'Metadata del SAT',sua:'SUA'};
function mesTxt(m){if(!m)return '—';var n=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][Number(m.slice(5,7))-1];return n+' '+m.slice(0,4)}
function mesAnterior(){var a=Number(HOY.slice(0,4)),m=Number(HOY.slice(5,7))-1;if(!m){m=12;a--}return a+'-'+(m<10?'0':'')+m}
async function analizarArchivo(f){
  var x={f:f,tipo:null,senales:[],meses:null,error:null};
  try{
    if(/\\.zip$/i.test(f.name)){
      await cargarJSZip();var z=await JSZip.loadAsync(f);
      var out=[];await juntarZip(z,'',0,out);
      if(out.some(function(o){return o.k==='sua'})){
        x.tipo='sua';x.out=out;var ms={};out.forEach(function(o){if(o.k==='sua')ms[o.per]=(ms[o.per]||0)+1});
        x.meses=Object.keys(ms).sort();x.porMes=ms;
        x.decision={mes:x.meses[x.meses.length-1],seguro:true,motivo:'el periodo viene en cada archivo .SUA'+(x.meses.length>1?' ('+x.meses.length+' meses)':'')};
        return x;
      }
      var xmls=Object.keys(z.files).filter(function(k){return !z.files[k].dir&&/\\.xml$/i.test(k)});
      if(!xmls.length){x.error='El ZIP no trae XML ni archivos del SUA';return x}
      x.tipo='xml';var paso=Math.max(1,Math.floor(xmls.length/300)),fechas=[];
      for(var i=0;i<xmls.length;i+=paso){var t=await z.files[xmls[i]].async('string');var ff=atributoXml(t,'FechaFinalPago');if(ff)fechas.push(ff)}
      var sf=senalFechas(fechas,'contenido');if(sf)x.senales.push(sf);
      mesesEnTexto(f.name,HOY).forEach(function(s){s.fuente='nombre';x.senales.push(s)});
      x.nota=xmls.length.toLocaleString('es-MX')+' XML';
    }else if(/\\.(txt|csv)$/i.test(f.name)){
      x.tipo='metadata';
      var sm=senalFechas(fechasMetadata(await f.slice(0,8e6).text()),'contenido',0.8,'fuerte');if(sm)x.senales.push(sm);
      mesesEnTexto(f.name,HOY).forEach(function(s){s.fuente='nombre';x.senales.push(s)});
    }else if(/\\.xlsx$/i.test(f.name)){
      await cargarJSZip();var zx=await JSZip.loadAsync(f);
      var wb=zx.file('xl/workbook.xml'),hojas=wb?hojasLibro(await wb.async('string')):[];
      var ss=zx.file('xl/sharedStrings.xml'),textos=ss?textosLibro((await ss.async('string')).slice(0,600000),400):[];
      x.tipo=tipoLibro(hojas);x.senales=senalesLibro(f.name,hojas,textos,HOY);
    }else{x.error='Formato no reconocido (se esperan .xlsx, .zip, .txt)';return x}
  }catch(e){x.error='No se pudo abrir: '+e.message;return x}
  x.decision=decidirMes(x.senales,HOY);
  return x;
}
async function analizarAuto(files){
  files=Array.prototype.slice.call(files||[]);if(!files.length)return;
  document.getElementById('detAuto').innerHTML='';
  aviso('msgAuto','Revisando '+files.length+' archivo'+(files.length>1?'s':'')+' en tu navegador…');
  AUTO=[];
  for(var i=0;i<files.length;i++){aviso('msgAuto','Revisando '+files[i].name+' ('+(i+1)+' de '+files.length+')…');AUTO.push(await analizarArchivo(files[i]))}
  // Contexto del lote: lo que es seguro en un archivo ayuda al que no dice su mes.
  var votos={};AUTO.forEach(function(x){if(x.decision&&x.decision.seguro&&x.tipo!=='sua')votos[x.decision.mes]=(votos[x.decision.mes]||0)+1;if(x.tipo==='sua')x.meses.forEach(function(m){votos[m]=(votos[m]||0)+1})});
  var lote=Object.keys(votos).sort(function(a,b){return votos[b]-votos[a]});
  lote=lote.length===1?lote[0]:null;
  AUTO.forEach(function(x){
    if(x.error||x.tipo==='sua'||!x.decision||x.decision.seguro||!lote)return;
    var fuertes=x.senales.filter(function(s){return s.fuerza!=='debil'});
    var debiles=x.senales.filter(function(s){return s.fuerza==='debil'});
    var coincide=debiles.every(function(s){return (s.mes||anioProbable(s.numero,HOY))===lote});
    if(!fuertes.length&&coincide){x.senales.push({mes:lote,fuerza:'fuerte',fuente:'lote'});x.decision=decidirMes(x.senales,HOY)}
  });
  pintarAuto(lote);
  var dudas=AUTO.filter(function(x){return !x.error&&!x.decision.seguro});
  if(!dudas.length&&AUTO.some(function(x){return !x.error}))return subirAuto();
  aviso('msgAuto',dudas.length?'Confirma el mes de '+(dudas.length===1?'1 archivo':dudas.length+' archivos')+' y presiona Subir.':'Ningún archivo se puede subir.',dudas.length?'':'err');
}
function pintarAuto(lote){
  var h='<div class="scroll"><table class="k-tbl"><thead><tr><th>Archivo</th><th>Tipo</th><th>Mes</th><th>Cómo lo supo</th><th>Estado</th></tr></thead><tbody>';
  AUTO.forEach(function(x,i){
    var mes;
    if(x.error)mes='—';
    else if(x.tipo==='sua')mes=x.meses.map(mesTxt).join(', ');
    else if(x.decision.seguro)mes='<b>'+esc(mesTxt(x.decision.mes))+'</b>';
    else mes='<input type="month" class="k-in" data-am="'+i+'" value="'+esc(x.decision.mes||lote||mesAnterior())+'" max="'+HOY.slice(0,7)+'" style="width:150px">';
    h+='<tr><td class="mono" style="font-size:11px">'+esc(x.f.name)+'</td><td>'+esc(x.tipo?TIPOS[x.tipo]:'—')+(x.nota?' <span class="sub" style="font-size:11px;color:#8ba5b2">'+esc(x.nota)+'</span>':'')+'</td><td>'+mes+'</td>'+
      '<td style="font-size:12px">'+esc(x.error||x.decision.motivo)+'</td><td id="aE'+i+'">'+(x.error?'<span class="b b-lim">No se sube</span>':x.tipo==='sua'||x.decision.seguro?'<span class="b b-ok">Mes detectado</span>':'<span class="b b-par">Confirma el mes</span>')+'</td></tr>';
  });
  h+='</tbody></table></div>';
  if(AUTO.some(function(x){return !x.error&&!x.decision.seguro}))h+='<div class="k-row" style="margin-top:10px"><button class="k-btn" id="bAuto">Subir</button><span class="sub" style="font-size:11px;color:#8ba5b2">Si el mes no tiene encargo, el sistema lo abre con la misma configuración del mes anterior.</span></div>';
  document.getElementById('detAuto').innerHTML=h;
  var b=document.getElementById('bAuto');if(b)b.addEventListener('click',function(){b.disabled=true;subirAuto()});
}
function empresaAuto(){if(CARGA)return U.empresa_id;if(ENC)return ENC.empresa_id;var e=document.getElementById('eEmp');return e&&e.value?Number(e.value):null}
async function subirAuto(){
  var emp=empresaAuto();if(!emp){aviso('msgAuto','Elige primero un encargo para saber de qué empresa son los archivos','err');return}
  document.querySelectorAll('[data-am]').forEach(function(inp){var x=AUTO[Number(inp.dataset.am)];if(inp.value){x.decision.mes=inp.value;x.decision.seguro=true;x.decision.motivo='confirmado por ti'}});
  var vale=AUTO.filter(function(x){return !x.error&&(x.tipo==='sua'||x.decision.mes)});
  var meses={};vale.forEach(function(x){(x.tipo==='sua'?x.meses:[x.decision.mes]).forEach(function(m){meses[m]=1})});
  var encs={},errMes={},abiertos=[];
  for(var m in meses){
    aviso('msgAuto','Buscando el encargo de '+mesTxt(m)+'…');
    try{var r=await api('POST','/api/kernel/encargo/mes',{empresa_id:emp,periodo:m});encs[m]=r.encargo.id;if(r.creado)abiertos.push(mesTxt(m))}catch(e){errMes[m]=e.message}
  }
  var orden={prenomina:1,maestro:2,xml:3,metadata:4,sua:5},hechos=0,fallas=0,ultimo=null;
  vale.sort(function(a,b){return orden[a.tipo]-orden[b.tipo]});
  for(var i=0;i<vale.length;i++){
    var x=vale[i],k=AUTO.indexOf(x),st=document.getElementById('aE'+k);
    var marcar=function(ok,t){if(st)st.innerHTML='<span class="b '+(ok?'b-ok':'b-lim')+'">'+esc(t)+'</span>';if(ok)hechos++;else fallas++};
    if(st)st.innerHTML='<span class="b b-run">Subiendo…</span>';
    aviso('msgAuto','Subiendo '+x.f.name+' ('+(i+1)+' de '+vale.length+')…');
    if(x.tipo==='sua'){
      var r2=await subirSua(x.f,function(per){return encs[per]||null},x.out);
      var sinEnc=x.meses.filter(function(m){return errMes[m]}).map(function(m){return mesTxt(m)+': '+errMes[m]});
      marcar(!r2.errores.length&&!sinEnc.length,(r2.ok||0)+' de '+(r2.total||0)+' registros'+(r2.errores.length||sinEnc.length?' · '+sinEnc.concat(r2.errores).slice(0,3).join(' · '):''));
      x.meses.forEach(function(m){if(encs[m])ultimo=encs[m]});
      continue;
    }
    var eid=encs[x.decision.mes];
    if(!eid){marcar(false,errMes[x.decision.mes]||'Sin encargo');continue}
    try{
      if(x.tipo==='prenomina')await subir(x.f,eid);
      else if(x.tipo==='maestro')await subirMaestro(x.f,eid);
      else await subirCfdi(x.f,eid);
      marcar(true,'Subido a '+mesTxt(x.decision.mes));ultimo=eid;
    }catch(e){marcar(false,e.message)}
  }
  document.getElementById('fAuto').value='';
  var b=document.getElementById('bAuto');if(b)b.remove();
  document.querySelectorAll('[data-am]').forEach(function(inp){inp.disabled=true});
  aviso('msgAuto',hechos+' de '+vale.length+' archivos subidos'+(abiertos.length?'. Se abrió el encargo de '+abiertos.join(' y '):'')+(fallas?'. Revisa los marcados en rojo.':'. Se procesan en el servidor; puedes cerrar esta pestaña.'),fallas?'err':'ok');
  if(ultimo)cargarEncargos(ultimo);
}
var dropA=document.getElementById('dropA');
['dragenter','dragover'].forEach(function(e){dropA.addEventListener(e,function(ev){ev.preventDefault();dropA.classList.add('on')})});
['dragleave','drop'].forEach(function(e){dropA.addEventListener(e,function(ev){ev.preventDefault();dropA.classList.remove('on')})});
dropA.addEventListener('drop',function(ev){if(ev.dataTransfer.files.length)analizarAuto(ev.dataTransfer.files)});

cargarEstado();cargarEncargos();
<\/script></body></html>`;
}
