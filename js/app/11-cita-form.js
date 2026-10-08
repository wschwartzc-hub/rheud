/* ---------------- APPOINTMENT SHEET ---------------- */
let curEstado='agendada',curPago='pagado',editingId=null,curColor='rosa',curMetodo='efectivo';
// duración guardada de la cita que se edita: los selectores van de 15 en 15 y no
// deben redondear una duración que nadie tocó (p. ej. 50 min)
let apptDurCargada=null;
function duracionElegida(){const d=getApptDur()||60;return (apptDurCargada&&d===apptDurCargada.mostrada)?apptDurCargada.min:d}
function renderColorChips(){
  document.getElementById('colorChips').innerHTML=PAL_ORDER.map(k=>`<button type="button" class="swatch ${k===curColor?'sel':''}" data-c="${k}" aria-label="${PAL_NAME[k]}" aria-pressed="${k===curColor}" style="background:${PALETTE[k].br}"></button>`).join('');
}
function setColor(k){curColor=k;renderColorChips();const b=document.querySelector(`#colorChips [data-c="${k}"]`);if(b)b.focus();}
document.getElementById('colorChips').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(b)setColor(b.dataset.c)});
let selectedSvcIds=[];
let svcChosenPrice={}; // id -> precio elegido (para servicios con precios variables)
function renderSvcPicker(){
  const cont=document.getElementById('apptSvcPicker');
  // Agrupados por rama; si se abrió desde un hueco, primero la rama de ese recurso
  const pref=typeof apptRecursoPref!=='undefined'?apptRecursoPref:null;
  const ordenCat=pref==='cabina'?['skin','nails','otro']:['nails','skin','otro'];
  const grupos=ordenCat.map(k=>({k,svcs:DB.servicios.filter(s=>(s.cat==='skin'?'skin':s.cat==='otro'?'otro':'nails')===k)})).filter(g=>g.svcs.length);
  const opt=s=>{
    const sel=selectedSvcIds.includes(s.id);
    const hasVar=s.precios&&s.precios.length>1;
    const shownPrice=sel&&svcChosenPrice[s.id]!=null?svcChosenPrice[s.id]:s.p;
    let priceLabel=fmtMoney(shownPrice);
    if(hasVar&&!sel)priceLabel=`${fmtMoney(Math.min(...s.precios))}+`;
    // si está seleccionado y tiene precios variables, muestra chips para elegir
    let varChips='';
    if(sel&&hasVar){
      varChips=`<div class="svc-var" role="group" aria-label="Precio de ${esc(s.n)}">${s.precios.map(pr=>`<button type="button" class="svc-var-chip ${svcChosenPrice[s.id]===pr?'on':''}" aria-pressed="${svcChosenPrice[s.id]===pr}" data-svc="${esc(s.id)}" data-pr="${Number(pr)}">${fmtMoney(pr)}</button>`).join('')}</div>`;
    }
    const meta=`${fmtDur(s.dur||60)} · ${RECURSOS[s.recurso]||RECURSOS.mesa}${s.limpieza?` +${Number(s.limpieza)} limpieza`:''}`;
    return `<div class="svc-opt ${sel?'sel':''} ${s.cat==='skin'?'skin':''}" data-id="${esc(s.id)}"><button type="button" class="svc-opt-row" aria-pressed="${sel}"><span class="chk" aria-hidden="true">${sel?icon('check'):''}</span><span class="so-b"><span class="so-n">${esc(s.n)}</span><span class="om">${meta}</span></span><span class="op">${priceLabel}</span></button>${varChips}</div>`;
  };
  cont.innerHTML=grupos.map(g=>(grupos.length>1?`<div class="svc-grp ${g.k}">${ramaIcon(g.k)}${catLabel(g.k)}</div>`:'')+g.svcs.map(opt).join('')).join('');
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
    if(exp.tipo)parts.push(`Piel ${esc(exp.tipo.toLowerCase())}${exp.fototipo?` · fototipo ${esc(exp.fototipo)}`:''}`);
    if(exp.alergias){parts.push(`<b>Alergias:</b> ${esc(exp.alergias)}`);warn=true;}
    if(exp.contra){parts.push(`<b>Contraindicaciones:</b> ${esc(exp.contra)}`);warn=true;}
    body=parts.join(' · ');
  }
  el.innerHTML=`<div class="skin-hint ${warn?'warn':''}"><div>${body}</div>${reqs.length?`<div class="skin-req">Requisitos · ${reqs.join(' · ')}</div>`:''}</div>`;
}
/* servicios seleccionados → items de la cita con duración y recurso.
   Al editar, los servicios que ya estaban en la cita conservan el nombre, la
   duración y el recurso guardados (el menú pudo cambiar o el servicio borrarse). */
let apptPrevItems={}; // id → item tal como está guardado en la cita que se edita
function selectedItems(){
  return selectedSvcIds.map(id=>{
    const prev=apptPrevItems[id],s=svcById(id);
    const pr=(svcChosenPrice[id]!=null)?Number(svcChosenPrice[id]):(prev?Number(prev.p||0):Number(s&&s.p||0));
    if(prev)return {...prev,p:pr};
    if(!s)return null;
    return {id:s.id,n:s.n,p:pr,d:Number(s.dur||60),r:s.recurso||'mesa',l:Number(s.limpieza||0),cat:s.cat||'nails'};
  }).filter(Boolean);
}
function selectedDur(){return selectedItems().reduce((t,i)=>t+(Number(i.d)||0),0)}
function renderApptSeq(){
  const el=document.getElementById('apptSeq');if(!el)return;
  const items=selectedItems();
  if(items.length<1){el.innerHTML='';return;}
  const total=items.reduce((t,i)=>t+i.d,0);
  const time=document.getElementById('apptTime').value;const s0=time?toMin(time):null;
  let cur=s0;
  const segs=items.map(i=>{const seg={i,s:cur};if(cur!=null)cur+=i.d;return seg;});
  const bar=items.map(i=>`<div class="seq-seg ${i.cat==='skin'?'skin':''}" style="flex:${Number(i.d)||1}">${s0!=null&&items.length>1?hm(segs.find(x=>x.i===i).s)+' · ':''}${esc(i.n.split(' ')[0])}${i.n.includes(' ')?'…':''}</div>${i.l&&i.r==='cabina'?`<div class="seq-clean" style="flex:${Number(i.l)||1}" title="limpieza de cabina"></div>`:''}`).join('');
  const recs=[...new Set(items.map(i=>RECURSOS[i.r]||esc(i.r)))].join(' → ');
  el.innerHTML=`<div class="seq-bar" aria-hidden="true">${bar}</div><div class="seq-lbl">Duración sugerida <b>${fmtDur(total)}</b>${s0!=null?` · termina ${hm(s0+total)}`:''} · ${recs}</div>`;
}
function syncApptDur(){const d=selectedDur();if(d>0){setApptDur(d);apptDurCargada=null;}}
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
  if(chip){e.stopPropagation();chooseSvcPrice(chip.dataset.svc,chip.dataset.pr);refocusSvc(`.svc-var-chip[data-svc="${chip.dataset.svc}"][data-pr="${chip.dataset.pr}"]`);return;}
  const b=e.target.closest('.svc-opt-row');const o=b&&b.closest('.svc-opt');
  if(o){const id=o.dataset.id;toggleSvc(id);refocusSvc(`.svc-opt[data-id="${id}"] .svc-opt-row`);}
});
/* Tras volver a pintar la lista, el foco regresa al mismo botón */
function refocusSvc(sel){try{const el=document.querySelector('#apptSvcPicker '+sel);if(el)el.focus({preventScroll:true});}catch(_){}}
let apptSelectedCliId=null,cliCreateReturnToAppt=false;
function onApptCliInput(){
  apptSelectedCliId=null;
  const q=document.getElementById('apptCli').value.trim();
  const box=document.getElementById('apptCliResults');
  if(!q){box.innerHTML='';return;}
  const matches=DB.clientas.filter(c=>matchCli(c,q)).slice(0,6);
  let html=matches.map(c=>`<button type="button" class="cli-res" data-on-click="pickApptCli('${c.id}')"><span class="ra" aria-hidden="true">${esc(c.nombre[0].toUpperCase())}</span><span class="rb"><span class="rn">${esc(c.nombre)}</span><span class="rd">${cliNumLabel(c.num)}${c.telefono?' · '+esc(c.telefono):''}${c.email?' · '+esc(c.email):''}</span></span></button>`).join('');
  if(!matches.some(c=>normTxt(c.nombre)===normTxt(q)))html+=`<button type="button" class="cli-res-new" data-on-click="addCliFromAppt()">${icon('userPlus')}Agregar clienta nueva: «${esc(q)}»</button>`;
  box.innerHTML=html;
}
function pickApptCli(id){
  const c=DB.clientas.find(x=>x.id===id);if(!c)return;
  apptSelectedCliId=id;
  document.getElementById('apptCli').value=c.nombre;
  document.getElementById('apptCliResults').innerHTML='';
  renderApptCortesias();
  renderApptSkinHint();
  // la sugerencia elegida desaparece: el foco pasa al siguiente paso (servicios)
  const sig=document.querySelector('#apptSvcPicker .svc-opt-row');if(sig)sig.focus({preventScroll:true});
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
/* segmentos que ocuparía la cita que se está capturando, empezando en t y
   durando dur (la duración elegida manda, igual que en citaSegments) */
function proposedSegments(t,dur){return NUC.segmentos(t,selectedItems(),dur,svcById)}
function segsClash(props,busy){return NUC.segsClash(props,busy)}
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
  const dur=duracionElegida();
  const time=document.getElementById('apptTime').value;
  const propS=time?toMin(time):null,propE=propS!=null?propS+dur:null;
  renderApptSeq();
  // conflict check: por recurso (mesa vs cabina), contando la limpieza de cabina
  let conflict=null,clash=null;
  if(propS!=null){clash=segsClash(proposedSegments(propS,dur),busy);if(clash)conflict=clash.b;}
  // minutos libres por recurso (mesa y cabina trabajan en paralelo)
  const usados=[...new Set(proposedSegments(winS,dur).map(x=>x.r).filter(r=>r!=='ninguno'))];
  const recursos=usados.length?usados:['mesa'];
  // hoy solo cuenta lo que queda del día
  const hoyKey=ymd(new Date()),nowM=new Date().getHours()*60+new Date().getMinutes();
  const ini=date===hoyKey?Math.min(winE,Math.max(winS,nowM)):winS;
  const libres=NUC.libresPorRecurso(busy,ini,winE,recursos);
  const freeMin=Math.min(...recursos.map(r=>libres[r]));
  const NOM_R={mesa:'la mesa',cabina:'la cabina'};
  const libresTxt=recursos.map((r,i)=>`~${Math.round(libres[r]/60)} h ${i?'':'libres '}en ${NOM_R[r]||r}`).join(' · ');
  // horas sugeridas cada 30 min; hoy, solo desde ahora; días pasados, ninguna
  const sug=date<hoyKey?[]:NUC.huecos(busy,t=>proposedSegments(t,dur),winS,winE,dur,date===hoyKey?nowM:null,4);
  // status
  let cls,ic,msg;
  if(propS!=null&&conflict){
    cls='as-conflict';ic='alert';
    const cli=DB.clientas.find(x=>x.id===conflict.c.clientaId);
    const enLimpieza=clash&&clash.p.s>=conflict.svcEnd;
    const rec=RECURSOS[conflict.r]||'el espacio';
    const quien=esc(cli?cli.nombre:'otra cita');
    msg=enLimpieza
      ?`La <b>${rec.toLowerCase()}</b> está en limpieza hasta las <b>${hm(conflict.e)}</b> (después de ${quien}). ${sug.length?'Elige un hueco abajo.':''}`
      :`La <b>${rec.toLowerCase()}</b> se encima con <b>${quien}</b> (${hm(conflict.s)}–${hm(conflict.e)}). ${sug.length?'Mira los espacios libres abajo.':'Ese día está lleno.'}`;
  }else if(propS!=null){
    cls='as-free';ic='checkCircle';msg=`Hay espacio a las <b>${hm(propS)}</b>.`;
  }else if(date<hoyKey){
    cls='as-tight';ic='clock';msg='Ese día ya pasó. Escribe la hora en que fue la cita.';
  }else if(!sug.length){
    cls='as-conflict';ic='alert';msg=freeMin<dur?'Día lleno, no cabe este servicio.':'Ya no quedan horas libres para este servicio ese día.';
  }else if(busy.length===0){
    cls='as-free';ic='checkCircle';msg='Día libre: cualquier horario funciona.';
  }else if(freeMin<((winE-ini)*0.35)){
    cls='as-tight';ic='clock';msg=`Día apretado: ${libresTxt}. Elige un hueco:`;
  }else{
    cls='as-free';ic='clock';msg=`Hay buen espacio (${libresTxt}). Elige un hueco:`;
  }
  // timeline blocks
  const usedR=new Set(proposedSegments(winS,dur).map(x=>x.r));
  const busyHtml=busy.filter(b=>usedR.has(b.r)||b.r==='ninguno').map(b=>{const l=Math.max(0,(b.s-winS)/winLen*100),w=Math.min(100,(Math.min(b.e,winE)-Math.max(b.s,winS))/winLen*100);return `<div class="tl-busy ${b.r==='cabina'?'cab':''}" style="left:${l}%;width:${w}%"></div>`}).join('');
  let propHtml='';
  if(propS!=null){const l=Math.max(0,(propS-winS)/winLen*100),w=Math.min(100-l,(dur)/winLen*100);propHtml=`<div class="tl-prop ${conflict?'bad':''}" style="left:${l}%;width:${w}%"></div>`;}
  const ticks=[];for(let h=AS_START;h<=AS_END;h+=3)ticks.push(`${h}:00`);
  const sugHtml=sug.length?`<div class="assist-sug" role="group" aria-label="Horarios libres">${sug.map(t=>`<button type="button" class="sug-chip" data-on-click="pickSlot(${t})">${hm(t)}</button>`).join('')}</div>`:'';
  el.innerHTML=`<div class="assist-lbl">Asistente de agenda · ${esc(fechaCorta(date))}</div>
    <div class="assist-status ${cls}" role="status">${icon(ic)}<span>${msg}</span></div>
    <div class="assist-timeline" aria-hidden="true">${busyHtml}${propHtml}</div>
    <div class="tl-ticks" aria-hidden="true">${ticks.map(t=>`<span>${t}</span>`).join('')}</div>
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
  // pagos y comprobante también en agendadas (anticipos); en canceladas solo si ya hay algo registrado
  const conPagos=e!=='cancelada'||curPagos.length>0||!!curComp;
  document.getElementById('pagosWrap').style.display=conPagos?'block':'none';
  document.getElementById('compWrap').style.display=conPagos?'block':'none';
  if(conPagos){updateDescInfo();renderPagos();}
}
/* ====== Pagos múltiples ====== */
const METODOS=[['efectivo','Efectivo'],['transferencia','Transfer.'],['tarjeta','Tarjeta'],['cupon','Cupón'],['otro','Otro']];
let curPagos=[]; // [{monto, metodo, fecha}]
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
      <label class="sr-only" for="pagoMonto${i}">Monto del pago ${i+1}</label>
      <input type="number" id="pagoMonto${i}" class="pago-monto" inputmode="numeric" placeholder="0" value="${Number(p.monto)||''}" data-on-input="setPagoMonto(${i},this.value)">
      <label class="sr-only" for="pagoMetodo${i}">Método del pago ${i+1}</label>
      <select id="pagoMetodo${i}" class="pago-metodo" data-on-change="setPagoMetodo(${i},this.value)">
        ${METODOS.map(m=>`<option value="${m[0]}" ${p.metodo===m[0]?'selected':''}>${m[1]}</option>`).join('')}
      </select>
      <button type="button" class="icon-btn pago-del" aria-label="Quitar pago ${i+1}" data-on-click="delPago(${i})">${icon('trash')}</button>
    </div>`).join('');
  updatePagosResumen();
}
function addPago(){
  const pagado=curPagos.reduce((s,p)=>s+(Number(p.monto)||0),0);
  const resto=Math.max(0,totalACobrar()-pagado);
  curPagos.push({monto:resto||'',metodo:'efectivo',fecha:ymd(new Date())});
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
  let estado,cls;
  if(pagado<=0&&curEstado!=='atendida'){estado='Sin anticipo';cls='t-soft';}
  else if(pagado<=0){estado='Sin pago';cls='t-bad';}
  else if(pend>0){estado='Parcial · debe '+fmtMoney(pend);cls='t-warn';}
  else if(pend<0){estado='Cobró '+fmtMoney(Math.abs(pend))+' de más';cls='t-bad';}
  else {estado='Pagado completo';cls='t-ok';}
  el.innerHTML=`<div class="pr-line"><span>Total a cobrar</span><b>${fmtMoney(total)}</b></div>
    <div class="pr-line"><span>Cobrado</span><b class="v-ok">${fmtMoney(pagado)}</b></div>
    <div class="pr-estado"><span class="tag ${cls}">${estado}</span></div>`;
}
/* resumen de pagos (cobrado / deuda / estado) con la fórmula única de js/pagos.js */
function pagosSummary(c){
  const r=resumenPago(c);
  return {cobrado:r.cobrado,deuda:r.saldo,total:r.total,estado:r.estado==='pagado'?'pagado':(r.estado==='parcial'?'parcial':'deuda')};
}
/* ---- Comprobantes: solo rutas del bucket o una foto recién tomada (data:image) ---- */
let curComp='';
function renderCompPreview(){
  const el=document.getElementById('compPreview');
  const tipo=NUC.tipoComprobante(curComp);
  if(!curComp||!tipo){el.innerHTML='';return;}
  if(tipo==='data'){
    el.innerHTML=`<img src="${esc(curComp)}" alt="Comprobante seleccionado"><button type="button" class="btn-sm btn-bad-line" data-on-click="removeComp()">${icon('trash')}Quitar comprobante</button>`;
  }else{
    el.innerHTML=`<div class="comp-row"><button type="button" class="btn-sm" data-on-click="verCompActual()">${icon('clip')}Ver comprobante actual</button><button type="button" class="btn-sm btn-bad-line" data-on-click="removeComp()">Quitar</button></div>`;
  }
}
function verCompActual(){verComprobante(curComp)}
/* muestra el comprobante en una hoja de la app (URL firmada de 5 min) y al
   cerrarla regresa a la hoja de donde vino */
let compVolverA=null;
async function verComprobante(valor){
  const tipo=NUC.tipoComprobante(valor);
  if(!tipo){toast('Comprobante no válido');return;}
  let url=valor;
  if(tipo==='ruta'){
    try{url=(await guardar(sb.storage.from('comprobantes').createSignedUrl(valor,300))).signedUrl;}
    catch(e){avisarError(e,'No se pudo abrir el comprobante');return;}
  }
  const img=document.getElementById('compVerImg');img.removeAttribute('src');img.src=url;
  compVolverA=curSheet&&curSheet!=='compSheet'?curSheet:null;
  if(compVolverA){document.getElementById(compVolverA).classList.remove('show');curSheet='compSheet';requestAnimationFrame(()=>document.getElementById('compSheet').classList.add('show'));}
  else showSheet('compSheet');
}
function cerrarComp(){
  document.getElementById('compVerImg').removeAttribute('src');
  if(!compVolverA){closeSheet();return;}
  document.getElementById('compSheet').classList.remove('show');
  const volver=compVolverA;curSheet=volver;compVolverA=null;
  requestAnimationFrame(()=>document.getElementById(volver).classList.add('show'));
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
document.getElementById('estadoChips').addEventListener('click',e=>{const b=e.target.closest('[data-e]');if(b)setEstado(b.dataset.e)});

function openApptSheet(){
  editingId=null;
  document.getElementById('apptSheetTitle').textContent='Nueva cita';
  document.getElementById('apptDelBtn').style.display='none';
  document.getElementById('apptCodeBar').style.display='none';
  document.getElementById('apptCli').value='';
  apptPrevItems={};selectedSvcIds=[];svcChosenPrice={};renderSvcPicker();
  apptCortesiaId=null;
  apptSelectedCliId=null;document.getElementById('apptCliResults').innerHTML='';
  document.getElementById('apptDate').value=selectedDate;
  document.getElementById('apptTime').value='';
  setApptDur(60);apptDurCargada=null;
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
  apptPrevItems={};(c.items||[]).forEach(i=>{if(i&&i.id)apptPrevItems[i.id]={...i};});
  svcChosenPrice={};citaItems(c).forEach(i=>{if(i.id)svcChosenPrice[i.id]=Number(i.p||0);});
  renderSvcPicker();
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  document.getElementById('apptCli').value=cli?cli.nombre:'';
  apptSelectedCliId=c.clientaId||null;document.getElementById('apptCliResults').innerHTML='';
  apptCortesiaId=c.cortesiaId||null;renderApptCortesias();
  document.getElementById('apptDate').value=c.fecha;
  document.getElementById('apptTime').value=c.hora||'';
  setApptDur(c.dur||60);apptDurCargada={min:Number(c.dur)||60,mostrada:getApptDur()};
  document.getElementById('apptPrice').value=c.precio||'';
  document.getElementById('apptNotes').value=c.notas||'';
  curColor=c.color||'rosa';renderColorChips();
  curComp=c.comprobante||'';renderCompPreview();
  curDescuento=Number(c.descMonto||0);
  document.getElementById('apptDescMonto').value=curDescuento>0?curDescuento:'';
  document.getElementById('apptDescPct').value=(curDescuento>0&&c.precio>0)?Math.round(curDescuento/c.precio*100):'';
  // cargar pagos: si la cita ya tiene lista de pagos úsala; si no, migra los campos viejos
  if(Array.isArray(c.pagos)&&c.pagos.length){
    curPagos=c.pagos.map(p=>({...p,monto:Number(p.monto)||0,metodo:p.metodo||'efectivo'}));
  }else if(c.estado==='atendida'){
    const sm=pagosSummary(c);
    curPagos=sm.cobrado>0?[{monto:sm.cobrado,metodo:c.metodo||'efectivo',fecha:c.pagadoFecha||c.fecha}]:[];
  }else{
    curPagos=[];
  }
  setEstado(c.estado);
  renderAssist();
  showSheet('apptSheet');
}
