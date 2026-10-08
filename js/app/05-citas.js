/* ---------------- CITAS (seguimiento) ---------------- */
let citasPeriod='todo';
document.getElementById('citasPeriodSeg').addEventListener('click',e=>{
  if(e.target.tagName!=='BUTTON')return;
  citasPeriod=e.target.dataset.p;
  document.querySelectorAll('#citasPeriodSeg button').forEach(b=>b.classList.toggle('on',b===e.target));
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
function clearCitasSearch(){document.getElementById('citasSearch').value='';renderCitas();}
function citasDateRange(){
  const today=new Date();today.setHours(0,0,0,0);
  if(citasPeriod==='todo')return null;
  if(citasPeriod==='dia'){const f=document.getElementById('citasDiaFecha').value||ymd(today);return [f,f];}
  if(citasPeriod==='mes')return [ymd(new Date(today.getFullYear(),today.getMonth(),1)),ymd(new Date(today.getFullYear(),today.getMonth()+1,0))];
  if(citasPeriod==='ano')return [ymd(new Date(today.getFullYear(),0,1)),ymd(new Date(today.getFullYear(),11,31))];
  if(citasPeriod==='rango'){let a=document.getElementById('cDesde').value||ymd(today),b=document.getElementById('cHasta').value||ymd(today);if(b<a){const t=a;a=b;b=t;}return [a,b];}
  return null;
}
function fillCitasFilters(){
  const cliSel=document.getElementById('citasCli'),svcSel=document.getElementById('citasSvc');
  const curCli=cliSel.value,curSvc=svcSel.value;
  cliSel.innerHTML='<option value="">Todas las clientas</option>'+[...DB.clientas].sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
  svcSel.innerHTML='<option value="">Todos los servicios</option>'+DB.servicios.map(s=>`<option value="${s.id}">${s.n}</option>`).join('');
  cliSel.value=curCli;svcSel.value=curSvc;
}
function renderCitas(){
  fillCitasFilters();
  updateConfirmBadge();
  const q=document.getElementById('citasSearch').value||'';
  document.getElementById('citasSearchClr').style.display=q?'block':'none';
  const range=citasDateRange();
  const fEstado=document.getElementById('citasEstado').value;
  const fCli=document.getElementById('citasCli').value;
  const fSvc=document.getElementById('citasSvc').value;
  const fMet=document.getElementById('citasMetodo').value;
  const nq=normTxt(q);
  let list=DB.citas.filter(c=>{
    if(range&&(c.fecha<range[0]||c.fecha>range[1]))return false;
    if(fEstado==='deuda'){if(!(c.estado==='atendida'&&(c.pago==='deuda'||c.pago==='parcial')))return false;}
    else if(fEstado==='pagada'){if(!(c.estado==='atendida'&&c.pago==='pagado'))return false;}
    else if(fEstado&&c.estado!==fEstado)return false;
    if(fCli&&c.clientaId!==fCli)return false;
    if(fSvc&&!citaItems(c).some(i=>i.id===fSvc))return false;
    if(fMet&&c.metodo!==fMet)return false;
    if(nq){const cli=DB.clientas.find(x=>x.id===c.clientaId);const hay=normTxt((cli?cli.nombre:'')+' '+svcFull(c));if(!hay.includes(nq))return false;}
    return true;
  });
  const orden=(document.getElementById('citasOrden')||{}).value||'fecha_desc';
  const nombreDe=id=>{const cli=DB.clientas.find(x=>x.id===id);return normTxt(cli?cli.nombre:'');};
  list.sort((a,b)=>{
    switch(orden){
      case 'fecha_asc':return (a.fecha+(a.hora||'')).localeCompare(b.fecha+(b.hora||''));
      case 'nombre_az':return nombreDe(a.clientaId).localeCompare(nombreDe(b.clientaId));
      case 'nombre_za':return nombreDe(b.clientaId).localeCompare(nombreDe(a.clientaId));
      case 'monto_desc':return montoCita(b)-montoCita(a);
      case 'monto_asc':return montoCita(a)-montoCita(b);
      case 'fecha_desc':
      default:return (b.fecha+(b.hora||'')).localeCompare(a.fecha+(a.hora||''));
    }
  });
  // summary
  const atend=list.filter(c=>c.estado==='atendida');
  const cobrado=atend.reduce((s,c)=>s+montoCita(c),0);
  const pend=atend.reduce((s,c)=>s+deudaCita(c),0);
  document.getElementById('citasCount').textContent=list.length?list.length+' citas':'';
  document.getElementById('citasSummary').innerHTML=`
    <div class="csum"><div class="cl">Citas</div><div class="cv">${list.length}</div></div>
    <div class="csum"><div class="cl">Cobrado</div><div class="cv" style="color:var(--green)">${fmtMoney(cobrado)}</div></div>
    <div class="csum"><div class="cl">Pendiente</div><div class="cv" style="color:${pend?'var(--red)':'var(--muted)'}">${fmtMoney(pend)}</div></div>`;
  const cont=document.getElementById('citasList');
  if(!list.length){cont.innerHTML=`<div class="empty"><div class="ic">🗓️</div><p>No hay citas con estos filtros.</p></div>`;return;}
  cont.innerHTML=list.map(c=>{
    const cli=DB.clientas.find(x=>x.id===c.clientaId);
    const d=new Date(c.fecha+'T00:00:00');
    const isDeuda=c.estado==='atendida'&&c.pago==='deuda';
    const isParcial=c.estado==='atendida'&&c.pago==='parcial';
    const rowCls=(isDeuda||isParcial)?'deuda':c.estado;
    const estPill=`<span class="pill ${c.estado}">${c.estado}</span>`;
    let payPill='';
    if(c.estado==='atendida'){
      if(isDeuda)payPill=`<span class="pill deuda">debe ${fmtMoney(deudaCita(c))}</span>`;
      else if(isParcial)payPill=`<span class="pill parcial">cobró ${fmtMoney(montoCita(c))} · debe ${fmtMoney(deudaCita(c))}</span>`;
      else payPill=`<span class="pill pagado">pagado</span>`;
    }
    const metPill=(c.estado==='atendida'&&c.pago==='pagado'&&c.metodo)?`<span class="pill metodo">${metodoLabel(c.metodo)}</span>`:'';
    const descM=Number(c.descMonto||0);
    const tieneDesc=descM>0;
    const totalNeto=Number(c.precio||0)-descM;
    const descPill=tieneDesc?`<span class="pill desc">${c.descPct?c.descPct+'% desc':'desc'}</span>`:'';
    const amtHtml=tieneDesc?`<span class="cr-amt"><span class="amt-strike">${fmtMoney(c.precio)}</span> ${fmtMoney(totalNeto)}</span>`:`<span class="cr-amt">${fmtMoney(c.precio)}</span>`;
    const compThumb=c.comprobante?`<div class="cr-comp"><span class="comp-link" data-on-click="event.stopPropagation();viewComp('${c.id}')">📎 Ver comprobante</span></div>`:'';
    const acts=[];
    if(isDeuda)acts.push(`<div class="cr-btn pay" data-on-click="event.stopPropagation();marcarPagada('${c.id}')">Marcar pagada</div>`);
    if(c.estado==='agendada')acts.push(`<div class="cr-btn pay" data-on-click="event.stopPropagation();marcarAtendida('${c.id}')">Atendida</div>`);
    if(c.estado!=='cancelada')acts.push(`<div class="cr-btn re" data-on-click="event.stopPropagation();reagendar('${c.id}')">Reagendar</div>`);
    if(c.estado!=='cancelada')acts.push(`<div class="cr-btn cx" data-on-click="event.stopPropagation();cancelarCita('${c.id}')">Cancelar</div>`);
    if(c.estado!=='cancelada'&&c.clientaId)acts.push(`<div class="cr-btn wa" data-on-click="event.stopPropagation();openAcciones('${c.clientaId}','${c.id}')">Acciones</div>`);
    return `<div class="citarow ${rowCls}">
      <div class="cr-top" data-on-click="editAppt('${c.id}')">
        <div class="cr-date"><div class="dd">${d.getDate()}</div><div class="dm">${MON[d.getMonth()]}</div></div>
        <div class="cr-body">
          <div class="cr-cli-row"><div class="cr-cli">${esc(cli?cli.nombre:'Clienta')}</div><div class="cr-when">${d.getFullYear()}${c.hora?' · '+fmt12(c.hora).h+' '+fmt12(c.hora).ap:''}</div></div>
          <div class="cr-svc">${svcFull(c)}</div>
          <div class="cr-meta">${amtHtml}${estPill}${payPill}${metPill}${descPill}</div>
          ${compThumb}
        </div>
      </div>
      ${acts.length?`<div class="cr-actions">${acts.join('')}</div>`:''}
    </div>`;
  }).join('');
}
function refreshAfterCita(){renderCitas();if(currentView==='agenda')renderAgenda();}
async function marcarAtendida(id){const c=DB.citas.find(x=>x.id===id);if(!c)return;const wasBefore=c.estado==='atendida';c.estado='atendida';if(!c.pago)c.pago='deuda';try{await sb.from('citas').update({estado:c.estado,pago:c.pago}).eq('id',id);}catch(e){console.error(e);}refreshAfterCita();toast('Marcada como atendida');maybeOfferRebook({estado:'atendida',clientaId:c.clientaId},wasBefore);}
async function marcarPagada(id){
  const c=DB.citas.find(x=>x.id===id);if(!c)return;
  const metodo=c.metodo||'efectivo';
  c.pago='pagado';c.pagadoFecha=ymd(new Date());c.metodo=metodo;
  c.pagos=[{monto:Number(c.precio||0),metodo}];
  c.cobrado=null;c.abonado=null;
  try{await sb.from('citas').update({pago:'pagado',pagado_fecha:c.pagadoFecha,metodo,pagos:c.pagos,abonado:null,cobrado:null}).eq('id',id);}catch(e){console.error(e);}
  refreshAfterCita();toast('Pago registrado ✨');
}
function reagendar(id){editAppt(id);}
async function cancelarCita(id){
  if(!confirm('¿Cancelar esta cita?'))return;
  const c=DB.citas.find(x=>x.id===id);if(!c)return;c.estado='cancelada';c.pago='';
  try{await sb.from('citas').update({estado:'cancelada',pago:''}).eq('id',id);}catch(e){console.error(e);}
  refreshAfterCita();toast('Cita cancelada');
}
async function viewComp(id){
  const c=DB.citas.find(x=>x.id===id);if(!c||!c.comprobante)return;
  let url=c.comprobante;
  if(!url.startsWith('http')&&!url.startsWith('data:')){
    try{const {data}=await sb.storage.from('comprobantes').createSignedUrl(c.comprobante,3600);url=data.signedUrl;}catch(e){console.error(e);}
  }
  const w=window.open();if(w)w.document.write('<img src="'+url+'" style="max-width:100%">');
}
