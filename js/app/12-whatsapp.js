/* ====== WhatsApp helpers reutilizables ====== */
function waTel(cli){let tel=(cli&&cli.telefono?cli.telefono:'').replace(/\D/g,'');if(tel.length===10)tel='52'+tel;return tel;}
function serviciosPromoText(){
  if(!DB.servicios.length)return '(agrega servicios en el Menú para que aparezcan aquí)';
  return DB.servicios.map(s=>{
    const precios=(s.precios&&s.precios.length)?s.precios.join('/'):s.p;
    return `🔹 ${s.n} — *$${precios}*`;
  }).join('\n');
}
function enviarPromo(){
  const tpl=PROMO_BROADCAST||PROMO_DEFAULT;
  const msg=tpl.replace('{{SERVICIOS}}',serviciosPromoText());
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}
function openEditPromoSheet(){
  document.getElementById('promoTplText').value=PROMO_BROADCAST||PROMO_DEFAULT;
  showSheet('editPromoSheet');
}
function previewPromo(){
  const tpl=document.getElementById('promoTplText').value||PROMO_DEFAULT;
  const msg=tpl.replace('{{SERVICIOS}}',serviciosPromoText());
  document.getElementById('promoPreview').textContent=msg;
  document.getElementById('promoPreviewWrap').style.display='block';
}
function restaurarPromoDefault(){
  if(!confirm('¿Restaurar la plantilla original?'))return;
  document.getElementById('promoTplText').value=PROMO_DEFAULT;
}
async function guardarPromoTpl(){
  const txt=document.getElementById('promoTplText').value.trim();
  if(!txt){toast('La plantilla no puede quedar vacía');return;}
  if(!txt.includes('{{SERVICIOS}}')){
    if(!confirm('No incluiste {{SERVICIOS}} — tus precios no aparecerán automáticamente. ¿Guardar de todas formas?'))return;
  }
  try{await guardar(sb.from('negocios').update({promo_broadcast:txt}).eq('id',NEGOCIO_ID));}
  catch(e){avisarError(e);return;}
  PROMO_BROADCAST=txt;
  closeSheet();toast('Plantilla guardada ✓');
}
function waOpen(cli,msg){
  const tel=waTel(cli);
  const url=(tel?`https://wa.me/${tel}`:`https://wa.me/`)+`?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank');
}
const PORTAL_URL='https://rheud-app.netlify.app/portal.html';
/* Enlace privado de la cita: token largo en el fragmento (#), que no viaja al
   servidor ni en el Referer. Las citas sin token caen al código corto. */
function portalLink(c){return c.portalToken?`${PORTAL_URL}#${c.portalToken}`:`${PORTAL_URL}?c=${c.codigo}`}
function msgConfirmacion(c,cli){
  const servicios=citaItems(c).map(i=>i.n).join(', ')||c.svcName||'tu servicio';
  const fechaHora=fmtFechaCompleta(c.fecha,c.hora);
  let msg=`¡Hola${cli?' '+cli.nombre.split(' ')[0]:''}! 🤍\n\n`;
  msg+=`Te recordamos tu cita de mañana en *Rhēud Beauty*:\n\n`;
  msg+=`📅 ${fechaHora}\n`;
  msg+=`💖 ${servicios}\n`;
  if(c.codigo)msg+=`🔖 ${c.codigo}\n`;
  msg+=`\n¿Nos confirmas tu asistencia? Responde *Sí* para confirmar. 💅✨`;
  return msg;
}
function openConfirmaciones(){
  const t=new Date();t.setDate(t.getDate()+1);
  const manana=ymd(t);
  const citas=DB.citas.filter(c=>c.fecha===manana&&c.estado!=='cancelada').sort((a,b)=>(a.hora||'').localeCompare(b.hora||''));
  const cont=document.getElementById('confirmList');
  const sub=document.getElementById('confirmSub');
  const fechaTxt=`${DOW[t.getDay()]} ${t.getDate()} ${MON[t.getMonth()]}`;
  if(!citas.length){
    sub.textContent=`No hay citas para mañana (${fechaTxt}).`;
    cont.innerHTML='<div class="empty-mini">Nada que confirmar por ahora.</div>';
  }else{
    sub.textContent=`${citas.length} cita${citas.length!==1?'s':''} para mañana, ${fechaTxt}. Toca para enviar la confirmación.`;
    cont.innerHTML=citas.map(c=>{
      const cli=DB.clientas.find(x=>x.id===c.clientaId);
      const t12=fmt12(c.hora);
      const hora=t12?`${t12.h} ${t12.ap}`:'—';
      const svc=citaItems(c).map(i=>i.n).join(' · ')||c.svcName||'Servicio';
      return `<div class="cf-item">
        <div class="cf-info">
          <div class="cf-when">${hora}</div>
          <div class="cf-cli">${esc(cli?cli.nombre:'Sin clienta')}</div>
          <div class="cf-svc">${svc}</div>
        </div>
        <button class="cf-wa" data-on-click="confirmarCita('${c.id}')">Confirmar</button>
      </div>`;
    }).join('');
  }
  showSheet('confirmSheet');
}
function confirmarCita(citaId){
  const c=DB.citas.find(x=>x.id===citaId);if(!c)return;
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  waOpen(cli, msgConfirmacion(c,cli));
}
function updateConfirmBadge(){
  const t=new Date();t.setDate(t.getDate()+1);
  const manana=ymd(t);
  const n=DB.citas.filter(c=>c.fecha===manana&&c.estado!=='cancelada').length;
  const b=document.getElementById('confirmBadge');
  if(b){if(n>0){b.textContent=n;b.style.display='inline-block';}else b.style.display='none';}
}
function msgInfoCita(c,cli){
  const servicios=citaItems(c).map(i=>i.n).join(', ')||c.svcName||'tu servicio';
  const fechaHora=fmtFechaCompleta(c.fecha,c.hora);
  let msg=`¡Hola${cli?' '+cli.nombre.split(' ')[0]:''}! 💅✨\n\n`;
  msg+=`Tu cita en *Rhēud Beauty*:\n\n`;
  msg+=`📅 ${fechaHora}\n`;
  msg+=`💖 ${servicios}\n`;
  // total neto (precio − descuento); si ya dejó anticipo, cuánto falta
  const r=resumenPago(c);
  if(r.total>0)msg+=`💵 Total: ${fmtMoney(r.total)}\n`;
  if(r.total>0&&r.cobrado>0)msg+=r.saldo>0?`✅ Pagado: ${fmtMoney(r.cobrado)} · resta ${fmtMoney(r.saldo)}\n`:`✅ Pagado\n`;
  const w=wxForDate(c.fecha);
  if(w)msg+=`${WX_ICON[w.code]||'🌡️'} Clima estimado: ${wxText(w.code)}, ${w.mx}°/${w.mn}°\n`;
  msg+=`\n🔖 Código de tu cita: *${c.codigo||'—'}*\n`;
  if(c.codigo||c.portalToken)msg+=`\nConsulta el estado de tu cita aquí:\n${portalLink(c)}\n`;
  msg+=`\n¡Te esperamos! 🤍`;
  return msg;
}
function msgRecordatorioPago(c,cli){
  const servicios=citaItems(c).map(i=>i.n).join(', ')||c.svcName||'tu servicio';
  const fechaHora=fmtFechaCompleta(c.fecha,c.hora);
  let msg=`¡Hola${cli?' '+cli.nombre.split(' ')[0]:''}! 🤍\n\n`;
  msg+=`Te recordamos con cariño un saldo pendiente de tu cita en *Rhēud Beauty*:\n\n`;
  msg+=`🔖 ID de cita: *${c.codigo||'—'}*\n`;
  msg+=`📅 ${fechaHora}\n`;
  msg+=`💖 ${servicios}\n`;
  const cob=montoCita(c);
  if(cob>0&&deudaCita(c)>0)msg+=`✅ Ya cobrado: $${cob}\n`;
  msg+=`💵 Monto pendiente: *$${deudaCita(c)}*\n`;
  if(c.codigo||c.portalToken)msg+=`\nPuedes ver el detalle aquí:\n${portalLink(c)}\n`;
  msg+=`\n¡Gracias! Cualquier duda, con gusto te apoyamos.`;
  return msg;
}

/* ====== Estado del menú de acciones ====== */
let accCliId=null, accCitaId=null;
/* Acciones de la clienta abierta en la ficha */
function openAccionesClienta(){openAcciones(openCliId,null)}
function openAcciones(cliId, citaId){
  accCliId=cliId||null; accCitaId=citaId||null;
  const cli=DB.clientas.find(x=>x.id===accCliId);
  document.getElementById('accSub').textContent = cli ? `Comunícate con ${cli.nombre.split(' ')[0]} por WhatsApp.` : 'Comunícate con la clienta por WhatsApp.';
  // mostrar botones según haya cita y según adeudo
  const hayCita=!!accCitaId;
  document.getElementById('accCitaBtn').style.display = hayCita?'flex':'none';
  let muestraCobro=false;
  if(hayCita){const c=DB.citas.find(x=>x.id===accCitaId); if(c && c.estado==='atendida' && (c.pago==='deuda'||c.pago==='parcial')) muestraCobro=true;}
  else if(accCliId){const st=clientStats(accCliId); if(st.debt>0) muestraCobro=true;}
  document.getElementById('accCobroBtn').style.display = muestraCobro?'flex':'none';
  showSheet('accionesSheet');
}
function accCli(){return DB.clientas.find(x=>x.id===accCliId);}
function accContactar(){
  const cli=accCli();
  if(!cli||!cli.telefono){toast('Esta clienta no tiene teléfono guardado');}
  waOpen(cli, `¡Hola${cli?' '+cli.nombre.split(' ')[0]:''}! 🤍 Te escribimos de *Rhēud Beauty*.`);
}
function accInfoCita(){
  const c=DB.citas.find(x=>x.id===accCitaId);if(!c){toast('Sin cita');return;}
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  waOpen(cli, msgInfoCita(c,cli));
}
function accRecordatorioPago(){
  let c=null;
  if(accCitaId)c=DB.citas.find(x=>x.id===accCitaId);
  else if(accCliId){
    // toma la deuda más antigua de la clienta
    const deudas=DB.citas.filter(x=>x.clientaId===accCliId&&x.estado==='atendida'&&(x.pago==='deuda'||x.pago==='parcial')).sort((a,b)=>a.fecha.localeCompare(b.fecha));
    c=deudas[0];
  }
  if(!c){toast('No hay adeudo registrado');return;}
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  waOpen(cli, msgRecordatorioPago(c,cli));
}
function accCortesia(){
  document.getElementById('cortesiaText').value = (typeof PROMO_TEMPLATE!=='undefined'&&PROMO_TEMPLATE) ? PROMO_TEMPLATE : '';
  document.getElementById('accionesSheet').classList.remove('show');
  curSheet='cortesiaSheet';
  requestAnimationFrame(()=>document.getElementById('cortesiaSheet').classList.add('show'));
}
function backToAcciones(){
  document.getElementById('cortesiaSheet').classList.remove('show');
  curSheet='accionesSheet';
  requestAnimationFrame(()=>document.getElementById('accionesSheet').classList.add('show'));
}
async function accEnviarCortesia(){
  const txt=document.getElementById('cortesiaText').value.trim();
  if(!txt){toast('Escribe el mensaje');return;}
  if(document.getElementById('cortesiaSave').checked&&txt!==PROMO_TEMPLATE){
    try{await guardar(sb.from('negocios').update({promo_template:txt}).eq('id',NEGOCIO_ID));PROMO_TEMPLATE=txt;}
    catch(e){avisarError(e,'No se pudo guardar la plantilla; el mensaje sí se envía.');}
  }
  const cli=accCli();
  let msg=`¡Hola${cli?' '+cli.nombre.split(' ')[0]:''}! 🎁\n\n${txt}\n\n— *Rhēud Beauty* 🤍`;
  waOpen(cli, msg);
  closeSheet();
}

/* botón WhatsApp dentro del formulario de cita (usa la misma lógica) */
function enviarWhatsApp(){
  if(!editingId){toast('Primero guarda la cita');return;}
  const c=DB.citas.find(x=>x.id===editingId);if(!c)return;
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  waOpen(cli, msgInfoCita(c,cli));
}
function openAccionesFromAppt(){
  if(!editingId){toast('Primero guarda la cita');return;}
  const c=DB.citas.find(x=>x.id===editingId);if(!c)return;
  document.getElementById('apptSheet').classList.remove('show');
  curSheet='accionesSheet';
  openAcciones(c.clientaId, c.id);
}
async function uploadComprobante(dataUri){
  if(NUC.tipoComprobante(dataUri)!=='data')return '';
  try{
    const blob=await (await fetch(dataUri)).blob();
    const path=NEGOCIO_ID+'/'+Date.now()+'_'+Math.random().toString(36).slice(2,7)+'.jpg';
    await guardar(sb.storage.from('comprobantes').upload(path,blob,{contentType:'image/jpeg',upsert:false}));
    return path; // guardamos la ruta; se firma al mostrar
  }catch(e){console.error('comprobante',e);return '';}
}
/* borra del bucket un comprobante que ya no usa ninguna cita (sin bloquear la UI) */
function borrarComprobante(path){
  if(NUC.tipoComprobante(path)!=='ruta')return;
  sb.storage.from('comprobantes').remove([path]).then(r=>{if(r&&r.error)console.error('borrar comprobante',r.error);},e=>console.error('borrar comprobante',e));
}
function repintarTrasCita(){
  renderAgenda();
  if(currentView==='ventas')renderVentas();
  if(currentView==='ventas'&&ventasModeActive==='insights')renderInteligencia();
  if(currentView==='clientas')renderClientas();
  if(currentView==='citas')renderCitas();
}
async function saveAppt(){
  // el botón queda desactivado mientras guarda: un doble toque no crea dos citas
  const listo=ocupar('cita',document.querySelector('#apptSheet .btn-primary'),'Guardando…');if(!listo)return;
  try{await guardarCita();}finally{listo();}
}
async function guardarCita(){
  const nombre=document.getElementById('apptCli').value.trim();
  if(!nombre){toast('Escribe el nombre de la clienta');return;}
  const date=document.getElementById('apptDate').value;
  if(!date){toast('Elige una fecha');return;}
  const hora=document.getElementById('apptTime').value;
  if(!hora){toast('Elige la hora de la cita');return;}
  const prev=editingId?DB.citas.find(c=>c.id===editingId):null;
  if(editingId&&!prev){toast('Esta cita ya no existe');closeSheet();return;}
  // clienta: debe elegirse de la lista; un nombre escrito que no está se confirma como nueva
  let cli=apptSelectedCliId?DB.clientas.find(c=>c.id===apptSelectedCliId):null;
  if(!cli){
    const iguales=DB.clientas.filter(c=>normTxt(c.nombre)===normTxt(nombre));
    if(iguales.length){toast(iguales.length>1?'Hay varias clientas con ese nombre: elige una de la lista':'Toca a la clienta en la lista para elegirla');onApptCliInput();return;}
    if(!confirm(`Crear clienta nueva: ${nombre}`))return;
  }
  const items=selectedItems();
  const dur=duracionElegida();
  // traslape con otra cita en el mismo recurso (mesa o cabina, con limpieza)
  if(curEstado!=='cancelada'){
    const clash=segsClash(proposedSegments(toMin(hora),dur),busyIntervals(date,editingId));
    if(clash){
      const otra=DB.clientas.find(x=>x.id===clash.b.c.clientaId);
      if(!confirm(`Se encima con ${otra?otra.nombre:'otra cita'} a las ${minLabel(clash.b.c&&clash.b.c.hora?toMin(clash.b.c.hora):clash.b.s)}. ¿Guardar de todas formas?`))return;
    }
  }
  const hoy=ymd(new Date());
  const isAtendida=curEstado==='atendida';
  const precioNum=Number(document.getElementById('apptPrice').value)||0;
  if(precioNum<0){toast('El total no puede ser negativo');return;}
  const descMontoVal=Math.min(Math.max(0,curDescuento),precioNum);
  // pagos y anticipos: se guardan en cualquier estado; cambiar el estado nunca los borra
  const pagosLimpios=curPagos.filter(p=>Number(p.monto)>0).map(p=>({...p,monto:Number(p.monto),metodo:p.metodo||'efectivo',fecha:p.fecha||hoy}));
  const cobradoTot=pagosLimpios.reduce((s,p)=>s+p.monto,0);
  if(curEstado==='cancelada'&&cobradoTot>0&&!(prev&&prev.estado==='cancelada')){
    if(!confirm(`Esta cita tiene pagos por ${fmtMoney(cobradoTot)}. Se conservan registrados aunque la canceles. ¿Cancelar la cita?`))return;
  }
  const pagoEstado=isAtendida?window.RheudPagos.campoPago({precio:precioNum,descMonto:descMontoVal,pagos:pagosLimpios,pago:'deuda',estado:'atendida'}):'';
  let pagadoFecha=prev?(prev.pagadoFecha||''):'';
  if(isAtendida)pagadoFecha=pagoEstado==='pagado'?((prev&&prev.estado==='atendida'&&prev.pagadoFecha)||hoy):'';
  // comprobante: una foto nueva se sube; una ruta del bucket se conserva
  let compVal=NUC.tipoComprobante(curComp)?curComp:'';
  let subido='';
  if(NUC.tipoComprobante(compVal)==='data'){
    compVal=await uploadComprobante(compVal);
    if(!compVal){toast('No se pudo subir el comprobante. Revisa tu conexión.');return;}
    subido=compVal;
  }
  if(!cli){
    try{cli=ponerEnCache('clientas',rowToCli(await guardar(sb.from('clientas').insert(cliToRow({nombre})).select().single())));}
    catch(e){if(subido)borrarComprobante(subido);avisarError(e,'No se pudo crear la clienta. Revisa tu conexión.');return;}
  }
  const data={
    clientaId:cli.id,items,servicioId:items[0]?items[0].id:'',svcName:items.map(i=>i.n).join(' · '),
    fecha:date,hora,dur,
    color:curColor,
    precio:precioNum,
    pagos:pagosLimpios,
    descMonto:descMontoVal,
    cobrado:null,descPct:(precioNum>0&&descMontoVal>0?Math.round(descMontoVal/precioNum*100):null),abonado:null,
    cortesiaId:apptCortesiaId||null,
    estado:curEstado,pago:pagoEstado,
    metodo:pagosLimpios.length?pagosLimpios[0].metodo:'',pagadoFecha, // método principal = primer pago
    comprobante:compVal,
    notas:document.getElementById('apptNotes').value.trim()
  };
  const wasAtendidaBefore=prev?prev.estado==='atendida':false;
  const prevCortesia=prev?prev.cortesiaId:null,prevComp=prev?prev.comprobante:'';
  try{
    if(prev){
      await guardar(sb.from('citas').update(citaToRow(data)).eq('id',prev.id));
      Object.assign(DB.citas.find(c=>c.id===prev.id)||prev,data);
    }else ponerEnCache('citas',rowToCita(await guardar(sb.from('citas').insert(citaToRow(data)).select().single())));
  }catch(e){if(subido)borrarComprobante(subido);avisarError(e,'No se pudo guardar la cita. Revisa tu conexión.');return;}
  // el comprobante que se quitó o se reemplazó se borra del bucket
  if(prevComp&&prevComp!==compVal)borrarComprobante(prevComp);
  closeSheet();
  agAnchor=new Date(date+'T00:00:00');selectedDate=date;
  repintarTrasCita();
  toast(prev?'Cita actualizada':'Cita agendada ✨');
  // la cortesía se consume al quedar atendida y vuelve si se cancela o se quita
  await sincronizarCortesias([prevCortesia,data.cortesiaId]);
  maybeOfferRebook(data,wasAtendidaBefore);
}
/* borrado suave: la cita queda en la base con deleted_at (y en la bitácora) */
async function deleteAppt(){
  const c=editingId?DB.citas.find(x=>x.id===editingId):null;if(!c)return;
  const cob=resumenPago(c).cobrado;
  if(!confirm(c.pagos.length&&cob>0?`Esta cita tiene pagos por ${fmtMoney(cob)}. ¿Eliminarla de todas formas?`:'¿Eliminar esta cita?'))return;
  const listo=ocupar('borrarCita',document.getElementById('apptDelBtn'));if(!listo)return;
  try{await guardar(sb.from('citas').update({deleted_at:new Date().toISOString()}).eq('id',c.id));}
  catch(e){avisarError(e,'No se pudo eliminar la cita. Revisa tu conexión.');return;}
  finally{listo();}
  DB.citas=DB.citas.filter(x=>x.id!==c.id);closeSheet();
  repintarTrasCita();
  toast('Cita eliminada');
  await sincronizarCortesias([c.cortesiaId]);
}
