/* ---------------- APPOINTMENT SHEET ---------------- */
let curEstado='agendada',curPago='pagado',editingId=null,curColor='rosa',curMetodo='efectivo';
function renderColorChips(){
  document.getElementById('colorChips').innerHTML=PAL_ORDER.map(k=>`<div class="swatch ${k===curColor?'sel':''}" data-c="${k}" style="background:${PALETTE[k].br}"></div>`).join('');
}
function setColor(k){curColor=k;renderColorChips();}
document.getElementById('colorChips').addEventListener('click',e=>{if(e.target.dataset.c)setColor(e.target.dataset.c)});
let selectedSvcIds=[];
let svcChosenPrice={}; // id -> precio elegido (para servicios con precios variables)
function renderSvcPicker(){
  const cont=document.getElementById('apptSvcPicker');
  cont.innerHTML=DB.servicios.map(s=>{
    const sel=selectedSvcIds.includes(s.id);
    const hasVar=s.precios&&s.precios.length>1;
    const shownPrice=sel&&svcChosenPrice[s.id]!=null?svcChosenPrice[s.id]:s.p;
    let priceLabel=fmtMoney(shownPrice);
    if(hasVar&&!sel)priceLabel=`${fmtMoney(Math.min(...s.precios))}+`;
    // si está seleccionado y tiene precios variables, muestra chips para elegir
    let varChips='';
    if(sel&&hasVar){
      varChips=`<div class="svc-var">${s.precios.map(pr=>`<span class="svc-var-chip ${svcChosenPrice[s.id]===pr?'on':''}" data-svc="${s.id}" data-pr="${pr}">${fmtMoney(pr)}</span>`).join('')}</div>`;
    }
    const cat=CATS[s.cat]||CATS.nails;
    const meta=`${fmtDur(s.dur||60)} · ${RECURSOS[s.recurso||'mesa']}${s.limpieza?` +${s.limpieza} limpieza`:''}`;
    return `<div class="svc-opt ${sel?'sel':''} ${s.cat==='skin'?'skin':''}" data-id="${s.id}"><div class="svc-opt-row"><div class="chk">${sel?'✓':''}</div><div class="on">${esc(s.n)}<div class="om">${meta}</div></div><div class="op">${priceLabel}</div></div>${varChips}</div>`;
  }).join('');
  const total=selectedSvcIds.reduce((t,id)=>{const s=DB.servicios.find(x=>x.id===id);if(!s)return t;const pr=(svcChosenPrice[id]!=null)?svcChosenPrice[id]:Number(s.p||0);return t+pr;},0);
  document.getElementById('svcCount').textContent=selectedSvcIds.length?`· ${selectedSvcIds.length} · ${fmtMoney(total)}`:'';
  renderApptSeq();
  renderApptSkinHint();
  return total;
}
/* si la cita lleva skin care: resume el expediente de piel y los requisitos del servicio */
function renderApptSkinHint(){
  const el=document.getElementById('apptSkin');if(!el)return;
  const items=selectedItems();const skin=items.filter(i=>i.cat==='skin');
  if(!skin.length){el.innerHTML='';return;}
  const reqs=skin.map(i=>svcById(i.id)).filter(s=>s&&s.requisitos).map(s=>`<b>${esc(s.n)}</b>: ${esc(s.requisitos)}`);
  const cliId=apptSelectedCliId;
  const exp=cliId?DB.expedientes.find(x=>x.clientaId===cliId):null;
  const filled=exp&&(exp.tipo||exp.alergias||exp.contra||exp.fototipo);
  let body,warn=false;
  if(!cliId){body='Elige la clienta para revisar su expediente de piel.';}
  else if(!filled){body='<b>Sin expediente de piel.</b> Antes del primer facial, llena tipo de piel, alergias y contraindicaciones en su ficha.';warn=true;}
  else{
    const parts=[];
    if(exp.tipo)parts.push(`Piel ${exp.tipo.toLowerCase()}${exp.fototipo?` · fototipo ${exp.fototipo}`:''}`);
    if(exp.alergias){parts.push(`<b>Alergias:</b> ${esc(exp.alergias)}`);warn=true;}
    if(exp.contra){parts.push(`<b>Contraindicaciones:</b> ${esc(exp.contra)}`);warn=true;}
    body=parts.join(' · ');
  }
  el.innerHTML=`<div class="skin-hint ${warn?'warn':''}"><div>${body}</div>${reqs.length?`<div class="skin-req">Requisitos · ${reqs.join(' · ')}</div>`:''}</div>`;
}
/* servicios seleccionados → items de la cita con duración y recurso */
function selectedItems(){
  return selectedSvcIds.map(id=>{const s=svcById(id);if(!s)return null;const pr=(svcChosenPrice[id]!=null)?Number(svcChosenPrice[id]):Number(s.p||0);return {id:s.id,n:s.n,p:pr,d:Number(s.dur||60),r:s.recurso||'mesa',l:Number(s.limpieza||0),cat:s.cat||'nails'};}).filter(Boolean);
}
function selectedDur(){return selectedItems().reduce((t,i)=>t+i.d,0)}
function renderApptSeq(){
  const el=document.getElementById('apptSeq');if(!el)return;
  const items=selectedItems();
  if(items.length<1){el.innerHTML='';return;}
  const total=items.reduce((t,i)=>t+i.d,0);
  const time=document.getElementById('apptTime').value;const s0=time?toMin(time):null;
  let cur=s0;
  const segs=items.map(i=>{const seg={i,s:cur};if(cur!=null)cur+=i.d;return seg;});
  const bar=items.map(i=>`<div class="seq-seg ${i.cat==='skin'?'skin':''}" style="flex:${i.d}">${s0!=null&&items.length>1?minLabel(segs.find(x=>x.i===i).s)+' · ':''}${esc(i.n.split(' ')[0])}${i.n.includes(' ')?'…':''}</div>${i.l&&i.r==='cabina'?`<div class="seq-clean" style="flex:${i.l}" title="limpieza de cabina"></div>`:''}`).join('');
  const recs=[...new Set(items.map(i=>RECURSOS[i.r]||i.r))].join(' → ');
  el.innerHTML=`<div class="seq-bar">${bar}</div><div class="seq-lbl">Duración sugerida <b>${fmtDur(total)}</b>${s0!=null?` · termina ${minLabel(s0+total)}`:''} · ${recs}</div>`;
}
function syncApptDur(){const d=selectedDur();if(d>0)setApptDur(d);}
function toggleSvc(id){
  const i=selectedSvcIds.indexOf(id);
  if(i>=0){selectedSvcIds.splice(i,1);delete svcChosenPrice[id];}
  else{
    selectedSvcIds.push(id);
    const s=DB.servicios.find(x=>x.id===id);
    // precio por defecto: si tiene variables, el primero; si no, su precio
    if(s&&s.precios&&s.precios.length)svcChosenPrice[id]=s.precios[0];
    else if(s)svcChosenPrice[id]=Number(s.p||0);
  }
  syncApptDur();
  const total=renderSvcPicker();
  document.getElementById('apptPrice').value=total||'';
}
function chooseSvcPrice(id,pr){
  svcChosenPrice[id]=Number(pr);
  const total=renderSvcPicker();
  document.getElementById('apptPrice').value=total||'';
}
document.getElementById('apptSvcPicker').addEventListener('click',e=>{
  const chip=e.target.closest('.svc-var-chip');
  if(chip){e.stopPropagation();chooseSvcPrice(chip.dataset.svc,chip.dataset.pr);return;}
  const o=e.target.closest('.svc-opt');if(o)toggleSvc(o.dataset.id);
});
let apptSelectedCliId=null,cliCreateReturnToAppt=false;
function onApptCliInput(){
  apptSelectedCliId=null;
  const q=document.getElementById('apptCli').value.trim();
  const box=document.getElementById('apptCliResults');
  if(!q){box.innerHTML='';return;}
  const matches=DB.clientas.filter(c=>matchCli(c,q)).slice(0,6);
  let html=matches.map(c=>`<div class="cli-res" data-on-click="pickApptCli('${c.id}')"><div class="ra">${c.nombre[0].toUpperCase()}</div><div class="rb"><div class="rn">${c.nombre}</div><div class="rd">${cliNumLabel(c.num)}${c.telefono?' · '+c.telefono:''}${c.email?' · '+c.email:''}</div></div></div>`).join('');
  if(!matches.some(c=>normTxt(c.nombre)===normTxt(q)))html+=`<div class="cli-res-new" data-on-click="addCliFromAppt()">+ Agregar cliente nuevo: “${q}”</div>`;
  box.innerHTML=html;
}
function pickApptCli(id){
  const c=DB.clientas.find(x=>x.id===id);if(!c)return;
  apptSelectedCliId=id;
  document.getElementById('apptCli').value=c.nombre;
  document.getElementById('apptCliResults').innerHTML='';
  renderApptCortesias();
  renderApptSkinHint();
}

/* schedule assistant */
const AS_START=8,AS_END=21; // ventana del día
/* intervalos ocupados del día, por recurso; e incluye la limpieza (bloqueo del recurso) */
function busyIntervals(key,excludeId){
  const out=[];
  DB.citas.filter(c=>c.fecha===key&&c.estado!=='cancelada'&&c.hora&&c.id!==excludeId).forEach(c=>{
    citaSegments(c).forEach(sg=>out.push({s:sg.s,e:sg.e+(sg.l||0),svcEnd:sg.e,r:sg.r,cat:sg.cat,c}));
  });
  return out.sort((a,b)=>a.s-b.s);
}
/* segmentos que ocuparía la cita que se está capturando, empezando en t */
function proposedSegments(t,dur){
  const items=selectedItems();
  if(!items.length)return [{r:'mesa',s:t,e:t+dur,l:0}];
  let cur=t;return items.map(i=>{const sg={r:i.r,s:cur,e:cur+i.d,l:i.l,n:i.n};cur+=i.d;return sg;});
}
function segsClash(props,busy){
  for(const p of props){if(p.r==='ninguno')continue;for(const b of busy){if(b.r!==p.r||b.r==='ninguno')continue;if(p.s<b.e&&(p.e+(p.l||0))>b.s)return {p,b};}}
  return null;
}
function onApptDateChange(){
  const date=document.getElementById('apptDate').value;
  if(date){agAnchor=new Date(date+'T00:00:00');selectedDate=date;if(currentView==='agenda')renderAgenda();}
  renderAssist();
}
function renderAssist(){
  renderApptWeather();
  const el=document.getElementById('assist');
  const date=document.getElementById('apptDate').value;
  if(!date){el.innerHTML='';return;}
  const busy=busyIntervals(date,editingId);
  const winS=AS_START*60,winE=AS_END*60,winLen=winE-winS;
  const dur=getApptDur()||60;
  const time=document.getElementById('apptTime').value;
  const propS=time?toMin(time):null,propE=propS!=null?propS+dur:null;
  renderApptSeq();
  // conflict check: por recurso (mesa vs cabina), contando la limpieza de cabina
  let conflict=null,clash=null;
  if(propS!=null){clash=segsClash(proposedSegments(propS,dur),busy);if(clash)conflict=clash.b;}
  // free minutes within window
  let freeMin=winLen;busy.forEach(b=>{freeMin-=Math.max(0,Math.min(b.e,winE)-Math.max(b.s,winS));});
  freeMin=Math.max(0,freeMin);
  // suggestions: scan 30-min steps for slots that fit dur
  const sug=[];
  for(let t=winS;t+dur<=winE&&sug.length<4;t+=30){
    if(!segsClash(proposedSegments(t,dur),busy))sug.push(t);
  }
  // status
  let cls,icon,msg;
  if(propS!=null&&conflict){
    cls='as-conflict';icon='⚠️';
    const cli=DB.clientas.find(x=>x.id===conflict.c.clientaId);
    const enLimpieza=clash&&clash.p.s>=conflict.svcEnd;
    const rec=RECURSOS[conflict.r]||'el espacio';
    msg=enLimpieza
      ?`La <b>${rec.toLowerCase()}</b> está en limpieza hasta las <b>${minLabel(conflict.e)}</b> (después de ${cli?cli.nombre:'otra cita'}). ${sug.length?'Elige un hueco abajo.':''}`
      :`La <b>${rec.toLowerCase()}</b> se encima con <b>${cli?cli.nombre:'otra cita'}</b> (${minLabel(conflict.s)}–${minLabel(conflict.e)}). ${sug.length?'Mira los espacios libres abajo.':'Ese día está lleno.'}`;
  }else if(propS!=null){
    cls='as-free';icon='✨';msg=`Perfecto, hay espacio a las <b>${minLabel(propS)}</b>.`;
  }else if(busy.length===0){
    cls='as-free';icon='🌿';msg='Día libre — cualquier horario funciona.';
  }else if(freeMin<dur){
    cls='as-conflict';icon='⛔';msg='Día lleno, no cabe este servicio.';
  }else if(freeMin< (winLen*0.35)){
    cls='as-tight';icon='⏳';msg=`Día apretado — quedan ~${Math.round(freeMin/60)} h libres. Elige un hueco:`;
  }else{
    cls='as-free';icon='🌿';msg=`Hay buen espacio (~${Math.round(freeMin/60)} h libres). Elige un hueco:`;
  }
  // timeline blocks
  const usedR=new Set(proposedSegments(winS,dur).map(x=>x.r));
  const busyHtml=busy.filter(b=>usedR.has(b.r)||b.r==='ninguno').map(b=>{const l=Math.max(0,(b.s-winS)/winLen*100),w=Math.min(100,(Math.min(b.e,winE)-Math.max(b.s,winS))/winLen*100);return `<div class="tl-busy ${b.r==='cabina'?'cab':''}" style="left:${l}%;width:${w}%"></div>`}).join('');
  let propHtml='';
  if(propS!=null){const l=Math.max(0,(propS-winS)/winLen*100),w=Math.min(100-l,(dur)/winLen*100);propHtml=`<div class="tl-prop ${conflict?'bad':''}" style="left:${l}%;width:${w}%"></div>`;}
  const ticks=[];for(let h=AS_START;h<=AS_END;h+=3){const ap=h>=12?'p':'a';ticks.push(`${(h%12||12)}${ap}`);}
  const sugHtml=sug.length?`<div class="assist-sug">${sug.map(t=>`<div class="sug-chip" data-on-click="pickSlot(${t})">${minLabel(t)}</div>`).join('')}</div>`:'';
  el.innerHTML=`<div class="assist-lbl">Asistente de agenda · ${(()=>{const d=new Date(date+'T00:00:00');return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]})()}</div>
    <div class="assist-status ${cls}"><span class="si">${icon}</span><span>${msg}</span></div>
    <div class="assist-timeline">${busyHtml}${propHtml}</div>
    <div class="tl-ticks">${ticks.map(t=>`<span>${t}</span>`).join('')}</div>
    ${sugHtml}`;
}
function pickSlot(t){
  const h=Math.floor(t/60),m=t%60;
  document.getElementById('apptTime').value=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  renderAssist();
}
function setEstado(e){
  curEstado=e;
  document.querySelectorAll('#estadoChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.e===e));
  const atendida=e==='atendida';
  document.getElementById('pagosWrap').style.display=atendida?'block':'none';
  document.getElementById('compWrap').style.display=atendida?'block':'none';
  if(atendida){updateDescInfo();renderPagos();}
}
/* ====== Pagos múltiples ====== */
const METODOS=[['efectivo','Efectivo'],['transferencia','Transfer.'],['tarjeta','Tarjeta'],['cupon','Cupón'],['otro','Otro']];
let curPagos=[]; // [{monto, metodo}]
let curDescuento=0; // monto de descuento
function precioBase(){return Number(document.getElementById('apptPrice').value)||0;}
function totalACobrar(){return Math.max(0,precioBase()-curDescuento);}
function onDescMonto(){
  let d=Number(document.getElementById('apptDescMonto').value)||0;
  const base=precioBase();
  if(d<0)d=0;if(d>base)d=base;
  curDescuento=d;
  // sincroniza el %
  const pctEl=document.getElementById('apptDescPct');
  pctEl.value=(base>0&&d>0)?Math.round(d/base*100):'';
  updateDescInfo();updatePagosResumen();
}
function onDescPct(){
  let pct=Number(document.getElementById('apptDescPct').value)||0;
  const base=precioBase();
  if(pct<0)pct=0;if(pct>100)pct=100;
  curDescuento=Math.round(base*pct/100);
  document.getElementById('apptDescMonto').value=curDescuento>0?curDescuento:'';
  updateDescInfo();updatePagosResumen();
}
function updateDescInfo(){
  const el=document.getElementById('descInfo');if(!el)return;
  const base=precioBase();
  if(curDescuento<=0||base<=0){el.innerHTML='';return;}
  el.innerHTML=`<span class="strike">${fmtMoney(base)}</span> Total a cobrar: <b>${fmtMoney(totalACobrar())}</b>`;
}
function renderPagos(){
  const cont=document.getElementById('pagosList');if(!cont)return;
  cont.innerHTML=curPagos.map((p,i)=>`
    <div class="pago-item">
      <input type="number" class="pago-monto" inputmode="numeric" placeholder="0" value="${p.monto||''}" data-on-input="setPagoMonto(${i},this.value)">
      <select class="pago-metodo" data-on-change="setPagoMetodo(${i},this.value)">
        ${METODOS.map(m=>`<option value="${m[0]}" ${p.metodo===m[0]?'selected':''}>${m[1]}</option>`).join('')}
      </select>
      <button type="button" class="pago-del" data-on-click="delPago(${i})">✕</button>
    </div>`).join('');
  updatePagosResumen();
}
function addPago(){
  const pagado=curPagos.reduce((s,p)=>s+(Number(p.monto)||0),0);
  const resto=Math.max(0,totalACobrar()-pagado);
  curPagos.push({monto:resto||'',metodo:'efectivo'});
  renderPagos();
}
function delPago(i){curPagos.splice(i,1);renderPagos();}
function setPagoMonto(i,v){if(curPagos[i])curPagos[i].monto=Number(v)||0;updatePagosResumen();}
function setPagoMetodo(i,v){if(curPagos[i])curPagos[i].metodo=v;}
function updatePagosResumen(){
  const el=document.getElementById('pagosResumen');if(!el)return;
  const total=totalACobrar();
  const pagado=curPagos.reduce((s,p)=>s+(Number(p.monto)||0),0);
  const pend=total-pagado;
  let estado,color;
  if(pagado<=0){estado='Sin pago';color='var(--red)';}
  else if(pend>0){estado='Parcial · debe '+fmtMoney(pend);color='#8a6a1e';}
  else if(pend<0){estado='Cobró '+fmtMoney(Math.abs(pend))+' de más';color='var(--red)';}
  else {estado='Pagado completo';color='var(--green)';}
  el.innerHTML=`<div class="pr-line"><span>Total a cobrar</span><b>${fmtMoney(total)}</b></div>
    <div class="pr-line"><span>Cobrado</span><b style="color:var(--green)">${fmtMoney(pagado)}</b></div>
    <div class="pr-estado" style="color:${color}">${estado}</div>`;
}
function pagosSummary(c){
  const base=Number(c.precio||0);
  const desc=Number(c.descMonto||0);
  const total=Math.max(0,base-desc);
  if(Array.isArray(c.pagos)&&c.pagos.length){
    const cobrado=c.pagos.reduce((s,p)=>s+(Number(p.monto)||0),0);
    return {cobrado,deuda:Math.max(0,total-cobrado),estado:(cobrado<=0?'deuda':(cobrado<total?'parcial':'pagado'))};
  }
  // compatibilidad con citas viejas
  if(c.pago==='parcial'){const ab=Number(c.abonado||0);return {cobrado:ab,deuda:Math.max(0,base-ab),estado:'parcial'};}
  if(c.pago==='deuda')return {cobrado:0,deuda:base,estado:'deuda'};
  const cob=(c.cobrado!=null&&!isNaN(c.cobrado))?Number(c.cobrado):base;
  return {cobrado:cob,deuda:0,estado:'pagado'};
}
let curComp='';
function renderCompPreview(){
  const el=document.getElementById('compPreview');
  if(!curComp){el.innerHTML='';return;}
  if(curComp.startsWith('data:')){
    el.innerHTML=`<img src="${curComp}"><span class="rm" data-on-click="removeComp()">Quitar comprobante</span>`;
  }else{
    el.innerHTML=`<span class="comp-link" data-on-click="viewCompRaw('${curComp}')">📎 Ver comprobante actual</span> <span class="rm" data-on-click="removeComp()">Quitar</span>`;
  }
}
async function viewCompRaw(path){
  let url=path;
  if(!path.startsWith('http')){try{const {data}=await sb.storage.from('comprobantes').createSignedUrl(path,3600);url=data.signedUrl;}catch(e){console.error(e);}}
  const w=window.open();if(w)w.document.write('<img src="'+url+'" style="max-width:100%">');
}
function removeComp(){curComp='';renderCompPreview();}
function onCompFile(e){
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const max=1000,sc=Math.min(1,max/Math.max(img.width,img.height));
      const cv=document.createElement('canvas');cv.width=img.width*sc;cv.height=img.height*sc;
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      curComp=cv.toDataURL('image/jpeg',0.7);renderCompPreview();
    };
    img.src=ev.target.result;
  };
  rd.readAsDataURL(f);
  e.target.value='';
}
document.getElementById('estadoChips').addEventListener('click',e=>{if(e.target.dataset.e)setEstado(e.target.dataset.e)});

function openApptSheet(){
  editingId=null;
  document.getElementById('apptSheetTitle').textContent='Nueva cita';
  document.getElementById('apptDelBtn').style.display='none';
  document.getElementById('apptCodeBar').style.display='none';
  document.getElementById('apptCli').value='';
  selectedSvcIds=[];svcChosenPrice={};renderSvcPicker();
  apptCortesiaId=null;
  apptSelectedCliId=null;document.getElementById('apptCliResults').innerHTML='';
  document.getElementById('apptDate').value=selectedDate;
  document.getElementById('apptTime').value='';
  setApptDur(60);
  document.getElementById('apptPrice').value='';
  document.getElementById('apptNotes').value='';
  curColor='rosa';renderColorChips();
  curComp='';renderCompPreview();
  curPagos=[];curDescuento=0;
  document.getElementById('apptDescMonto').value='';
  document.getElementById('apptDescPct').value='';
  setEstado('agendada');
  renderAssist();
  showSheet('apptSheet');
}
function editAppt(id){
  const c=DB.citas.find(x=>x.id===id);if(!c)return;
  editingId=id;
  document.getElementById('apptSheetTitle').textContent='Editar cita';
  document.getElementById('apptDelBtn').style.display='block';
  const bar=document.getElementById('apptCodeBar');
  if(c.codigo){document.getElementById('apptCodeVal').textContent=c.codigo;bar.style.display='block';}
  else bar.style.display='none';
  selectedSvcIds=citaItems(c).map(i=>i.id).filter(Boolean);
  svcChosenPrice={};citaItems(c).forEach(i=>{if(i.id)svcChosenPrice[i.id]=Number(i.p||0);});
  renderSvcPicker();
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  document.getElementById('apptCli').value=cli?cli.nombre:'';
  apptSelectedCliId=c.clientaId||null;document.getElementById('apptCliResults').innerHTML='';
  apptCortesiaId=c.cortesiaId||null;renderApptCortesias();
  document.getElementById('apptDate').value=c.fecha;
  document.getElementById('apptTime').value=c.hora||'';
  setApptDur(c.dur||60);
  document.getElementById('apptPrice').value=c.precio||'';
  document.getElementById('apptNotes').value=c.notas||'';
  curColor=c.color||'rosa';renderColorChips();
  curComp=c.comprobante||'';renderCompPreview();
  curDescuento=Number(c.descMonto||0);
  document.getElementById('apptDescMonto').value=curDescuento>0?curDescuento:'';
  document.getElementById('apptDescPct').value=(curDescuento>0&&c.precio>0)?Math.round(curDescuento/c.precio*100):'';
  // cargar pagos: si la cita ya tiene lista de pagos úsala; si no, migra los campos viejos
  if(Array.isArray(c.pagos)&&c.pagos.length){
    curPagos=c.pagos.map(p=>({monto:Number(p.monto)||0,metodo:p.metodo||'efectivo'}));
  }else if(c.estado==='atendida'){
    const sm=pagosSummary(c);
    curPagos=sm.cobrado>0?[{monto:sm.cobrado,metodo:c.metodo||'efectivo'}]:[];
  }else{
    curPagos=[];
  }
  setEstado(c.estado);
  renderAssist();
  showSheet('apptSheet');
}
