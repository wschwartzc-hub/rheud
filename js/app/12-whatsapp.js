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
  PROMO_BROADCAST=txt;
  try{await sb.from('negocios').update({promo_broadcast:txt}).eq('id',NEGOCIO_ID);}catch(e){console.error(e);toast('Error al guardar');return;}
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
  if(c.precio)msg+=`💵 Total: $${c.precio}\n`;
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
  if(document.getElementById('cortesiaSave').checked){
    PROMO_TEMPLATE=txt;
    try{await sb.from('negocios').update({promo_template:txt}).eq('id',NEGOCIO_ID);}catch(e){console.error(e);}
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
  if(!dataUri||!dataUri.startsWith('data:'))return dataUri||'';
  try{
    const blob=await (await fetch(dataUri)).blob();
    const path=NEGOCIO_ID+'/'+Date.now()+'_'+Math.random().toString(36).slice(2,7)+'.jpg';
    const {error}=await sb.storage.from('comprobantes').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(error)throw error;
    return path; // guardamos la ruta; se firma al mostrar
  }catch(e){console.error('comprobante',e);return '';}
}
async function saveAppt(){
  const nombre=document.getElementById('apptCli').value.trim();
  if(!nombre){toast('Escribe el nombre de la clienta');return;}
  const date=document.getElementById('apptDate').value;
  if(!date){toast('Elige una fecha');return;}
  const btn=document.querySelector('#apptSheet .btn-primary');if(btn)btn.textContent='Guardando…';
  let cli=apptSelectedCliId?DB.clientas.find(c=>c.id===apptSelectedCliId):null;
  if(!cli)cli=DB.clientas.find(c=>c.nombre.toLowerCase()===nombre.toLowerCase());
  if(!cli){
    try{const {data:ins,error}=await sb.from('clientas').insert(cliToRow({nombre})).select().single();if(error)throw error;cli=rowToCli(ins);DB.clientas.push(cli);}
    catch(e){toast('Error al crear clienta');console.error(e);if(btn)btn.textContent='Guardar cita';return;}
  }
  const items=selectedItems();
  const svcName=items.map(i=>i.n).join(' · ');
  const todayKey=ymd(new Date());
  const isAtendida=curEstado==='atendida';
  const precioNum=Number(document.getElementById('apptPrice').value)||0;
  const descMontoVal=isAtendida?Math.min(curDescuento,precioNum):0;
  const totalCobrar=Math.max(0,precioNum-descMontoVal);
  // pagos: limpia los que tengan monto > 0
  const pagosLimpios=isAtendida?curPagos.filter(p=>Number(p.monto)>0).map(p=>({monto:Number(p.monto),metodo:p.metodo||'efectivo'})):[];
  const cobradoTot=pagosLimpios.reduce((s,p)=>s+p.monto,0);
  let pagoEstado='';
  if(isAtendida){
    if(cobradoTot<=0)pagoEstado='deuda';
    else if(cobradoTot<totalCobrar)pagoEstado='parcial';
    else pagoEstado='pagado';
  }
  let pagadoFecha='';
  if(isAtendida&&pagoEstado==='pagado'){
    const prev=editingId?DB.citas.find(c=>c.id===editingId):null;
    if(prev&&prev.pagadoFecha&&prev.estado==='atendida')pagadoFecha=prev.pagadoFecha;
    else pagadoFecha=todayKey;
  }
  // comprobante: si es data URI nuevo, súbelo; si ya era ruta, déjalo
  let compVal=isAtendida?curComp:'';
  if(compVal&&compVal.startsWith('data:'))compVal=await uploadComprobante(compVal);
  // método principal (primer pago) para compatibilidad/etiquetas
  const metodoPrincipal=pagosLimpios.length?pagosLimpios[0].metodo:'';
  const data={
    clientaId:cli.id,items,servicioId:items[0]?items[0].id:'',svcName,
    fecha:date,hora:document.getElementById('apptTime').value,
    dur:getApptDur()||60,
    color:curColor,
    precio:precioNum,
    pagos:pagosLimpios,
    descMonto:descMontoVal,
    cobrado:null,descPct:(precioNum>0&&descMontoVal>0?Math.round(descMontoVal/precioNum*100):null),abonado:null,
    cortesiaId:apptCortesiaId||null,
    estado:curEstado,pago:isAtendida?pagoEstado:'',
    metodo:metodoPrincipal,pagadoFecha,
    comprobante:compVal,
    notas:document.getElementById('apptNotes').value.trim()
  };
  // si hay cortesía nueva seleccionada, marcarla como usada después de guardar
  const wasAtendidaBefore=editingId?(DB.citas.find(c=>c.id===editingId)||{}).estado==='atendida':false;
  try{
    if(editingId){
      const {error}=await sb.from('citas').update(citaToRow(data)).eq('id',editingId);if(error)throw error;
      Object.assign(DB.citas.find(c=>c.id===editingId),data);
    }else{
      const {data:ins,error}=await sb.from('citas').insert(citaToRow(data)).select().single();if(error)throw error;
      DB.citas.push(rowToCita(ins));
    }
  }catch(e){toast('Error al guardar la cita');console.error(e);if(btn)btn.textContent='Guardar cita';return;}
  if(btn)btn.textContent='Guardar cita';
  closeSheet();
  agAnchor=new Date(date+'T00:00:00');selectedDate=date;
  renderAgenda();
  if(currentView==='ventas')renderVentas();
  if(currentView==='ventas'&&ventasModeActive==='insights')renderInteligencia();
  if(currentView==='clientas')renderClientas();
  if(currentView==='citas')renderCitas();
  toast(editingId?'Cita actualizada':'Cita agendada ✨');
  // si se aplicó una cortesía nueva, marcarla como usada
  if(apptCortesiaId){
    const prevCortesia=editingId?(DB.citas.find(c=>c.id===editingId)||{}).cortesiaId:null;
    if(apptCortesiaId!==prevCortesia){
      const cor=DB.cortesias.find(x=>x.id===apptCortesiaId);
      if(cor&&!cor.usada){
        const hoy=ymd(new Date());cor.usada=true;cor.fechaUso=hoy;
        sb.from('cortesias').update({usada:true,fecha_uso:hoy}).eq('id',apptCortesiaId).then();
      }
    }
  }
  maybeOfferRebook(data,wasAtendidaBefore);
}
async function deleteAppt(){
  if(!editingId||!confirm('¿Eliminar esta cita?'))return;
  try{const {error}=await sb.from('citas').delete().eq('id',editingId);if(error)throw error;}
  catch(e){toast('Error al eliminar');console.error(e);return;}
  DB.citas=DB.citas.filter(c=>c.id!==editingId);closeSheet();
  renderAgenda();
  if(currentView==='ventas')renderVentas();
  if(currentView==='ventas'&&ventasModeActive==='insights')renderInteligencia();
  if(currentView==='clientas')renderClientas();
  if(currentView==='citas')renderCitas();
  toast('Cita eliminada');
}
