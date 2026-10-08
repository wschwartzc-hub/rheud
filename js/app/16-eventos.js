/* ================= EVENTOS PERSONALES =================
   Dentista, comida, recoger a alguien, un día libre… Se ven en la agenda y
   pueden apartar el horario (el asistente no sugiere citas encima) y avisar 30
   min antes, pero no son citas: viven en la tabla eventos, así que no cuentan
   en el total de citas, cobros, finanzas, estadísticas, portal ni WhatsApp. */
let editingEventoId=null;
const $ev=id=>document.getElementById(id);

function llenarEvento(e){
  $ev('evTitulo').value=e.titulo||'';
  $ev('evFecha').value=e.fecha||selectedDate||ymd(new Date());
  $ev('evTodoDia').checked=!e.hora&&!!e.fecha;
  const s=toMin(e.hora);
  $ev('evHora').value=s==null?'':hhmm(s);
  $ev('evHoraFin').value=s==null?'':hhmm(Math.min(s+(Number(e.dur)||60),23*60+59));
  $ev('evBloquea').checked=e.bloquea!==false;
  $ev('evRecordar').checked=e.recordar!==false;
  $ev('evNotas').value=e.notas||'';
  syncEventoForm();
}
/* fecha y hora opcionales: vienen de «Nueva cita» o de la vista del día */
function openEventoSheet(fecha,hora){
  editingEventoId=null;
  $ev('evSheetTitle').textContent='Evento personal';
  $ev('evTipoSeg').hidden=false;
  $ev('evDelBtn').hidden=true;
  llenarEvento({fecha:fecha||selectedDate||ymd(new Date()),hora:hora||'',dur:60,bloquea:true,recordar:true});
  // nuevo sin hora elegida: queda en blanco para escribirla (no «todo el día»)
  $ev('evTodoDia').checked=false;syncEventoForm();
  showSheet('eventoSheet');
}
function editEvento(id){
  const e=(DB.eventos||[]).find(x=>x.id===id);
  if(!e){toast('Este evento ya no existe');return;}
  editingEventoId=id;
  $ev('evSheetTitle').textContent='Editar evento';
  $ev('evTipoSeg').hidden=true;
  $ev('evDelBtn').hidden=false;
  llenarEvento(e);
  showSheet('eventoSheet');
}
/* «Nueva cita» ⇄ «Evento personal» sin perder la fecha ni la hora */
function cambiarAEvento(){
  const fecha=$ev('apptDate').value||selectedDate,hora=$ev('apptTime').value;
  $ev('apptSheet').classList.remove('show');
  openEventoSheet(fecha,hora);
}
function cambiarACita(){
  const fecha=$ev('evFecha').value||selectedDate,hora=$ev('evTodoDia').checked?'':$ev('evHora').value;
  $ev('eventoSheet').classList.remove('show');
  selectedDate=fecha;
  openApptSheet();
  if(hora){$ev('apptTime').value=hora;renderAssist();}
}
function syncEventoForm(){
  const todo=$ev('evTodoDia').checked;
  $ev('evHorasWrap').hidden=todo;
  $ev('evRecordarWrap').hidden=todo;
  renderEventoAviso();
}
function onEvHoraIni(){
  const a=toMin($ev('evHora').value),b=toMin($ev('evHoraFin').value);
  if(a!=null&&(b==null||b<=a))$ev('evHoraFin').value=hhmm(Math.min(a+60,23*60+59));
  renderEventoAviso();
}
/* minutos [s, e) que aparta lo que está en el formulario; null si falta la hora */
function rangoForm(){
  if($ev('evTodoDia').checked)return {s:0,e:24*60};
  const s=toMin($ev('evHora').value),e=toMin($ev('evHoraFin').value);
  return (s==null||e==null||e<=s)?null:{s,e};
}
function citasEncimadas(fecha,s,e){
  return DB.citas.filter(c=>c.fecha===fecha&&c.estado!=='cancelada'&&c.hora)
    .filter(c=>citaSegments(c).some(sg=>sg.s<e&&(sg.e+(sg.l||0))>s));
}
/* Aviso informativo: el evento puede guardarse aunque ya haya citas ahí */
function renderEventoAviso(){
  const el=$ev('evAviso');if(!el)return;
  const fecha=$ev('evFecha').value,r=rangoForm();
  if(!fecha||!r||!$ev('evBloquea').checked){el.innerHTML='';return;}
  const n=citasEncimadas(fecha,r.s,r.e);
  if(!n.length){el.innerHTML='';return;}
  const lista=n.slice(0,3).map(c=>`${hm(toMin(c.hora))} ${esc(cliNombre(c))}`).join(', ');
  el.innerHTML=`<div class="assist-status as-tight" role="status">${icon('alert')}<span>Ese horario ya tiene ${n.length===1?'una cita':n.length+' citas'}: ${lista}${n.length>3?'…':''}. Las citas no se mueven; revisa si hay que reagendarlas.</span></div>`;
}
async function saveEvento(){
  const titulo=$ev('evTitulo').value.trim();
  if(!titulo){toast('Escribe qué es el evento');$ev('evTitulo').focus();return;}
  const fecha=$ev('evFecha').value;
  if(!fecha){toast('Elige la fecha');return;}
  const todo=$ev('evTodoDia').checked;
  let hora='',dur=24*60;
  if(!todo){
    hora=$ev('evHora').value;
    if(!hora){toast('Elige la hora de inicio o marca «Todo el día»');return;}
    const r=rangoForm();
    if(!r){toast('La hora de fin debe ser después de la de inicio');return;}
    dur=r.e-r.s;
    if(dur<5){toast('El evento debe durar al menos 5 minutos');return;}
  }
  if(editingEventoId&&!(DB.eventos||[]).some(x=>x.id===editingEventoId)){toast('Este evento ya no existe');closeSheet();return;}
  const ev={titulo:titulo.slice(0,120),fecha,hora,dur,bloquea:$ev('evBloquea').checked,recordar:!todo&&$ev('evRecordar').checked,notas:$ev('evNotas').value.trim().slice(0,2000)};
  const listo=ocupar('evento',$ev('evSaveBtn'),'Guardando…');if(!listo)return;
  const eraNuevo=!editingEventoId;
  try{
    const q=eraNuevo?sb.from('eventos').insert(eventoToRow(ev)):sb.from('eventos').update(eventoToRow(ev)).eq('id',editingEventoId);
    ponerEnCache('eventos',rowToEvento(await guardar(q.select().single())));
  }catch(e){listo();avisarError(e,'No se pudo guardar el evento. Revisa tu conexión e intenta de nuevo.');return;}
  listo();
  closeSheet();
  agAnchor=new Date(fecha+'T00:00:00');selectedDate=fecha;
  if(currentView==='agenda')renderAgenda();
  let msg=eraNuevo?'Evento guardado · no cuenta como cita':'Evento actualizado';
  // el aviso de 30 min necesita las notificaciones activadas en este dispositivo
  if(ev.recordar&&window.RheudPush){
    try{if(await window.RheudPush.estado()!=='activadas')msg+='. Para el aviso, activa las notificaciones en la campana';}catch(_){}
  }
  toast(msg);
}
async function deleteEvento(){
  const id=editingEventoId;
  if(!id||!confirm('¿Eliminar este evento personal?'))return;
  // borrado suave, como citas y gastos: queda en la bitácora
  try{await guardar(sb.from('eventos').update({deleted_at:new Date().toISOString()}).eq('id',id));}
  catch(e){avisarError(e,'No se pudo eliminar. Revisa tu conexión.');return;}
  DB.eventos=(DB.eventos||[]).filter(x=>x.id!==id);
  closeSheet();
  if(currentView==='agenda')renderAgenda();
  toast('Evento eliminado');
}
