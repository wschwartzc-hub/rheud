/* ---------------- INTELIGENCIA ---------------- */
/* El periodo lo elige el selector único de Finanzas (finPeriodo) */
let intelPeriod='mes';
function atendidasEntre(a,b){return DB.citas.filter(c=>c.estado==='atendida'&&c.fecha>=a&&c.fecha<=b)}
function sumP(arr){return arr.reduce((s,c)=>s+montoCita(c),0)}
function bucketsFor(start,end){
  const days=Math.round((end-start)/86400000)+1,out=[];
  if(days<=14){
    for(let i=0;i<days;i++){const d=new Date(start);d.setDate(start.getDate()+i);out.push({label:days<=8?DOW[d.getDay()][0]:String(d.getDate()),from:ymd(d),to:ymd(d)});}
    return {buckets:out,gran:'día'};
  }
  if(days<=92){
    let cur=new Date(start);
    while(cur<=end){const f=new Date(cur);const t=new Date(cur);t.setDate(t.getDate()+6);const tt=t>end?new Date(end):t;out.push({label:f.getDate()+'/'+(f.getMonth()+1),from:ymd(f),to:ymd(tt)});cur.setDate(cur.getDate()+7);}
    return {buckets:out,gran:'semana'};
  }
  let cur=new Date(start.getFullYear(),start.getMonth(),1);
  while(cur<=end){const t=new Date(cur.getFullYear(),cur.getMonth()+1,0);const ff=cur<start?new Date(start):new Date(cur),tt=t>end?new Date(end):t;out.push({label:MON[cur.getMonth()][0],from:ymd(ff),to:ymd(tt)});cur.setMonth(cur.getMonth()+1);}
  return {buckets:out,gran:'mes'};
}
function renderInteligencia(){
  const now=new Date();now.setHours(0,0,0,0);const todayKey=ymd(now);
  let start,end,rangeLabel;
  if(intelPeriod==='dia'){
    start=new Date(now);end=new Date(now);rangeLabel='Hoy';
  }else if(intelPeriod==='sem'){
    const day=now.getDay(),diff=(day===0?6:day-1);
    start=new Date(now);start.setDate(now.getDate()-diff);end=new Date(now);rangeLabel='Esta semana';
  }else if(intelPeriod==='mes'){
    start=new Date(now.getFullYear(),now.getMonth(),1);end=new Date(now);rangeLabel=MONF[now.getMonth()]+' '+now.getFullYear();
  }else if(intelPeriod==='ano'){
    start=new Date(now.getFullYear(),0,1);end=new Date(now);rangeLabel=String(now.getFullYear());
  }else{
    start=new Date((document.getElementById('vDesde').value||todayKey)+'T00:00:00');
    end=new Date((document.getElementById('vHasta').value||todayKey)+'T00:00:00');
    if(end<start){const t=start;start=end;end=t;}
    rangeLabel=`${start.getDate()} ${MON[start.getMonth()]} – ${end.getDate()} ${MON[end.getMonth()]}`;
  }
  const startKey=ymd(start),endKey=ymd(end);
  const bf=bucketsFor(start,end),buckets=bf.buckets,gran=bf.gran;
  const lenMs=end-start,prevEnd=new Date(start.getTime()-86400000),prevStart=new Date(prevEnd.getTime()-lenMs);
  const cur=atendidasEntre(startKey,endKey);
  const prev=atendidasEntre(ymd(prevStart),ymd(prevEnd));
  document.getElementById('intelRange').textContent=rangeLabel;

  const ingresos=cur.reduce((s,c)=>s+Number(c.precio||0),0),cobrado=cur.reduce((s,c)=>s+montoCita(c),0),porCobrar=cur.reduce((s,c)=>s+deudaCita(c),0);
  const nCitas=cur.length,ticket=nCitas?Math.round(ingresos/nCitas):0;
  const prevIng=sumP(prev);
  let delta=null;if(prevIng>0)delta=Math.round(((ingresos-prevIng)/prevIng)*100);

  const svcMap={};cur.forEach(c=>{citaItems(c).forEach(it=>{const k=it.id||it.n;if(!svcMap[k])svcMap[k]={n:it.n||'Servicio',count:0,rev:0};svcMap[k].count++;svcMap[k].rev+=Number(it.p||0);});});
  const topSvc=Object.values(svcMap).sort((a,b)=>b.rev-a.rev);
  const dowTally=[0,0,0,0,0,0,0];cur.forEach(c=>{dowTally[new Date(c.fecha+'T00:00:00').getDay()]++});
  const maxDow=Math.max(...dowTally);const busyDay=maxDow>0?DOW[dowTally.indexOf(maxDow)]:null;
  const clientasRango=[...new Set(cur.map(c=>c.clientaId))];
  let nuevas=0;clientasRango.forEach(id=>{const first=DB.citas.filter(c=>c.clientaId===id&&c.estado==='atendida').map(c=>c.fecha).sort()[0];if(first&&first>=startKey&&first<=endKey)nuevas++;});
  const recurrentes=clientasRango.length-nuevas;

  // ===== POR RAMA (uñas vs skin care) =====
  const rama={nails:{rev:0,n:0},skin:{rev:0,n:0},otro:{rev:0,n:0}};
  cur.forEach(c=>{citaItems(c).forEach(it=>{const s=svcById(it.id);const cat=it.cat||(s?s.cat:'nails')||'nails';rama[cat]=rama[cat]||{rev:0,n:0};rama[cat].rev+=Number(it.p||0);rama[cat].n++;});});
  const hasSkin=DB.servicios.some(s=>s.cat==='skin')||rama.skin.n>0;
  // Retención: de las clientas atendidas en el periodo anterior, ¿qué % volvió en este?
  const prevIds=new Set(prev.map(c=>c.clientaId)),curIds=new Set(cur.map(c=>c.clientaId));
  let volvieron=0;prevIds.forEach(id=>{if(curIds.has(id))volvieron++;});
  const retencion=prevIds.size?Math.round(volvieron/prevIds.size*100):null;
  // Recompra: % de las clientas del periodo que ya habían venido antes
  const recompra=clientasRango.length?Math.round(recurrentes/clientasRango.length*100):null;
  // Venta cruzada: clientas de uñas con 2+ visitas que nunca han tomado un facial
  const crossSell=hasSkin?DB.clientas.filter(cl=>{const cs=DB.citas.filter(c=>c.clientaId===cl.id&&c.estado==='atendida');return cs.length>=2&&!cs.some(c=>citaCats(c).includes('skin'));}):[];

  // ===== TENDENCIAS vs periodo anterior =====
  const prevNCitas=prev.length;
  const prevTicket=prevNCitas?Math.round(sumP(prev)/prevNCitas):0;
  // clientas nuevas del periodo anterior
  const prevClientas=[...new Set(prev.map(c=>c.clientaId))];
  let prevNuevas=0;prevClientas.forEach(id=>{const first=DB.citas.filter(c=>c.clientaId===id&&c.estado==='atendida').map(c=>c.fecha).sort()[0];if(first&&first>=ymd(prevStart)&&first<=ymd(prevEnd))prevNuevas++;});
  function pctChange(now,before){if(before<=0)return null;return Math.round(((now-before)/before)*100);}
  const dCitas=pctChange(nCitas,prevNCitas);
  const dTicket=pctChange(ticket,prevTicket);
  const dNuevas=pctChange(nuevas,prevNuevas);
  function trendChip(label,now,before,delta,fmtV){
    const v=fmtV?fmtV(now):now;
    let ic='',cls='tr-flat',txt='igual';
    if(delta!==null){
      if(delta>0){ic=icon('arrowUp');cls='tr-up';txt='+'+delta+'%';}
      else if(delta<0){ic=icon('arrowDown');cls='tr-down';txt=delta+'%';}
    }else if(before===0&&now>0){ic=icon('arrowUp');cls='tr-up';txt='nuevo';}
    return `<div class="trend"><div class="tr-lbl">${label}</div><div class="tr-val">${v}</div><div class="tr-delta ${cls}">${ic}${txt}</div></div>`;
  }
  const periodoPrevLabel={dia:'ayer',sem:'la semana pasada',mes:'el mes pasado',ano:'el año pasado'}[intelPeriod]||'el periodo anterior';

  // ===== SUGERENCIAS basadas en datos (icono + texto) =====
  const tips=[];
  if(nCitas>0){
    if(dCitas!==null&&dCitas<=-15)tips.push(['trendDown',`Tus citas bajaron <b>${Math.abs(dCitas)}%</b> frente a ${periodoPrevLabel}. Buen momento para una promo o un mensaje a clientas que no han vuelto.`]);
    else if(dCitas!==null&&dCitas>=15)tips.push(['trendUp',`Tus citas subieron <b>${dCitas}%</b> frente a ${periodoPrevLabel}. Asegura esos horarios pico con anticipación.`]);
    if(dTicket!==null&&dTicket<=-10)tips.push(['money',`Tu ticket promedio bajó <b>${Math.abs(dTicket)}%</b>. Ofrecer un servicio adicional (diseño, retiro) al agendar puede subirlo.`]);
    if(busyDay&&maxDow>0&&intelPeriod!=='dia')tips.push(['cal',`El <b>${busyDay}</b> es tu día más fuerte. Si quieres llenar días flojos, una promo entre semana puede ayudar.`]);
    if(nuevas>0&&recurrentes>0&&recurrentes<nuevas)tips.push(['repeat',`Tuviste más clientas nuevas que recurrentes. La tarjeta de lealtad o un recordatorio de «ya toca tu mantenimiento» ayuda a que regresen.`]);
    if(porCobrar>0)tips.push(['alert',`Tienes <b>${fmtMoney(porCobrar)}</b> por cobrar. En Citas, el botón «Cobrar» o las acciones de la cita mandan el recordatorio por WhatsApp.`]);
    if(crossSell.length)tips.push(['skin',`<b>${crossSell.length} clienta${crossSell.length!==1?'s':''} de uñas</b> con 2+ visitas nunca ${crossSell.length!==1?'han':'ha'} probado un facial (${crossSell.slice(0,3).map(c=>esc(c.nombre.split(' ')[0])).join(', ')}${crossSell.length>3?'…':''}). Un LED de cortesía tras su próxima cita suele convertir.`]);
    if(!tips.length)tips.push(['checkCircle',`Todo se ve estable. Sigue registrando tus citas para detectar patrones con más datos.`]);
  }

  let frase=[];
  if(nCitas===0){frase.push('Aún no hay servicios atendidos en este periodo. En cuanto marques una cita como <b>atendida</b>, verás todo aquí.');}
  else{
    frase.push(`Llevas <b>${nCitas} servicio${nCitas!==1?'s':''}</b> por <b>${fmtMoney(ingresos)}</b>${delta!==null?` — ${delta>=0?delta+'% más':Math.abs(delta)+'% menos'} que ${periodoPrevLabel}`:''}.`);
    if(topSvc[0])frase.push(`Tu servicio estrella es <b>${esc(topSvc[0].n)}</b> (${topSvc[0].count} ${topSvc[0].count!==1?'veces':'vez'}).`);
    if(busyDay&&intelPeriod!=='dia')frase.push(`Tu día más fuerte es el <b>${busyDay}</b>.`);
    if(porCobrar>0)frase.push(`Tienes <b>${fmtMoney(porCobrar)}</b> por cobrar.`);
  }

  const maxBar=Math.max(...buckets.map(b=>sumP(atendidasEntre(b.from,b.to))),1);
  const barsHtml=buckets.map(b=>{const v=sumP(atendidasEntre(b.from,b.to));const h=Math.round((v/maxBar)*100);
    return `<div class="bar-col"><div class="bar-val">${v?('$'+(v>=1000?(v/1000).toFixed(1)+'k':v)):''}</div><div class="bar-track"><div class="bar-fill ${v?'':'zero'}" style="height:${v?Math.max(h,4):4}%"></div></div><div class="bar-lbl">${b.label}</div></div>`;
  }).join('');
  const ramaTot=rama.nails.rev+rama.skin.rev+(rama.otro?rama.otro.rev:0);

  document.getElementById('intelBody').innerHTML=`
    <div class="insight"><div class="ih">${icon('sparkle')}Resumen</div><p>${frase.join(' ')}</p></div>
    ${nCitas>0?`<div class="divider"><span>Frente a ${periodoPrevLabel}</span></div>
    <div class="trends">
      ${trendChip('Citas',nCitas,prevNCitas,dCitas)}
      ${trendChip('Ingresos',ingresos,prevIng,delta,fmtMoney)}
      ${trendChip('Ticket prom.',ticket,prevTicket,dTicket,fmtMoney)}
      ${trendChip('Clientas nuevas',nuevas,prevNuevas,dNuevas)}
    </div>`:''}
    ${tips.length?`<div class="divider"><span>Sugerencias</span></div>
    <div class="tips">${tips.map(t=>`<div class="tip">${icon(t[0])}<p>${t[1]}</p></div>`).join('')}</div>`:''}
    <div class="kpis">
      <div class="kpi"><div class="l">Cobrado</div><div class="v v-ok">${fmtMoney(cobrado)}</div></div>
      <div class="kpi"><div class="l">Por cobrar</div><div class="v ${porCobrar?'v-bad':''}">${fmtMoney(porCobrar)}</div></div>
      <div class="kpi"><div class="l">Servicios</div><div class="v">${nCitas}</div></div>
      <div class="kpi"><div class="l">Ticket promedio</div><div class="v">${fmtMoney(ticket)}</div></div>
    </div>
    <div class="chartcard"><div class="ct">Ingresos por ${gran}</div><div class="bars" role="img" aria-label="Ingresos por ${gran}">${barsHtml}</div></div>
    ${hasSkin?`<div class="chartcard rama-intel"><div class="ct">Por rama</div>${['nails','skin'].map(cat=>ramaRow(cat,{v:rama[cat].rev,n:rama[cat].n},ramaTot)).join('')}</div>`:''}
    <div class="kpis">
      <div class="kpi"><div class="l">Clientas nuevas</div><div class="v">${nuevas}</div></div>
      <div class="kpi"><div class="l">Recurrentes</div><div class="v">${recurrentes}</div></div>
      <div class="kpi"><div class="l">Retención</div><div class="v">${retencion===null?'—':retencion+'%'}</div><div class="kpi-sub">${retencion===null?'Sin datos del periodo anterior':'Clientas del periodo anterior que volvieron'}</div></div>
      <div class="kpi"><div class="l">Recompra</div><div class="v">${recompra===null?'—':recompra+'%'}</div><div class="kpi-sub">Ya habían venido antes</div></div>
    </div>
    <div class="divider"><span>Servicios más vendidos</span></div>
    ${topSvc.length?topSvc.slice(0,5).map((s,i)=>`<div class="rank"><div class="num">${i+1}</div><div class="rn">${esc(s.n)}</div><div class="rc"><div class="a">${fmtMoney(s.rev)}</div><div class="b">${s.count} ${s.count!==1?'veces':'vez'}</div></div></div>`).join(''):'<p class="empty-mini">Sin datos todavía.</p>'}
  `;
}
