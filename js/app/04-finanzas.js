/* ---------------- VENTAS ---------------- */
let ventasPeriod='mes';
function rangeStart(p){
  const d=new Date();d.setHours(0,0,0,0);
  if(p==='dia')return ymd(d);
  if(p==='sem'){const day=d.getDay();const diff=(day===0?6:day-1);d.setDate(d.getDate()-diff);return ymd(d);}
  if(p==='mes'){d.setDate(1);return ymd(d);}
  if(p==='ano')return ymd(new Date(d.getFullYear(),0,1));
}
function ensureRangeDefaults(desdeId,hastaId){
  const today=ymd(new Date());
  const d=document.getElementById(desdeId),h=document.getElementById(hastaId);
  if(!d.value){const f=new Date();f.setDate(1);d.value=ymd(f);}
  if(!h.value)h.value=today;
}
/* Un solo selector de periodo para Ingresos, Gastos e Insights */
const PERIODO_TXT={dia:'hoy',sem:'esta semana',mes:'este mes',ano:'este año',rango:'del rango'};
function finPeriodo(p){
  ventasPeriod=p;egresosPeriod=p;intelPeriod=p;
  document.querySelectorAll('#finPeriodSeg button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  if(p==='rango')ensureRangeDefaults('vDesde','vHasta');
  document.getElementById('ventasRange').style.display=p==='rango'?'flex':'none';
  renderFinanzas();
}
function finRangoTexto(){
  const now=new Date();
  if(ventasPeriod==='dia')return 'Hoy · '+fechaCorta(ymd(now));
  if(ventasPeriod==='sem'){const ws=startOfWeek(now),we=addDays(ws,6);return `${ws.getDate()} ${MON[ws.getMonth()].toLowerCase()} – ${we.getDate()} ${MON[we.getMonth()].toLowerCase()}`;}
  if(ventasPeriod==='mes')return `${MONF[now.getMonth()]} ${now.getFullYear()}`;
  if(ventasPeriod==='ano')return String(now.getFullYear());
  let a=document.getElementById('vDesde').value,b=document.getElementById('vHasta').value;
  if(a&&b&&b<a){const t=a;a=b;b=t;}
  return a&&b?`${fechaCorta(a)} – ${fechaCorta(b)}`:'Rango';
}
function renderFinanzas(){
  const lbl=document.getElementById('finRangeLbl');if(lbl)lbl.textContent=finRangoTexto();
  if(ventasModeActive==='egresos')renderEgresos();
  else if(ventasModeActive==='insights')renderInteligencia();
  else renderVentas();
}
function renderVentas(){
  let startKey,endKey;const today=ymd(new Date());
  if(ventasPeriod==='rango'){
    startKey=document.getElementById('vDesde').value||today;
    endKey=document.getElementById('vHasta').value||today;
    if(endKey<startKey){const t=startKey;startKey=endKey;endKey=t;}
  }else{
    startKey=rangeStart(ventasPeriod);
    endKey=today;
    // Para las agendadas futuras usamos el fin real del periodo (no hoy)
  }
  // fin natural del periodo (para incluir citas agendadas del resto del mes/semana/año)
  let endKeyFull=endKey;
  if(ventasPeriod==='mes'){const d=new Date();endKeyFull=ymd(new Date(d.getFullYear(),d.getMonth()+1,0));}
  else if(ventasPeriod==='sem'){const d=new Date(startKey+'T00:00:00');d.setDate(d.getDate()+6);endKeyFull=ymd(d);}
  else if(ventasPeriod==='ano'){endKeyFull=ymd(new Date(new Date().getFullYear(),11,31));}
  const sales=DB.citas.filter(c=>c.estado==='atendida'&&c.fecha>=startKey&&c.fecha<=endKey);

  const agendadas=DB.citas.filter(c=>c.estado==='agendada'&&c.fecha>=startKey&&c.fecha<=endKeyFull);
  // por atender: los anticipos ya están cobrados; lo pendiente es el saldo neto (precio − descuento − anticipos)
  const anticipos=agendadas.reduce((s,c)=>s+resumenPago(c).cobrado,0);
  const cobrado=sales.reduce((s,c)=>s+montoCita(c),0)+anticipos;
  const deuda=sales.reduce((s,c)=>s+deudaCita(c),0);
  const esperadoAgendadas=agendadas.reduce((s,c)=>s+resumenPago(c).saldo,0);
  const totalEsperado=cobrado+deuda+esperadoAgendadas;
  const nTodo=sales.length+agendadas.length;
  const pct=totalEsperado>0?Math.round(cobrado/totalEsperado*100):0;
  const pend=deuda+esperadoAgendadas;
  const per=PERIODO_TXT[ventasPeriod]||'';
  document.getElementById('ventasStats').innerHTML=`
    <div class="stat stat-hero">
      <div class="lbl">Esperado ${per}</div>
      <div class="val">${fmtMoney(totalEsperado)}</div>
      <div class="prog" role="img" aria-label="${pct}% cobrado"><span style="width:${pct}%"></span></div>
      <div class="sub">${nTodo} cita${nTodo!==1?'s':''} · ${sales.length} atendida${sales.length!==1?'s':''}${agendadas.length?` · ${agendadas.length} por atender`:''}</div>
    </div>
    <div class="stat"><div class="lbl">Cobrado</div><div class="val v-ok">${fmtMoney(cobrado)}</div><div class="sub">${pct}% del esperado</div></div>
    <div class="stat"><div class="lbl">Pendiente</div><div class="val ${pend?'v-bad':''}">${fmtMoney(pend)}</div><div class="sub">${deuda?`${fmtMoney(deuda)} adeudo`:'Sin adeudos'}${esperadoAgendadas?` · ${fmtMoney(esperadoAgendadas)} por atender`:''}</div></div>`;
  // Ingresos por rama (uñas vs skin care) del periodo
  renderVentasRama(sales);
  const fm=document.getElementById('fraseMot');if(fm)fm.innerHTML='';
  const cont=document.getElementById('ventasList');
  const ordered=[...sales].sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora));
  if(!ordered.length){cont.innerHTML=`<div class="empty">${icon('list')}<p>Sin movimientos en este periodo.</p></div>`;renderCobranza();return;}
  cont.innerHTML=ordered.map(c=>{
    const cli=DB.clientas.find(x=>x.id===c.clientaId);
    const d=new Date(c.fecha+'T00:00:00');
    let tag,amt;
    if(c.pago==='deuda'){tag='<span class="tag t-bad">Debe</span>';amt=fmtMoney(deudaCita(c));}
    else if(c.pago==='parcial'){tag='<span class="tag t-warn">Debe '+fmtMoney(deudaCita(c))+'</span>';amt=fmtMoney(montoCita(c));}
    else {tag='<span class="tag t-ok">Pagado</span>';amt=fmtMoney(montoCita(c));}
    return `<button type="button" class="row" data-on-click="editAppt('${c.id}')">
      <span class="avatar" aria-hidden="true">${esc(cli?cli.nombre[0].toUpperCase():'·')}</span>
      <span class="info"><span class="name">${esc(cli?cli.nombre:'Clienta')}</span>
      <span class="det">${esc(svcDisplay(c))} · ${d.getDate()} ${MON[d.getMonth()].toLowerCase()}</span></span>
      <span class="right"><span class="amt">${amt}</span>${tag}</span>
    </button>`;
  }).join('');
  renderCobranza();
}
function renderVentasRama(sales){
  const el=document.getElementById('ventasRama');if(!el)return;
  const acc={nails:{v:0,n:0},skin:{v:0,n:0},otro:{v:0,n:0}};
  sales.forEach(c=>{
    const items=(c.items&&c.items.length)?c.items:[{id:c.servicioId,p:Number(c.precio||0)}];
    const sumP=items.reduce((t,i)=>t+Number(i.p||0),0)||Number(c.precio||0);
    const real=montoCita(c);
    items.forEach(i=>{const s=svcById(i.id);const cat=i.cat||(s?s.cat:'nails')||'nails';const share=sumP?Number(i.p||0)/sumP:1/items.length;acc[cat]=acc[cat]||{v:0,n:0};acc[cat].v+=real*share;acc[cat].n++;});
  });
  const total=Object.values(acc).reduce((t,x)=>t+x.v,0);
  const hasSkin=DB.servicios.some(s=>s.cat==='skin')||acc.skin.n>0;
  if(!total||!hasSkin){el.innerHTML='';return;}
  el.innerHTML=`<div class="card rama-card"><div class="eyebrow">Cobrado por rama</div>${ramaRow('nails',acc.nails,total)}${ramaRow('skin',acc.skin,total)}${acc.otro.n?ramaRow('otro',acc.otro,total):''}</div>`;
}
/* Fila de rama (uñas / piel / otros) con barra proporcional */
function ramaRow(cat,x,total){
  x=x||{v:0,n:0};const pct=total?Math.round(x.v/total*100):0;const tk=x.n?Math.round(x.v/x.n):0;
  return `<div class="rama-row ${cat}"><div class="rama-top"><span class="rama-ic">${ramaIcon(cat)}</span><span class="rama-n">${catLabel(cat)}</span><span class="rama-meta">${x.n} servicio${x.n!==1?'s':''}${tk?` · ticket ${fmtMoney(tk)}`:''}</span><span class="rama-v num">${fmtMoney(Math.round(x.v))}</span></div><div class="rama-bar" role="img" aria-label="${pct}%"><div style="width:${pct}%"></div></div></div>`;
}
function metodoLabel(m){return ({efectivo:'Efectivo',transferencia:'Transfer.',tarjeta:'Tarjeta',cupon:'Cupón',otro:'Otro'})[m]||'Pagado'}
function renderCobranza(){
  const debts=DB.citas.filter(c=>c.estado==='atendida'&&(c.pago==='deuda'||c.pago==='parcial'));
  const alertEl=document.getElementById('cobAlert');
  const block=document.getElementById('cobranzaBlock');
  if(!debts.length){alertEl.innerHTML='';block.innerHTML='';return;}
  // aging buckets
  const buckets=[{l:'0–7 días',min:0,max:7,v:0},{l:'8–14 días',min:8,max:14,v:0},{l:'15–30 días',min:15,max:30,v:0},{l:'+30 días',min:31,max:1e9,v:0}];
  debts.forEach(c=>{const d=daysSince(c.fecha);const b=buckets.find(b=>d>=b.min&&d<=b.max);if(b)b.v+=deudaCita(c);});
  const totalDebt=debts.reduce((s,c)=>s+deudaCita(c),0);
  const overdue=debts.filter(c=>daysSince(c.fecha)>=14);
  const overdueAmt=overdue.reduce((s,c)=>s+deudaCita(c),0);
  const overdueClis=new Set(overdue.map(c=>c.clientaId)).size;
  alertEl.innerHTML=overdueAmt>0?`<div class="alert-cob" role="note">${icon('alert')}<div class="at">Tienes <b>${fmtMoney(overdueAmt)}</b> en cobranza vencida (+14 días) de <b>${overdueClis} client${overdueClis!==1?'as':'a'}</b>. Conviene dar seguimiento.</div></div>`:'';
  // debtors grouped by client
  const byCli={};
  debts.forEach(c=>{if(!byCli[c.clientaId])byCli[c.clientaId]={debt:0,oldest:0,count:0};byCli[c.clientaId].debt+=deudaCita(c);byCli[c.clientaId].count++;byCli[c.clientaId].oldest=Math.max(byCli[c.clientaId].oldest,daysSince(c.fecha));});
  const debtors=Object.entries(byCli).map(([id,d])=>({id,...d})).sort((a,b)=>b.debt-a.debt);
  const maxB=Math.max(...buckets.map(b=>b.v),1);
  const barsHtml=buckets.map(b=>{const h=Math.round((b.v/maxB)*100);const danger=b.min>=15;return `<div class="bar-col"><div class="bar-val">${b.v?('$'+(b.v>=1000?(b.v/1000).toFixed(1)+'k':b.v)):''}</div><div class="bar-track"><div class="bar-fill ${b.v?'':'zero'} ${danger&&b.v?'bad':''}" style="height:${b.v?Math.max(h,4):4}%"></div></div><div class="bar-lbl">${b.l.replace(' días','d')}</div></div>`}).join('');
  const debtorRows=debtors.map(d=>{
    const cl=DB.clientas.find(x=>x.id===d.id);if(!cl)return '';
    const big=d.debt>=500;const old=d.oldest>=14;
    return `<button type="button" class="row debtor" data-on-click="openCli('${d.id}')">
      <span class="avatar ${old?'av-bad':''}" aria-hidden="true">${esc(cl.nombre[0].toUpperCase())}</span>
      <span class="info"><span class="name">${esc(cl.nombre)}</span>
      <span class="det"><span class="${old?'age-bad':''}">hace ${d.oldest} d</span> · ${d.count} cargo${d.count!==1?'s':''} · ${big?'adeudo alto':'adeudo bajo'}</span></span>
      <span class="right"><span class="amt v-bad">${fmtMoney(d.debt)}</span></span>
    </button>`;
  }).join('');
  block.innerHTML=`
    <div class="divider"><span>Cobranza · ${fmtMoney(totalDebt)} pendiente</span></div>
    <div class="chartcard"><div class="ct">Antigüedad del adeudo</div><div class="bars" role="img" aria-label="${buckets.map(b=>b.l+': '+fmtMoney(b.v)).join(', ')}">${barsHtml}</div></div>
    ${debtorRows}`;
}
