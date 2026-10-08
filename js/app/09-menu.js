/* ---------------- SERVICIOS ---------------- */
/* ============ MENÚ: tabs Servicios / Premios ============ */
function menuTab(t){
  document.querySelectorAll('#menuSeg button').forEach(b=>b.classList.toggle('on',b.dataset.s===t));
  document.getElementById('menuServicios').style.display=(t==='servicios')?'block':'none';
  document.getElementById('menuPremios').style.display=(t==='premios')?'block':'none';
  document.getElementById('menuCortesias').style.display=(t==='cortesias')?'block':'none';
  const subs={servicios:'Servicios',premios:'Premios de lealtad',cortesias:'Catálogo de cortesías'};
  document.getElementById('menuSub').textContent=subs[t]||t;
  if(t==='premios')renderPremios();
  if(t==='cortesias')renderCortesiasCat();
}
/* ============ CATÁLOGO DE CORTESÍAS ============ */
function renderCortesiasCat(){
  const el=document.getElementById('cortesiasCatList');if(!el)return;
  if(!DB.cortesiasCat.length){el.innerHTML='<div class="empty-mini">Sin cortesías en el catálogo aún.</div>';return;}
  el.innerHTML=DB.cortesiasCat.map(c=>`<div class="premio-card" data-on-click="editCortesiaCat('${c.id}')">
    <div class="pr-top"><div class="pr-n">${esc(c.nombre)}</div><span class="pr-badge menor">${c.vigencia} días</span></div>
    ${c.desc?`<div class="pr-desc">${esc(c.desc)}</div>`:''}
  </div>`).join('');
}
let editingCCId=null;
function openCortesiaCatSheet(){
  editingCCId=null;
  document.getElementById('cortesiaCatTitle').textContent='Nueva cortesía';
  document.getElementById('ccNombre').value='';
  document.getElementById('ccDesc').value='';
  document.getElementById('ccVigencia').value='30';
  document.getElementById('ccDelBtn').style.display='none';
  showSheet('cortesiaCatSheet');
}
function editCortesiaCat(id){
  const c=DB.cortesiasCat.find(x=>x.id===id);if(!c)return;
  editingCCId=id;
  document.getElementById('cortesiaCatTitle').textContent='Editar cortesía';
  document.getElementById('ccNombre').value=c.nombre;
  document.getElementById('ccDesc').value=c.desc||'';
  document.getElementById('ccVigencia').value=c.vigencia||30;
  document.getElementById('ccDelBtn').style.display='block';
  showSheet('cortesiaCatSheet');
}
async function saveCortesiaCat(){
  const nombre=document.getElementById('ccNombre').value.trim();
  if(!nombre){toast('Escribe el nombre');return;}
  const obj={negocio_id:NEGOCIO_ID,nombre,descripcion:document.getElementById('ccDesc').value.trim(),vigencia_dias:Number(document.getElementById('ccVigencia').value)||30};
  const listo=ocupar('cortesiaCat',document.querySelector('#cortesiaCatSheet .btn-primary'),'Guardando…');if(!listo)return;
  try{
    if(editingCCId){
      await guardar(sb.from('cortesias_catalogo').update(obj).eq('id',editingCCId));
      const c=DB.cortesiasCat.find(x=>x.id===editingCCId);if(c){c.nombre=nombre;c.desc=obj.descripcion;c.vigencia=obj.vigencia_dias;}
    }else ponerEnCache('cortesiasCat',rowToCortesiaCat(await guardar(sb.from('cortesias_catalogo').insert(obj).select().single())));
  }catch(e){avisarError(e);return;}
  finally{listo();}
  renderCortesiasCat();closeSheet();toast('Cortesía guardada');
}
async function deleteCortesiaCat(){
  if(!editingCCId||!confirm('¿Eliminar esta cortesía del catálogo?'))return;
  const id=editingCCId;
  try{await guardar(sb.from('cortesias_catalogo').delete().eq('id',id));}
  catch(e){avisarError(e,'No se pudo eliminar. Revisa tu conexión.');return;}
  DB.cortesiasCat=DB.cortesiasCat.filter(c=>c.id!==id);
  renderCortesiasCat();closeSheet();toast('Eliminada');
}
/* ============ CORTESÍAS DE CLIENTA ============ */
function cortesiasDeClienta(cliId){return DB.cortesias.filter(c=>c.clientaId===cliId);}
function isCortesiaVigente(c){if(c.usada)return false;if(!c.fechaVence)return true;return c.fechaVence>=ymd(new Date());}
/* días por medianoches locales: 'YYYY-MM-DD 00:00:00' daba NaN en Safari y "vence hoy" un día antes */
function diasRestantes(c){return NUC.diasRestantes(c.fechaVence)}
function renderCliCortesias(cliId){
  const el=document.getElementById('cliCortesias');if(!el)return;
  const lista=cortesiasDeClienta(cliId);
  const vigentes=lista.filter(c=>isCortesiaVigente(c));
  const usadas=lista.filter(c=>c.usada);
  const expiradas=lista.filter(c=>!c.usada&&!isCortesiaVigente(c));
  function card(c,tipo){
    const dr=diasRestantes(c);
    const badge=tipo==='vigente'
      ?`<span class="cc-badge cc-ok">${dr===0?'Vence hoy':(dr!==null?`${dr}d`:' Sin venc.')}</span>`
      :(tipo==='expirada'?`<span class="cc-badge cc-exp">Expirada</span>`:`<span class="cc-badge cc-used">Usada${c.fechaUso?' · '+c.fechaUso:''}</span>`);
    return `<div class="cc-card ${tipo}">
      <div class="cc-row"><div class="cc-desc">${esc(c.desc)}</div>${badge}</div>
      ${c.notas?`<div class="cc-notas">${esc(c.notas)}</div>`:''}
      ${tipo==='vigente'?`<button class="cc-usar" data-on-click="usarCortesia('${c.id}')">Marcar como usada</button>`:''}
    </div>`;
  }
  el.innerHTML=`<div class="cc-section">
    <div class="cc-header"><div class="cc-title">🎁 Cortesías</div><button class="cc-add-btn" data-on-click="openCortesiaCliSheet()">+ Agregar</button></div>
    ${vigentes.length?vigentes.map(c=>card(c,'vigente')).join(''):'<div class="empty-mini" style="margin:6px 0">Sin cortesías vigentes.</div>'}
    ${expiradas.map(c=>card(c,'expirada')).join('')}
    ${usadas.length?`<details class="cc-used-details"><summary>${usadas.length} usada${usadas.length!==1?'s':''}</summary>${usadas.map(c=>card(c,'usada')).join('')}</details>`:''}
  </div>`;
}
function openCortesiaCliSheet(){
  const p=document.getElementById('ccCatPicker');
  if(DB.cortesiasCat.length)p.innerHTML=DB.cortesiasCat.map(c=>`<div class="cc-pick-item" data-cc="${c.id}" data-desc="${esc(c.nombre)}" data-vig="${c.vigencia}" data-on-click="pickCortesiaCat(this)">${esc(c.nombre)} · ${c.vigencia}d</div>`).join('')+'<div class="cc-pick-item" data-cc="" data-on-click="pickCortesiaCat(this)">✏️ Personalizada</div>';
  else p.innerHTML='<div class="empty-mini">Sin catálogo aún. Créalo en Menú → Cortesías.</div>';
  document.getElementById('ccCliDesc').value='';
  document.getElementById('ccCliVigencia').value='30';
  document.getElementById('ccCliNotas').value='';
  showSheet('cortesiaCliSheet');
}
function pickCortesiaCat(el){
  document.querySelectorAll('.cc-pick-item').forEach(i=>i.classList.remove('sel'));
  el.classList.add('sel');
  if(el.dataset.desc){document.getElementById('ccCliDesc').value=el.dataset.desc;document.getElementById('ccCliVigencia').value=el.dataset.vig||30;}
  else{document.getElementById('ccCliDesc').value='';document.getElementById('ccCliVigencia').value='30';}
}
async function saveCortesiaCli(){
  const desc=document.getElementById('ccCliDesc').value.trim();
  if(!desc){toast('Escribe la descripción');return;}
  const vig=Number(document.getElementById('ccCliVigencia').value)||30;
  const hoy=ymd(new Date());const vence=new Date(hoy+'T00:00:00');vence.setDate(vence.getDate()+vig);
  const picked=document.querySelector('.cc-pick-item.sel');
  const obj={negocio_id:NEGOCIO_ID,clienta_id:openCliId,catalogo_id:picked&&picked.dataset.cc?picked.dataset.cc:null,descripcion:desc,vigencia_dias:vig,fecha_inicio:hoy,fecha_vence:ymd(vence),usada:false,notas:document.getElementById('ccCliNotas').value.trim()};
  const listo=ocupar('cortesiaCli',document.querySelector('#cortesiaCliSheet .btn-primary'),'Guardando…');if(!listo)return;
  try{ponerEnCache('cortesias',rowToCortesia(await guardar(sb.from('cortesias').insert(obj).select().single())),true);}
  catch(e){avisarError(e);return;}
  finally{listo();}
  document.getElementById('cortesiaCliSheet').classList.remove('show');
  curSheet='cliSheet';requestAnimationFrame(()=>document.getElementById('cliSheet').classList.add('show'));
  renderCliCortesias(openCliId);toast('Cortesía agregada 🎁');
}
async function usarCortesia(id){
  const c=DB.cortesias.find(x=>x.id===id);if(!c)return;
  if(!confirm(`¿Marcar "${c.desc}" como usada?`))return;
  const hoy=ymd(new Date());
  try{await guardar(sb.from('cortesias').update({usada:true,fecha_uso:hoy}).eq('id',id));}
  catch(e){avisarError(e);return;}
  c.usada=true;c.fechaUso=hoy;
  renderCliCortesias(openCliId);toast('Cortesía marcada como usada ✓');
}
/* Una cortesía aplicada a una cita se consume cuando la cita queda atendida y
   vuelve a estar disponible si la cita se cancela, se borra o se le quita.
   Se recalcula para las cortesías indicadas a partir de las citas del caché. */
async function sincronizarCortesias(ids){
  for(const id of new Set((ids||[]).filter(Boolean))){
    const cor=DB.cortesias.find(x=>x.id===id);if(!cor)continue;
    const cita=DB.citas.find(c=>c.cortesiaId===id&&c.estado==='atendida');
    const usada=!!cita,fecha=cita?(cita.fecha||ymd(new Date())):null;
    if(cor.usada===usada)continue;
    try{await guardar(sb.from('cortesias').update({usada,fecha_uso:fecha}).eq('id',id));cor.usada=usada;cor.fechaUso=fecha||'';}
    catch(e){avisarError(e,'La cita se guardó, pero no se pudo actualizar la cortesía.');}
  }
}
/* ============ CORTESÍA EN FORMULARIO DE CITA ============ */
let apptCortesiaId=null;
function renderApptCortesias(){
  const wrap=document.getElementById('apptCortesiaWrap');if(!wrap)return;
  if(!apptSelectedCliId){wrap.style.display='none';return;}
  // si la cita ya tiene cortesía aplicada, mostrarla como info (no editable)
  if(apptCortesiaId){
    const cor=DB.cortesias.find(x=>x.id===apptCortesiaId);
    wrap.style.display='block';
    document.getElementById('apptCortesiaList').innerHTML=
      `<div class="cc-applied">🎁 <b>${cor?esc(cor.desc):'Cortesía'}</b> aplicada${cor&&cor.usada?' · usada ✓':''}<button data-on-click="selectApptCortesia(null,null);renderApptCortesias()" class="cc-quitar">Quitar</button></div>`;
    return;
  }
  // vigentes y sin apartar en otra cita (se consumen hasta que la cita queda atendida)
  const vigentes=DB.cortesias.filter(c=>c.clientaId===apptSelectedCliId&&isCortesiaVigente(c)&&!DB.citas.some(x=>x.cortesiaId===c.id&&x.id!==editingId&&x.estado!=='cancelada'));
  if(!vigentes.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  const list=document.getElementById('apptCortesiaList');
  list.innerHTML=`<div class="cc-pick-item sel" data-on-click="selectApptCortesia(null,this)">Sin cortesía</div>`
    +vigentes.map(c=>`<div class="cc-pick-item" data-on-click="selectApptCortesia('${c.id}',this)">${esc(c.desc)}</div>`).join('');
}
function selectApptCortesia(id,el){
  apptCortesiaId=id;
  document.querySelectorAll('#apptCortesiaList .cc-pick-item').forEach(i=>i.classList.remove('sel'));
  if(el)el.classList.add('sel');
}
/* ============ EGRESOS ============ */
let ventasModeActive='ingresos';
function ventasMode(m){
  ventasModeActive=m;
  document.querySelectorAll('#ventasModeSeg button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  document.getElementById('ventasIngresosPane').style.display=(m==='ingresos')?'block':'none';
  document.getElementById('ventasEgresosPane').style.display=(m==='egresos')?'block':'none';
  document.getElementById('ventasInsightsPane').style.display=(m==='insights')?'block':'none';
  document.getElementById('ventasSubtitle').textContent=({ingresos:'Ingresos',egresos:'Gastos',insights:'Insights'})[m];
  if(m==='egresos')renderEgresos();
  if(m==='insights')renderInteligencia();
}
let egresosPeriod='mes';
function egresosSetPeriod(p){
  egresosPeriod=p;
  document.querySelectorAll('#egresosSeg button').forEach(b=>b.classList.toggle('on',b.dataset.ep===p));
  renderEgresos();
}
function egresosRange(){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const ymdH=ymd(hoy);
  if(egresosPeriod==='dia')return [ymdH,ymdH];
  if(egresosPeriod==='sem'){const ws=startOfWeek(hoy);const we=new Date(ws);we.setDate(ws.getDate()+6);return [ymd(ws),ymd(we)];}
  if(egresosPeriod==='mes')return [ymd(new Date(hoy.getFullYear(),hoy.getMonth(),1)),ymd(new Date(hoy.getFullYear(),hoy.getMonth()+1,0))];
  if(egresosPeriod==='ano')return [ymd(new Date(hoy.getFullYear(),0,1)),ymd(new Date(hoy.getFullYear(),11,31))];
  return [null,null]; // todo
}
function renderEgresos(){
  const hoy=ymd(new Date());
  const [rStart,rEnd]=egresosRange();
  const filtered=rStart?DB.egresos.filter(e=>e.fecha>=rStart&&e.fecha<=rEnd):DB.egresos;
  const totalEg=filtered.reduce((s,e)=>s+e.monto,0);
  // Cobrado del mismo periodo
  const ventas=DB.citas.filter(c=>c.estado==='atendida'&&(!rStart||c.fecha>=rStart)&&(!rEnd||c.fecha<=hoy));
  const cobradoPeriodo=ventas.reduce((s,c)=>s+montoCita(c),0);
  const ganancia=cobradoPeriodo-totalEg;
  const periodoLabel={dia:'hoy',sem:'esta semana',mes:'este mes',ano:'este año',todo:'total'}[egresosPeriod]||'';
  document.getElementById('egresoResumen').innerHTML=`<div class="stats">
    <div class="stat"><div class="lbl">Gastos ${periodoLabel}</div><div class="val" style="color:var(--red)">${fmtMoney(totalEg)}</div></div>
    <div class="stat"><div class="lbl">Cobrado ${periodoLabel}</div><div class="val" style="color:var(--green)">${fmtMoney(cobradoPeriodo)}</div></div>
    <div class="stat wide stat-hero"><div class="lbl">Ganancia neta</div><div class="val">${fmtMoney(ganancia)}</div><div class="sub">${fmtMoney(cobradoPeriodo)} cobrado − ${fmtMoney(totalEg)} gastos</div></div>
  </div>`;
  const fe=document.getElementById('egresoFecha');if(fe&&!fe.value)fe.value=hoy;
  const list=document.getElementById('egresosList');
  if(!filtered.length){list.innerHTML='<div class="empty-mini">Sin egresos en este periodo.</div>';return;}
  list.innerHTML=filtered.map(e=>`<div class="egreso-item">
    <div class="ei-info"><div class="ei-concepto">${esc(e.concepto)}</div><div class="ei-fecha">${e.fecha}</div></div>
    <div class="ei-right"><div class="ei-monto">${fmtMoney(e.monto)}</div><button class="ei-del" data-on-click="deleteEgreso('${e.id}')">✕</button></div>
  </div>`).join('');
}
async function addEgreso(){
  const concepto=document.getElementById('egresoConcepto').value.trim();
  const monto=Number(document.getElementById('egresoMonto').value)||0;
  const fecha=document.getElementById('egresoFecha').value||ymd(new Date());
  if(!concepto){toast('Escribe el concepto');return;}
  if(!monto){toast('Escribe el monto');return;}
  if(monto<0){toast('El monto no puede ser negativo');return;}
  const listo=ocupar('egreso',document.querySelector('.ef-add'));if(!listo)return;
  try{ponerEnCache('egresos',rowToEgreso(await guardar(sb.from('egresos').insert({negocio_id:NEGOCIO_ID,fecha,concepto,monto}).select().single())),true);}
  catch(e){avisarError(e);return;}
  finally{listo();}
  document.getElementById('egresoConcepto').value='';document.getElementById('egresoMonto').value='';
  renderEgresos();toast('Egreso registrado');
}
async function deleteEgreso(id){
  if(!confirm('¿Eliminar este gasto?'))return;
  try{await guardar(sb.from('egresos').delete().eq('id',id));}
  catch(e){avisarError(e,'No se pudo eliminar. Revisa tu conexión.');return;}
  DB.egresos=DB.egresos.filter(e=>e.id!==id);renderEgresos();toast('Eliminado');
}
/* ============ PREMIOS (catálogo) ============ */
function renderPremios(){
  const cont=document.getElementById('premiosList');
  if(!DB.premios.length){cont.innerHTML='<div class="empty-mini">Aún no tienes premios. Agrega el primero para tu tarjeta de lealtad.</div>';return;}
  const menores=DB.premios.filter(p=>p.nivel==='menor');
  const mayores=DB.premios.filter(p=>p.nivel==='mayor');
  function card(p){
    return `<div class="premio-card" data-on-click="editPremio('${p.id}')">
      <div class="pr-top"><div class="pr-n">${p.nombre}</div><span class="pr-badge ${p.nivel}">${p.nivel==='menor'?'6 sellos':'12 sellos'}</span></div>
      ${p.desc?`<div class="pr-desc">${p.desc}</div>`:''}
    </div>`;
  }
  let html='';
  html+=`<div class="premio-group"><div class="pg-title">🎁 Premio menor · 6 sellos</div>${menores.length?menores.map(card).join(''):'<div class="empty-mini">Sin premios de 6 sellos.</div>'}</div>`;
  html+=`<div class="premio-group"><div class="pg-title">🏆 Premio mayor · 12 sellos</div>${mayores.length?mayores.map(card).join(''):'<div class="empty-mini">Sin premios de 12 sellos.</div>'}</div>`;
  cont.innerHTML=html;
}
let editingPremioId=null;
function openPremioSheet(){
  editingPremioId=null;
  document.getElementById('premioSheetTitle').textContent='Nuevo premio';
  document.getElementById('premioNombre').value='';
  document.getElementById('premioDesc').value='';
  setPremioNivel('menor');
  document.getElementById('premioDelBtn').style.display='none';
  showSheet('premioSheet');
}
function editPremio(id){
  const p=DB.premios.find(x=>x.id===id);if(!p)return;
  editingPremioId=id;
  document.getElementById('premioSheetTitle').textContent='Editar premio';
  document.getElementById('premioNombre').value=p.nombre;
  document.getElementById('premioDesc').value=p.desc||'';
  setPremioNivel(p.nivel||'menor');
  document.getElementById('premioDelBtn').style.display='block';
  showSheet('premioSheet');
}
let curPremioNivel='menor';
function setPremioNivel(n){curPremioNivel=n;document.querySelectorAll('#premioNivelChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.nv===n));}
async function savePremio(){
  const nombre=document.getElementById('premioNombre').value.trim();
  if(!nombre){toast('Escribe el nombre del premio');return;}
  const obj={nombre,nivel:curPremioNivel,desc:document.getElementById('premioDesc').value.trim()};
  const listo=ocupar('premio',document.querySelector('#premioSheet .btn-primary'),'Guardando…');if(!listo)return;
  try{
    if(editingPremioId){
      await guardar(sb.from('premios').update(premioToRow(obj)).eq('id',editingPremioId));
      const p=DB.premios.find(x=>x.id===editingPremioId);if(p)Object.assign(p,obj);
    }else ponerEnCache('premios',rowToPremio(await guardar(sb.from('premios').insert(premioToRow(obj)).select().single())));
  }catch(e){avisarError(e,'No se pudo guardar el premio. Revisa tu conexión.');return;}
  finally{listo();}
  renderPremios();closeSheet();toast('Premio guardado');
}
async function deletePremio(){
  if(!editingPremioId)return;
  if(!confirm('¿Eliminar este premio?'))return;
  const id=editingPremioId;
  try{await guardar(sb.from('premios').delete().eq('id',id));}
  catch(e){avisarError(e,'No se pudo eliminar el premio. Revisa tu conexión.');return;}
  DB.premios=DB.premios.filter(p=>p.id!==id);
  renderPremios();closeSheet();toast('Premio eliminado');
}
