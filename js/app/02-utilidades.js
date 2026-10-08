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

/* ---------------- NAV ----------------
   4 pestañas + el botón central «+» (siempre «Nueva cita»). Finanzas y Menú
   viven dentro de «Más»: con ellas abiertas, la pestaña activa es «Más». */
const NAV_TAB={agenda:'agenda',citas:'citas',clientas:'clientas',mas:'mas',ventas:'mas',servicios:'mas'};
function nav(v){
  const prev=currentView;
  document.querySelectorAll('.view').forEach(s=>s.classList.remove('active'));
  document.getElementById('v-'+v).classList.add('active');
  const tab=NAV_TAB[v]||v;
  document.querySelectorAll('.nav button[data-v]').forEach(b=>{
    const on=b.dataset.v===tab;b.classList.toggle('on',on);
    if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  currentView=v;
  // Todas las secciones excepto agenda empiezan desde arriba
  if(v!=='agenda')window.scrollTo({top:0,behavior:'instant'});
  if(v==='ventas')renderFinanzas();
  if(v==='clientas')renderClientas();
  if(v==='servicios')renderServicios();
  if(v==='agenda'){agAutoScroll=true;renderAgenda();}
  if(v==='citas')renderCitas();
  // Al cambiar de sección el foco va al título (lectores de pantalla y teclado)
  if(prev!==v){const h=document.querySelector('#v-'+v+' h1');if(h&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.nav,.mas-list,.back'))h.focus({preventScroll:true});}
}
let currentView='agenda';
/* El «+» central siempre crea una cita; se conserva el nombre por compatibilidad. */
function fabAction(){openApptSheet();}

/* ---------------- GREETING ---------------- */
function greet(){
  const el=document.getElementById('greet');if(!el)return;
  const h=new Date().getHours();
  el.textContent=h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
}
