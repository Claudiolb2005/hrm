// paginas/dictamen.js — El dictamen tal como se emitió (/dictamen?id=…), para el cliente y para HRM.
//
// Lee /api/dictamen: el contenido congelado, si su huella verifica y todas las versiones del
// encargo con su fecha (T6 regla 6). Nada se recalcula aquí: se muestra lo emitido.
// El JS del navegador va sin backticks ni ${…} para no chocar con el template literal.

export function paginaDictamen({ CSS, LOGO, LOGOUT_FN }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dictamen — HRM</title>
<style>
${CSS}
*{box-sizing:border-box}
.d-wrap{max-width:1040px;margin:0 auto;padding:28px 24px 72px}
.d-meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}
.d-meta h1{font-size:26px;font-weight:650;letter-spacing:-.015em;color:#0D2B31;margin:0 0 4px}
.d-meta .c{font-size:14px;color:#3d5a6b}
.d-vers{display:flex;gap:6px;flex-wrap:wrap}
.d-vers a{display:inline-flex;flex-direction:column;padding:6px 12px;border:1px solid #DCE5E3;border-radius:8px;text-decoration:none;color:#10252B;font-size:12px;background:#fff;line-height:1.3}
.d-vers a small{color:#5E7479;font-size:10.5px}
.d-vers a.act{border-color:#12857F;box-shadow:inset 0 0 0 1px #12857F}
.d-nota{margin:18px 0 0;padding:12px 14px;border:1px solid #DCE5E3;border-radius:10px;background:#fff;font-size:12px;line-height:1.55;color:#3d5a6b}
.d-op{margin:22px 0;padding:26px 28px;border-radius:14px;background:#0D2B31;color:#E8F2F1;position:relative;overflow:hidden}
.d-op .k{font-size:12px;color:#8FB5B5;margin-bottom:6px}
.d-op .v{font-size:34px;font-weight:650;letter-spacing:-.02em;line-height:1.1}
.d-op .f{font-size:15px;line-height:1.6;max-width:760px;margin-top:12px;color:#CFE3E1}
.d-op .m{font-size:12px;color:#8FB5B5;margin-top:12px}
.d-op .sig{position:absolute;left:0;top:0;bottom:0;width:6px}
.sig.conforme{background:#3FD6C8}.sig.conforme_con_observaciones{background:#9AD8A6}.sig.con_salvedades{background:#F2B544}.sig.adverso{background:#F06A5B}.sig.sin_opinion{background:#8BA5B2}
.d-sec{margin-top:30px}
.d-sec h2{font-size:15px;font-weight:650;color:#0D2B31;margin:0 0 10px;scroll-margin-top:72px}
.d-sec .sub{font-size:12px;color:#5E7479;margin:-4px 0 10px}
.tira{display:grid;grid-template-columns:repeat(13,1fr);gap:3px;margin-bottom:8px}
.tira div{height:10px;border-radius:2px}
.mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.mods div{background:#fff;border:1px solid #DCE5E3;border-radius:10px;padding:10px 12px;font-size:12px;color:#3d5a6b;display:flex;gap:10px;align-items:flex-start}
.mods b{display:block;color:#10252B;font-size:12.5px;font-weight:600}
.pt{width:10px;height:10px;border-radius:50%;flex:none;margin-top:4px}
.verde{background:#11795a}.amarillo{background:#E0A100}.rojo{background:#C2412D}.gris{background:#8BA5B2}.fuera{background:transparent;border:1.5px dashed #9fb3b8}
.ced{background:#fff;border:1px solid #DCE5E3;border-radius:12px;padding:16px 18px;margin-bottom:10px}
.ced .h{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}
.ced .h b{font-size:14.5px;color:#0D2B31}
.ced dl{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;margin:12px 0 0;font-size:13px}
.ced dt{color:#5E7479}
.ced dd{margin:0;color:#10252B}
.tag{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;background:#EEF3F2;color:#3d5a6b;margin-left:4px}
.tag.mat{background:#FCE8E4;color:#9b2c1d}.tag.alto{background:#FCE8E4;color:#9b2c1d}.tag.medio{background:#FFF3D6;color:#7a5600}
.tb{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border:1px solid #DCE5E3;border-radius:10px;overflow:hidden}
.tb th{text-align:left;font-weight:600;color:#5E7479;font-size:11.5px;padding:9px 12px;border-bottom:1px solid #DCE5E3;background:#F7FAF9}
.tb td{padding:9px 12px;border-bottom:1px solid #EEF3F2;vertical-align:top}
.num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.mono{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all}
.integro{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border-radius:14px}
.integro.si{background:#E3F6EE;color:#0d5c44}.integro.no{background:#FCE8E4;color:#9b2c1d}
.d-acc{display:flex;gap:8px;margin-top:10px}
.d-btn{padding:8px 14px;border-radius:8px;border:1px solid #12857F;background:#fff;color:#12857F;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none}
.vacio{color:#5E7479;font-size:13px;padding:40px 0;text-align:center}
@media(max-width:640px){.d-op .v{font-size:26px}.ced dl{grid-template-columns:1fr}.tira{grid-template-columns:repeat(7,1fr)}.d-wrap{padding:20px 16px 56px}}
@media print{.top,.d-acc,.cmdk-t{display:none!important}.d-op{background:#fff;color:#000;border:2px solid #0D2B31}.d-op .f,.d-op .k,.d-op .m{color:#333}.d-wrap{padding:0}}
</style></head><body>
<div class="top"><div class="top-l"><img src="${LOGO}" alt="HRM"></div>
<div class="top-r"><span id="uN" style="font-size:12px"></span><a href="/portal" class="bo" id="volver">Informes</a><button class="bo br" onclick="logout()">Salir</button></div></div>
<main class="d-wrap" id="raiz"><div class="vacio">Cargando el dictamen…</div></main>
<script>
var tk=localStorage.getItem('hrm_token'),U=JSON.parse(localStorage.getItem('hrm_user')||'{}');if(!tk)window.location.href='/';
${LOGOUT_FN}
document.getElementById('uN').textContent=U.empresa_nombre||U.nombre||'';
if(U.rol==='admin'){var v=document.getElementById('volver');v.href='/kernel';v.textContent='Auditoría';}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pesos(c){if(c==null)return '—';var n=Number(c),s=n<0?'−':'';n=Math.abs(n);return s+'$'+Math.floor(n/100).toLocaleString('es-MX')+'.'+String(n%100).padStart(2,'0')}
function fecha(s){if(!s)return '—';var d=new Date(s);return isNaN(d)?String(s):d.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
var ESTM={completo:'Completo',universo_parcial:'Universo parcial',limitacion_alcance:'Limitación al alcance',fuera_de_alcance:'Fuera del alcance de esta versión'};
var ESTH={abierto:'Abierto',en_correccion:'En corrección',corregido:'Corregido',confirmado:'Confirmado',resuelto_por_reproceso:'Resuelto por reproceso',superado:'Superado'};
var COLOR={verde:'#11795a',amarillo:'#E0A100',rojo:'#C2412D',gris:'#8BA5B2',fuera:'#DCE5E3'};
var id=new URLSearchParams(location.search).get('id');
if(!id){document.getElementById('raiz').innerHTML='<div class="vacio">Falta el dictamen a mostrar.</div>'}
else fetch('/api/dictamen?id='+encodeURIComponent(id),{headers:{'Authorization':'Bearer '+tk}}).then(function(r){
  if(r.status===401){localStorage.removeItem('hrm_token');location.href='/';return null}
  return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'No disponible');return j});
}).then(function(r){if(r)pintar(r)}).catch(function(e){document.getElementById('raiz').innerHTML='<div class="vacio">'+esc(e.message)+'</div>'});

function valTxt(v){
  var p=v.periodos||[],m=(p[0]||{}).multa||{};
  return 'Contribución omitida '+pesos(v.omision_c)+' · actualización '+pesos(v.actualizacion_c)+(p.length===1&&p[0].factor?' (factor '+esc(p[0].factor)+')':'')+
    ' · recargos '+pesos(v.recargos_c)+(p.length===1&&p[0].meses_recargos?' ('+p[0].meses_recargos+' '+(p[0].meses_recargos===1?'mes':'meses')+', '+esc(p[0].tasa_acumulada_pct)+' %)':'')+
    ' · multa de '+pesos(v.multa_min_c)+' a '+pesos(v.multa_max_c)+(m.min_pct?' ('+esc(m.min_pct)+'–'+esc(m.max_pct)+' %, '+esc((m.fundamento||'').split(',')[0].split(' (')[0])+')':'')+
    '. Contingencia: '+pesos(v.contingencia_min_c)+' si se corrige espontáneamente; '+pesos(v.contingencia_max_c)+' si la descubre la autoridad. Valuada al '+esc(v.fecha_calculo||'—')+'.'+
    (v.no_valuados&&v.no_valuados.length?' Sin valuar: '+esc(v.no_valuados.join('; '))+'.':'');
}
function pintar(r){
  var d=r.dictamen,c=d.contenido,p=c.portada,o=c.s9_opinion,ops=r.opiniones,h='';
  document.title=p.titulo+' v'+d.version+' — HRM';
  h+='<div class="d-meta"><div><h1>'+esc(p.titulo)+'</h1><div class="c">'+esc(p.cliente)+' · '+esc(p.periodo)+' · nivel '+esc(p.nivel)+'</div></div>'+
    '<div class="d-vers" aria-label="Versiones">'+r.versiones.map(function(v){return '<a href="/dictamen?id='+encodeURIComponent(v.id)+'"'+(v.id===d.id?' class="act" aria-current="page"':'')+'>Versión '+v.version+'<small>'+esc(fecha(v.emitido_en))+'</small></a>'}).join('')+'</div></div>';
  if(p.version>1)h+='<div class="d-nota"><b>Versión '+p.version+'.</b> Sustituye a la versión '+(p.version-1)+' sin borrarla: '+esc(p.motivo_version)+' (lo solicitó '+(p.disparado_por==='cliente'?'el cliente':'HRM')+').</div>';
  h+='<div class="d-nota">'+esc(p.nota_alcance)+'<br><span style="color:#5E7479">'+esc(p.independencia)+'</span></div>';

  h+='<section class="d-op" aria-label="Opinión"><div class="sig '+esc(o.opinion)+'"></div><div class="k">Opinión</div><div class="v">'+esc(ops[o.opinion]||o.opinion)+'</div><div class="f">'+esc(o.frase)+'</div>'+
    (o.cambiada_por_revisor?'<div class="m">El revisor cambió la opinión propuesta por el sistema ('+esc(ops[o.propuesta])+'): '+esc(o.motivo_cambio)+'</div>':'')+
    '<div class="m">Emitido el '+esc(fecha(d.emitido_en))+'</div></section>';

  // Resumen: semáforo por módulo
  var sem=c.s3_resumen.semaforo,mods=c.s4_frente1;
  h+='<section class="d-sec"><h2 id="resumen">Resumen por módulo</h2><div class="sub">'+c.s3_resumen.hallazgos+' hallazgos, '+c.s3_resumen.materiales+' materiales · exposición máxima '+pesos(c.s3_resumen.exposicion_max_c)+' (sin accesorios)</div>'+
    '<div class="tira" aria-hidden="true">'+mods.map(function(m){return '<div style="background:'+COLOR[(sem[m.modulo]||{}).color||'fuera']+'"></div>'}).join('')+'</div>'+
    '<div class="mods">'+mods.map(function(m){var s=sem[m.modulo]||{color:'fuera',etiqueta:''};return '<div><span class="pt '+s.color+'"></span><span><b>'+esc(m.modulo+' · '+m.nombre)+'</b>'+esc(s.etiqueta)+'</span></div>'}).join('')+'</div></section>';

  // Alcance y limitaciones
  var a=c.s1_alcance,mat=a.materialidad||{};
  h+='<section class="d-sec"><h2 id="alcance">Alcance y limitaciones</h2><table class="tb"><thead><tr><th>Módulo</th><th>Estado</th><th class="num">Cobertura</th><th>Nota</th></tr></thead><tbody>'+
    a.modulos.filter(function(m){return m.estado!=='fuera_de_alcance'}).map(function(m){return '<tr><td>'+esc(m.modulo+' · '+m.nombre)+'</td><td>'+esc(ESTM[m.estado]||m.estado)+'</td><td class="num">'+(m.esperado?m.efectivo.toLocaleString('es-MX')+' de '+m.esperado.toLocaleString('es-MX'):'—')+'</td><td>'+esc((m.motivos||[]).join('; '))+'</td></tr>'}).join('')+
    '</tbody></table>'+((a.requerimiento_pendiente||[]).length?'<div class="sub" style="margin-top:12px"><b style="color:#10252B">Documentos pedidos que no se recibieron completos</b></div><table class="tb"><thead><tr><th>Documento</th><th>Estado</th><th>Pedido el</th><th>Responsable</th></tr></thead><tbody>'+
      a.requerimiento_pendiente.map(function(q){return '<tr><td>'+esc(q.descripcion)+(q.esencial?' <span class="tag mat">indispensable</span>':'')+'</td><td>'+esc(({pendiente:'No recibido',entregada:'Recibido, en revisión',incompleta:'Incompleto'})[q.estado]||q.estado)+'</td><td>'+esc(fecha(q.solicitado_en).split(' ').slice(0,3).join(' '))+'</td><td>'+esc(q.responsable||'—')+'</td></tr>'}).join('')+'</tbody></table>':'')+
    '<div class="sub" style="margin-top:10px">Fuera del alcance de esta versión: '+esc(a.modulos.filter(function(m){return m.estado==='fuera_de_alcance'}).map(function(m){return m.nombre}).join(', ')||'ninguno')+'.</div>'+
    '<div class="sub">Materialidad: '+(mat.umbral_c!=null?pesos(mat.umbral_c)+' ('+(mat.bp/100).toFixed(2)+'% de la carga patronal del periodo, '+pesos(mat.carga_patronal_c)+', con piso de '+pesos(mat.piso_c)+')':'—')+
    '.'+(a.cfdi?' XML de nómina: '+Number(a.cfdi.validos||0).toLocaleString('es-MX')+' comprobantes válidos de '+Number(a.cfdi.comprobantes||0).toLocaleString('es-MX')+' recibidos'+(a.cfdi.cancelados?', '+a.cfdi.cancelados+' cancelados ante el SAT fuera del cruce':'')+(a.cfdi.sin_estado_sat?', '+a.cfdi.sin_estado_sat+' sin estado ante el SAT verificado':'')+'.':'')+
    ' Los hallazgos cualitativos y los que se repiten en '+esc(mat.recurrencia_periodos||3)+' o más periodos son materiales siempre. Tolerancia de redondeo: '+pesos((a.tolerancia||{}).individual_c)+' por colaborador; no aplica a importes enterados.</div></section>';

  // Cédulas
  h+='<section class="d-sec"><h2 id="cedulas">Cédulas de hallazgo</h2>'+(c.s6_cedulas.length?c.s6_cedulas.map(function(x){
    return '<article class="ced"><div class="h"><b>'+x.numero+'. '+esc(x.titulo)+'</b><span>'+(x.material?'<span class="tag mat">Material</span>':'<span class="tag">No material</span>')+'<span class="tag '+esc(x.riesgo)+'">Riesgo '+esc(x.riesgo)+'</span><span class="tag">'+esc(ESTH[x.estatus]||x.estatus)+'</span></span></div>'+
      '<dl><dt>Módulo</dt><dd>'+esc(x.modulo+' · '+(r.modulos[x.modulo]||''))+'</dd><dt>Criterio</dt><dd>'+esc(x.criterio)+'</dd><dt>Condición</dt><dd>'+esc(x.condicion)+'</dd>'+
      (x.causa?'<dt>Causa</dt><dd>'+esc(x.causa)+'</dd>':'')+
      '<dt>Efecto</dt><dd>'+(x.efecto_min_c!=null&&x.efecto_min_c!==x.efecto_max_c?pesos(x.efecto_min_c)+' a ':'')+pesos(x.efecto_max_c)+(x.diferencias?' · '+x.diferencias.toLocaleString('es-MX')+' casos':'')+'<div style="font-size:11.5px;color:#5E7479">'+(typeof x.valuacion==='string'?esc(x.valuacion):valTxt(x.valuacion))+'</div></dd>'+
      (x.material?'<dt>Por qué es material</dt><dd>'+esc((x.motivos_material||[]).join('; '))+'</dd>':'')+
      '<dt>Recomendación</dt><dd>'+esc(x.recomendacion||'Por definir con el cliente')+'</dd><dt>Responsable · fecha</dt><dd>'+esc(x.responsable||'Por asignar')+' · '+esc(x.fecha_compromiso||'sin fecha')+'</dd></dl></article>'}).join(''):'<div class="sub">Sin hallazgos sobre tolerancia.</div>')+'</section>';

  if(c.transiciones&&c.transiciones.length)h+='<section class="d-sec"><h2>Qué pasó con los hallazgos de la versión anterior</h2><table class="tb"><thead><tr><th>Hallazgo</th><th>Antes</th><th>Ahora</th></tr></thead><tbody>'+
    c.transiciones.map(function(t){return '<tr><td class="mono">'+esc(t.hallazgo_id)+'</td><td>'+esc(ESTH[t.antes]||t.antes)+'</td><td>'+esc(ESTH[t.despues]||t.despues)+'</td></tr>'}).join('')+'</tbody></table></section>';

  h+='<section class="d-sec"><h2 id="plan">Plan de corrección</h2>'+(c.s10_plan.length?'<table class="tb"><thead><tr><th>Hallazgo</th><th>Recomendación</th><th>Responsable</th><th>Fecha compromiso</th></tr></thead><tbody>'+
    c.s10_plan.map(function(x){return '<tr><td>'+esc(x.titulo)+'</td><td>'+esc(x.recomendacion||'Por definir')+'</td><td>'+esc(x.responsable||'Por asignar')+'</td><td>'+esc(x.fecha_compromiso||'—')+'</td></tr>'}).join('')+'</tbody></table>':'<div class="sub">Nada pendiente.</div>')+'</section>';

  var sf=c.s7_saldos_a_favor||{partidas:[]};
  h+='<section class="d-sec"><h2 id="saldos">Saldos a favor y oportunidades de ahorro</h2>'+(sf.partidas&&sf.partidas.length?'<table class="tb"><thead><tr><th>Concepto</th><th>Quién lo recupera</th><th class="num">Casos</th><th class="num">Importe</th><th class="num">Sujeto a criterio</th></tr></thead><tbody>'+
    sf.partidas.map(function(x){return '<tr><td>'+esc(x.descripcion)+(x.sin_clasificar_c?'<div style="font-size:11.5px;color:#5E7479">'+pesos(x.sin_clasificar_c)+' todavía sin clasificar</div>':'')+'</td><td>'+esc(x.quien_recupera)+'</td><td class="num">'+Number(x.casos||0).toLocaleString('es-MX')+'</td><td class="num">'+pesos(x.importe_c)+'</td><td class="num">'+(x.sujeto_a_criterio_c?pesos(x.sujeto_a_criterio_c):'—')+'</td></tr>'}).join('')+
    '</tbody></table><div class="sub" style="margin-top:8px">Recuperable por la empresa: '+pesos(sf.total_empresa_c)+' · por los trabajadores: '+pesos(sf.total_trabajadores_c)+'. '+esc(sf.nota||'')+'</div>':'<div class="sub">'+esc(sf.nota||'Sin diferencias a favor en los rubros revisados.')+'</div>')+'</section>';

  var sg=c.s11_seguimiento||[];
  h+='<section class="d-sec"><h2 id="seguimiento">Seguimiento de periodos anteriores</h2>'+(sg.length?'<table class="tb"><thead><tr><th>Periodo</th><th>Hallazgo</th><th>Estado</th><th>Responsable</th><th>Fecha compromiso</th></tr></thead><tbody>'+
    sg.map(function(x){return '<tr><td>'+esc(x.periodo||'—')+'</td><td>'+esc(x.titulo)+' <span class="tag '+esc(x.riesgo||'')+'">Riesgo '+esc(x.riesgo||'—')+'</span></td><td>'+esc(ESTH[x.estatus]||x.estatus)+'</td><td>'+esc(x.responsable||'Por asignar')+'</td><td>'+esc(x.fecha_compromiso||'—')+(x.vencido?' <span class="tag mat">Vencido</span>':'')+'</td></tr>'}).join('')+
    '</tbody></table>':'<div class="sub">No hay hallazgos abiertos de periodos anteriores.</div>')+'</section>';

  h+='<section class="d-sec"><h2 id="base">Base normativa</h2><table class="tb"><thead><tr><th>Regla</th><th>Qué verifica</th><th>Fundamento</th></tr></thead><tbody>'+
    (c.s2_base_normativa||[]).map(function(b){return '<tr><td class="mono">'+esc(b.regla_id+' '+b.version)+'</td><td>'+esc(b.titulo)+'</td><td>'+esc(b.fundamento)+'</td></tr>'}).join('')+'</tbody></table></section>';

  h+='<section class="d-sec"><h2 id="traza">Trazabilidad</h2><table class="tb"><tbody>'+
    '<tr><td style="width:200px">Integridad del documento</td><td>'+(r.integro?'<span class="integro si">La huella coincide: no cambió desde su emisión</span>':'<span class="integro no">La huella no coincide</span>')+'</td></tr>'+
    '<tr><td>Huella SHA-256</td><td class="mono">'+esc(d.huella_contenido)+'</td></tr>'+
    '<tr><td>Ejecución del kernel</td><td class="mono">'+esc(p.ejecucion_id)+'<br>sello '+esc(p.sello_ejecucion)+'</td></tr>'+
    (a.cfdi?'<tr><td>Paquete de XML</td><td class="mono">'+esc(a.cfdi.sha256)+'</td></tr>':'')+
    (c.conservacion?'<tr><td>Conservación</td><td>Papeles de trabajo: permanentes. Archivos fuente del cliente: hasta el '+esc(c.conservacion.archivos_fuente_hasta)+'.</td></tr>':'')+
    '<tr><td>Versiones</td><td class="mono">kernel '+esc(p.kernel_version)+' · reglas '+esc(p.version_catalogo_reglas)+' · parámetros '+esc(p.version_parametros)+'</td></tr></tbody></table>'+
    '<div class="d-acc"><button class="d-btn" onclick="window.print()">Imprimir o guardar PDF</button></div></section>';
  document.getElementById('raiz').innerHTML=h;
}
<\/script></body></html>`;
}
