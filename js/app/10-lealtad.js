/* ============ TARJETA DE LEALTAD (por clienta) ============ */
const MAX_SELLOS=12;
function loyaltyCardHtml(cli){
  const sellos=Math.min(cli.sellos||0,MAX_SELLOS);
  let dots='';
  for(let i=1;i<=MAX_SELLOS;i++){
    const on=i<=sellos;
    const hito=(i===6||i===12);
    dots+=`<div class="sello ${on?'on':''} ${hito?'hito':''}">${on?'✦':(hito?(i===6?'6':'12'):'')}</div>`;
  }
  const pMenor=DB.premios.find(p=>p.id===cli.premioMenorId);
  const pMayor=DB.premios.find(p=>p.id===cli.premioMayorId);
  // estado de premios
  const lograMenor=sellos>=6, lograMayor=sellos>=12;
  function premioRow(nivel,premio,logra,canjeado){
    const meta=nivel==='menor'?'6 sellos':'12 sellos';
    const ic=nivel==='menor'?'🎁':'🏆';
    let right;
    if(canjeado)right=`<span class="lp-done">Canjeado ✓</span>`;
    else if(logra&&premio)right=`<button class="lp-btn" data-on-click="canjearPremio('${nivel}')">Canjear</button>`;
    else right='';
    return `<div class="loy-prem ${logra?'ready':''}">
      <div class="lp-ic">${ic}</div>
      <div class="lp-mid">
        <div class="lp-name">${premio?premio.nombre:'<span class="lp-empty">Sin premio asignado</span>'}</div>
        <div class="lp-meta">${meta}${logra&&!canjeado?' · ¡disponible!':''}</div>
      </div>
      <button class="lp-edit" data-on-click="pickPremio('${nivel}')">${premio?'Cambiar':'Asignar'}</button>
      ${right}
    </div>`;
  }
  return `<div class="loy-card">
    <div class="loy-head">
      <span>Tarjeta de lealtad</span>
      <span class="loy-count">${sellos}/12</span>
    </div>
    <div class="loy-grid">${dots}</div>
    <div class="loy-actions">
      <button class="loy-minus" data-on-click="addSello(-1)">−</button>
      <button class="loy-plus" data-on-click="addSello(1)">+ Marcar sello</button>
    </div>
    <button class="loy-qr-btn" data-on-click="showCliQR()">📱 Ver QR de la clienta</button>
    <div class="loy-prems">
      ${premioRow('menor',pMenor,lograMenor,cli.menorCanjeado)}
      ${premioRow('mayor',pMayor,lograMayor,cli.mayorCanjeado)}
    </div>
  </div>`;
}
async function addSello(delta){
  const cli=DB.clientas.find(x=>x.id===openCliId);if(!cli)return;
  let s=(cli.sellos||0)+delta;
  if(s<0)s=0;if(s>MAX_SELLOS)s=MAX_SELLOS;
  cli.sellos=s;
  try{await sb.from('clientas').update({sellos:s}).eq('id',cli.id);}catch(e){console.error(e);}
  refreshLoyalty(cli);
  if(delta>0&&(s===6||s===12))toast(s===6?'¡Llegó a 6 sellos! 🎁':'¡Tarjeta completa! 🏆');
}
function refreshLoyalty(cli){
  const box=document.getElementById('cliLoyalty');
  if(box)box.innerHTML=loyaltyCardHtml(cli);
}
let pickNivel=null;
function backToCliFromPick(){
  document.getElementById('pickPremioSheet').classList.remove('show');
  curSheet='cliSheet';
  requestAnimationFrame(()=>document.getElementById('cliSheet').classList.add('show'));
}
function pickPremio(nivel){
  pickNivel=nivel;
  const lista=DB.premios.filter(p=>p.nivel===nivel);
  const cont=document.getElementById('pickPremioList');
  document.getElementById('pickPremioTitle').textContent=nivel==='menor'?'Premio de 6 sellos':'Premio de 12 sellos';
  if(!lista.length){
    cont.innerHTML='<div class="empty-mini">No tienes premios de este nivel. Créalos en Menú → Premios.</div>';
  }else{
    cont.innerHTML=lista.map(p=>`<button class="pick-item" data-on-click="assignPremio('${p.id}')"><b>${p.nombre}</b>${p.desc?`<small>${p.desc}</small>`:''}</button>`).join('')
      +`<button class="pick-item clear" data-on-click="assignPremio('')">Quitar premio asignado</button>`;
  }
  showSheet('pickPremioSheet');
}
async function assignPremio(premioId){
  const cli=DB.clientas.find(x=>x.id===openCliId);if(!cli)return;
  const field=pickNivel==='menor'?'premio_menor_id':'premio_mayor_id';
  const val=premioId||null;
  if(pickNivel==='menor')cli.premioMenorId=val;else cli.premioMayorId=val;
  try{await sb.from('clientas').update({[field]:val}).eq('id',cli.id);}catch(e){console.error(e);}
  // vuelve a la ficha de clienta (estaba debajo)
  document.getElementById('pickPremioSheet').classList.remove('show');
  curSheet='cliSheet';
  requestAnimationFrame(()=>document.getElementById('cliSheet').classList.add('show'));
  refreshLoyalty(cli);
}
async function canjearPremio(nivel){
  const cli=DB.clientas.find(x=>x.id===openCliId);if(!cli)return;
  const field=nivel==='menor'?'menor_canjeado':'mayor_canjeado';
  if(nivel==='menor')cli.menorCanjeado=true;else cli.mayorCanjeado=true;
  try{await sb.from('clientas').update({[field]:true}).eq('id',cli.id);}catch(e){console.error(e);}
  refreshLoyalty(cli);
  toast('Premio canjeado ✓');
}

/* ====== QR: mostrar el de la clienta ====== */
function showCliQR(){
  const cli=DB.clientas.find(x=>x.id===openCliId);if(!cli)return;
  document.getElementById('cliQrTitle').textContent='QR · '+cli.nombre;
  const box=document.getElementById('cliQrBox');
  box.innerHTML='';
  document.getElementById('cliSheet').classList.remove('show');
  curSheet='cliQrSheet';
  requestAnimationFrame(()=>document.getElementById('cliQrSheet').classList.add('show'));
  // generar QR con el id de la clienta
  try{
    new QRCode(box,{text:'RHEUD-CLI:'+cli.id,width:220,height:220,colorDark:'#5C2233',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  }catch(e){box.innerHTML='<div class="empty-mini">No se pudo generar el QR.</div>';console.error(e);}
}
function backToCliFromQR(){
  document.getElementById('cliQrSheet').classList.remove('show');
  curSheet='cliSheet';
  requestAnimationFrame(()=>document.getElementById('cliSheet').classList.add('show'));
}

/* ====== QR: escanear para sumar sello ====== */
let qrScanner=null;
function openScanner(){
  document.getElementById('scanResult').innerHTML='';
  showSheet('scanSheet');
  // pequeño delay para que el contenedor esté visible
  setTimeout(startScan,250);
}
function startScan(){
  if(typeof Html5Qrcode==='undefined'){
    document.getElementById('scanResult').innerHTML='<div class="scan-err">No se pudo cargar el escáner. Revisa tu conexión.</div>';
    return;
  }
  qrScanner=new Html5Qrcode('qrReader');
  qrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}},onScanSuccess,()=>{})
    .catch(err=>{
      document.getElementById('scanResult').innerHTML='<div class="scan-err">No se pudo abrir la cámara. Dale permiso a Safari para usar la cámara.</div>';
      console.error(err);
    });
}
async function onScanSuccess(text){
  if(!text||!text.startsWith('RHEUD-CLI:')){
    document.getElementById('scanResult').innerHTML='<div class="scan-err">Ese QR no es de una clienta de Rhēud.</div>';
    return;
  }
  const id=text.replace('RHEUD-CLI:','');
  const cli=DB.clientas.find(x=>x.id===id);
  if(!cli){
    document.getElementById('scanResult').innerHTML='<div class="scan-err">No encontré a esa clienta.</div>';
    return;
  }
  // pausa el escáner para no leer mil veces
  try{await qrScanner.stop();}catch(e){}
  let s=Math.min((cli.sellos||0)+1,MAX_SELLOS);
  cli.sellos=s;
  try{await sb.from('clientas').update({sellos:s}).eq('id',cli.id);}catch(e){console.error(e);}
  let extra='';
  if(s===6)extra=' · ¡llegó a 6 sellos! 🎁';
  else if(s===12)extra=' · ¡tarjeta completa! 🏆';
  document.getElementById('scanResult').innerHTML=`<div class="scan-ok"><b>${cli.nombre}</b><br>Sello sumado: ${s}/12${extra}</div><button class="btn btn-primary" style="margin-top:12px" data-on-click="restartScan()">Escanear otra</button>`;
}
function restartScan(){
  document.getElementById('scanResult').innerHTML='';
  startScan();
}
async function closeScanner(){
  if(qrScanner){try{await qrScanner.stop();}catch(e){}try{qrScanner.clear();}catch(e){}qrScanner=null;}
  closeSheet();
  if(currentView==='clientas')renderClientas();
}

let menuCat='all',menuSub='';
function setMenuCat(c){menuCat=c;menuSub='';renderServicios();}
function setMenuSub(x){menuSub=(menuSub===x)?'':x;renderServicios();}
function renderServicios(){
  const cont=document.getElementById('svcList');
  const counts={all:DB.servicios.length};
  DB.servicios.forEach(x=>{counts[x.cat||'nails']=(counts[x.cat||'nails']||0)+1;});
  const cats=document.getElementById('menuCats');
  if(cats){
    const order=['all','nails','skin','otro'].filter(c=>c==='all'||counts[c]);
    cats.innerHTML=order.map(c=>`<div class="chip ${menuCat===c?(c==='skin'?'sel-skin':'sel'):''}" data-on-click="setMenuCat('${c}')">${c==='all'?'Todo':catLabel(c)} <span class="n">${counts[c]||0}</span></div>`).join('');
  }
  let list=DB.servicios.filter(x=>menuCat==='all'||(x.cat||'nails')===menuCat);
  const subs=document.getElementById('menuSubs');
  if(subs){
    const present=[...new Set(list.map(x=>x.sub).filter(Boolean))];
    subs.innerHTML=(menuCat!=='all'&&present.length)?`<span class="${!menuSub?'on':''}" data-on-click="setMenuSub('')">Todas</span>`+present.map(x=>`<span class="${menuSub===x?'on':''}" data-sub="${esc(x)}" data-on-click="setMenuSub(this.dataset.sub)">${esc(x)}</span>`).join(''):'';
    subs.style.display=subs.innerHTML?'flex':'none';
    if(menuCat==='skin')subs.classList.add('skin');else subs.classList.remove('skin');
  }
  if(menuSub)list=list.filter(x=>x.sub===menuSub);
  document.getElementById('menuSub').textContent=menuCat==='all'?`${DB.servicios.length} servicios`:`${list.length} en ${catLabel(menuCat)}`;
  if(!list.length){cont.innerHTML=`<div class="empty"><p>Aún no hay servicios en esta rama. Agrega el primero con el botón de abajo.</p></div>`;return;}
  cont.innerHTML=list.map(s=>{
    const cost=Number(s.costoReal||0),price=Number(s.p||0),margin=price-cost;
    const cat=CATS[s.cat]||CATS.nails;
    const meta=[];
    meta.push(`<b>${fmtDur(s.dur||60)}</b>`);
    if(s.recurso==='cabina')meta.push(`cabina${s.limpieza?` <b>+${s.limpieza}</b>`:''}`);
    else if(s.recurso==='mesa'&&s.limpieza)meta.push(`mesa <b>+${s.limpieza}</b>`);
    if(s.insumos&&s.insumos.length)meta.push(esc(s.insumos.join(', ')));
    if(cost>0&&price>0)meta.push(`margen <b>${Math.round(margin/price*100)}%</b>`);
    if(s.incluye)meta.push(`Incluye: ${esc(s.incluye)}`);
    const tags=`<span class="tag ${menuCat==='all'?cat.cls:'t-soft'}">${menuCat==='all'?cat.short:(s.sub||cat.short)}</span>${s.requisitos?`<span class="tag t-warn">Requisitos</span>`:''}`;
    return `<div class="svc-card" data-on-click="editSvc('${s.id}')">
      <div class="sc-top"><div class="sc-n">${esc(s.n)}</div><div class="sc-p">${(s.precios&&s.precios.length>1)?(fmtMoney(Math.min(...s.precios))+' – '+fmtMoney(Math.max(...s.precios))):fmtMoney(s.p)}</div></div>
      ${s.desc?`<div class="sc-desc">${esc(s.desc)}</div>`:''}
      <div class="sc-meta">${tags}${meta.map(m=>`<span>${m}</span>`).join('<span class="sc-dot">·</span>')}</div>
    </div>`;
  }).join('');
}
let editingSvcId=null;
function openSvcSheet(){
  editingSvcId=null;
  document.getElementById('svcSheetTitle').textContent='Nuevo servicio';
  document.getElementById('svcDelBtn').style.display='none';
  document.getElementById('svcName').value='';document.getElementById('svcPrice').value='';
  document.getElementById('svcCost').value='';document.getElementById('svcDesc').value='';
  document.getElementById('svcIncl').value='';document.getElementById('svcPrecios').value='';
  setSvcCat(menuCat==='skin'?'skin':'nails');
  document.getElementById('svcSub').value=(menuCat!=='all'&&menuSub)?menuSub:'';
  document.getElementById('svcDur').value=60;document.getElementById('svcLimp').value='';
  document.getElementById('svcInsumos').value='';document.getElementById('svcReq').value='';
  document.getElementById('svcMargin').innerHTML='';
  showSheet('svcSheet');
}
function editSvc(id){
  const s=DB.servicios.find(x=>x.id===id);if(!s)return;
  editingSvcId=id;
  document.getElementById('svcSheetTitle').textContent='Editar servicio';
  document.getElementById('svcDelBtn').style.display='block';
  document.getElementById('svcName').value=s.n||'';
  document.getElementById('svcPrice').value=s.p||'';
  document.getElementById('svcCost').value=s.costoReal||'';
  document.getElementById('svcDesc').value=s.desc||'';
  document.getElementById('svcIncl').value=s.incluye||'';
  document.getElementById('svcPrecios').value=(s.precios&&s.precios.length)?s.precios.join(', '):'';
  setSvcCat(s.cat||'nails',false);setSvcRec(s.recurso||'mesa');
  document.getElementById('svcSub').value=s.sub||'';
  document.getElementById('svcDur').value=s.dur||60;
  document.getElementById('svcLimp').value=s.limpieza||'';
  document.getElementById('svcInsumos').value=(s.insumos||[]).join(', ');
  document.getElementById('svcReq').value=s.requisitos||'';
  svcMarginHint();
  showSheet('svcSheet');
}
/* rama / recurso en la hoja de servicio */
let svcCat='nails',svcRec='mesa';
function setSvcCat(c,autoRec){
  svcCat=c;
  document.querySelectorAll('#svcCatChips .chip').forEach(ch=>ch.classList.toggle('sel',ch.dataset.c===c));
  document.getElementById('svcSubList').innerHTML=(SUBFAMILIAS[c]||[]).map(x=>`<option value="${x}">`).join('');
  if(autoRec!==false)setSvcRec(c==='skin'?'cabina':(c==='nails'?'mesa':'ninguno'));
}
function setSvcRec(r){svcRec=r;document.querySelectorAll('#svcRecChips .chip').forEach(ch=>ch.classList.toggle('sel',ch.dataset.r===r));}
document.getElementById('svcCatChips').addEventListener('click',e=>{const ch=e.target.closest('.chip');if(ch)setSvcCat(ch.dataset.c);});
document.getElementById('svcRecChips').addEventListener('click',e=>{const ch=e.target.closest('.chip');if(ch)setSvcRec(ch.dataset.r);});
function svcMarginHint(){
  const el=document.getElementById('svcMargin');if(!el)return;
  const p=Number(document.getElementById('svcPrice').value)||0,c=Number(document.getElementById('svcCost').value)||0;
  if(!p||!c){el.innerHTML='';return;}
  const m=p-c,pct=Math.round(m/p*100);
  el.innerHTML=`<div class="margin-hint">Margen estimado <b>${fmtMoney(m)} · ${pct}%</b></div>`;
}
document.getElementById('svcPrice').addEventListener('input',svcMarginHint);
function parsePrecios(str){
  return (str||'').split(',').map(x=>Number(x.trim())).filter(x=>!isNaN(x)&&x>0);
}
async function saveSvc(){
  const n=document.getElementById('svcName').value.trim();
  if(!n){toast('Escribe el nombre');return;}
  const precios=parsePrecios(document.getElementById('svcPrecios').value);
  let p=Number(document.getElementById('svcPrice').value)||0;
  // si hay precios variables y no hay precio base, usa el primero como referencia
  if(precios.length&&!p)p=precios[0];
  const data={
    n,p,
    precios,
    costoReal:Number(document.getElementById('svcCost').value)||0,
    desc:document.getElementById('svcDesc').value.trim(),
    incluye:document.getElementById('svcIncl').value.trim(),
    cat:svcCat,sub:document.getElementById('svcSub').value.trim(),
    dur:Number(document.getElementById('svcDur').value)||60,
    limpieza:Number(document.getElementById('svcLimp').value)||0,
    recurso:svcRec,
    insumos:document.getElementById('svcInsumos').value.split(',').map(x=>x.trim()).filter(Boolean),
    requisitos:document.getElementById('svcReq').value.trim()
  };
  try{
    if(editingSvcId){
      const {error}=await sb.from('servicios').update(svcToRow(data)).eq('id',editingSvcId);
      if(error)throw error;
      Object.assign(DB.servicios.find(s=>s.id===editingSvcId),data);
    }else{
      const {data:ins,error}=await sb.from('servicios').insert(svcToRow(data)).select().single();
      if(error)throw error;
      DB.servicios.push(rowToSvc(ins));
    }
    closeSheet();renderServicios();
    toast(editingSvcId?'Servicio actualizado':'Servicio agregado');
  }catch(e){toast('Error al guardar');console.error(e);}
}
async function delSvc(){
  if(!editingSvcId||!confirm('¿Eliminar este servicio del menú?'))return;
  try{
    const {error}=await sb.from('servicios').delete().eq('id',editingSvcId);
    if(error)throw error;
    DB.servicios=DB.servicios.filter(s=>s.id!==editingSvcId);closeSheet();renderServicios();toast('Servicio eliminado');
  }catch(e){toast('Error al eliminar');console.error(e);}
}
