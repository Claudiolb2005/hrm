// paginas/encargo.js — El encargo visto por el cliente (/encargo?id=…): lo que falta entregar,
// sus hallazgos con plan de corrección y sus dictámenes. También lo abre HRM para verlo como el cliente.
// El JS del navegador va sin backticks ni ${…} para no chocar con el template literal.

export function paginaEncargo({ CSS, LOGO, LOGOUT_FN }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu revisión — HRM</title>
<style>
${CSS}
*{box-sizing:border-box}
.e-wrap{max-width:1040px;margin:0 auto;padding:28px 24px 72px}
.e-hd h1{font-size:26px;font-weight:650;letter-spacing:-.015em;color:#0D2B31;margin:0 0 4px}
.e-hd .c{font-size:14px;color:#3d5a6b}
.e-bar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 6px}
.e-paso{flex:1;min-width:180px;background:#fff;border:1px solid #DCE5E3;border-radius:12px;padding:12px 14px}
.e-paso .n{font-size:24px;font-weight:650;color:#0D2B31;font-variant-numeric:tabular-nums}
.e-paso .l{font-size:12px;color:#5E7479}
.e-sec{margin-top:30px}
.e-sec h2{font-size:16px;font-weight:650;color:#0D2B31;margin:0 0 4px}
.e-sec .sub{font-size:12.5px;color:#5E7479;margin:0 0 12px}
.it{background:#fff;border:1px solid #DCE5E3;border-radius:12px;padding:14px 16px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:6px 16px;align-items:start}
.it.esencial{border-left:4px solid #12857F}
.it b{font-size:14px;color:#10252B;font-weight:600}
.it .d{font-size:12.5px;color:#5E7479;line-height:1.5}
.it .ar{grid-column:1/-1;font-size:12px;color:#3d5a6b;border-top:1px dashed #DCE5E3;padding-top:8px;margin-top:4px}
.chip{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11.5px;font-weight:600;white-space:nowrap}
.pendiente{background:#FFF3D6;color:#7a5600}.entregada{background:#E6F2FB;color:#1f5f99}.completa{background:#E3F6EE;color:#0d5c44}
.incompleta{background:#FCE8E4;color:#9b2c1d}.no_aplica{background:#EEF3F2;color:#5E7479}.vencida{background:#FCE8E4;color:#9b2c1d}
.btn{padding:8px 14px;border-radius:8px;border:1px solid #12857F;background:#12857F;color:#fff;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
.btn.sec{background:#fff;color:#12857F}
.btn:disabled{opacity:.5;cursor:default}
.hz{background:#fff;border:1px solid #DCE5E3;border-radius:12px;padding:16px 18px;margin-bottom:10px}
.hz .t{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}
.hz .t b{font-size:14.5px;color:#0D2B31}
.hz p{font-size:13px;color:#3d5a6b;margin:8px 0 0;line-height:1.55}
.hz .f{display:grid;grid-template-columns:1fr 160px;gap:8px;margin-top:12px}
.hz .f input,.hz .f textarea{width:100%;padding:8px 10px;border:1px solid #DCE5E3;border-radius:8px;font:inherit;font-size:13px;background:#F7FAF9}
.hz .f textarea{grid-column:1/-1;min-height:54px}
.hz .acc{display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap;font-size:12.5px;color:#3d5a6b}
.hz .h{font-size:12px;color:#5E7479;margin-top:10px;border-top:1px dashed #DCE5E3;padding-top:8px;line-height:1.6}
.tag{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;background:#EEF3F2;color:#3d5a6b;margin-left:4px}
.tag.mat,.tag.alto{background:#FCE8E4;color:#9b2c1d}.tag.medio{background:#FFF3D6;color:#7a5600}
.dl a{display:inline-flex;flex-direction:column;padding:8px 14px;border:1px solid #DCE5E3;border-radius:10px;text-decoration:none;color:#10252B;background:#fff;margin:0 8px 8px 0;font-size:13px}
.dl a small{color:#5E7479;font-size:11px}
.msg{font-size:12px;margin-top:6px}.msg.ok{color:#0d5c44}.msg.err{color:#9b2c1d}
.vacio{color:#5E7479;font-size:13px;padding:30px 0;text-align:center}
@media(max-width:640px){.it{grid-template-columns:1fr}.hz .f{grid-template-columns:1fr}.e-wrap{padding:20px 16px 56px}}
</style></head><body>
<div class="top"><div class="top-l"><img src="${LOGO}" alt="HRM"></div>
<div class="top-r"><span id="uN" style="font-size:12px"></span><a href="/portal" class="bo" id="volver">Informes</a><button class="bo br" onclick="logout()">Salir</button></div></div>
<main class="e-wrap" id="raiz"><div class="vacio">Cargando…</div></main>
<script>
var tk=localStorage.getItem('hrm_token'),U=JSON.parse(localStorage.getItem('hrm_user')||'{}');if(!tk)window.location.href='/';
${LOGOUT_FN}
document.getElementById('uN').textContent=U.empresa_nombre||U.nombre||'';
if(U.rol==='admin'){var v=document.getElementById('volver');v.href='/kernel';v.textContent='Auditoría';}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pesos(c){if(c==null)return '—';var n=Number(c),s=n<0?'−':'';n=Math.abs(n);return s+'$'+Math.floor(n/100).toLocaleString('es-MX')+'.'+String(n%100).padStart(2,'0')}
function dia(s){if(!s)return '—';var d=new Date(String(s).length===10?s+'T12:00:00':s);return isNaN(d)?String(s):d.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'})}
var EST={pendiente:'Pendiente',entregada:'Entregada, en revisión',completa:'Completa',incompleta:'Incompleta',no_aplica:'No aplica'};
var ESTH={abierto:'Abierto',en_correccion:'En corrección',corregido:'Corregido',confirmado:'Confirmado',resuelto_por_reproceso:'Resuelto por reproceso',superado:'Superado'};
var OPS={conforme:'Conforme',conforme_con_observaciones:'Conforme con observaciones',con_salvedades:'Con salvedades',adverso:'Adverso',sin_opinion:'Sin opinión'};
var ID=new URLSearchParams(location.search).get('id'),D=null;
function api(m,p,b){var o={method:m,headers:{'Authorization':'Bearer '+tk}};if(b instanceof FormData)o.body=b;else if(b){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b)}
  return fetch(p,o).then(function(r){if(r.status===401){localStorage.removeItem('hrm_token');location.href='/';throw new Error('Sesión vencida')}return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})}
function cargar(){api('GET','/api/encargo?id='+encodeURIComponent(ID)).then(function(r){D=r;pintar()}).catch(function(e){document.getElementById('raiz').innerHTML='<div class="vacio">'+esc(e.message)+'</div>'})}
function pintar(){
  var e=D.encargo,req=D.requerimiento,hs=D.hallazgos,h='';
  var mes=new Date(e.periodo_desde+'T12:00:00').toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  document.title='Revisión '+mes+' — HRM';
  h+='<div class="e-hd"><h1>Tu revisión de nómina · '+esc(mes)+'</h1><div class="c">'+esc(e.empresa)+(e.rfc?' ('+esc(e.rfc)+')':'')+' · '+esc(e.periodo_desde)+' a '+esc(e.periodo_hasta)+(e.cerrado_en?' · cerrado el '+esc(dia(e.cerrado_en)):'')+'</div></div>';
  var pend=req.filter(function(x){return x.estado_efectivo==='pendiente'||x.estado_efectivo==='incompleta'}).length;
  var abiertos=hs.filter(function(x){return ['abierto','en_correccion','confirmado'].indexOf(x.estatus)>=0}).length;
  var dic=D.dictamenes[0];
  h+='<div class="e-bar"><div class="e-paso"><div class="n">'+pend+'</div><div class="l">'+(pend===1?'documento por entregar o completar':'documentos por entregar o completar')+'</div></div>'+
    '<div class="e-paso"><div class="n">'+abiertos+'</div><div class="l">hallazgos con corrección pendiente</div></div>'+
    '<div class="e-paso"><div class="n" style="font-size:17px;padding-top:5px">'+(dic?esc(OPS[dic.opinion]):'En revisión')+'</div><div class="l">'+(dic?'dictamen versión '+dic.version+', '+esc(dia(dic.emitido_en)):'todavía sin dictamen')+'</div></div></div>';

  h+='<section class="e-sec"><h2 id="requerimiento">Lo que necesitamos de ti</h2><div class="sub">Sin la nómina del periodo y los XML originales no podemos emitir opinión. Lo que falte se declara en el dictamen como limitación, con la fecha en que se pidió.</div>';
  h+=req.length?req.map(function(x,i){
    var st=x.vencida?'<span class="chip vencida">Vencida</span>':'<span class="chip '+x.estado_efectivo+'">'+EST[x.estado_efectivo]+'</span>';
    var ar=x.archivos.map(function(a){return esc(a.nombre)+' · '+esc(dia(a.subido_en))+(a.revision==='rechazado'?' · <b style="color:#9b2c1d">rechazado</b>: '+esc(a.nota_revision):a.revision==='aceptado'?' · aceptado':' · en revisión')}).join('<br>');
    var ev=x.evidencia&&x.evidencia.detalle&&x.evidencia.detalle.length?'<div class="d" style="margin-top:4px">'+esc(x.evidencia.detalle.join('; '))+'</div>':'';
    return '<div class="it'+(x.esencial?' esencial':'')+'"><div><b>'+esc(x.descripcion)+'</b>'+(x.esencial?' <span class="tag">indispensable</span>':x.obligatoria?'':' <span class="tag">opcional</span>')+
      '<div class="d">Pedido el '+esc(dia(x.solicitado_en))+(x.fecha_compromiso?' · entrega comprometida '+esc(dia(x.fecha_compromiso)):'')+(x.responsable?' · responsable: '+esc(x.responsable):'')+'</div>'+ev+(x.nota?'<div class="d">'+esc(x.nota)+'</div>':'')+'</div>'+
      '<div style="text-align:right">'+st+(x.estado_efectivo!=='completa'&&x.estado_efectivo!=='no_aplica'&&!e.cerrado_en?'<div style="margin-top:8px"><label class="btn sec" style="display:inline-block">Subir archivo<input type="file" data-i="'+i+'" style="display:none"></label></div>':'')+'<div class="msg" id="m'+i+'"></div></div>'+
      (ar?'<div class="ar">'+ar+'</div>':'')+'</div>'}).join(''):'<div class="vacio">Todavía no hay requerimiento para este periodo.</div>';
  h+='</section>';

  h+='<section class="e-sec"><h2 id="hallazgos">Hallazgos y plan de corrección</h2><div class="sub">Propón quién lo corrige y para cuándo. HRM lo marca como corregido cuando revisa la evidencia.</div>';
  h+=hs.length?hs.map(function(x){
    var cerrado=['corregido','resuelto_por_reproceso','superado'].indexOf(x.estatus)>=0;
    return '<article class="hz"><div class="t"><b>'+x.numero+'. '+esc(x.titulo)+'</b><span>'+(x.material?'<span class="tag mat">Material</span>':'')+'<span class="tag '+esc(x.riesgo)+'">Riesgo '+esc(x.riesgo)+'</span><span class="tag">'+esc(ESTH[x.estatus])+'</span></span></div>'+
      '<p><b>Qué encontramos:</b> '+esc(x.condicion)+'</p><p><b>Fundamento:</b> '+esc(x.criterio)+'</p>'+(x.efecto_max_c!=null?'<p><b>Contingencia máxima estimada:</b> '+pesos(x.efecto_max_c)+' (con actualización, recargos y multa cuando aplican; el detalle está en el dictamen)</p>':'')+
      (x.recomendacion?'<p><b>Qué recomendamos:</b> '+esc(x.recomendacion)+'</p>':'')+
      (cerrado?'':'<div class="f"><input placeholder="Responsable de la corrección" id="r_'+esc(x.id)+'" value="'+esc(x.responsable||'')+'"><input type="date" id="f_'+esc(x.id)+'" value="'+esc(x.fecha_compromiso||'')+'">'+
        '<textarea placeholder="Comentario para HRM (avance, evidencia que enviarás, dudas)" id="c_'+esc(x.id)+'"></textarea></div>'+
        '<div class="acc">'+(x.estatus==='abierto'?'<label><input type="checkbox" id="e_'+esc(x.id)+'"> Ya lo estamos corrigiendo</label>':'')+'<button class="btn" data-h="'+esc(x.id)+'">Guardar</button><span class="msg" id="mh_'+esc(x.id)+'"></span></div>')+
      (x.historia.length?'<div class="h">'+x.historia.map(function(b){return esc(dia(b.en))+' · '+esc(b.quien)+': '+(b.campo==='comentario'?esc(b.despues):esc(({responsable:'responsable',fecha_compromiso:'fecha compromiso',estatus:'estatus'})[b.campo]+' → '+(b.campo==='estatus'?ESTH[b.despues]||b.despues:b.despues||'—'))+(b.motivo?' («'+esc(b.motivo)+'»)':''))}).join('<br>')+'</div>':'')+
      '</article>'}).join(''):'<div class="vacio">Sin hallazgos publicados todavía.</div>';
  h+='</section>';

  if(D.dictamenes.length)h+='<section class="e-sec"><h2 id="dictamenes">Dictámenes</h2><div class="dl">'+D.dictamenes.map(function(d){return '<a href="/dictamen?id='+encodeURIComponent(d.id)+'">Versión '+d.version+' · '+esc(OPS[d.opinion])+'<small>'+esc(dia(d.emitido_en))+'</small></a>'}).join('')+'</div></section>';
  document.getElementById('raiz').innerHTML=h;
  document.querySelectorAll('input[type=file][data-i]').forEach(function(inp){inp.addEventListener('change',function(){subir(Number(inp.dataset.i),inp.files[0])})});
  document.querySelectorAll('button[data-h]').forEach(function(b){b.addEventListener('click',function(){guardar(b.dataset.h,b)})});
}
function subir(i,f){
  if(!f)return;var x=D.requerimiento[i],m=document.getElementById('m'+i);
  if(f.size>95*1024*1024){m.className='msg err';m.textContent='Máximo 95 MB por archivo';return}
  var fd=new FormData();fd.append('file',f);fd.append('encargo_id',ID);fd.append('fuente_clave',x.fuente_clave);
  m.className='msg';m.textContent='Subiendo '+f.name+'…';
  api('POST','/api/encargo/archivo',fd).then(function(){m.className='msg ok';m.textContent='Recibido. HRM lo revisa.';setTimeout(cargar,900)}).catch(function(e){m.className='msg err';m.textContent=e.message});
}
function guardar(id,b){
  var g=function(p){return document.getElementById(p+id)},m=document.getElementById('mh_'+id);
  var body={id:id,responsable:g('r_').value.trim(),fecha_compromiso:g('f_').value||null,comentario:g('c_').value.trim()};
  if(g('e_')&&g('e_').checked)body.en_correccion=true;
  b.disabled=true;
  api('POST','/api/encargo/hallazgo',body).then(function(r){m.className='msg ok';m.textContent=r.cambios?'Guardado':'Sin cambios';b.disabled=false;if(r.cambios)setTimeout(cargar,700)}).catch(function(e){m.className='msg err';m.textContent=e.message;b.disabled=false});
}
if(!ID)document.getElementById('raiz').innerHTML='<div class="vacio">Falta el encargo.</div>';else cargar();
<\/script></body></html>`;
}
