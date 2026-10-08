/* ---------------- DATE HELPERS ---------------- */
const DOW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MON=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fmtMoney(n){return '$'+Number(n||0).toLocaleString('es-MX')}
/* Escapa texto para meterlo en HTML (contenido o atributo entre comillas). */
const ESC_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>ESC_MAP[c])}
function getApptDur(){const h=Number(document.getElementById('apptDurH').value)||0;const m=Number(document.getElementById('apptDurM').value)||0;return h*60+m;}
function setApptDur(min){min=Number(min)||60;const h=Math.floor(min/60);let m=min%60;if(![0,15,30,45].includes(m))m=Math.round(m/15)*15%60;const hSel=document.getElementById('apptDurH'),mSel=document.getElementById('apptDurM');hSel.value=String(Math.min(h,8));mSel.value=String(m);}
function fmtDur(min){min=Number(min)||0;const h=Math.floor(min/60),m=min%60;if(h&&m)return `${h} h ${m} min`;if(h)return `${h} h`;return `${m} min`;}
function citaItems(c){if(c.items&&c.items.length)return c.items;const s=DB.servicios.find(x=>x.id===c.servicioId);return [{id:c.servicioId||'',n:(s?s.n:(c.svcName||'Servicio')),p:Number(c.precio||0)}]}
/* monto realmente cobrado: usa 'cobrado' si la dueña aplicó descuento, si no el precio */
function montoCita(c){
  if(c.estado!=='atendida')return 0;
  return pagosSummary(c).cobrado;
}
function deudaCita(c){
  if(c.estado!=='atendida')return 0;
  return pagosSummary(c).deuda;
}
function svcDisplay(c){const it=citaItems(c);if(it.length<=1)return it[0]?it[0].n:(c.svcName||'Servicio');return it[0].n+' +'+(it.length-1)}
function svcFull(c){return citaItems(c).map(i=>i.n).join(' · ')}
function fmt12(t){if(!t)return '';let[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';h=h%12||12;return {h:h+':'+String(m).padStart(2,'0'),ap}}
function fmtFechaCompleta(fecha,hora){const d=new Date(fecha+'T00:00:00');let s=`${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;if(hora){const t=fmt12(hora);s+=` · ${t.h} ${t.ap}`;}return s;}
let selectedDate=ymd(new Date());

/* ---------------- NAV ---------------- */
function nav(v){
  document.querySelectorAll('.view').forEach(s=>s.classList.remove('active'));
  document.getElementById('v-'+v).classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  const fab=document.getElementById('fab');
  const fabLabels={agenda:'Nueva cita',citas:'Nueva cita',clientas:'Clienta',servicios:'Servicio'};
  fab.style.display=fabLabels[v]?'flex':'none';
  const fl=document.getElementById('fabLabel');if(fl&&fabLabels[v])fl.textContent=fabLabels[v];
  currentView=v;
  // Todas las secciones excepto agenda empiezan desde arriba
  if(v!=='agenda')window.scrollTo({top:0,behavior:'instant'});
  if(v==='ventas')renderVentas();
  if(v==='clientas')renderClientas();
  if(v==='servicios')renderServicios();
  if(v==='agenda'){agAutoScroll=true;renderAgenda();}
  if(v==='citas')renderCitas();
}
let currentView='agenda';
function fabAction(){
  if(currentView==='clientas')openCliCreateSheet();
  else if(currentView==='servicios')openSvcSheet();
  else openApptSheet();
}

/* ---------------- GREETING ---------------- */
function greet(){
  const h=new Date().getHours();
  const s=h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
  document.getElementById('greet').innerHTML=s+', <b>preciosa</b>';
}
