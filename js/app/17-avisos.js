/* ================= BANDEJA DE AVISOS (la campana) =================
   Todo lo que avisa la app queda aquí, aunque las notificaciones del
   dispositivo estén apagadas: recordatorios de citas y de eventos personales,
   cambios que hizo alguien más del estudio, el resumen del día y las citas de
   mañana por confirmar. Viven en la tabla notificaciones (una fila por
   persona; las escribe la función rheud-push) y cada quien solo ve las suyas.
   Los ajustes (qué avisos y a qué hora) están en Más › Notificaciones
   (js/push.js); aquí hay un acceso directo con el engrane. */
let AVISOS=[],avisosCargados=false,avisosCanal=null;
const AVISO_ICONO={recordatorio:'clock',evento:'user',cambios:'repeat',resumen:'sun',confirmar:'checkCircle',prueba:'bell'};

async function cargarAvisos(){
  if(!NEGOCIO_ID)return;
  try{
    const data=await guardar(sb.from('notificaciones')
      .select('id,tipo,titulo,cuerpo,url,cita_id,evento_id,created_at,leida_at')
      .eq('negocio_id',NEGOCIO_ID).order('created_at',{ascending:false}).limit(60));
    AVISOS=data||[];avisosCargados=true;
  }catch(e){console.warn('avisos',e);} // sin la tabla aún, la campana queda vacía
  pintarBadgeAvisos();
  if(curSheet==='avisosSheet')pintarAvisos();
}
function noLeidos(){return AVISOS.filter(a=>!a.leida_at).length}
/* número sobre la campana y en el ícono de la app (iPhone 16.4+ instalada) */
function pintarBadgeAvisos(){
  const n=noLeidos(),num=document.getElementById('notifNum'),btn=document.getElementById('btnNotif');
  if(num){num.hidden=!n;num.textContent=n>9?'9+':String(n);}
  if(btn)btn.setAttribute('aria-label',n?`Notificaciones, ${n} sin leer`:'Notificaciones');
  try{if(navigator.setAppBadge){if(n)navigator.setAppBadge(n).catch(()=>{});else navigator.clearAppBadge().catch(()=>{});}}catch(_){}
}
/* tiempo real: los avisos nuevos aparecen sin recargar (canal filtrado por persona) */
async function suscribirAvisos(){
  if(avisosCanal)return;
  let uid=null;
  try{const {data}=await sb.auth.getSession();uid=data&&data.session?data.session.user.id:null;}catch(_){}
  if(!uid)return;
  avisosCanal=sb.channel('rheud-avisos-'+uid)
    .on('postgres_changes',{event:'*',schema:'public',table:'notificaciones',filter:'user_id=eq.'+uid},p=>{
      const n=p&&p.new&&p.new.id?p.new:null;if(!n||(n.negocio_id&&n.negocio_id!==NEGOCIO_ID))return;
      const i=AVISOS.findIndex(a=>a.id===n.id);
      if(i>=0)AVISOS[i]={...AVISOS[i],...n};else AVISOS.unshift(n);
      pintarBadgeAvisos();
      if(curSheet==='avisosSheet')pintarAvisos();
    })
    .subscribe();
}
function iniciarAvisos(){cargarAvisos();suscribirAvisos();}

function abrirAvisos(){
  pintarAvisos();
  showSheet('avisosSheet');
  if(!avisosCargados)cargarAvisos();
}
function diaAviso(ts){
  const k=ymd(new Date(ts)),hoy=ymd(new Date());
  if(k===hoy)return 'Hoy';
  if(k===ymd(addDays(new Date(),-1)))return 'Ayer';
  const t=fechaCorta(k);return t[0].toUpperCase()+t.slice(1);
}
function horaAviso(ts){
  const d=new Date(ts),min=Math.round((Date.now()-d.getTime())/60000);
  if(min<1)return 'Ahora';
  if(min<60)return `Hace ${min} min`;
  return hm(d.getHours()*60+d.getMinutes());
}
function pintarAvisos(){
  const cont=document.getElementById('avisosLista');if(!cont)return;
  const n=noLeidos();
  document.getElementById('avisosTodo').hidden=!n;
  pintarInvitacionPush();
  if(!AVISOS.length){
    cont.innerHTML=`<div class="empty">${icon('bell')}<p>${avisosCargados?'Sin notificaciones por ahora':'Cargando…'}</p><span class="av-vacio">Aquí verás los recordatorios de tus citas y eventos, los cambios que haga alguien más del estudio, el resumen del día y las citas de mañana por confirmar.</span></div>`;
    return;
  }
  let dia='',html='';
  AVISOS.forEach(a=>{
    const d=diaAviso(a.created_at);
    if(d!==dia){dia=d;html+=`<div class="av-dia">${esc(d)}</div>`;}
    const nueva=!a.leida_at,cuando=horaAviso(a.created_at);
    const lbl=`${a.titulo}. ${a.cuerpo||''}. ${cuando}${nueva?'. Sin leer':''}`;
    html+=`<button type="button" class="av${nueva?' nueva':''}" aria-label="${esc(lbl)}" data-on-click="abrirAviso('${esc(a.id)}')">
      <span class="av-ic t-${esc(a.tipo)}" aria-hidden="true">${icon(AVISO_ICONO[a.tipo]||'bell')}</span>
      <span class="av-b" aria-hidden="true"><span class="av-t">${esc(a.titulo)}</span>${a.cuerpo?`<span class="av-c">${esc(a.cuerpo)}</span>`:''}<span class="av-h">${esc(cuando)}</span></span>
      ${nueva?'<span class="av-dot" aria-hidden="true"></span>':''}
    </button>`;
  });
  cont.innerHTML=html;
}
/* si este dispositivo no recibe push, invita a activarlo (los avisos igual quedan aquí) */
async function pintarInvitacionPush(){
  const el=document.getElementById('avisosPush');if(!el)return;
  let st='no-soportado';
  try{if(window.RheudPush)st=await window.RheudPush.estado();}catch(_){}
  el.innerHTML=st==='activadas'||st==='no-soportado'?'':
    `<div class="av-push"><span class="av-ic" aria-hidden="true">${icon('bell')}</span><span class="av-push-tx"><b>Recíbelos también en este dispositivo</b><small>${st==='instalar'?'Agrega la app a tu pantalla de inicio para activarlos.':'Aunque la app esté cerrada.'}</small></span><button type="button" class="btn-sm" data-on-click="abrirAjustesAvisos()">Activar</button></div>`;
}
/* engrane: de la bandeja a los ajustes (Más › Notificaciones) */
function abrirAjustesAvisos(){
  if(!window.RheudPush){toast('Los ajustes de avisos no están disponibles aquí');return;}
  document.getElementById('avisosSheet').classList.remove('show');
  window.RheudPush.abrir();
}
async function marcarLeida(id){
  const a=AVISOS.find(x=>x.id===id);
  const t=new Date().toISOString();
  if(a){if(a.leida_at)return;a.leida_at=t;pintarBadgeAvisos();}
  try{await guardar(sb.from('notificaciones').update({leida_at:t}).eq('id',id).is('leida_at',null));}
  catch(e){console.warn('marcar leída',e);}
}
async function marcarTodasLeidas(){
  const ids=AVISOS.filter(a=>!a.leida_at).map(a=>a.id);if(!ids.length)return;
  const t=new Date().toISOString();
  AVISOS.forEach(a=>{if(!a.leida_at)a.leida_at=t;});
  pintarBadgeAvisos();pintarAvisos();
  try{await guardar(sb.from('notificaciones').update({leida_at:t}).in('id',ids));}
  catch(e){avisarError(e,'No se pudieron marcar como leídas. Revisa tu conexión.');}
}
function abrirAviso(id){
  const a=AVISOS.find(x=>x.id===id);if(!a)return;
  marcarLeida(id);
  closeSheet();
  irADestinoAviso({cita:a.cita_id,evento:a.evento_id,confirmar:a.tipo==='confirmar'});
}
/* a dónde lleva un aviso: la cita, el evento, «Confirmar mañana» o Hoy */
function irADestinoAviso(d){
  if(d.cita){
    if(DB.citas.some(c=>c.id===d.cita)){editAppt(d.cita);return;}
    toast('Esa cita ya no existe');return;
  }
  if(d.evento){
    if((DB.eventos||[]).some(e=>e.id===d.evento)){editEvento(d.evento);return;}
    toast('Ese evento ya no existe');return;
  }
  if(d.confirmar&&typeof openConfirmaciones==='function'){openConfirmaciones();return;}
  if(currentView!=='agenda')nav('agenda');
  agToday();
}
window.RheudAvisos={marcarLeida,cargar:cargarAvisos,refrescarBadge:pintarBadgeAvisos,irA:irADestinoAviso};
// si la app ya arrancó antes de que cargara este archivo
if(NEGOCIO_ID)iniciarAvisos();
