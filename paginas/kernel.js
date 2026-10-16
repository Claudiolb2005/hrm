// paginas/kernel.js — Panel de auditoría del kernel (/kernel, sólo admin).
//
// Encargo → archivos (ingesta en el servidor, avance) → reporte (fuentes, resultados por regla)
// → diferencias agrupadas por importe y clasificación en cubetas → aceptación.
// Todo lo que viene de un archivo del cliente se escapa antes de pintarse (esc()).
// El JS del navegador va sin backticks ni ${…} para no chocar con el template literal.

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
.oculto{display:none}
.drop{border:2px dashed #c8dfe8;border-radius:12px;padding:16px;text-align:center;font-size:12px;color:#5a7a8a;background:#f8fbfc}
.drop.on{border-color:#1a8a8a;background:#eef8f8}
.scroll{overflow-x:auto}
.scroll.alto{max-height:460px;overflow-y:auto}
.scroll.alto thead th{position:sticky;top:0;background:#fff}
</style></head><body>
<div class="top"><div class="top-l"><img src="${LOGO}" alt="HRM"><span style="color:#1a8a8a;font-weight:700">Auditoría · Kernel</span></div>
<div class="top-r"><span id="uN" style="color:#5a7a8a;font-size:13px"></span><a href="/admin" class="bo">← Administrador</a><button class="bo br" onclick="logout()">Salir</button></div></div>
<div class="k-wrap">
  <div class="k-hd">
    <div><h1>Auditoría de nómina</h1><div class="sub" id="kEstado">Cargando estado del kernel…</div></div>
    <div class="k-row">
      <select id="selEnc" class="k-sel" onchange="cambiarEncargo()"></select>
      <button class="k-btn sec" onclick="toggle('frmEnc')">Nuevo encargo</button>
    </div>
  </div>

  <div id="frmEnc" class="k-card oculto">
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

  <div class="k-tabs" id="tabs">
    <div class="k-tab act" data-t="archivos">Archivos</div>
    <div class="k-tab" data-t="diferencias">Diferencias <span class="n" id="nPend">0</span></div>
    <div class="k-tab" data-t="calendario">Calendario</div>
    <div class="k-tab" data-t="registros">Registros patronales</div>
    <div class="k-tab" data-t="criterios">Criterios</div>
  </div>

  <section id="t-archivos">
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
      <div class="frm">
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
      <h3>Cargar (uno por renglón: registro, entidad, prima %, desde, hasta)</h3>
      <textarea id="rTxt" class="k-in" style="width:100%;min-height:110px;font-family:ui-monospace,Menlo,monospace;font-size:12px" placeholder="Y6079749104, CDMX, 0.50, 2026-03-01, 2027-02-28&#10;Z3337346103, SIN, 0.50, 2026-03-01, 2027-02-28"></textarea>
      <div class="frm"><div style="grid-column:span 3"><label>Fuente</label><input id="rFue" class="k-in" placeholder="SUA agosto 2026"></div><div><button class="k-btn" onclick="guardarRegistros()">Guardar registros</button></div></div>
      <div id="msgReg"></div>
    </div>
  </section>

  <section id="t-criterios" class="oculto">
    <div class="k-card"><h2>Bitácora de criterios</h2><div class="scroll"><table class="k-tbl"><thead><tr><th>#</th><th>Tema</th><th>Decisión</th><th>Estado</th><th>Quién</th></tr></thead><tbody id="tbCrit"></tbody></table></div></div>
  </section>
</div>
<script>
${AUTH_ADMIN}
${LOGOUT_FN}
document.getElementById('uN').textContent = U.nombre || U.email || '';
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
  ['archivos','diferencias','calendario','registros','criterios'].forEach(function(s){document.getElementById('t-'+s).classList.toggle('oculto',s!==t.dataset.t)});
  if(t.dataset.t==='diferencias')cargarEjecuciones();
  if(t.dataset.t==='calendario')cargarCalendario();
  if(t.dataset.t==='registros')cargarRegistros();
  if(t.dataset.t==='criterios')cargarCriterios();
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
  return Promise.all([api('GET','/api/kernel/encargos'),api('GET','/api/empresas')]).then(function(r){
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
  cargarIngestas();
  var act=document.querySelector('.k-tab.act');if(act&&act.dataset.t!=='archivos')act.click();
}
function crearEncargo(){
  var b={id:document.getElementById('eId').value.trim(),empresa_id:Number(document.getElementById('eEmp').value),nivel:document.getElementById('eNiv').value.trim(),
    periodo_desde:document.getElementById('eDes').value,periodo_hasta:document.getElementById('eHas').value,ejercicio:Number((document.getElementById('eDes').value||'').slice(0,4)),
    origen_nomina:document.getElementById('eOri').value,aplica_ajuste_mensual:document.getElementById('eAju').value==='1'};
  if(b.origen_nomina==='la_casa'){var op=prompt('Id de usuario que operó la nómina (no podrá revisar):');if(!op)return;b.operador_nomina_usuario_id=Number(op)}
  api('POST','/api/kernel/encargos',b).then(function(){toggle('frmEnc');cargarEncargos(b.id)}).catch(function(e){alert(e.message)});
}

// ── Archivos / ingestas
function subir(f){
  if(!ENC){aviso('msgSubir','Primero crea o elige un encargo','err');return}
  if(!f)return;
  if(!/\\.xlsx$/i.test(f.name)){aviso('msgSubir','Sólo .xlsx','err');return}
  var fd=new FormData();fd.append('file',f);fd.append('encargo_id',ENC.id);
  aviso('msgSubir','Subiendo '+f.name+'…');
  api('POST','/api/kernel/ingestas',fd).then(function(r){aviso('msgSubir','Recibido. Procesando en el servidor…','ok');document.getElementById('fArch').value='';cargarIngestas(r.id)})
    .catch(function(e){aviso('msgSubir',e.message,'err')});
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
    h+='<button class="k-btn sec" onclick="irDiferencias()">Clasificar diferencias →</button>';
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

cargarEstado();cargarEncargos();
<\/script></body></html>`;
}
