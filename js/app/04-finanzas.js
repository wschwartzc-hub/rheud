/* ---------------- VENTAS ---------------- */
let ventasPeriod='dia';
function rangeStart(p){
  const d=new Date();d.setHours(0,0,0,0);
  if(p==='dia')return ymd(d);
  if(p==='sem'){const day=d.getDay();const diff=(day===0?6:day-1);d.setDate(d.getDate()-diff);return ymd(d);}
  if(p==='mes'){d.setDate(1);return ymd(d);}
}
function ensureRangeDefaults(desdeId,hastaId){
  const today=ymd(new Date());
  const d=document.getElementById(desdeId),h=document.getElementById(hastaId);
  if(!d.value){const f=new Date();f.setDate(1);d.value=ymd(f);}
  if(!h.value)h.value=today;
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
  // fin natural del periodo (para incluir citas agendadas del resto del mes/semana)
  let endKeyFull=endKey;
  if(ventasPeriod==='mes'){const d=new Date();endKeyFull=ymd(new Date(d.getFullYear(),d.getMonth()+1,0));}
  else if(ventasPeriod==='sem'){const d=new Date(startKey+'T00:00:00');d.setDate(d.getDate()+6);endKeyFull=ymd(d);}
  const sales=DB.citas.filter(c=>c.estado==='atendida'&&c.fecha>=startKey&&c.fecha<=endKey);
  const total=sales.reduce((s,c)=>s+Number(c.precio||0),0);
  const cobrado=sales.reduce((s,c)=>s+montoCita(c),0);
  const deuda=sales.reduce((s,c)=>s+deudaCita(c),0);
  const agendadas=DB.citas.filter(c=>c.estado==='agendada'&&c.fecha>=startKey&&c.fecha<=endKeyFull);
  const esperadoAgendadas=agendadas.reduce((s,c)=>s+Number(c.precio||0),0);
  const totalEsperado=cobrado+deuda+esperadoAgendadas;
  const nTodo=sales.length+agendadas.length;
  document.getElementById('ventasStats').innerHTML=`
    <div class="stat wide stat-hero">
      <div class="lbl">Total esperado del periodo</div>
      <div class="val">${fmtMoney(totalEsperado)}</div>
      <div class="sub">${nTodo} cita${nTodo!==1?'s':''} · ${sales.length} atendida${sales.length!==1?'s':''}${agendadas.length?` · ${agendadas.length} por atender`:''}</div>
    </div>
    <div class="stat"><div class="lbl">Cobrado ✓</div><div class="val" style="color:var(--green)">${fmtMoney(cobrado)}</div></div>
    <div class="stat"><div class="lbl">Pendiente</div><div class="val" style="color:${(deuda+esperadoAgendadas)?'var(--red)':'var(--muted)'}">${fmtMoney(deuda+esperadoAgendadas)}</div></div>`;
  // Ingresos por rama (uñas vs skin care) del periodo
  renderVentasRama(sales);
  // Frase alentadora dinámica
  const pctCobrado=totalEsperado>0?Math.round(cobrado/totalEsperado*100):0;
  let frase='',emoji='';
  if(totalEsperado===0){
    frase='Cada cita que agendas es un paso hacia tus metas. ¡Tú puedes!';emoji='🌸';
  }else if(pctCobrado===100&&cobrado>0){
    frase='¡Todo cobrado! Eso es trabajo bien hecho y clientes felices. Eres increíble. ✨';emoji='🏆';
  }else if(pctCobrado>=80){
    frase=`Llevas el ${pctCobrado}% cobrado. ¡Casi completas — qué mes tan poderoso! 💪`;emoji='🌟';
  }else if(pctCobrado>=50){
    frase=`Ya tienes más de la mitad asegurada. Cada servicio que das es una inversión en ti y en Rhēud. `;emoji='💅';
  }else if(agendadas.length>0&&cobrado>0){
    frase=`${agendadas.length} cita${agendadas.length!==1?'s':''} más esperando — ${fmtMoney(esperadoAgendadas)} adicionales por llegar. ¡Lo tuyo sigue creciendo!`;emoji='🚀';
  }else if(cobrado>0){
    frase=`Cada peso cobrado es el resultado de tu talento y dedicación. Rhēud Beauty brilla porque tú brillas.`;emoji='✨';
  }else{
    frase='El mes está empezando y las citas están por llegar. ¡Tus manos hacen magia! 💖';emoji='🌸';
  }
  document.getElementById('fraseMot').innerHTML=`<div class="frase-mot"><span class="frase-emoji">${emoji}</span><p>${frase}</p></div>`;
  const cont=document.getElementById('ventasList');
  const ordered=[...sales].sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora));
  if(!ordered.length){cont.innerHTML=`<div class="empty"><div class="ic">📋</div><p>Sin movimientos en este periodo.</p></div>`;renderCobranza();return;}
  cont.innerHTML=ordered.map(c=>{
    const cli=DB.clientas.find(x=>x.id===c.clientaId);
    const d=new Date(c.fecha+'T00:00:00');
    let pill,amt;
    if(c.pago==='deuda'){pill='<span class="pill deuda">Debe</span>';amt=fmtMoney(deudaCita(c));}
    else if(c.pago==='parcial'){pill='<span class="pill parcial">Abonó · debe '+fmtMoney(deudaCita(c))+'</span>';amt=fmtMoney(montoCita(c));}
    else {pill='<span class="pill pagado">Pagado</span>';amt=fmtMoney(montoCita(c));}
    return `<div class="row" data-on-click="editAppt('${c.id}')">
      <div class="avatar">${cli?cli.nombre[0].toUpperCase():'·'}</div>
      <div class="info"><div class="name">${esc(cli?cli.nombre:'Clienta')}</div>
      <div class="det">${svcDisplay(c)} · ${d.getDate()} ${MON[d.getMonth()]}</div></div>
      <div class="right"><div class="amt">${amt}</div>${pill}</div>
    </div>`;
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
  const row=(cat,color)=>{const x=acc[cat]||{v:0,n:0};const pct=total?Math.round(x.v/total*100):0;const tk=x.n?Math.round(x.v/x.n):0;
    return `<div class="rama-row"><div class="rama-top"><span class="rama-dot" style="background:${color}"></span><span class="rama-n">${catLabel(cat)}</span><span class="rama-meta">${x.n} servicio${x.n!==1?'s':''}${tk?` · ticket ${fmtMoney(tk)}`:''}</span><span class="rama-v num">${fmtMoney(Math.round(x.v))}</span></div><div class="rama-bar"><div style="width:${pct}%;background:${color}"></div></div></div>`;};
  el.innerHTML=`<div class="card rama-card"><div class="eyebrow">Cobrado por rama</div>${row('nails','#A03F66')}${row('skin','#6A57B8')}${acc.otro.n?row('otro','#9C8E92'):''}</div>`;
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
  alertEl.innerHTML=overdueAmt>0?`<div class="alert-cob"><div class="ai">⚠️</div><div class="at">Tienes <b>${fmtMoney(overdueAmt)}</b> en cobranza vencida (+14 días) de <b>${overdueClis} client${overdueClis!==1?'as':'a'}</b>. Conviene dar seguimiento.</div></div>`:'';
  // debtors grouped by client
  const byCli={};
  debts.forEach(c=>{if(!byCli[c.clientaId])byCli[c.clientaId]={debt:0,oldest:0,count:0};byCli[c.clientaId].debt+=deudaCita(c);byCli[c.clientaId].count++;byCli[c.clientaId].oldest=Math.max(byCli[c.clientaId].oldest,daysSince(c.fecha));});
  const debtors=Object.entries(byCli).map(([id,d])=>({id,...d})).sort((a,b)=>b.debt-a.debt);
  const maxB=Math.max(...buckets.map(b=>b.v),1);
  const barsHtml=buckets.map(b=>{const h=Math.round((b.v/maxB)*100);const danger=b.min>=15;return `<div class="bar-col"><div class="bar-val">${b.v?('$'+(b.v>=1000?(b.v/1000).toFixed(1)+'k':b.v)):''}</div><div class="bar-track"><div class="bar-fill ${b.v?'':'zero'}" style="height:${b.v?Math.max(h,4):4}%;${danger&&b.v?'background:linear-gradient(to top,var(--red),#D98A82)':''}"></div></div><div class="bar-lbl">${b.l.replace(' días','d')}</div></div>`}).join('');
  const debtorRows=debtors.map(d=>{
    const cl=DB.clientas.find(x=>x.id===d.id);if(!cl)return '';
    const big=d.debt>=500;const old=d.oldest>=14;
    return `<div class="row debtor" data-on-click="openCli('${d.id}')">
      <div class="avatar" style="background:${old?'linear-gradient(150deg,#B5564E,#8C3A2E)':'linear-gradient(150deg,var(--mauve),var(--wine))'}">${cl.nombre[0].toUpperCase()}</div>
      <div class="info"><div class="name">${esc(cl.nombre)}</div>
      <div class="det"><span class="${old?'age-bad':''}">hace ${d.oldest}d</span> · ${d.count} cargo${d.count!==1?'s':''} · ${big?'adeudo alto':'adeudo bajo'}</div></div>
      <div class="right"><div class="amt" style="color:var(--red)">${fmtMoney(d.debt)}</div></div>
    </div>`;
  }).join('');
  block.innerHTML=`
    <div class="divider">Cobranza · ${fmtMoney(totalDebt)} pendiente</div>
    <div class="chartcard"><div class="ct">Antigüedad del adeudo</div><div class="bars">${barsHtml}</div></div>
    ${debtorRows}`;
}
document.getElementById('ventasSeg').addEventListener('click',e=>{
  if(e.target.tagName!=='BUTTON')return;
  ventasPeriod=e.target.dataset.p;
  document.querySelectorAll('#ventasSeg button').forEach(b=>b.classList.toggle('on',b===e.target));
  if(ventasPeriod==='rango')ensureRangeDefaults('vDesde','vHasta');
  document.getElementById('ventasRange').style.display=ventasPeriod==='rango'?'flex':'none';
  renderVentas();
});
