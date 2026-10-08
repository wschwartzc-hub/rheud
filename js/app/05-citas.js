/* ---------------- CITAS (seguimiento) ---------------- */
/* Por defecto se ve el día elegido en la tira semanal; los filtros avanzados
   (periodo, estado, clienta, servicio, método y orden) viven tras el botón de filtros. */
let citasPeriod='dia';
let citasRama='todas'; // todas | nails | skin | cobrar
document.getElementById('citasPeriodSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  citasPeriod=b.dataset.p;
  document.querySelectorAll('#citasPeriodSeg button').forEach(x=>x.classList.toggle('on',x===b));
  if(citasPeriod==='rango')ensureRangeDefaults('cDesde','cHasta');
  document.getElementById('citasRange').style.display=citasPeriod==='rango'?'flex':'none';
  const diaPicker=document.getElementById('citasDiaPicker');
  if(citasPeriod==='dia'){
    diaPicker.style.display='flex';
    const f=document.getElementById('citasDiaFecha');
    if(!f.value)f.value=ymd(new Date()); // default hoy
  }else{diaPicker.style.display='none';}
  renderCitas();
});
function citasDiaHoy(){document.getElementById('citasDiaFecha').value=ymd(new Date());renderCitas();}
function clearCitasSearch(){document.getElementById('citasSearch').value='';renderCitas();document.getElementById('citasSearch').focus();}
function citasDiaSel(){return document.getElementById('citasDiaFecha').value||ymd(new Date());}
function citasDateRange(){
  const today=new Date();today.setHours(0,0,0,0);
  if(citasPeriod==='todo')return null;
  if(citasPeriod==='dia'){const f=citasDiaSel();return [f,f];}
  if(citasPeriod==='mes'){const b=new Date(citasDiaSel()+'T00:00:00');return [ymd(new Date(b.getFullYear(),b.getMonth(),1)),ymd(new Date(b.getFullYear(),b.getMonth()+1,0))];}
  if(citasPeriod==='ano'){const y=new Date(citasDiaSel()+'T00:00:00').getFullYear();return [ymd(new Date(y,0,1)),ymd(new Date(y,11,31))];}
  if(citasPeriod==='rango'){let a=document.getElementById('cDesde').value||ymd(today),b=document.getElementById('cHasta').value||ymd(today);if(b<a){const t=a;a=b;b=t;}return [a,b];}
  return null;
}
function fillCitasFilters(){
  const cliSel=document.getElementById('citasCli'),svcSel=document.getElementById('citasSvc');
  const curCli=cliSel.value,curSvc=svcSel.value;
  cliSel.innerHTML='<option value="">Todas</option>'+[...DB.clientas].sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  svcSel.innerHTML='<option value="">Todos</option>'+DB.servicios.map(s=>`<option value="${esc(s.id)}">${esc(s.n)}</option>`).join('');
  cliSel.value=curCli;svcSel.value=curSvc;
}
/* --- controles de la cabecera --- */
function toggleCitasSearch(force){
  const bar=document.getElementById('citasSearchBar'),btn=document.getElementById('citasSearchBtn');
  const abrir=typeof force==='boolean'?force:bar.hidden;
  bar.hidden=!abrir;btn.setAttribute('aria-expanded',String(abrir));
  const inp=document.getElementById('citasSearch');
  if(abrir)inp.focus();else if(inp.value){inp.value='';renderCitas();}
}
function toggleCitasFiltros(){
  const p=document.getElementById('citasFiltros'),btn=document.getElementById('citasFiltBtn');
  p.hidden=!p.hidden;btn.setAttribute('aria-expanded',String(!p.hidden));
}
function limpiarFiltrosCitas(){
  ['citasEstado','citasCli','citasSvc','citasMetodo'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('citasOrden').value='auto';
  citasRama='todas';
  const dia=document.querySelector('#citasPeriodSeg button[data-p="dia"]');if(dia)dia.click();else renderCitas();
}
function setCitasRama(r){citasRama=(citasRama===r&&r!=='todas')?'todas':r;renderCitas();}
function citasIrADia(key){
  if(!key)return;
  document.getElementById('citasDiaFecha').value=key;
  if(citasRama==='cobrar')citasRama='todas';
  if(citasPeriod!=='dia'){const b=document.querySelector('#citasPeriodSeg button[data-p="dia"]');if(b){b.click();return;}}
  renderCitas();
}
function citasSemana(dir){citasIrADia(ymd(addDays(new Date(citasDiaSel()+'T00:00:00'),dir*7)));}
function renderCitasWeek(){
  const el=document.getElementById('citasWeek');if(!el)return;
  const sel=citasDiaSel(),ws=startOfWeek(new Date(sel+'T00:00:00')),we=addDays(ws,6),todayKey=ymd(new Date());
  const activo=citasPeriod==='dia'&&citasRama!=='cobrar'&&!normTxt(document.getElementById('citasSearch').value||'');
  let days='';
  for(let i=0;i<7;i++){
    const d=addDays(ws,i),k=ymd(d);
    const n=dayEvents(k).filter(c=>c.estado!=='cancelada').length;
    const on=activo&&k===sel;
    days+=`<button type="button" class="wkd${on?' on':''}${k===todayKey?' tdy':''}" aria-pressed="${on}" aria-label="${DOWL[d.getDay()]} ${d.getDate()}, ${n?n+' cita'+(n!==1?'s':''):'sin citas'}" data-on-click="citasIrADia('${k}')"><span class="w">${DOW[d.getDay()]}</span><span class="n">${d.getDate()}</span><span class="c">${n?n+' cita'+(n!==1?'s':''):'—'}</span></button>`;
  }
  el.innerHTML=`<div class="wk-nav"><span class="wk-lbl">${ws.getDate()} ${MON[ws.getMonth()].toLowerCase()} – ${we.getDate()} ${MON[we.getMonth()].toLowerCase()}</span>
    <button type="button" class="icon-btn" aria-label="Semana anterior" data-on-click="citasSemana(-1)">${icon('chevL')}</button>
    <button type="button" class="icon-btn" aria-label="Semana siguiente" data-on-click="citasSemana(1)">${icon('chevR')}</button></div>
    <div class="wk-days" role="group" aria-label="Días de la semana">${days}</div>`;
}
function renderCitasChips(nCobrar){
  const el=document.getElementById('citasChips');if(!el)return;
  const ch=(r,txt,cls)=>`<button type="button" class="chip ${cls||''}${citasRama===r?' sel':''}" aria-pressed="${citasRama===r}" data-on-click="setCitasRama('${r}')">${txt}</button>`;
  el.innerHTML=ch('todas','Todas')+ch('nails','Uñas','c-nails')+ch('skin','Piel','c-skin')+ch('cobrar',`Por cobrar <span class="n">${nCobrar}</span>`,'c-bad');
}
/* Siguiente cita de hoy (la primera agendada que aún no termina) */
function siguienteCitaId(){
  const now=new Date(),k=ymd(now),nowM=now.getHours()*60+now.getMinutes();
  const n=DB.citas.filter(c=>c.fecha===k&&c.estado==='agendada'&&c.hora&&toMin(c.hora)+(Number(c.dur)||60)>nowM).sort((a,b)=>a.hora.localeCompare(b.hora))[0];
  return n?n.id:null;
}
const RECURSO_CORTO={mesa:'Mesa',cabina:'Cabina',ninguno:''};
function citaCard(c,conFecha,nextId){
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  const nombre=cli?cli.nombre:'Clienta';
  const cats=citaCats(c),cat=cats[0]==='skin'?'skin':(cats[0]==='otro'?'otro':'nails');
  const s=toMin(c.hora),e=s!=null?s+(Number(c.dur)||60):null;
  const recs=[...new Set(citaItems(c).map(i=>RECURSO_CORTO[i.r||(svcById(i.id)||{}).recurso||'mesa']).filter(Boolean))].join(' → ');
  const when=[conFecha?fechaCorta(c.fecha):'',s!=null?`${hm(s)} – ${hm(e)}`:'Sin hora',recs].filter(Boolean).join(' · ');
  const deuda=deudaCita(c);
  let st,stCls;
  if(c.estado==='cancelada'){st='Cancelada';stCls='t-soft';}
  else if(c.estado==='atendida'){if(deuda>0){st='Debe '+fmtMoney(deuda);stCls='t-bad';}else{st='Pagada';stCls='t-ok';}}
  else if(c.id===nextId){st='Siguiente';stCls='t-wine';}
  else if(c.confirmadaAt){st=icon('check')+'Confirmada';stCls='t-conf';}
  else{st='Agendada';stCls='t-soft';}
  const descM=Number(c.descMonto||0);
  const precio=descM>0?`<span class="amt-strike">${fmtMoney(c.precio)}</span>${fmtMoney(Number(c.precio||0)-descM)}`:fmtMoney(c.precio);
  // Una sola acción principal según el estado; lo demás vive en «⋯»
  let main='';
  if(c.estado==='agendada')main=`<button type="button" class="btn-sm btn-ok-line" data-on-click="marcarAtendida('${c.id}')">${icon('check')}Atendida</button>`;
  else if(c.estado==='atendida'&&deuda>0)main=`<button type="button" class="btn-sm btn-wine" data-on-click="cobrarCita('${c.id}')">${icon('money')}Cobrar</button>`;
  const nota=c.estado==='agendada'?[c.confirmadaAt&&stCls!=='t-conf'?'Confirmada':'',c.codigo].filter(Boolean).join(' · '):'';
  const est=ESTADO_TXT[c.estado]?c.estado:'agendada'; // lista blanca para la clase
  return `<article class="cita ${est}${deuda>0?' debe':''}">
    <div class="cita-top">
      <button type="button" class="cita-main" data-on-click="editAppt('${c.id}')">
        <span class="cita-ic ${cat}">${ramaIcon(cat)}</span>
        <span class="cita-b"><span class="cita-n">${esc(nombre)}</span><span class="cita-s">${esc(svcFull(c))}</span><span class="cita-w">${when}</span></span>
        <span class="cita-r"><span class="cita-p">${precio}</span><span class="tag ${stCls}">${st}</span></span>
      </button>
      <button type="button" class="cita-more" aria-label="Más acciones para la cita de ${esc(nombre)}" data-on-click="openAccionesCita('${c.id}')">${icon('more')}</button>
    </div>
    ${main?`<div class="cita-act"><span class="cita-nota">${esc(nota)}</span>${main}</div>`:''}
  </article>`;
}
function renderCitas(){
  const fd=document.getElementById('citasDiaFecha');if(!fd.value)fd.value=ymd(new Date());
  fillCitasFilters();
  updateConfirmBadge();
  const q=document.getElementById('citasSearch').value||'';
  document.getElementById('citasSearchClr').style.display=q?'flex':'none';
  const nq=normTxt(q);
  const porCobrar=DB.citas.filter(c=>c.estado==='atendida'&&deudaCita(c)>0);
  renderCitasWeek();
  renderCitasChips(porCobrar.length);
  // «Por cobrar» y la búsqueda dentro del día miran todas las fechas
  const todasFechas=citasRama==='cobrar'||(nq&&citasPeriod==='dia');
  const range=todasFechas?null:citasDateRange();
  const fEstado=document.getElementById('citasEstado').value;
  const fCli=document.getElementById('citasCli').value;
  const fSvc=document.getElementById('citasSvc').value;
  const fMet=document.getElementById('citasMetodo').value;
  const orden=(document.getElementById('citasOrden')||{}).value||'auto';
  const dot=document.getElementById('citasFiltDot');
  if(dot)dot.hidden=!(fEstado||fCli||fSvc||fMet||orden!=='auto'||citasPeriod!=='dia');
  let list=DB.citas.filter(c=>{
    if(range&&(c.fecha<range[0]||c.fecha>range[1]))return false;
    if(citasRama==='cobrar'){if(!(c.estado==='atendida'&&deudaCita(c)>0))return false;}
    else if(citasRama==='nails'||citasRama==='skin'){if(!citaCats(c).includes(citasRama))return false;}
    if(fEstado==='deuda'){if(!(c.estado==='atendida'&&(c.pago==='deuda'||c.pago==='parcial')))return false;}
    else if(fEstado==='pagada'){if(!(c.estado==='atendida'&&c.pago==='pagado'))return false;}
    else if(fEstado&&c.estado!==fEstado)return false;
    if(fCli&&c.clientaId!==fCli)return false;
    if(fSvc&&!citaItems(c).some(i=>i.id===fSvc))return false;
    if(fMet&&c.metodo!==fMet)return false;
    if(nq){const cli=DB.clientas.find(x=>x.id===c.clientaId);const hay=normTxt((cli?cli.nombre:'')+' '+svcFull(c));if(!hay.includes(nq))return false;}
    return true;
  });
  const nombreDe=id=>{const cli=DB.clientas.find(x=>x.id===id);return normTxt(cli?cli.nombre:'');};
  const porHora=orden==='auto'&&citasPeriod==='dia'&&!todasFechas;
  list.sort((a,b)=>{
    switch(porHora?'hora':orden){
      case 'hora':return (a.hora||'99').localeCompare(b.hora||'99');
      case 'fecha_asc':return (a.fecha+(a.hora||'')).localeCompare(b.fecha+(b.hora||''));
      case 'nombre_az':return nombreDe(a.clientaId).localeCompare(nombreDe(b.clientaId));
      case 'nombre_za':return nombreDe(b.clientaId).localeCompare(nombreDe(a.clientaId));
      case 'monto_desc':return montoCita(b)-montoCita(a);
      case 'monto_asc':return montoCita(a)-montoCita(b);
      default:return (b.fecha+(b.hora||'')).localeCompare(a.fecha+(a.hora||''));
    }
  });
  // contexto y resumen
  let ctx;
  if(citasRama==='cobrar')ctx='Por cobrar · todas las fechas';
  else if(nq&&citasPeriod==='dia')ctx='Búsqueda en todas las fechas';
  else if(citasPeriod==='dia')ctx=fechaCorta(citasDiaSel());
  else if(citasPeriod==='mes'){const b=new Date(citasDiaSel()+'T00:00:00');ctx=`${MONF[b.getMonth()]} ${b.getFullYear()}`;}
  else if(citasPeriod==='ano')ctx=String(new Date(citasDiaSel()+'T00:00:00').getFullYear());
  else if(citasPeriod==='rango'&&range)ctx=`${fechaCorta(range[0])} – ${fechaCorta(range[1])}`;
  else ctx='Todas las fechas';
  document.getElementById('citasCount').textContent=ctx;
  const atend=list.filter(c=>c.estado==='atendida');
  const cobrado=atend.reduce((s,c)=>s+montoCita(c),0);
  const pend=atend.reduce((s,c)=>s+deudaCita(c),0);
  document.getElementById('citasSummary').innerHTML=list.length?`<b>${list.length}</b> cita${list.length!==1?'s':''}${cobrado?` · ${fmtMoney(cobrado)} cobrado`:''}${pend?` · <span class="v-bad">${fmtMoney(pend)} por cobrar</span>`:''}`:'';
  const cont=document.getElementById('citasList');
  const conFecha=!porHora;
  const nextId=siguienteCitaId();
  let html='';
  if(!list.length){
    html=nq?`<div class="empty">${icon('search')}<p>Sin resultados para «${esc(q)}».</p></div>`
      :citasPeriod==='dia'&&citasRama==='todas'?`<div class="empty">${icon('cal')}<p>Sin citas el ${esc(fechaCorta(citasDiaSel()))}.</p><button type="button" class="btn-sm" data-on-click="nuevaCitaEnDia()">${icon('plus')}Nueva cita</button></div>`
      :`<div class="empty">${icon('filter')}<p>No hay citas con estos filtros.</p></div>`;
  }else html=list.map(c=>citaCard(c,conFecha,nextId)).join('');
  // Tarjeta especial: pendientes de cobro de otros días
  if(citasRama!=='cobrar'&&!nq&&porCobrar.length){
    const fuera=porCobrar.filter(c=>!list.includes(c)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
    if(fuera.length){
      const c=fuera[0];
      html+=`<article class="cobro-card"><div class="cb-b"><div class="cb-e">Pendiente de cobro · ${esc(fechaCorta(c.fecha))}</div><div class="cb-n">${esc(cliNombre(c))} · ${fmtMoney(deudaCita(c))}</div>${fuera.length>1?`<button type="button" class="link-btn" data-on-click="setCitasRama('cobrar')">Ver las ${porCobrar.length} por cobrar</button>`:''}</div><button type="button" class="btn-sm btn-wine" data-on-click="cobrarCita('${c.id}')">Cobrar</button></article>`;
    }
  }
  cont.innerHTML=html;
}
function nuevaCitaEnDia(){selectedDate=citasDiaSel();openApptSheet();}
function refreshAfterCita(){renderCitas();if(currentView==='agenda')renderAgenda();}
/* «Cobrar»: registra el saldo pendiente eligiendo el método (hoja de cobro) */
function cobrarCita(id){marcarPagada(id);}
function openAccionesCita(id){const c=DB.citas.find(x=>x.id===id);if(!c)return;openAcciones(c.clientaId,c.id);}
async function marcarAtendida(id){
  const c=DB.citas.find(x=>x.id===id);if(!c)return;
  const wasBefore=c.estado==='atendida';
  // con anticipos queda parcial o pagada; sin pagos, en deuda
  const cambios={estado:'atendida',pago:campoPagoDe({...c,estado:'atendida',pago:c.pago||'deuda'})};
  try{await guardar(sb.from('citas').update(cambios).eq('id',id));}
  catch(e){avisarError(e,'No se pudo marcar como atendida. Revisa tu conexión.');return;}
  Object.assign(c,cambios);
  refreshAfterCita();toast('Marcada como atendida');
  await sincronizarCortesias([c.cortesiaId]);
  maybeOfferRebook({estado:'atendida',clientaId:c.clientaId},wasBefore);
}
/* columna "pago" de una cita atendida a partir de sus pagos (anticipos incluidos) */
function campoPagoDe(c){return window.RheudPagos.campoPago(c)}

/* ---- Marcar pagada: agrega un pago por el saldo y pide el método ---- */
let cobroCitaId=null,cobroMetodo='efectivo';
function marcarPagada(id){
  const c=DB.citas.find(x=>x.id===id);if(!c)return;
  const r=resumenPago(c);
  if(r.saldo<=0){toast('Esta cita ya está pagada');return;}
  cobroCitaId=id;
  setCobroMetodo(['efectivo','transferencia','tarjeta','otro'].includes(c.metodo)?c.metodo:'efectivo');
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  document.getElementById('cobroSub').textContent=`${cli?cli.nombre:'Clienta'} · saldo ${fmtMoney(r.saldo)}${r.cobrado>0?` (ya pagó ${fmtMoney(r.cobrado)})`:''}`;
  document.getElementById('cobroMonto').textContent=fmtMoney(r.saldo);
  showSheet('cobroSheet');
}
function setCobroMetodo(m){cobroMetodo=m;document.querySelectorAll('#cobroMetodos .chip').forEach(ch=>ch.classList.toggle('sel',ch.dataset.m===m));}
async function confirmarCobro(){
  const c=DB.citas.find(x=>x.id===cobroCitaId);if(!c){closeSheet();return;}
  const listo=ocupar('cobro',document.getElementById('cobroBtn'),'Guardando…');if(!listo)return;
  try{
    const hoy=ymd(new Date());
    const pagos=window.RheudPagos.pagosConSaldo(c,cobroMetodo,hoy);
    const cambios={pagos,pago:campoPagoDe({...c,pagos}),pagadoFecha:hoy,metodo:pagos[0]?pagos[0].metodo:cobroMetodo,abonado:null,cobrado:null};
    try{await guardar(sb.from('citas').update({pagos,pago:cambios.pago,pagado_fecha:hoy,metodo:cambios.metodo,abonado:null,cobrado:null}).eq('id',c.id));}
    catch(e){avisarError(e,'No se pudo registrar el pago. Revisa tu conexión.');return;}
    Object.assign(c,cambios);
    closeSheet();refreshAfterCita();
    if(currentView==='ventas')renderVentas();
    toast('Pago registrado ✨');
  }finally{listo();}
}
function reagendar(id){editAppt(id);}
async function cancelarCita(id){
  const c=DB.citas.find(x=>x.id===id);if(!c)return;
  const cob=resumenPago(c).cobrado;
  if(!confirm(cob>0&&c.pagos.length?`Esta cita tiene pagos por ${fmtMoney(cob)}. Se conservan registrados. ¿Cancelar la cita?`:'¿Cancelar esta cita?'))return;
  try{await guardar(sb.from('citas').update({estado:'cancelada',pago:''}).eq('id',id));}
  catch(e){avisarError(e,'No se pudo cancelar la cita. Revisa tu conexión.');return;}
  c.estado='cancelada';c.pago='';
  refreshAfterCita();toast('Cita cancelada');
  await sincronizarCortesias([c.cortesiaId]);
}
function viewComp(id){
  const c=DB.citas.find(x=>x.id===id);if(!c||!c.comprobante)return;
  verComprobante(c.comprobante);
}
