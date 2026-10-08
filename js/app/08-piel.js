/* ---------------- EXPEDIENTE DE PIEL ---------------- */
// cada nota lleva id; a las viejas sin id se les da uno estable (igual en cada carga)
function rowToExp(r){const evo=Array.isArray(r.evolucion)?r.evolucion:[];return {id:r.id,clientaId:r.clienta_id,tipo:r.tipo||'',fototipo:r.fototipo||'',sensibilidad:r.sensibilidad||'',alergias:r.alergias||'',contra:r.contraindicaciones||'',objetivo:r.objetivo||'',rutina:r.rutina||'',evolucion:evo.map((n,i)=>(n&&n.id)?n:{...n,id:NUC.idNota(n,i)}),updatedAt:r.updated_at||''}}
function expToRow(e){return {negocio_id:NEGOCIO_ID,clienta_id:e.clientaId,tipo:e.tipo||'',fototipo:e.fototipo||'',sensibilidad:e.sensibilidad||'',alergias:e.alergias||'',contraindicaciones:e.contra||'',objetivo:e.objetivo||'',rutina:e.rutina||'',evolucion:e.evolucion||[]}}
/* expediente de la clienta; si aún no tiene, se crea uno vacío EN el caché para que
   el tipo de piel o la primera nota no se pierdan antes de guardarse */
function getExp(cliId){let e=DB.expedientes.find(x=>x.clientaId===cliId);if(!e){e={id:null,clientaId:cliId,tipo:'',fototipo:'',sensibilidad:'',alergias:'',contra:'',objetivo:'',rutina:'',evolucion:[],updatedAt:''};DB.expedientes.push(e);}return e;}
const PIEL_CAMPOS={pielFoto:'fototipo',pielSens:'sensibilidad',pielAlergias:'alergias',pielContra:'contra',pielObjetivo:'objetivo',pielRutina:'rutina'};
let pielCargado={}; // último valor puesto en cada campo: si el de pantalla difiere, hay cambios sin guardar
/* suave=true (refresco por tiempo real): no toca el campo con foco, los que tienen
   cambios sin guardar ni la nota que se está escribiendo */
function loadExpediente(cliId,suave){
  const e=getExp(cliId);
  document.querySelectorAll('#pielTipoChips .chip').forEach(ch=>ch.classList.toggle('sel',ch.dataset.t===e.tipo));
  Object.entries(PIEL_CAMPOS).forEach(([id,k])=>{
    const el=document.getElementById(id);if(!el)return;const v=e[k]||'';
    if(suave&&(el===document.activeElement||el.value!==(pielCargado[id]??'')))return;
    el.value=v;pielCargado[id]=v;
  });
  if(!suave)document.getElementById('pielNota').value='';
  const when=document.getElementById('pielWhen');if(when)when.textContent=e.updatedAt?('act. '+fmtFechaCompleta(NUC.fechaLocal(e.updatedAt),'')):'';
  renderConsent(DB.clientas.find(x=>x.id===cliId));
  renderEvolucion(e);
  renderFotos(cliId);
}
/* consentimiento para guardar datos de salud y fotos (columnas de la migración 20261008_11) */
function renderConsent(cl){
  const ch=document.getElementById('pielConsent');if(!ch)return;
  ch.checked=!!(cl&&cl.consentSalud);
  const f=document.getElementById('pielConsentFecha');if(f)f.textContent=(cl&&cl.consentSalud&&cl.consentFecha)?' · '+fechaLarga(cl.consentFecha):'';
}
async function setConsentimiento(si){
  const cl=DB.clientas.find(x=>x.id===openCliId);if(!cl)return;
  const fecha=si?ymd(new Date()):null;
  try{await guardar(sb.from('clientas').update({consentimiento_salud:!!si,consentimiento_fecha:fecha}).eq('id',cl.id));}
  catch(e){renderConsent(cl);avisarError(e);return;}
  cl.consentSalud=!!si;cl.consentFecha=fecha||'';renderConsent(cl);
}
/* ---- fotos antes / después (bucket privado "expedientes", URL firmada al mostrar) ---- */
function rowToFoto(r){return {id:r.id,clientaId:r.clienta_id,tipo:r.tipo||'seguimiento',fecha:r.fecha||'',path:r.path||'',nota:r.nota||''}}
let fotoTipo='seguimiento';const FOTO_URL_CACHE={};
function pickFoto(t){
  if(!openCliId)return;
  const cl=DB.clientas.find(x=>x.id===openCliId);
  if(cl&&!cl.consentSalud&&!confirm('La clienta no ha autorizado guardar sus fotos. ¿Tomar la foto de todas formas?'))return;
  fotoTipo=t;const inp=document.getElementById('fotoInput');inp.value='';inp.click();
}
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
  let huerfana=''; // archivo subido cuya fila no se pudo guardar: se borra
  try{
    const blob=await compressImage(f,1280,.82);
    const path=`${NEGOCIO_ID}/${cliId}/${Date.now()}_${tipo}.jpg`;
    await guardar(sb.storage.from('expedientes').upload(path,blob,{contentType:'image/jpeg',upsert:false}));
    huerfana=path;
    const data=await guardar(sb.from('fotos_piel').insert({negocio_id:NEGOCIO_ID,clienta_id:cliId,tipo,fecha:ymd(new Date()),path}).select().single());
    huerfana='';
    ponerEnCache('fotos',rowToFoto(data),true);
    if(openCliId===cliId)renderFotos(cliId);
    toast('Foto guardada');
  }catch(e){
    console.error(e);toast('No se pudo subir la foto');
    if(huerfana)sb.storage.from('expedientes').remove([huerfana]).then(()=>{},()=>{});
  }
}
async function fotoUrl(path){
  const c=FOTO_URL_CACHE[path];if(c&&c.exp>Date.now())return c.url;
  const {data,error}=await sb.storage.from('expedientes').createSignedUrl(path,300);
  if(error||!data)return '';
  FOTO_URL_CACHE[path]={url:data.signedUrl,exp:Date.now()+4*60*1000};return data.signedUrl;
}
function renderFotos(cliId){
  const el=document.getElementById('pielFotos');if(!el)return;
  const list=DB.fotos.filter(f=>f.clientaId===cliId).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  if(!list.length){el.innerHTML='<p class="empty-mini" style="grid-column:1/-1">Sin fotos. Toma una “antes” en la primera cita y un “después” al cerrar la serie.</p>';return;}
  const TL={antes:'Antes',despues:'Después',seguimiento:'Seguimiento'};
  el.innerHTML=list.map(f=>{const d=new Date((f.fecha||ymd(new Date()))+'T00:00:00');return `<div class="foto"><img alt="" data-path="${esc(f.path)}"><span class="tag ${f.tipo==='despues'?'t-ok':(f.tipo==='antes'?'t-nails':'t-soft')}">${TL[f.tipo]||f.tipo} · ${d.getDate()} ${MON[d.getMonth()]}</span><span class="foto-x" data-on-click="delFoto('${f.id}')" title="Borrar">×</span></div>`;}).join('');
  el.querySelectorAll('img[data-path]').forEach(async im=>{const u=await fotoUrl(im.dataset.path);if(u){im.src=u;im.onclick=()=>window.open(u,'_blank','noopener');}});
}
async function delFoto(id){
  const f=DB.fotos.find(x=>x.id===id);if(!f)return;
  if(!confirm('¿Borrar esta foto?'))return;
  try{
    await guardar(sb.storage.from('expedientes').remove([f.path]));
    await guardar(sb.from('fotos_piel').delete().eq('id',id));
    DB.fotos=DB.fotos.filter(x=>x.id!==id);renderFotos(openCliId);
  }catch(e){avisarError(e,'No se pudo borrar la foto');}
}
function renderEvolucion(e){
  const el=document.getElementById('pielEvolucion');if(!el)return;
  const list=[...(e.evolucion||[])].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  el.innerHTML=list.length?list.map(n=>{const d=new Date((n.fecha||ymd(new Date()))+'T00:00:00');return `<div class="evo"><div class="evo-d"><span class="num">${d.getDate()}</span><span>${MON[d.getMonth()]}</span></div><div class="evo-b">${n.servicio?`<div class="evo-s">${esc(n.servicio)}</div>`:''}<div class="evo-t">${esc(n.nota)}</div></div><span class="evo-x" data-id="${esc(n.id)}" data-on-click="delEvolucion(this.dataset.id)" title="Borrar">×</span></div>`;}).join(''):'<p class="empty-mini">Sin notas todavía. Después de cada facial, anota qué viste y qué sigue.</p>';
}
document.getElementById('pielTipoChips').addEventListener('click',async e=>{
  const ch=e.target.closest('.chip');if(!ch||!openCliId)return;
  const ex=getExp(openCliId),antes=ex.tipo;
  ex.tipo=(ex.tipo===ch.dataset.t)?'':ch.dataset.t;
  const pinta=()=>document.querySelectorAll('#pielTipoChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.t===ex.tipo));
  pinta();
  if(!await saveExpediente()){ex.tipo=antes;pinta();}
});
/* guarda el expediente con lo que hay en pantalla; devuelve true si se guardó */
async function saveExpediente(){
  if(!openCliId)return false;
  const cliId=openCliId,e=getExp(cliId);
  const vals={};Object.entries(PIEL_CAMPOS).forEach(([id,k])=>{const v=document.getElementById(id).value;vals[id]=(id==='pielFoto'||id==='pielSens')?v:v.trim();});
  Object.entries(PIEL_CAMPOS).forEach(([id,k])=>{e[k]=vals[id];});
  const empty=!e.tipo&&!e.fototipo&&!e.sensibilidad&&!e.alergias&&!e.contra&&!e.objetivo&&!e.rutina&&!(e.evolucion||[]).length;
  if(empty&&!e.id)return true;
  try{
    const data=await guardar(sb.from('expedientes_piel').upsert(expToRow(e),{onConflict:'clienta_id'}).select().single());
    const fresh=data?rowToExp(data):e;const i=DB.expedientes.findIndex(x=>x.clientaId===cliId);
    if(i>=0)DB.expedientes[i]=fresh;else DB.expedientes.push(fresh);
    if(openCliId===cliId){Object.keys(PIEL_CAMPOS).forEach(id=>{pielCargado[id]=vals[id];});const when=document.getElementById('pielWhen');if(when)when.textContent='act. hoy';}
    return true;
  }catch(err){avisarError(err,'No se pudo guardar el expediente. Revisa tu conexión.');return false;}
}
async function addEvolucion(){
  if(!openCliId)return;
  const ta=document.getElementById('pielNota');const nota=ta.value.trim();if(!nota){toast('Escribe la nota');return;}
  const listo=ocupar('nota');if(!listo)return;
  try{
    const e=getExp(openCliId),antes=e.evolucion||[];
    const today=ymd(new Date());
    const skinToday=DB.citas.find(c=>c.clientaId===openCliId&&c.fecha===today&&c.estado!=='cancelada'&&citaCats(c).includes('skin'));
    e.evolucion=[...antes,{id:uid(),fecha:today,servicio:skinToday?svcFull(skinToday):'',nota}];
    renderEvolucion(e);
    if(await saveExpediente()){ta.value='';renderEvolucion(getExp(openCliId));}
    else{e.evolucion=antes;renderEvolucion(e);} // la nota se queda escrita para reintentar
  }finally{listo();}
}
async function delEvolucion(id){
  if(!openCliId||!id)return;const e=getExp(openCliId);
  if(!confirm('¿Borrar esta nota?'))return;
  const antes=e.evolucion||[];
  e.evolucion=antes.filter(n=>n.id!==id);renderEvolucion(e);
  if(!await saveExpediente()){e.evolucion=antes;renderEvolucion(e);}
}
/* ---- ficha de la clienta: cada campo se guarda al salir de él; el caché cambia solo si se guardó ---- */
async function guardarClienta(cambios,aplicar){
  const id=openCliId;if(!id)return false;
  try{await guardar(sb.from('clientas').update(cambios).eq('id',id));}
  catch(e){avisarError(e);return false;}
  const cl=DB.clientas.find(x=>x.id===id);if(cl)aplicar(cl);
  return true;
}
function saveCliNotes(){
  const notas=document.getElementById('cliNotes').value.trim();
  return guardarClienta({notas},cl=>{cl.notas=notas;});
}
function saveCliContact(){
  const telefono=document.getElementById('cliPhone').value.trim(),email=document.getElementById('cliEmail').value.trim(),cumple=document.getElementById('cliCumple').value||'';
  return guardarClienta({telefono,email,cumple:cumple||null},cl=>{cl.telefono=telefono;cl.email=email;cl.cumple=cumple;});
}
function saveCliPrefs(){
  const coloresFav=document.getElementById('cliColores').value.trim(),alergias=document.getElementById('cliAlergias').value.trim(),notasPrefs=document.getElementById('cliNotasPrefs').value.trim();
  return guardarClienta({colores_fav:coloresFav,alergias,notas_prefs:notasPrefs},cl=>{cl.coloresFav=coloresFav;cl.alergias=alergias;cl.notasPrefs=notasPrefs;});
}
let curForma='';
function pintarForma(){document.querySelectorAll('#formaChips .chip').forEach(c=>c.classList.toggle('sel',c.dataset.f===curForma));}
async function setForma(f){
  const antes=curForma;curForma=f;pintarForma();
  if(!openCliId)return;
  if(!await guardarClienta({forma_una:f},cl=>{cl.formaUna=f;})){curForma=antes;pintarForma();}
}
document.getElementById('formaChips').addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(c&&c.dataset.f){
    const f=c.dataset.f===curForma?'':c.dataset.f; // toggle off si se toca la misma
    setForma(f);
  }
});
function loadCliPrefs(cl){
  curForma=cl.formaUna||'';
  pintarForma();
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
  const existing=DB.clientas.find(c=>normTxt(c.nombre)===normTxt(nombre));
  if(existing&&!cliCreateReturnToAppt){toast('Ya existe una clienta con ese nombre');return;}
  // desde una cita: puede ser la misma clienta o una homónima; se pregunta
  let cli=(existing&&confirm(`Ya existe una clienta llamada ${existing.nombre}${existing.telefono?' ('+existing.telefono+')':''}. ¿Agendar con ella?\n\nCancelar crea una clienta nueva.`))?existing:null;
  if(!cli){
    const listo=ocupar('nuevaCli',document.querySelector('#cliCreateSheet .btn-primary'),'Guardando…');if(!listo)return;
    try{
      const draft={nombre,telefono:document.getElementById('ncPhone').value.trim(),email:document.getElementById('ncEmail').value.trim(),notas:document.getElementById('ncNotes').value.trim()};
      cli=ponerEnCache('clientas',rowToCli(await guardar(sb.from('clientas').insert(cliToRow(draft)).select().single())));
    }catch(e){avisarError(e,'No se pudo guardar la clienta. Revisa tu conexión.');return;}
    finally{listo();}
  }
  if(cliCreateReturnToAppt){
    cliCreateReturnToAppt=false;
    document.getElementById('cliCreateSheet').classList.remove('show');
    curSheet='apptSheet';
    requestAnimationFrame(()=>document.getElementById('apptSheet').classList.add('show'));
    pickApptCli(cli.id);
    toast('Clienta agregada 💗');
  }else{
    closeSheet();renderClientas();toast('Clienta agregada 💗');
  }
}
