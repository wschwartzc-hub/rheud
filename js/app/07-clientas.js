/* ---------------- CLIENTAS ---------------- */
function daysSince(key){return Math.round((Date.now()-new Date(key+'T00:00:00').getTime())/86400000)}
function nextCliNum(){let mx=0;DB.clientas.forEach(c=>{if(c.num&&c.num>mx)mx=c.num;});return mx+1;}
function ensureCliNumbers(){let changed=false;DB.clientas.forEach(c=>{if(!c.num){c.num=nextCliNum();changed=true;}});if(changed)persist();}
function cliNumLabel(n){return n?'Cliente #'+String(n).padStart(3,'0'):''}
function normTxt(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function matchCli(c,q){q=normTxt(q);if(!q)return true;const num=c.num?('#'+String(c.num).padStart(3,'0')+' '+c.num):'';return normTxt(c.nombre).includes(q)||normTxt(c.telefono).includes(q)||normTxt(c.email).includes(q)||num.includes(q);}
function clientStats(id){
  const cs=DB.citas.filter(c=>c.clientaId===id&&c.estado==='atendida');
  const spent=cs.reduce((s,c)=>s+montoCita(c),0);
  const debtCitas=cs.filter(c=>c.pago==='deuda'||c.pago==='parcial');
  const debt=cs.reduce((s,c)=>s+deudaCita(c),0);
  const last=cs.map(c=>c.fecha).sort().pop();
  const visits=cs.length,avgTicket=visits?Math.round(spent/visits):0;
  const lastDays=last?daysSince(last):null;
  let oldestDebtDays=0;debtCitas.forEach(c=>{const d=daysSince(c.fecha);if(d>oldestDebtDays)oldestDebtDays=d;});
  const paid=cs.filter(c=>c.pago==='pagado'&&c.pagadoFecha);
  let avgDaysToPay=null;
  if(paid.length){const tot=paid.reduce((s,c)=>s+Math.max(0,Math.round((new Date(c.pagadoFecha+'T00:00:00')-new Date(c.fecha+'T00:00:00'))/86400000)),0);avgDaysToPay=Math.round(tot/paid.length);}
  return {visits,spent,debt,debtCount:debtCitas.length,last,avgTicket,lastDays,oldestDebtDays,avgDaysToPay};
}
function clientSegment(st){
  if(st.visits===0)return {label:'Sin servicios',cls:'seg-new'};
  if(st.lastDays!==null&&st.lastDays>75&&st.visits>=2)return {label:'Inactiva',cls:'seg-cold'};
  if(st.visits>=5&&st.avgTicket>=450)return {label:'VIP',cls:'seg-vip'};
  if(st.avgTicket>=500)return {label:'Premium',cls:'seg-prem'};
  if(st.visits>=5)return {label:'Frecuente',cls:'seg-freq'};
  if(st.visits>=2)return {label:'Regular',cls:'seg-reg'};
  return {label:'Nueva',cls:'seg-new'};
}
function payBehavior(st){
  if(st.debt>0){
    if(st.oldestDebtDays>=14)return {label:'Cobranza urgente',cls:'pay-bad'};
    return {label:'Con adeudo',cls:'pay-warn'};
  }
  if(st.avgDaysToPay===null||st.avgDaysToPay<=0)return {label:'Puntual',cls:'pay-good'};
  if(st.avgDaysToPay<=3)return {label:'Buena paga',cls:'pay-ok'};
  return {label:'Se tarda',cls:'pay-warn'};
}
/* ============ RETENCIÓN: en riesgo + cumpleaños ============ */
const RIESGO_DIAS=35; // ciclo típico de uñas: 3-4 semanas
function cliEnRiesgo(){
  return DB.clientas.filter(cl=>{
    const st=clientStats(cl.id);
    return st.visits>0&&st.lastDays!=null&&st.lastDays>=RIESGO_DIAS&&cl.telefono;
  }).map(cl=>({cl,days:clientStats(cl.id).lastDays})).sort((a,b)=>a.days-b.days);
}
function proximosCumples(dias){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const out=[];
  DB.clientas.forEach(cl=>{
    if(!cl.cumple)return;
    const [_,m,d]=cl.cumple.split('-').map(Number);
    if(!m||!d)return;
    let next=new Date(hoy.getFullYear(),m-1,d);
    if(next<hoy)next=new Date(hoy.getFullYear()+1,m-1,d);
    const diff=Math.round((next-hoy)/86400000);
    if(diff<=dias)out.push({cl,diff,fecha:next});
  });
  return out.sort((a,b)=>a.diff-b.diff);
}
function renderCliAlerts(){
  const el=document.getElementById('cliAlerts');if(!el)return;
  const riesgo=cliEnRiesgo();
  const cumples=proximosCumples(7);
  let html='';
  if(cumples.length){
    html+=`<section class="alert-card cumple-card" aria-labelledby="alCumple"><h2 class="al-title" id="alCumple">${icon('cake')}Cumpleaños próximos</h2>`;
    html+=cumples.map(x=>`<div class="al-row"><button type="button" class="al-info" data-on-click="openCli('${x.cl.id}')"><b>${esc(x.cl.nombre)}</b><small>${x.diff===0?'Hoy':(x.diff===1?'Mañana':'En '+x.diff+' días')} · ${x.fecha.getDate()} ${MON[x.fecha.getMonth()].toLowerCase()}</small></button><button type="button" class="btn-sm btn-wa-line" aria-label="Felicitar a ${esc(x.cl.nombre)} por WhatsApp" data-on-click="waCumple('${x.cl.id}')">${icon('wa')}Felicitar</button></div>`).join('');
    html+=`</section>`;
  }
  if(riesgo.length){
    html+=`<section class="alert-card riesgo-card" aria-labelledby="alRiesgo"><h2 class="al-title" id="alRiesgo">${icon('clockBack')}No han vuelto <span class="n">${riesgo.length}</span></h2>`;
    html+=riesgo.slice(0,3).map(x=>`<div class="al-row"><button type="button" class="al-info" data-on-click="openCli('${x.cl.id}')"><b>${esc(x.cl.nombre)}</b><small>Última visita hace ${x.days} días</small></button><button type="button" class="btn-sm btn-wa-line" aria-label="Escribir a ${esc(x.cl.nombre)} por WhatsApp" data-on-click="waTeExtranamos('${x.cl.id}')">${icon('wa')}Escribir</button></div>`).join('');
    html+=`<button type="button" class="link-btn al-ver-todas" data-on-click="openRiesgoSheet()">Ver las ${riesgo.length} ${icon('chevR')}</button>`;
    html+=`</section>`;
  }
  el.innerHTML=html;
}
function fechaLarga(ymdStr){
  if(!ymdStr)return '';
  const d=new Date(ymdStr+'T00:00:00');
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
function riesgoSort(list,mode){
  const arr=list.slice();
  if(mode==='gasto')arr.sort((a,b)=>b.st.spent-a.st.spent);
  else if(mode==='nombre')arr.sort((a,b)=>a.cl.nombre.localeCompare(b.cl.nombre));
  else arr.sort((a,b)=>b.days-a.days); // más días sin volver primero (más urgente)
  return arr;
}
let riesgoOrden='dias';
function openRiesgoSheet(){
  riesgoOrden='dias';
  renderRiesgoList();
  showSheet('riesgoSheet');
}
function riesgoSetOrden(m){
  riesgoOrden=m;
  document.querySelectorAll('#riesgoOrdenSeg button').forEach(b=>b.classList.toggle('on',b.dataset.o===m));
  renderRiesgoList();
}
/* Cierra la hoja actual y abre la ficha cuando termina la animación */
function cerrarYAbrirClienta(id){closeSheet();setTimeout(()=>openCli(id),260)}
function renderRiesgoList(){
  const el=document.getElementById('riesgoFullList');if(!el)return;
  let list=cliEnRiesgo().map(x=>({...x,st:clientStats(x.cl.id)}));
  list=riesgoSort(list,riesgoOrden);
  document.getElementById('riesgoCount').textContent=list.length;
  if(!list.length){el.innerHTML='<div class="empty-mini">Ninguna clienta en riesgo por ahora.</div>';return;}
  el.innerHTML=list.map(x=>{
    const seg=clientSegment(x.st);
    return `<div class="riesgo-full-card">
      <button type="button" class="rf-main" data-on-click="cerrarYAbrirClienta('${x.cl.id}')">
        <span class="rf-top"><span class="rf-name">${esc(x.cl.nombre)} <span class="badge ${seg.cls}">${seg.label}</span></span><span class="rf-days">${x.days} d</span></span>
        <span class="rf-detail">Última visita: ${fechaLarga(x.st.last)} · ${x.st.visits} visita${x.st.visits!==1?'s':''} · ${fmtMoney(x.st.spent)} gastado${x.st.debt?` · <span class="rf-debt">debe ${fmtMoney(x.st.debt)}</span>`:''}</span>
      </button>
      <button type="button" class="btn-sm btn-wa-line rf-wa" data-on-click="waTeExtranamos('${x.cl.id}')">${icon('wa')}Mandar «te extrañamos»</button>
    </div>`;
  }).join('');
}
function waTeExtranamos(cliId){
  const cl=DB.clientas.find(x=>x.id===cliId);if(!cl)return;
  const msg=`¡Hola ${cl.nombre.split(' ')[0]}! 🤍\n\nTe extrañamos en *Rhēud Beauty* 💅 Ya pasó un tiempito desde tu última visita y tus uñas merecen su mantenimiento.\n\n¿Te aparto un espacio esta semana? ✨`;
  waOpen(cl,msg);
}
function waCumple(cliId){
  const cl=DB.clientas.find(x=>x.id===cliId);if(!cl)return;
  const msg=`¡Feliz cumpleaños, ${cl.nombre.split(' ')[0]}! 🎂✨\n\nDe parte de *Rhēud Beauty* te deseamos un día precioso 🤍\n\nVen a consentirte este mes: tenemos un detalle especial para ti en tu próxima visita 💅`;
  waOpen(cl,msg);
}

/* ============ RE-AGENDADO (rebooking) ============ */
let pendingRebook=null; // {cliId, nombre}
function maybeOfferRebook(citaData,wasAtendidaBefore){
  // ofrece agendar la siguiente cita cuando se marca como atendida por primera vez
  if(citaData.estado!=='atendida'||wasAtendidaBefore)return;
  const cl=DB.clientas.find(x=>x.id===citaData.clientaId);if(!cl)return;
  pendingRebook={cliId:cl.id,nombre:cl.nombre};
  document.getElementById('rebookName').textContent=cl.nombre.split(' ')[0];
  setTimeout(()=>showSheet('rebookSheet'),350);
}
function descartarRebook(){pendingRebook=null;closeSheet()}
function rebookIn(weeks){
  if(!pendingRebook)return closeSheet();
  const cliId=pendingRebook.cliId;pendingRebook=null;
  closeSheet();
  const d=new Date();d.setDate(d.getDate()+weeks*7);
  openApptSheet();
  document.getElementById('apptDate').value=ymd(d);
  // preselecciona la clienta
  apptSelectedCliId=cliId;
  const cl=DB.clientas.find(x=>x.id===cliId);
  if(cl){document.getElementById('apptCliSearch').value=cl.nombre;document.getElementById('apptCliResults').innerHTML='';}
  onApptDateChange();
  toast('Próxima cita de '+(cl?cl.nombre.split(' ')[0]:'')+' · elige hora');
}

/* ============ EXPORTAR CSV ============ */
function exportCSV(){
  const rows=[['Fecha','Hora','Clienta','Servicios','Precio','Descuento','Cobrado','Pendiente','Estado pago','Método','Código']];
  DB.citas.filter(c=>c.estado==='atendida').sort((a,b)=>(a.fecha+a.hora).localeCompare(b.fecha+b.hora)).forEach(c=>{
    const cl=DB.clientas.find(x=>x.id===c.clientaId);
    const sm=pagosSummary(c);
    rows.push([c.fecha,c.hora||'',cl?cl.nombre:'',svcFull(c),c.precio||0,c.descMonto||0,sm.cobrado,sm.deuda,sm.estado,metodoLabel(c.metodo||''),c.codigo||'']);
  });
  const csv=rows.map(r=>r.map(v=>{v=String(v??'');return (v.includes(',')||v.includes('"'))?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='rheud-ingresos-'+ymd(new Date())+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  toast('CSV exportado 📊');
}

function renderClientas(){
  renderCliAlerts();
  const cont=document.getElementById('cliList');
  const q=(document.getElementById('cliSearch')||{}).value||'';
  document.getElementById('cliSearchClr').style.display=q?'block':'none';
  if(!DB.clientas.length){document.getElementById('cliCount').textContent='';cont.innerHTML=`<div class="empty">${icon('user')}<p>Aún no hay clientas.<br>Agrégalas aquí o al crear una cita.</p><button type="button" class="btn-sm" data-on-click="openCliCreateSheet()">${icon('userPlus')}Nueva clienta</button></div>`;return;}
  let list=DB.clientas.filter(c=>matchCli(c,q));
  document.getElementById('cliCount').textContent=q?`${list.length} de ${DB.clientas.length}`:`${DB.clientas.length} registradas`;
  list=list.sort((a,b)=>{const sa=clientStats(a.id).last||'',sb=clientStats(b.id).last||'';return sb.localeCompare(sa)});
  if(!list.length){cont.innerHTML=`<div class="empty">${icon('search')}<p>Ninguna clienta coincide con «${esc(q)}».</p></div>`;return;}
  // Una sola etiqueta de segmento y, si aplica, el adeudo
  cont.innerHTML=`<div class="card list-card">`+list.map(cl=>{
    const st=clientStats(cl.id),seg=clientSegment(st);
    const urgente=st.debt>0&&st.oldestDebtDays>=14;
    return `<button type="button" class="row" data-on-click="openCli('${cl.id}')">
      <span class="avatar" aria-hidden="true">${esc(cl.nombre[0].toUpperCase())}</span>
      <span class="info"><span class="name">${esc(cl.nombre)}</span>
      <span class="det">${cliNumLabel(cl.num)?cliNumLabel(cl.num).replace('Cliente ','')+' · ':''}${st.visits} visita${st.visits!==1?'s':''}${st.spent?` · ${fmtMoney(st.spent)}`:''}</span></span>
      <span class="right"><span class="badge ${seg.cls}">${seg.label}</span>${st.debt?`<span class="debt${urgente?' urg':''}">Debe ${fmtMoney(st.debt)}</span>`:''}</span>
    </button>`;
  }).join('')+`</div>`;
}
function clearCliSearch(){const s=document.getElementById('cliSearch');s.value='';renderClientas();}
let openCliId=null;
function openCli(id){
  openCliId=id;
  const cl=DB.clientas.find(x=>x.id===id);const st=clientStats(id);
  document.getElementById('cliAv').textContent=cl.nombre[0].toUpperCase();
  document.getElementById('cliName').textContent=cl.nombre;
  document.getElementById('cliNum').textContent=cliNumLabel(cl.num);
  document.getElementById('cliPhone').value=cl.telefono||'';
  document.getElementById('cliEmail').value=cl.email||'';
  document.getElementById('cliVisits').textContent=st.visits;
  document.getElementById('cliSpent').textContent=fmtMoney(st.spent);
  document.getElementById('cliTicket').textContent=fmtMoney(st.avgTicket);
  document.getElementById('cliDebtKv').style.display=st.debt?'flex':'none';
  document.getElementById('cliDebt').textContent=fmtMoney(st.debt)+(st.debt?` · hace ${st.oldestDebtDays}d`:'');
  const pay=payBehavior(st),seg=clientSegment(st);
  document.getElementById('cliBadges').innerHTML=`<span class="badge ${seg.cls}">${seg.label}</span><span class="badge ${pay.cls}">${pay.label}</span>`;  const payKv=document.getElementById('cliPayKv');
  if(st.avgDaysToPay!==null){payKv.style.display='flex';document.getElementById('cliPayDays').textContent=st.avgDaysToPay<=0?'el mismo día':st.avgDaysToPay+(st.avgDaysToPay===1?' día':' días');}
  else payKv.style.display='none';
  document.getElementById('cliLast').textContent=st.last?(()=>{const d=new Date(st.last+'T00:00:00');return d.getDate()+' '+MON[d.getMonth()]})():'—';
  document.getElementById('cliNotes').value=cl.notas||'';
  document.getElementById('cliCumple').value=cl.cumple||'';
  loadCliPrefs(cl);
  loadExpediente(cl.id);
  renderCliCortesias(cl.id);
  const hist=DB.citas.filter(c=>c.clientaId===id).sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora));
  document.getElementById('cliHist').innerHTML=hist.length?hist.map(c=>{
    const pg=c.estado==='atendida'?(c.pago==='deuda'?' · debe':(c.metodo?' · '+metodoLabel(c.metodo):' · pagado')):'';
    const cat=citaCats(c)[0];
    return `<div class="histitem"><span class="hi-ic ${cat==='skin'?'skin':cat==='otro'?'otro':'nails'}">${ramaIcon(cat)}</span><div class="hi-b"><div class="hs">${esc(svcFull(c))}</div>
    <div class="hd">${fechaCorta(c.fecha)}${c.hora?' · '+hm(toMin(c.hora)):''} · ${(ESTADO_TXT[c.estado]||'Agendada').toLowerCase()}${pg}</div></div>
    <div class="hp">${fmtMoney(montoCita(c)||c.precio)}${deudaCita(c)>0?`<small class="hp-debe">debe ${fmtMoney(deudaCita(c))}</small>`:''}</div></div>`;
  }).join(''):'<p class="empty-mini">Sin historial.</p>';
  document.getElementById('cliLoyalty').innerHTML=loyaltyCardHtml(cl);
  showSheet('cliSheet');
}
