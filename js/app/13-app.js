/* ---------------- SHEET CONTROL ----------------
   Las hojas son diálogos modales: al abrir se recuerda el botón que la abrió
   (sheetOpener) y al cerrar el foco vuelve ahí. El foco inicial, el foco
   atrapado y Escape viven en 15-accesibilidad.js. */
let curSheet=null;
let sheetOpener=null;
function showSheet(id){
  // Solo la primera hoja de una cadena recuerda quién la abrió
  if(!document.querySelector('.sheet.show')&&!curSheet)sheetOpener=recordarOrigen(document.activeElement);
  curSheet=id;document.getElementById('scrim').classList.add('show');
  requestAnimationFrame(()=>document.getElementById(id).classList.add('show'));
}
function closeSheet(){
  if(curSheet==='cliCreateSheet'&&cliCreateReturnToAppt){
    cliCreateReturnToAppt=false;
    document.getElementById('cliCreateSheet').classList.remove('show');
    curSheet='apptSheet';
    requestAnimationFrame(()=>document.getElementById('apptSheet').classList.add('show'));
    return;
  }
  // cierra cualquier hoja abierta (robusto ante estados inconsistentes)
  if(typeof qrScanner!=='undefined'&&qrScanner){try{qrScanner.stop();}catch(e){}try{qrScanner.clear();}catch(e){}qrScanner=null;}
  document.querySelectorAll('.sheet.show').forEach(s=>s.classList.remove('show'));
  document.getElementById('scrim').classList.remove('show');
  if(openCliId){renderClientas();openCliId=null;}
  curSheet=null;
  if(typeof apptRecursoPref!=='undefined')apptRecursoPref=null;
  const o=sheetOpener;sheetOpener=null;
  if(o)setTimeout(()=>devolverFoco(o),30);
}
/* Guarda el elemento que abrió la hoja y cómo volver a encontrarlo si la lista se repinta */
function recordarOrigen(el){
  if(!el||el===document.body||!el.closest)return null;
  return {el,id:el.id||'',accion:el.getAttribute('data-on-click')||'',vista:currentView};
}
function devolverFoco(o){
  if(document.querySelector('.sheet.show'))return;
  let el=o.el&&o.el.isConnected&&o.el.offsetParent!==null?o.el:null;
  if(!el&&o.id)el=document.getElementById(o.id);
  if(!el&&o.accion)el=[...document.querySelectorAll('#app [data-on-click]')].find(x=>x.getAttribute('data-on-click')===o.accion&&x.offsetParent!==null)||null;
  if(!el||el.offsetParent===null)el=document.querySelector('.view.active h1');
  if(el)el.focus({preventScroll:true});
}
/* Los avisos son interfaz: sin emojis (los emojis quedan solo en los mensajes de WhatsApp) */
function toast(m){const t=document.getElementById('toast');t.textContent=String(m).replace(/\p{Extended_Pictographic}️?/gu,'').replace(/\s{2,}/g,' ').trim();t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2600)}

/* ================= AUTH + INIT ================= */
const APP_VERSION='7.0';
const APP_BUILD='8 oct';
async function doLogin(){
  const emailEl=document.getElementById('loginEmail');
  const passEl=document.getElementById('loginPass');
  const email=emailEl.value.trim();
  const pass=passEl.value;
  const err=document.getElementById('loginErr');err.textContent='';
  if(!email||!pass){err.textContent='Escribe correo y contraseña.';return;}
  // Safari en modo privado bloquea localStorage — Supabase lo necesita
  try{localStorage.setItem('_test','1');localStorage.removeItem('_test');}
  catch(e){err.textContent='Activa el almacenamiento del navegador. En Safari: Configuración → Safari → desactiva "Navegación privada" o "Bloquear cookies".';return;}
  const btn=document.getElementById('loginBtn');
  btn.textContent='Entrando…';btn.disabled=true;
  try{
    // Limpia cualquier sesión vieja antes de entrar (fix para Safari)
    await sb.auth.signOut();
    const {error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error){
      // muestra el error real de Supabase para diagnosticar
      const msg=error.message||'Error desconocido';
      if(msg.toLowerCase().includes('invalid')||msg.toLowerCase().includes('credentials')){
        err.textContent='Correo o contraseña incorrectos.';
      }else if(msg.toLowerCase().includes('email')){
        err.textContent='Verifica tu correo: '+msg;
      }else if(msg.toLowerCase().includes('rate')||msg.toLowerCase().includes('limit')){
        err.textContent='Demasiados intentos. Espera unos minutos e intenta de nuevo.';
      }else{
        err.textContent='Error: '+msg;
      }
      passEl.value='';
      setTimeout(()=>passEl.focus(),100);
    }else{
      try{
        await startApp();
      }catch(e2){
        // muestra el error real para poder diagnosticar
        err.textContent='Acceso correcto pero error al cargar: '+e2.message;
        console.error('startApp error:',e2);
      }
    }
  }catch(e){
    err.textContent='Error de conexión ('+e.message+'). Revisa tu internet.';
    console.error(e);
  }finally{
    btn.textContent='Entrar';btn.disabled=false;
  }
}
async function confirmSignOut(){
  if(!confirm('¿Cerrar sesión?'))return;
  await sb.auth.signOut();
  window.location.reload();
}
async function ensureNegocio(){
  // busca el negocio del usuario. Las membresías se dan de alta por invitación:
  // una cuenta sin membresía no crea un negocio nuevo.
  let {data:miembros,error:em}=await sb.from('miembros').select('negocio_id').limit(1);
  if(em)throw em;
  if(miembros&&miembros.length){
    NEGOCIO_ID=miembros[0].negocio_id;
    try{const {data:neg}=await sb.from('negocios').select('promo_template,promo_broadcast').eq('id',NEGOCIO_ID).single();if(neg){if(neg.promo_template)PROMO_TEMPLATE=neg.promo_template;if(neg.promo_broadcast)PROMO_BROADCAST=neg.promo_broadcast;}}catch(e){}
    return;
  }
  throw new Error('Tu cuenta todavía no tiene acceso al estudio. Pide a la dueña que te agregue.');
}
async function startApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('loadingScreen').style.display='flex';
  try{
    // si la usuaria activó la verificación en dos pasos, pide el código antes de cargar
    if(window.RheudMFA)await RheudMFA.verificarAntesDeEntrar();
    await ensureNegocio();
    document.getElementById('loadTxt').textContent='Cargando tu estudio…';
    await loadAll();
  }catch(e){
    console.error(e);
    document.getElementById('loadingScreen').style.display='none';
    document.getElementById('loginScreen').style.display='flex';
    const msg=(e&&(e.message||e.error_description||e.details||e.hint))||JSON.stringify(e);
    const el=document.getElementById('loginErr');
    el.style.whiteSpace='normal';el.style.fontSize='11px';el.style.textAlign='left';
    el.textContent='Error: '+msg+(e&&e.code?(' [código '+e.code+']'):'');
    return;
  }
  document.getElementById('loadingScreen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('sbVer').textContent='v'+APP_VERSION+' · '+APP_BUILD;
  const sv=document.getElementById('signoutVer');if(sv)sv.textContent='Rhēud Beauty v'+APP_VERSION;
  greet();renderAgenda();
  subscribeRealtime();
  // la bandeja (17-avisos.js) puede cargar después: si aún no está, arranca sola
  if(typeof iniciarAvisos==='function')iniciarAvisos();
  startClock();
  initWeather();
  updateConn();
  setupScrollShrink();
}
function setupScrollShrink(){
  const tb=document.querySelector('.topbar');
  const syncStickyTop=()=>{
    // pega los controles de agenda justo debajo del topbar (que cambia de alto)
    document.querySelectorAll('.agenda-sticky').forEach(el=>{el.style.top=tb.offsetHeight+'px';});
  };
  let ticking=false;
  const onScroll=()=>{
    if(ticking)return;ticking=true;
    requestAnimationFrame(()=>{
      const y=window.scrollY||document.documentElement.scrollTop;
      tb.classList.toggle('scrolled',y>24);
      syncStickyTop();
      ticking=false;
    });
  };
  window.addEventListener('scroll',onScroll,{passive:true});
  setTimeout(syncStickyTop,60);
  window.addEventListener('resize',syncStickyTop);
}
function logout(){sb.auth.signOut().then(()=>location.reload());}

/* ---- Tiempo real: cada cambio llega con su fila y se aplica al caché ----
   Canal filtrado por negocio. Los DELETE no admiten filtro (solo traen el id),
   así que se escuchan aparte y solo quitan del caché lo que ya estaba ahí. */
let rtChannel=null,rtCaido=false;
function subscribeRealtime(){
  if(rtChannel)return;
  let ch=sb.channel('rheud-rt-'+NEGOCIO_ID);
  Object.keys(TABLAS).forEach(t=>{
    ch=ch.on('postgres_changes',{event:'*',schema:'public',table:t,filter:'negocio_id=eq.'+NEGOCIO_ID},p=>aplicarCambio(t,p))
      .on('postgres_changes',{event:'DELETE',schema:'public',table:t},p=>aplicarCambio(t,p));
  });
  rtChannel=ch.subscribe(estado=>{
    // si el canal se cayó, al volver se recarga todo (pudo perder cambios)
    if(estado==='CHANNEL_ERROR'||estado==='TIMED_OUT'||estado==='CLOSED')rtCaido=true;
    else if(estado==='SUBSCRIBED'&&rtCaido){rtCaido=false;recargarTodo();}
  });
}
function aplicarCambio(tabla,p){
  const t=TABLAS[tabla];if(!t||!p)return;
  const nueva=(p.new&&p.new.id)?p.new:null,id=nueva?nueva.id:(p.old&&p.old.id);
  if(!id)return;
  if(nueva&&nueva.negocio_id&&nueva.negocio_id!==NEGOCIO_ID)return;
  const lista=DB[t.k];
  // el expediente se identifica por clienta (puede haber un borrador sin id en el caché)
  const i=lista.findIndex(x=>x.id===id||(t.k==='expedientes'&&nueva&&x.clientaId===nueva.clienta_id));
  if(p.eventType==='DELETE'||!nueva||(t.viva&&!t.viva(nueva))){
    if(i<0)return;
    lista.splice(i,1);
  }else{
    const obj=t.map(nueva);
    if(i>=0)lista[i]=obj;else if(t.alInicio)lista.unshift(obj);else lista.push(obj);
  }
  programarRepintado();
}
/* repinta solo lo que se ve, una vez por ráfaga de cambios */
let repintarTimer=null;
function programarRepintado(){clearTimeout(repintarTimer);repintarTimer=setTimeout(repintarVista,200);}
function repintarVista(){
  try{
    if(currentView==='agenda')renderAgenda();
    else if(currentView==='ventas'){if(ventasModeActive==='insights')renderInteligencia();else if(ventasModeActive==='egresos')renderEgresos();else renderVentas();}
    else if(currentView==='clientas')renderClientas();
    else if(currentView==='citas')renderCitas();
    else if(currentView==='servicios'){
      if(document.getElementById('menuPremios').style.display==='block')renderPremios();
      else if(document.getElementById('menuCortesias').style.display==='block')renderCortesiasCat();
      else renderServicios();
    }
    // ficha abierta: refresco suave (no pisa lo que se está escribiendo)
    if(openCliId&&document.getElementById('cliSheet').classList.contains('show')){
      const cl=DB.clientas.find(x=>x.id===openCliId);
      loadExpediente(openCliId,true);renderCliCortesias(openCliId);
      if(cl)refreshLoyalty(cl);
    }
    if(curSheet==='apptSheet')renderAssist();
  }catch(e){console.error('repintar',e);}
}
/* al reconectar se recarga todo: los cambios de mientras no llegaron por el canal */
let recargando=null;
function recargarTodo(){
  if(recargando)return recargando;
  recargando=cargarTablas().then(repintarVista,e=>console.error('recarga',e)).finally(()=>{recargando=null;});
  if(typeof cargarAvisos==='function')cargarAvisos();
  return recargando;
}

/* ---- Reloj + fecha ---- */
function startClock(){
  const el=document.getElementById('sbClock');
  const tick=()=>{const d=new Date();el.textContent=`${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} · ${d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`;};
  tick();setInterval(tick,1000*20);
}

/* ---- Estado de conexión ---- */
function updateConn(){
  onlineState=navigator.onLine;
  const c=document.getElementById('sbConn');
  c.className='sb-conn '+(onlineState?'on':'off');
  document.getElementById('sbConnTxt').textContent=onlineState?'En línea':'Sin conexión';
}
window.addEventListener('online',()=>{updateConn();if(NEGOCIO_ID)recargarTodo();toast('Conexión restaurada ✨');});
window.addEventListener('offline',updateConn);
// el teléfono suspende la conexión en segundo plano: tras un rato fuera, se recarga al volver
let ocultaDesde=0;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){ocultaDesde=Date.now();return;}
  if(NEGOCIO_ID&&ocultaDesde&&Date.now()-ocultaDesde>60000)recargarTodo();
  ocultaDesde=0;
});

/* ---- Clima (Open-Meteo, sin API key) ---- */
let WX_CACHE=null;
const WX_ICON={0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',73:'🌨️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',95:'⛈️',96:'⛈️',99:'⛈️'};
function wxText(code){const m={0:'Despejado',1:'Casi despejado',2:'Parcialmente nublado',3:'Nublado',45:'Niebla',48:'Niebla',51:'Llovizna',53:'Llovizna',55:'Llovizna',61:'Lluvia ligera',63:'Lluvia',65:'Lluvia fuerte',71:'Nieve',80:'Chubascos',81:'Chubascos',82:'Tormenta',95:'Tormenta',96:'Tormenta',99:'Tormenta'};return m[code]||'—';}
async function initWeather(){
  if(!navigator.geolocation){document.getElementById('sbWeather').textContent='';return;}
  navigator.geolocation.getCurrentPosition(async pos=>{
    try{
      const {latitude:lat,longitude:lon}=pos.coords;
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`);
      WX_CACHE=await r.json();
      const cur=WX_CACHE.current;
      document.getElementById('sbWeather').textContent=`${WX_ICON[cur.weather_code]||''} ${Math.round(cur.temperature_2m)}°`;
      renderAgendaWeather();
      if(document.getElementById('apptSheet').classList.contains('show'))renderApptWeather();
    }catch(e){document.getElementById('sbWeather').textContent='';console.error(e);}
  },()=>{document.getElementById('sbWeather').textContent='';},{timeout:8000});
}
function wxForDate(key){
  if(!WX_CACHE||!WX_CACHE.daily)return null;
  const idx=WX_CACHE.daily.time.indexOf(key);
  if(idx<0)return null;
  return {code:WX_CACHE.daily.weather_code[idx],mx:Math.round(WX_CACHE.daily.temperature_2m_max[idx]),mn:Math.round(WX_CACHE.daily.temperature_2m_min[idx])};
}
function renderApptWeather(){
  const el=document.getElementById('apptWeather');if(!el)return;
  const date=document.getElementById('apptDate').value;
  if(!date){el.style.display='none';return;}
  const w=wxForDate(date);
  if(!w){el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=`<span class="aw-ic">${wxIcon(w.code)}</span><span class="aw-tx">Clima ese día: <b>${wxText(w.code)}</b> · ${w.mx}° / ${w.mn}°</span>`;
}
function renderAgendaWeather(){
  const el=document.getElementById('agendaWeather');if(!el)return;
  if(!WX_CACHE||!WX_CACHE.daily){el.textContent='';return;}
  if(agMode!=='dia'&&agMode!=='lista'){el.textContent='';return;}
  const key=ymd(agAnchor);
  const idx=WX_CACHE.daily.time.indexOf(key);
  if(idx<0){el.textContent='';return;}
  const code=WX_CACHE.daily.weather_code[idx],mx=Math.round(WX_CACHE.daily.temperature_2m_max[idx]),mn=Math.round(WX_CACHE.daily.temperature_2m_min[idx]);
  el.innerHTML=`${wxIcon(code)}<span class="wx">${wxText(code)} · ${mx}° / ${mn}°</span>`;
}

/* ---- arranque: sesión existente entra directo ---- */
// Versiones anteriores podían guardar una API key de IA en este navegador.
try{localStorage.removeItem('rheud_ai_key');}catch(_){}
(async()=>{
  try{
    const {data,error}=await sb.auth.getSession();
    if(error){
      // sesión corrupta — la limpiamos para que el login funcione
      await sb.auth.signOut();
      return;
    }
    if(data&&data.session){
      await startApp();
    }
  }catch(e){
    // si falla al arrancar, limpia y muestra login
    try{await sb.auth.signOut();}catch(_){}
    console.error('Init error:',e);
  }
})();
