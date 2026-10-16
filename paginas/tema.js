// paginas/tema.js — Sistema visual del portal HRM («consola de verificación»).
//
// Una sola capa que viste todas las páginas sin tocar su lógica: H() la inyecta en cada
// respuesta HTML. Idea rectora: el portal es un instrumento que verifica la nómina al
// centavo. Cromo oscuro color petróleo (la consola), área de trabajo clara y fría (el papel),
// un solo acento de señal (cian HRM) para lo vivo: foco, selección, comando.
// Lo memorable está en dos lugares: la barra de comandos (⌘K / Ctrl+K) y la portada de
// acceso, donde tres columnas de cifras se concilian solas. Todo lo demás, quieto.
//
// Tipografía: Instrument Sans para todo (cifras tabulares); JetBrains Mono sólo para
// identificadores de máquina (RFC, registros, huellas). Etiquetas en minúsculas de oración.

const FUENTES = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">';

export const TEMA_CSS = `
:root{
  --tinta:#0D2B31;--tinta-2:#133A42;--tinta-3:#1D4B55;--senal:#3FD6C8;--hrm:#12857F;--hrm-2:#0E6F6A;
  --papel:#F3F6F5;--hoja:#FFFFFF;--linea:#DCE5E3;--linea-2:#E9EFEE;--texto:#10252B;--suave:#5E7479;--tenue:#8FA3A6;
  --ambar:#B9780A;--rojo:#B93A27;--verde:#1D7A55;
  --f:'Instrument Sans',system-ui,-apple-system,'Segoe UI',sans-serif;--m:'JetBrains Mono',ui-monospace,Menlo,monospace;
  --r1:6px;--r2:10px;--r3:14px;
}
html body{font-family:var(--f);background:var(--papel);color:var(--texto);-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 1,"ss01" 1;letter-spacing:-.003em}
html body button,html body input,html body select,html body textarea{font-family:var(--f)}
html body ::selection{background:rgba(63,214,200,.28)}
html body :focus-visible{outline:2px solid var(--senal);outline-offset:2px}
html body a{color:var(--hrm)}

/* ── Cromo: la consola ─────────────────────────────────────────── */
html body .top{background:var(--tinta);border-bottom:1px solid var(--tinta-3);box-shadow:none;padding:10px 28px;position:sticky;top:0;z-index:50;gap:16px}
html body .top-l img{filter:brightness(0) invert(1);opacity:.94;height:50px!important;width:auto;margin:-8px -6px -8px -10px}
html body .top-l span{color:#CFE5E2!important;font-weight:600!important;font-size:14px;padding-left:14px;border-left:1px solid var(--tinta-3)}
html body .top-r{color:#A9C3C0}
html body .top-r #uN{color:#A9C3C0!important;font-weight:500!important}
html body .top .bo{background:transparent;border:1px solid rgba(207,229,226,.18);color:#D6E7E5;border-radius:var(--r1);padding:6px 11px;font-size:12px;font-weight:500}
html body .top .bo:hover{border-color:var(--senal);color:#fff;background:rgba(63,214,200,.08)}
html body .top .bo svg{opacity:.8}
html body .top .bo.br:hover{border-color:#E8806E;color:#FFD9D2;background:rgba(232,128,110,.08)}

/* ── Páginas sin sesión (restablecer contraseña) ──────────────── */
html body .nav{background:var(--tinta);border-bottom:1px solid var(--tinta-3);backdrop-filter:none;padding:12px 28px}
html body .nav img{height:56px!important;filter:brightness(0) invert(1);opacity:.94;margin:-6px 0 -6px -10px}
html body .center .card{border:1px solid var(--linea);border-radius:var(--r3);box-shadow:0 1px 0 rgba(16,37,43,.03)}
html body .center .card h2{font-weight:600;letter-spacing:-.02em}

/* ── Barra de comandos ─────────────────────────────────────────── */
.cmdk-t{display:inline-flex;align-items:center;gap:10px;min-width:260px;padding:7px 10px 7px 12px;border-radius:var(--r1);border:1px solid rgba(207,229,226,.16);background:rgba(255,255,255,.04);color:#93B1AE;font:500 12.5px var(--f);cursor:pointer;margin-right:auto;margin-left:22px}
.cmdk-t:hover{border-color:rgba(63,214,200,.5);color:#D6E7E5}
.cmdk-t kbd,.cmdk kbd{font:500 10.5px var(--m);padding:1px 6px;border-radius:4px;border:1px solid rgba(207,229,226,.22);color:#A9C3C0;margin-left:auto}
.cmdk-o{position:fixed;inset:0;background:rgba(7,24,28,.52);backdrop-filter:blur(3px);z-index:10000;display:none;align-items:flex-start;justify-content:center;padding-top:12vh}
.cmdk-o.on{display:flex}
.cmdk{width:min(640px,92vw);background:var(--tinta);border:1px solid var(--tinta-3);border-radius:var(--r3);box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden;color:#E4F0EE;transform-origin:50% 0;animation:cmdkIn .16s ease-out}
@keyframes cmdkIn{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}
html body .cmdk input{width:100%;background:transparent!important;border:0!important;border-bottom:1px solid var(--tinta-3)!important;box-shadow:none!important;padding:16px 18px;font:500 16px var(--f);color:#F2FAF9!important;outline:none;margin:0;border-radius:0!important}
.cmdk input::placeholder{color:#6F8F8C}
.cmdk ul{list-style:none;max-height:min(420px,56vh);overflow-y:auto;padding:6px}
.cmdk li{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:14px;color:#D6E7E5}
.cmdk li small{color:#7C9A97;font-size:12px;margin-left:auto;white-space:nowrap}
.cmdk li.g{font-size:11.5px;color:#6F8F8C;padding:10px 12px 4px;cursor:default;font-weight:600}
.cmdk li.sel{background:rgba(63,214,200,.12);color:#fff}
.cmdk li.sel::before{content:'';width:3px;align-self:stretch;margin:-3px 0 -3px -6px;border-radius:2px;background:var(--senal)}
.cmdk .pie{display:flex;gap:14px;padding:9px 16px;border-top:1px solid var(--tinta-3);font-size:11.5px;color:#6F8F8C}
.cmdk .vacio{padding:18px;color:#7C9A97;font-size:13px}

/* ── Superficies ───────────────────────────────────────────────── */
html body .cd,html body .pc,html body .sec,html body .k-card,html body .uc,html body .step-i{background:var(--hoja);border:1px solid var(--linea);border-radius:var(--r3);box-shadow:0 1px 0 rgba(16,37,43,.03)}
html body .pc::before,html body .kpi::before,html body .card::before{display:none}
html body .pc{transition:border-color .15s,box-shadow .15s}
html body .pc:hover{transform:none;border-color:#9FD3CD;box-shadow:0 6px 22px rgba(13,43,49,.07)}
html body .pc h3{font-weight:650;letter-spacing:-.015em}
html body .kpi{background:var(--hoja);border:1px solid var(--linea);border-radius:var(--r2);box-shadow:none}
html body .kpi-l,html body .kp-l,html body .k-card .kpi .l{text-transform:none;letter-spacing:0;font-size:12px;font-weight:500;color:var(--suave)}
html body .kpi-v,html body .kp-v,html body .k-card .kpi .v{font-family:var(--f);font-weight:650;letter-spacing:-.02em;font-feature-settings:"tnum" 1}
html body .chart-c{background:#FAFCFB;border:1px solid var(--linea-2);border-radius:var(--r2)}
html body .callout{background:#F7FAF9;border:1px solid var(--linea-2);border-left:3px solid var(--hrm);border-radius:var(--r1)}
html body .ct{max-width:1080px}
html body .mn,html body .k-wrap{background:var(--papel)}

/* ── Títulos ───────────────────────────────────────────────────── */
html body h1{font-weight:650;letter-spacing:-.025em}
html body h2,html body h3{letter-spacing:-.015em}
html body .pc .kp-v{color:var(--texto)!important;font-weight:600}
html body .pc .kp-l{font-size:12px}

/* ── Etiquetas y tablas: minúsculas de oración, cifras tabulares ─ */
html body label,html body .frm label,html body .k-card h2,html body .sb-hd h3,html body .step-i .sn{text-transform:none;letter-spacing:0;font-weight:600;color:var(--suave)}
html body .k-card h2{font-size:15px;color:var(--texto);letter-spacing:-.01em}
html body th,html body .tbl th,html body .k-tbl th{text-transform:none;letter-spacing:0;font-size:12px;font-weight:600;color:var(--suave);background:transparent;border-bottom:1px solid var(--linea)}
html body thead{background:transparent}
html body td,html body .tbl td{font-family:var(--f);font-feature-settings:"tnum" 1;font-size:12.5px;color:#2A4148;border-bottom:1px solid var(--linea-2)}
html body td:first-child{font-family:var(--f);color:var(--texto);font-weight:500}
html body tr.tot td{font-weight:650;color:var(--texto);border-top:1px solid var(--linea)}
html body .mono,html body code{font-family:var(--m)}
html body .sec{scroll-margin-top:72px}
html body .sec-n{font-family:var(--m);font-weight:500;background:transparent;color:var(--hrm);border:1px solid #CFE6E3;border-radius:var(--r1)}
html body .sec-t{font-weight:600;letter-spacing:-.01em}
html body .sec-h:hover{background:#F8FBFA}
html body .sec-body{border-top:1px solid var(--linea-2)}

/* ── Controles ─────────────────────────────────────────────────── */
html body input:not([type=checkbox]):not([type=radio]):not([type=file]),html body select,html body textarea,html body .k-in,html body .k-sel,html body .sb-search{border:1px solid var(--linea);border-radius:var(--r1);background:#FBFDFC;color:var(--texto)}
html body input:focus,html body select:focus,html body textarea:focus{border-color:var(--hrm);box-shadow:0 0 0 3px rgba(18,133,127,.12);background:#fff}
html body .btn,html body .k-btn{background:var(--hrm);border-radius:var(--r1);font-weight:600;box-shadow:none;letter-spacing:0}
html body .btn:hover,html body .k-btn:hover{background:var(--hrm-2);transform:none;box-shadow:none}
html body .k-btn.sec{background:#fff;color:var(--hrm);border:1px solid #A9D6D1}
html body .bo{border-radius:var(--r1)}
html body .chip{border-radius:var(--r1)}
html body .chip.act,html body .tab.act,html body .k-tab.act{background:var(--tinta);box-shadow:none;color:#fff}
html body .tab.active{color:var(--texto);border-bottom-color:var(--hrm)}
html body .k-tabs,html body .tabs{border-radius:var(--r2)}
html body .k-tab .n{background:rgba(18,133,127,.1);color:var(--hrm)}
html body .k-tab.act .n{background:rgba(63,214,200,.2);color:#fff}

/* ── Barra lateral del administrador ───────────────────────────── */
html body .sb{background:#FBFCFC;border-right:1px solid var(--linea)}
html body .sb-it{color:var(--suave)}
html body .sb-it.act{background:#EEF6F5;color:var(--texto);border-left-color:var(--hrm)}
html body .sb-it .ini{background:var(--tinta);color:#BFEDE8;border-radius:var(--r1);font-weight:600}
html body .mn-hd{background:var(--hoja);border-bottom:1px solid var(--linea)}
html body .mn-hd .left h1{font-weight:650;letter-spacing:-.02em}

/* ── Estilos en línea heredados: sin mayúsculas forzadas ni Courier ─ */
html body [style*="text-transform:uppercase"]{text-transform:none!important;letter-spacing:0!important}
html body [style*="Courier"],html body [style*="font-family:monospace"],html body [style*="font-family: monospace"]{font-family:var(--f)!important;font-feature-settings:"tnum" 1}
html body .sb-it .inf .rf{font-family:var(--m);font-size:10.5px}

/* ── Estados ───────────────────────────────────────────────────── */
html body .b-ok{background:#E4F3EC;color:var(--verde)}
html body .b-par{background:#FBF1DC;color:#8A5A06}
html body .b-lim{background:#F8E4DF;color:var(--rojo)}
html body .b-run{background:#E1F5F3;color:var(--hrm-2)}
html body .bar i{background:var(--hrm)}

@media (max-width:760px){
  html body .top{padding:8px 14px}
  .cmdk-t{min-width:0;margin-left:8px}
  .cmdk-t span{display:none}
  html body .top .bo{padding:5px 8px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{.cmdk-t,.cmdk-o{display:none!important}html body .top{position:static;background:#fff}html body .top-l img{filter:none}}
`;

// Chart.js: tipografía y retícula del sistema (se ejecuta justo después de cargar la librería).
const TEMA_GRAFICAS = `(function(){function t(){if(!window.Chart||!Chart.defaults||t.ok)return;t.ok=1;var d=Chart.defaults;
d.font.family="'Instrument Sans',system-ui,sans-serif";d.font.size=12;d.color='#5E7479';
if(d.scale&&d.scale.grid){d.scale.grid.color='rgba(16,37,43,.06)';}
if(d.plugins&&d.plugins.tooltip){var q=d.plugins.tooltip;q.backgroundColor='#0D2B31';q.titleColor='#F2FAF9';q.bodyColor='#D6E7E5';q.borderColor='#1D4B55';q.borderWidth=1;q.padding=10;q.cornerRadius=8;}}
t();document.addEventListener('DOMContentLoaded',t);})();`;

// Barra de comandos: navegar con el teclado a cualquier periodo, sección o acción.
const TEMA_JS = `(function(){
var tk=null,U={};try{tk=localStorage.getItem('hrm_token');U=JSON.parse(localStorage.getItem('hrm_user')||'{}')}catch(e){}
var ruta=location.pathname;
if(!tk||ruta==='/'||ruta==='/login'||ruta==='/recover')return;
var mac=/Mac|iPhone|iPad/.test(navigator.platform);
var top=document.querySelector('.top');
if(top){var b=document.createElement('button');b.type='button';b.className='cmdk-t';b.setAttribute('aria-label','Abrir la barra de comandos');
  b.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Ir a un periodo, sección o acción</span><kbd>'+(mac?'⌘K':'Ctrl K')+'</kbd>';
  b.addEventListener('click',abrir);var l=top.querySelector('.top-l');if(l&&l.nextSibling)top.insertBefore(b,l.nextSibling);else top.appendChild(b);}
var o=document.createElement('div');o.className='cmdk-o';o.setAttribute('role','dialog');o.setAttribute('aria-label','Barra de comandos');
o.innerHTML='<div class="cmdk"><input type="text" placeholder="Escribe un mes, una sección o una acción" aria-label="Buscar"><ul role="listbox"></ul><div class="pie"><span>↑↓ moverse</span><span>↵ abrir</span><span>esc cerrar</span></div></div>';
document.body.appendChild(o);
var inp=o.querySelector('input'),ul=o.querySelector('ul'),items=[],vis=[],sel=0,cargado=false;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function norm(s){return String(s).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()}
function base(){
  var l=[];
  if(U.rol==='admin'){l.push({g:'Ir a',t:'Administrador',d:'Clientes y periodos',f:function(){location.href='/admin'}});
    l.push({g:'Ir a',t:'Auditoría',d:'Archivos, diferencias y cubetas',f:function(){location.href='/kernel'}});}
  l.push({g:'Ir a',t:'Portal de reportes',d:'Periodos publicados',f:function(){location.href='/portal'}});
  document.querySelectorAll('.sec').forEach(function(s){var h=s.querySelector('.sec-h'),t=s.querySelector('.sec-t'),n=s.querySelector('.sec-n');if(!h||!t)return;
    l.push({g:'En este informe',t:t.textContent.trim(),d:n?'Sección '+n.textContent.trim():'',f:function(){if(!s.classList.contains('open'))h.click();s.scrollIntoView({behavior:'smooth',block:'start'})}})});
  document.querySelectorAll('.k-tab[data-t]').forEach(function(t){l.push({g:'En esta pantalla',t:t.textContent.replace(/\\d+$/,'').trim(),d:'Pestaña',f:function(){t.click()}})});
  if(window.print&&ruta==='/reporte')l.push({g:'Acciones',t:'Imprimir o guardar en PDF',d:'',f:function(){window.print()}});
  l.push({g:'Acciones',t:'Cerrar sesión',d:U.email||'',f:function(){if(typeof logout==='function')logout();else{localStorage.removeItem('hrm_token');localStorage.removeItem('hrm_user');location.href='/'}}});
  return l;
}
function cargar(){if(cargado)return;cargado=true;
  fetch('/api/periodos',{headers:{'Authorization':'Bearer '+tk}}).then(function(r){return r.ok?r.json():{periodos:[]}}).then(function(j){
    var ps=(j.periodos||j.results||[]);
    ps.forEach(function(p){var mes=String(p.mes||'');items.push({g:'Informes',t:mes.charAt(0).toUpperCase()+mes.slice(1)+' '+p.anio,d:(p.empresa_nombre||'').split(' ')[0]+(p.estado&&p.estado!=='publicado'?' · '+p.estado:''),f:function(){location.href='/reporte?id='+p.id}})});
    pintar();
  }).catch(function(){});
}
function pintar(){
  var q=norm(inp.value.trim());
  vis=items.filter(function(i){if(!q)return true;var h=norm(i.t+' '+i.d+' '+i.g);return q.split(/\\s+/).every(function(w){return h.indexOf(w)>=0})}).slice(0,60);
  if(sel>=vis.length)sel=Math.max(0,vis.length-1);
  if(!vis.length){ul.innerHTML='<li class="vacio">Nada coincide con «'+esc(inp.value)+'». Prueba con un mes o un número de sección.</li>';return}
  var g='',h='';vis.forEach(function(i,k){if(i.g!==g){g=i.g;h+='<li class="g" role="presentation">'+esc(g)+'</li>'}
    h+='<li role="option" data-k="'+k+'"'+(k===sel?' class="sel" aria-selected="true"':'')+'>'+esc(i.t)+(i.d?'<small>'+esc(i.d)+'</small>':'')+'</li>'});
  ul.innerHTML=h;var s=ul.querySelector('.sel');if(s)s.scrollIntoView({block:'nearest'});
}
function abrir(){items=base();o.classList.add('on');inp.value='';sel=0;pintar();cargar();setTimeout(function(){inp.focus()},10)}
function cerrar(){o.classList.remove('on')}
function ejecutar(k){var i=vis[k];if(!i)return;cerrar();i.f()}
inp.addEventListener('input',function(){sel=0;pintar()});
ul.addEventListener('mousemove',function(e){var li=e.target.closest('li[data-k]');if(li&&Number(li.dataset.k)!==sel){sel=Number(li.dataset.k);pintar()}});
ul.addEventListener('click',function(e){var li=e.target.closest('li[data-k]');if(li)ejecutar(Number(li.dataset.k))});
o.addEventListener('click',function(e){if(e.target===o)cerrar()});
document.addEventListener('keydown',function(e){
  if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();o.classList.contains('on')?cerrar():abrir();return}
  if(!o.classList.contains('on'))return;
  if(e.key==='Escape'){cerrar()}else if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(vis.length-1,sel+1);pintar()}
  else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(0,sel-1);pintar()}else if(e.key==='Enter'){e.preventDefault();ejecutar(sel)}
});
})();`;

/** Inyecta tipografía, tema y barra de comandos en cualquier página HTML del portal. */
export function aplicarTema(html) {
  if (typeof html !== 'string' || html.indexOf('</head>') < 0) return html;
  let out = html.replace('</head>', FUENTES + '<style id="tema-hrm">' + TEMA_CSS + '</style><script>' + TEMA_GRAFICAS + '</script></head>');
  const i = out.lastIndexOf('</body>');
  if (i >= 0) out = out.slice(0, i) + '<script>' + TEMA_JS + '</script>' + out.slice(i);
  return out;
}
