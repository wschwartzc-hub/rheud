/* ---------------- EXPEDIENTE DE PIEL ---------------- */
function rowToExp(r){return {id:r.id,clientaId:r.clienta_id,tipo:r.tipo||'',fototipo:r.fototipo||'',sensibilidad:r.sensibilidad||'',alergias:r.alergias||'',contra:r.contraindicaciones||'',objetivo:r.objetivo||'',rutina:r.rutina||'',evolucion:Array.isArray(r.evolucion)?r.evolucion:[],updatedAt:r.updated_at||''}}
function expToRow(e){return {negocio_id:NEGOCIO_ID,clienta_id:e.clientaId,tipo:e.tipo||'',fototipo:e.fototipo||'',sensibilidad:e.sensibilidad||'',alergias:e.alergias||'',contraindicaciones:e.contra||'',objetivo:e.objetivo||'',rutina:e.rutina||'',evolucion:e.evolucion||[]}}
function getExp(cliId){let e=DB.expedientes.find(x=>x.clientaId===cliId);if(!e){e={id:null,clientaId:cliId,tipo:'',fototipo:'',sensibilidad:'',alergias:'',contra:'',objetivo:'',rutina:'',evolucion:[],updatedAt:''};}return e;}
function loadExpediente(cliId){
  const e=getExp(cliId);
  document.querySelectorAll('#pielTipoChips .chip').forEach(ch=>ch.classList.toggle('sel',ch.dataset.t===e.tipo));
  document.getElementById('pielFoto').value=e.fototipo||'';
  document.getElementById('pielSens').value=e.sensibilidad||'';
  document.getElementById('pielAlergias').value=e.alergias||'';
  document.getElementById('pielContra').value=e.contra||'';
  document.getElementById('pielObjetivo').value=e.objetivo||'';
  document.getElementById('pielRutina').value=e.rutina||'';
  document.getElementById('pielNota').value='';
  const when=document.getElementById('pielWhen');if(when)when.textContent=e.updatedAt?('act. '+fmtFechaCompleta(e.updatedAt.slice(0,10),'')):'';
  renderEvolucion(e);
  renderFotos(cliId);
}
/* ---- fotos antes / después (bucket privado "expedientes", URL firmada al mostrar) ---- */
function rowToFoto(r){return {id:r.id,clientaId:r.clienta_id,tipo:r.tipo||'seguimiento',fecha:r.fecha||'',path:r.path||'',nota:r.nota||''}}
let fotoTipo='seguimiento';const FOTO_URL_CACHE={};
function pickFoto(t){if(!openCliId)return;fotoTipo=t;const inp=document.getElementById('fotoInput');inp.value='';inp.click();}
function compressImage(file,max,q){
  return new Promise((res,rej)=>{
    const img=new Image();const url=URL.createObjectURL(file);
    img.onload=()=>{const sc=Math.min(1,max/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);cv.toBlob(b=>b?res(b):rej(new Error('No se pudo procesar la imagen')),'image/jpeg',q);};
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Imagen inválida'));};
    img.src=url;
  });
}
async function onFotoPicked(ev){
  const f=ev.target.files&&ev.target.files[0];if(!f||!openCliId)return;
  const cliId=openCliId,tipo=fotoTipo;
  toast('Subiendo foto…');
  try{
    const blob=await compressImage(f,1280,.82);
    const path=`${NEGOCIO_ID}/${cliId}/${Date.now()}_${tipo}.jpg`;
    const up=await sb.storage.from('expedientes').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(up.error)throw up.error;
    const {data,error}=await sb.from('fotos_piel').insert({negocio_id:NEGOCIO_ID,clienta_id:cliId,tipo,fecha:ymd(new Date()),path}).select().single();
    if(error)throw error;
    DB.fotos.unshift(rowToFoto(data));
    if(openCliId===cliId)renderFotos(cliId);
    toast('Foto guardada');
  }catch(e){console.error(e);toast('No se pudo subir la foto');}
}
async function fotoUrl(path){
  const c=FOTO_URL_CACHE[path];if(c&&c.exp>Date.now())return c.url;
  const {data,error}=await sb.storage.from('expedientes').createSignedUrl(path,3600);
  if(error||!data)return '';
  FOTO_URL_CACHE[path]={url:data.signedUrl,exp:Date.now()+50*60*1000};return data.signedUrl;
}
function renderFotos(cliId){
  const el=document.getElementById('pielFotos');if(!el)return;
  const list=DB.fotos.filter(f=>f.clientaId===cliId).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  if(!list.length){el.innerHTML='<p class="empty-mini" style="grid-column:1/-1">Sin fotos. Toma una “antes” en la primera cita y un “después” al cerrar la serie.</p>';return;}
  const TL={antes:'Antes',despues:'Después',seguimiento:'Seguimiento'};
  el.innerHTML=list.map(f=>{const d=new Date((f.fecha||ymd(new Date()))+'T00:00:00');return `<div class="foto"><img alt="" data-path="${esc(f.path)}"><span class="tag ${f.tipo==='despues'?'t-ok':(f.tipo==='antes'?'t-nails':'t-soft')}">${TL[f.tipo]||f.tipo} · ${d.getDate()} ${MON[d.getMonth()]}</span><span class="foto-x" data-on-click="delFoto('${f.id}')" title="Borrar">×</span></div>`;}).join('');
  el.querySelectorAll('img[data-path]').forEach(async im=>{const u=await fotoUrl(im.dataset.path);if(u){im.src=u;im.onclick=()=>window.open(u,'_blank');}});
}
async function delFoto(id){
  const f=DB.fotos.find(x=>x.id===id);if(!f)return;
  if(!confirm('¿Borrar esta foto?'))return;
  try{
    await sb.storage.from('expedientes').remove([f.path]);
    const {error}=await sb.from('fotos_piel').delete().eq('id',id);if(error)throw error;
    DB.fotos=DB.fotos.filter(x=>x.id!==id);renderFotos(openCliId);
  }catch(e){console.error(e);toast('No se pudo borrar la foto');}
}
function renderEvolucion(e){
  const el=document.getElementById('pielEvolucion');if(!el)return;
  const list=[...(e.evolucion||[])].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  el.innerHTML=list.length?list.map((n,i)=>{const d=new Date((n.fecha||ymd(new Date()))+'T00:00:00');return `<div class="evo"><div class="evo-d"><span class="num">${d.getDate()}</span><span>${MON[d.getMonth()]}</span></div><div class="evo-b">${n.servicio?`<div class="evo-s">${esc(n.servicio)}</div>`:''}<div class="evo-t">${esc(n.nota)}</div></div><span class="evo-x" data-on-click="delEvolucion(${list.length-1-i})" title="Borrar">×</span></div>`;}).join(''):'<p class="empty-mini">Sin notas todavía. Después de cada facial, anota qué viste y qué sigue.</p>';
}
document.getElementById('pielTipoChips').addEventListener('click',e=>{const ch=e.target.closest('.chip');if(!ch||!openCliId)return;const ex=getExp(openCliId);ex.tipo=(ex.tipo===ch.dataset.t)?'':ch.dataset.t;document.querySelectorAll('#pielTipoChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.t===ex.tipo));saveExpediente();});
async function saveExpediente(){
  if(!openCliId)return;
  const e=getExp(openCliId);
  e.fototipo=document.getElementById('pielFoto').value;
  e.sensibilidad=document.getElementById('pielSens').value;
  e.alergias=document.getElementById('pielAlergias').value.trim();
  e.contra=document.getElementById('pielContra').value.trim();
  e.objetivo=document.getElementById('pielObjetivo').value.trim();
  e.rutina=document.getElementById('pielRutina').value.trim();
  const empty=!e.tipo&&!e.fototipo&&!e.sensibilidad&&!e.alergias&&!e.contra&&!e.objetivo&&!e.rutina&&!(e.evolucion||[]).length;
  if(empty&&!e.id)return;
  try{
    const {data,error}=await sb.from('expedientes_piel').upsert(expToRow(e),{onConflict:'clienta_id'}).select().single();
    if(error)throw error;
    const fresh=rowToExp(data);const i=DB.expedientes.findIndex(x=>x.clientaId===openCliId);
    if(i>=0)DB.expedientes[i]=fresh;else DB.expedientes.push(fresh);
    const when=document.getElementById('pielWhen');if(when)when.textContent='act. hoy';
  }catch(err){console.error(err);toast('No se pudo guardar el expediente (¿falta la migración?)');}
}
async function addEvolucion(){
  if(!openCliId)return;
  const ta=document.getElementById('pielNota');const nota=ta.value.trim();if(!nota){toast('Escribe la nota');return;}
  const e=getExp(openCliId);
  const today=ymd(new Date());
  const skinToday=DB.citas.find(c=>c.clientaId===openCliId&&c.fecha===today&&c.estado!=='cancelada'&&citaCats(c).includes('skin'));
  e.evolucion=[...(e.evolucion||[]),{fecha:today,servicio:skinToday?svcFull(skinToday):'',nota}];
  ta.value='';renderEvolucion(e);
  await saveExpediente();
}
async function delEvolucion(idx){
  if(!openCliId)return;const e=getExp(openCliId);
  if(!confirm('¿Borrar esta nota?'))return;
  e.evolucion=(e.evolucion||[]).filter((_,i)=>i!==idx);renderEvolucion(e);await saveExpediente();
}
async function saveCliNotes(){
  if(!openCliId)return;
  const cl=DB.clientas.find(x=>x.id===openCliId);cl.notas=document.getElementById('cliNotes').value.trim();
  try{await sb.from('clientas').update({notas:cl.notas}).eq('id',openCliId);}catch(e){console.error(e);}
}
async function saveCliContact(){
  if(!openCliId)return;
  const cl=DB.clientas.find(x=>x.id===openCliId);
  cl.telefono=document.getElementById('cliPhone').value.trim();
  cl.email=document.getElementById('cliEmail').value.trim();
  cl.cumple=document.getElementById('cliCumple').value||'';
  try{await sb.from('clientas').update({telefono:cl.telefono,email:cl.email,cumple:cl.cumple||null}).eq('id',openCliId);}catch(e){console.error(e);}
}
async function saveCliPrefs(){
  if(!openCliId)return;
  const cl=DB.clientas.find(x=>x.id===openCliId);
  cl.coloresFav=document.getElementById('cliColores').value.trim();
  cl.alergias=document.getElementById('cliAlergias').value.trim();
  cl.notasPrefs=document.getElementById('cliNotasPrefs').value.trim();
  try{await sb.from('clientas').update({colores_fav:cl.coloresFav,alergias:cl.alergias,notas_prefs:cl.notasPrefs}).eq('id',openCliId);}catch(e){console.error(e);}
}
let curForma='';
function setForma(f){
  curForma=f;
  document.querySelectorAll('#formaChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.f===f));
  if(!openCliId)return;
  const cl=DB.clientas.find(x=>x.id===openCliId);
  if(cl){cl.formaUna=f;sb.from('clientas').update({forma_una:f}).eq('id',openCliId).then();}
}
document.getElementById('formaChips').addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(c&&c.dataset.f){
    const f=c.dataset.f===curForma?'':c.dataset.f; // toggle off si se toca la misma
    setForma(f);
  }
});
function loadCliPrefs(cl){
  curForma=cl.formaUna||'';
  document.querySelectorAll('#formaChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.f===curForma));
  document.getElementById('cliColores').value=cl.coloresFav||'';
  document.getElementById('cliAlergias').value=cl.alergias||'';
  document.getElementById('cliNotasPrefs').value=cl.notasPrefs||'';
  renderFreqSvcs(cl.id);
}
function renderFreqSvcs(cliId){
  const el=document.getElementById('cliFreqSvcs');if(!el)return;
  const citas=DB.citas.filter(c=>c.clientaId===cliId&&c.estado==='atendida');
  if(citas.length<2){el.innerHTML='';return;}
  // cuenta frecuencia de cada servicio
  const freq={};
  citas.forEach(c=>citaItems(c).forEach(i=>{const k=i.n;freq[k]=(freq[k]||0)+1;}));
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(!top.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="freq-svcs"><div class="fs-title">🔄 Suele pedir</div>${top.map(([n,v])=>`<span class="fs-chip">${n} <small>×${v}</small></span>`).join('')}</div>`;
}

function openCliCreateSheet(){
  cliCreateReturnToAppt=false;
  document.getElementById('ncName').value='';
  document.getElementById('ncPhone').value='';
  document.getElementById('ncEmail').value='';
  document.getElementById('ncNotes').value='';
  showSheet('cliCreateSheet');
}
function addCliFromAppt(){
  const q=document.getElementById('apptCli').value.trim();
  cliCreateReturnToAppt=true;
  document.getElementById('ncName').value=q;
  document.getElementById('ncPhone').value='';
  document.getElementById('ncEmail').value='';
  document.getElementById('ncNotes').value='';
  document.getElementById('apptCliResults').innerHTML='';
  document.getElementById('apptSheet').classList.remove('show');
  showSheet('cliCreateSheet');
}
async function saveNewCli(){
  const nombre=document.getElementById('ncName').value.trim();
  if(!nombre){toast('Escribe el nombre');return;}
  const existing=DB.clientas.find(c=>c.nombre.toLowerCase()===nombre.toLowerCase());
  if(existing&&!cliCreateReturnToAppt){toast('Ya existe una clienta con ese nombre');return;}
  let cli=existing;
  if(!cli){
    const draft={nombre,telefono:document.getElementById('ncPhone').value.trim(),email:document.getElementById('ncEmail').value.trim(),notas:document.getElementById('ncNotes').value.trim()};
    try{
      const {data:ins,error}=await sb.from('clientas').insert(cliToRow(draft)).select().single();
      if(error)throw error;
      cli=rowToCli(ins);DB.clientas.push(cli);
    }catch(e){toast('Error al guardar clienta');console.error(e);return;}
  }
  if(cliCreateReturnToAppt){
    cliCreateReturnToAppt=false;
    apptSelectedCliId=cli.id;
    document.getElementById('apptCli').value=cli.nombre;
    document.getElementById('apptCliResults').innerHTML='';
    document.getElementById('cliCreateSheet').classList.remove('show');
    curSheet='apptSheet';
    requestAnimationFrame(()=>document.getElementById('apptSheet').classList.add('show'));
    toast('Clienta agregada 💗');
  }else{
    closeSheet();renderClientas();toast('Clienta agregada 💗');
  }
}
