/* ---------------- SHEET CONTROL ---------------- */
let curSheet=null;
function showSheet(id){
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
}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200)}

/* ================= AUTH + INIT ================= */
const APP_VERSION='6.4';
const APP_BUILD='5 jul';
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

/* ---- Realtime: refresca el caché cuando otro dispositivo cambia algo ---- */
let rtChannel=null;
function subscribeRealtime(){
  if(rtChannel)return;
  rtChannel=sb.channel('rheud-rt')
    .on('postgres_changes',{event:'*',schema:'public',table:'citas'},()=>refetch('citas'))
    .on('postgres_changes',{event:'*',schema:'public',table:'clientas'},()=>refetch('clientas'))
    .on('postgres_changes',{event:'*',schema:'public',table:'servicios'},()=>refetch('servicios'))
    .on('postgres_changes',{event:'*',schema:'public',table:'premios'},()=>refetch('premios'))
    .on('postgres_changes',{event:'*',schema:'public',table:'cortesias_catalogo'},()=>refetch())
    .on('postgres_changes',{event:'*',schema:'public',table:'cortesias'},()=>refetch())
    .on('postgres_changes',{event:'*',schema:'public',table:'egresos'},()=>refetch())
    .on('postgres_changes',{event:'*',schema:'public',table:'expedientes_piel'},()=>refetch())
    .on('postgres_changes',{event:'*',schema:'public',table:'fotos_piel'},()=>refetch())
    .subscribe();
}
let refetchTimer=null;
function refetch(){
  // debounce: varias señales seguidas -> una sola recarga
  clearTimeout(refetchTimer);
  refetchTimer=setTimeout(async()=>{
    try{
      const [sv,cl,ci,pr]=await Promise.all([
        sb.from('servicios').select('*').order('created_at',{ascending:true}),
        sb.from('clientas').select('*').order('created_at',{ascending:true}),
        sb.from('citas').select('*').order('fecha',{ascending:true}),
        sb.from('premios').select('*').order('created_at',{ascending:true})
      ]);
      if(sv.data)DB.servicios=sv.data.map(rowToSvc);
      if(cl.data)DB.clientas=cl.data.map(rowToCli);
      if(ci.data)DB.citas=ci.data.map(rowToCita);
      if(pr&&pr.data)DB.premios=pr.data.map(rowToPremio);
      const [cc,co,eg,ex,fo]=await Promise.all([
        sb.from('cortesias_catalogo').select('*').order('created_at',{ascending:true}),
        sb.from('cortesias').select('*').order('created_at',{ascending:false}),
        sb.from('egresos').select('*').order('fecha',{ascending:false}),
        sb.from('expedientes_piel').select('*'),
        sb.from('fotos_piel').select('*').order('fecha',{ascending:false})
      ]);
      if(cc&&cc.data)DB.cortesiasCat=cc.data.map(rowToCortesiaCat);
      if(co&&co.data)DB.cortesias=co.data.map(rowToCortesia);
      if(eg&&eg.data)DB.egresos=eg.data.map(rowToEgreso);
      if(ex&&ex.data)DB.expedientes=ex.data.map(rowToExp);
      if(fo&&fo.data)DB.fotos=fo.data.map(rowToFoto);
      if(openCliId&&document.getElementById('cliSheet').classList.contains('show'))loadExpediente(openCliId);
      // re-render la vista actual
      if(currentView==='agenda')renderAgenda();
      else if(currentView==='ventas')renderVentas();
      else if(currentView==='ventas'&&ventasModeActive==='insights')renderInteligencia();
      else if(currentView==='clientas')renderClientas();
      else if(currentView==='citas')renderCitas();
      else if(currentView==='servicios')renderServicios();
    }catch(e){console.error('refetch',e);}
  },350);
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
window.addEventListener('online',()=>{updateConn();refetch();toast('Conexión restaurada ✨');});
window.addEventListener('offline',updateConn);

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
  el.innerHTML=`<span class="aw-ic">${WX_ICON[w.code]||'🌡️'}</span><span class="aw-tx">Clima ese día: <b>${wxText(w.code)}</b> · ${w.mx}° / ${w.mn}°</span>`;
}
function renderAgendaWeather(){
  const el=document.getElementById('agendaWeather');if(!el)return;
  if(!WX_CACHE||!WX_CACHE.daily){el.textContent='';return;}
  if(agMode!=='dia'){el.textContent='';return;}
  const key=ymd(agAnchor);
  const idx=WX_CACHE.daily.time.indexOf(key);
  if(idx<0){el.textContent='';return;}
  const code=WX_CACHE.daily.weather_code[idx],mx=Math.round(WX_CACHE.daily.temperature_2m_max[idx]),mn=Math.round(WX_CACHE.daily.temperature_2m_min[idx]);
  el.innerHTML=`${WX_ICON[code]||''} <span class="wx">${wxText(code)} · ${mx}° / ${mn}°</span>`;
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
