/* ---------------- AGENDA ---------------- */
const PALETTE={
  rosa:{bg:'#FBD7E4',br:'#E58AAD',tx:'#7A2748'},
  lila:{bg:'#E7DAF6',br:'#A985D9',tx:'#5B3A86'},
  durazno:{bg:'#FCE2CF',br:'#EFA877',tx:'#8A4F22'},
  menta:{bg:'#D5F0E2',br:'#7FCBA6',tx:'#2F6B4E'},
  cielo:{bg:'#D8E9FB',br:'#86B7E8',tx:'#2D5B86'},
  coral:{bg:'#FBD6CF',br:'#EE9183',tx:'#8C3A2E'},
  oro:{bg:'#F7E8C6',br:'#D9B96A',tx:'#7C5E1E'}
};
const PAL_ORDER=['rosa','lila','durazno','menta','cielo','coral','oro'];
const PAL_NAME={rosa:'Rosa',lila:'Lila',durazno:'Durazno',menta:'Menta',cielo:'Cielo',coral:'Coral',oro:'Oro'};
const MONF=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOWL=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
/* Horario visible: 8:00–20:00, o más si hay citas fuera de ese rango */
const DAY_START=8,DAY_END=20,HOUR_PX=60,HOUR_PX_WK=48;
let RST=DAY_START,REN=DAY_END;
function setRange(keys){
  let mn=DAY_START,mx=DAY_END;
  keys.forEach(k=>dayEvents(k).concat(dayPersonales(k)).forEach(c=>{
    if(!c.hora)return;
    const s=toMin(c.hora),e=s+(Number(c.dur)||60);
    mn=Math.min(mn,Math.floor(s/60));
    mx=Math.max(mx,Math.ceil(e/60));
  }));
  RST=mn;REN=Math.max(mx,mn+1);
}
/* Vista por defecto: Carriles (día por recurso) */
let agMode='dia',agAnchor=new Date();agAnchor.setHours(0,0,0,0);
let agAutoScroll=true; // activa auto-enfoque al abrir/cambiar día (no en refrescos automáticos)

function toMin(t){if(!t)return null;const p=t.split(':');return (+p[0])*60+(+p[1])}
function minLabel(min){let h=Math.floor(min/60),m=min%60,ap=h>=12?'PM':'AM',hh=h%12||12;return hh+(m?':'+String(m).padStart(2,'0'):'')+' '+ap}
/* Hora de 24 h como en el diseño C: 9:00, 13:30 */
function hm(min){min=Math.round(min);return Math.floor(min/60)+':'+String(min%60).padStart(2,'0')}
/* Valor para <input type="time">: 09:00 */
function hhmm(min){return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0')}
function startOfWeek(d){const x=new Date(d);const day=x.getDay(),diff=(day===0?6:day-1);x.setDate(x.getDate()-diff);x.setHours(0,0,0,0);return x}
function dayEvents(key){return DB.citas.filter(c=>c.fecha===key)}
/* Eventos personales del día (js/app/16-eventos.js). No son citas: nunca entran
   en los conteos, cobros ni estadísticas; solo se dibujan y apartan horario. */
function dayPersonales(key){return (DB.eventos||[]).filter(e=>e.fecha===key).sort((a,b)=>(a.hora||'').localeCompare(b.hora||''))}
function evRango(e){const s=toMin(e.hora);return s==null?null:{s,e:s+(Number(e.dur)||60)}}
function cliNombre(c){const cli=DB.clientas.find(x=>x.id===c.clientaId);return cli?cli.nombre:'Clienta'}
function fechaCorta(key){const d=new Date(key+'T00:00:00');const y=d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'';return `${DOW[d.getDay()].toLowerCase()} ${d.getDate()} ${MON[d.getMonth()].toLowerCase()}${y}`}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}

function agShift(dir){
  if(agMode==='dia'||agMode==='lista')agAnchor.setDate(agAnchor.getDate()+dir);
  else if(agMode==='sem')agAnchor.setDate(agAnchor.getDate()+dir*7);
  else agAnchor.setMonth(agAnchor.getMonth()+dir);
  agAutoScroll=true;renderAgenda();
}
function agToday(){agAnchor=new Date();agAnchor.setHours(0,0,0,0);agAutoScroll=true;renderAgenda()}
function goDay(key){
  agAnchor=new Date(key+'T00:00:00');agMode='dia';
  document.querySelectorAll('#agViewSeg button').forEach(b=>b.classList.toggle('on',b.dataset.m==='dia'));
  agAutoScroll=true;renderAgenda();
}
document.getElementById('agViewSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  agMode=b.dataset.m;
  document.querySelectorAll('#agViewSeg button').forEach(x=>x.classList.toggle('on',x===b));
  agAutoScroll=true;renderAgenda();
});

function placeEvents(evs){
  evs.sort((a,b)=>a._s-b._s||a._e-b._e);
  let cols=[],cluster=[],cEnd=-1;
  const flush=()=>{const n=cols.length||1;cluster.forEach(e=>e._cols=n);cluster=[];cols=[];cEnd=-1;};
  evs.forEach(e=>{
    if(cluster.length&&e._s>=cEnd)flush();
    let placed=false;
    for(let i=0;i<cols.length;i++){if(cols[i]<=e._s){cols[i]=e._e;e._col=i;placed=true;break;}}
    if(!placed){e._col=cols.length;cols.push(e._e);}
    cluster.push(e);cEnd=Math.max(cEnd,e._e);
  });
  flush();return evs;
}
const ESTADO_TXT={agendada:'Agendada',atendida:'Atendida',cancelada:'Cancelada'};
/* Bloque de la vista Semana (columnas estrechas) */
function evBox(c,narrow){
  if(c._pers)return persBox(c,narrow);
  const pal=PALETTE[c.color]||PALETTE.rosa;
  const hpx=narrow?HOUR_PX_WK:HOUR_PX;
  const top=Math.max(0,(c._s-RST*60)/60*hpx)+10; // +10: el relleno superior de la columna
  const h=Math.max(((c._e-c._s)/60)*hpx,narrow?16:40);
  const w=100/(c._cols||1),left=(c._col||0)*w;
  const nombre=cliNombre(c);
  const todayKey=ymd(new Date());
  const nowM=new Date().getHours()*60+new Date().getMinutes();
  const pasada=c.fecha<todayKey||(c.fecha===todayKey&&c._e<=nowM);
  // Pasadas y canceladas: fondo neutro con texto oscuro (sin opacidad, para que se lean)
  let cls='ev';let st=`background:${pal.bg};border-left-color:${pal.br};color:${pal.tx}`;
  if(c.estado==='cancelada'){cls+=' ev-cancel';st='';}
  else if(pasada||c.estado==='atendida'){cls+=' ev-past';st=`border-left-color:${pal.br}`;}
  const inner=narrow?`<span class="ec">${esc(nombre.split(' ')[0])}</span>`
    :`<span class="et">${hm(c._s)}</span><span class="ec">${esc(nombre)}</span><span class="es">${esc(svcDisplay(c))}</span>`;
  const lbl=`${hm(c._s)}, ${nombre}, ${svcDisplay(c)}, ${ESTADO_TXT[c.estado]||'Agendada'}`;
  return `<button type="button" class="${cls}" style="top:${top}px;height:${h}px;left:calc(${left}% + 1px);width:calc(${w}% - 2px);${st}" aria-label="${esc(lbl)}" data-on-click="event.stopPropagation();editAppt('${c.id}')">${inner}</button>`;
}
function persBox(o,narrow){
  const ev=o._pers,hpx=narrow?HOUR_PX_WK:HOUR_PX;
  const top=Math.max(0,(o._s-RST*60)/60*hpx)+10;
  const h=Math.max(((o._e-o._s)/60)*hpx,narrow?16:40);
  const w=100/(o._cols||1),left=(o._col||0)*w;
  const inner=narrow?`<span class="ec">${esc(ev.titulo)}</span>`:`<span class="et">${hm(o._s)}</span><span class="ec">${esc(ev.titulo)}</span><span class="es">Personal</span>`;
  return `<button type="button" class="ev ev-pers" style="top:${top}px;height:${h}px;left:calc(${left}% + 1px);width:calc(${w}% - 2px)" aria-label="${esc(`${hm(o._s)} a ${hm(o._e)}, ${ev.titulo}, evento personal`)}" data-on-click="event.stopPropagation();editEvento('${ev.id}')">${inner}</button>`;
}
function gutterHours(){let g='';for(let hh=RST;hh<REN;hh++){g+=`<div class="hr-cell"><span class="lbl">${hh}:00</span></div>`;}return g}
function gridLines(){let l='';for(let hh=RST;hh<REN;hh++)l+='<div class="line"></div>';return l}
function nowLine(){const now=new Date();const m=now.getHours()*60+now.getMinutes();if(m<RST*60||m>REN*60)return '';return `<div class="nowline" style="top:${(m-RST*60)/60*HOUR_PX}px" aria-hidden="true"></div>`}

function prepDay(key,narrow){
  const timed=dayEvents(key).filter(c=>c.hora).map(c=>{c._s=toMin(c.hora);c._e=c._s+(Number(c.dur)||60);return c;});
  dayPersonales(key).forEach(ev=>{const r=evRango(ev);if(r)timed.push({_pers:ev,_s:r.s,_e:r.e});});
  placeEvents(timed);return timed;
}
/* La vista Día siempre es por carriles (Mesa · Cabina). Se conserva el interruptor por compatibilidad. */
let agLanes=true;
function toggleLanes(){agLanes=!agLanes;agAutoScroll=true;renderAgenda();}
const LANES=[
  {r:'mesa',n:'Mesa de uñas',cls:'nails',verbo:'Agendar uñas'},
  {r:'cabina',n:'Cabina facial',cls:'skin',verbo:'Agendar facial'}
];
const PX_MIN=HOUR_PX/60;
function laneBlock(o,mn,isToday,nowM){
  const sg=o.sg,c=sg.c;
  const top=(sg.s-mn)*PX_MIN,h=Math.max((sg.e-sg.s)*PX_MIN,30);
  const n=o._cols||1,w=100/n,left=(o._col||0)*w;
  const pos=`left:calc(${left}% + ${o._col?2:0}px);width:calc(${w}% - ${n>1?2:0}px)`;
  const nombre=cliNombre(c),svc=sg.n||svcDisplay(c);
  const cat=sg.cat==='skin'?'skin':(sg.cat==='otro'?'otro':'nails');
  const done=c.estado==='atendida';
  const live=isToday&&!done&&sg.s<=nowM&&sg.e>nowM;
  const conf=c.estado==='agendada'&&!!c.confirmadaAt;
  const ck=done?icon('check','b-ck'):'';
  const t=`${hm(sg.s)} – ${hm(sg.e)}`;
  let inner;
  if(h<44)inner=`<span class="b-n">${ck}${esc(nombre)}</span>`;
  else if(h<62)inner=`<span class="b-n">${ck}${esc(nombre)}</span><span class="b-s">${esc(svc)}</span>`;
  else inner=`<span class="b-n">${ck}${esc(nombre)}</span><span class="b-s">${esc(svc)}</span><span class="b-t">${t}</span>${conf&&h>=80?`<span class="b-c">${icon('check')}Confirmada</span>`:''}`;
  const lbl=`${t}, ${nombre}, ${svc}, ${done?'atendida':(conf?'confirmada':(live?'en curso':'agendada'))}`;
  let html=`<button type="button" class="blk ${cat}${done?' done':''}${live?' live':''}" style="top:${top}px;height:${h}px;${pos}" aria-label="${esc(lbl)}" data-on-click="editAppt('${c.id}')">${inner}</button>`;
  if(sg.l){const ct=Math.max(top+h,(sg.e-mn)*PX_MIN);html+=`<div class="clean ${cat}" style="top:${ct}px;height:${Math.max(5,sg.l*PX_MIN)}px;${pos}" title="Limpieza ${sg.l} min" aria-hidden="true"></div>`;}
  return {s:sg.s,html};
}
/* Huecos libres de un carril (≥ 45 min), como botones para agendar ahí */
function laneGaps(mine,key,L,mn,mx,desde){
  const busy=mine.map(o=>[o._s,o._e]).sort((a,b)=>a[0]-b[0]);
  let cur=Math.max(mn,desde==null?mn:Math.ceil(desde/15)*15);const out=[];
  busy.forEach(([s,e])=>{if(s>cur)out.push([cur,s]);cur=Math.max(cur,e);});
  if(mx>cur)out.push([cur,mx]);
  return out.map(([a,b])=>{
    a=Math.ceil(a/15)*15;b=Math.floor(b/15)*15;if(b-a<45)return null;
    const top=(a-mn)*PX_MIN+2,h=(b-a)*PX_MIN-4;
    const lbl=`Libre de ${hm(a)} a ${hm(b)} en ${L.n}. ${L.verbo}`;
    return {s:a,html:`<button type="button" class="gap ${L.cls}${h>150?' tall':(h<70?' short':'')}" style="top:${top}px;height:${h}px" aria-label="${lbl}" data-on-click="agendarHueco('${key}','${hhmm(a)}','${L.r}')">${icon('plus')}<span class="g-t">Libre ${hm(a)} – ${hm(b)}</span><span class="g-a">${L.verbo}</span></button>`};
  }).filter(Boolean);
}
/* Abre «Nueva cita» con la fecha, la hora y el recurso del hueco */
let apptRecursoPref=null;
function agendarHueco(key,hora,recurso){
  selectedDate=key;
  openApptSheet();
  apptRecursoPref=recurso;
  document.getElementById('apptTime').value=hora;
  renderSvcPicker();renderAssist();
  toast(`Hueco de ${hm(toMin(hora))} en ${RECURSOS[recurso]||'la agenda'}: elige servicio y clienta`);
}
function renderDayLanes(key,isToday){
  const canvas=document.getElementById('agendaCanvas');
  const all=dayEvents(key);
  const segs=[];all.filter(c=>c.hora&&c.estado!=='cancelada').forEach(c=>citaSegments(c).forEach(sg=>segs.push(sg)));
  // eventos personales: los que apartan horario van como banda sobre los dos
  // carriles; los de todo el día y los que no apartan, arriba como chips
  const pers=dayPersonales(key);
  const persBloq=pers.filter(e=>e.bloquea&&e.hora).map(ev=>({ev,...evRango(ev)}));
  const diaApartado=pers.some(e=>e.bloquea&&!e.hora);
  let mn=DAY_START*60,mx=DAY_END*60;
  segs.forEach(sg=>{mn=Math.min(mn,Math.floor(sg.s/60)*60);mx=Math.max(mx,Math.ceil((sg.e+(sg.l||0))/60)*60);});
  persBloq.forEach(p=>{mn=Math.min(mn,Math.floor(p.s/60)*60);mx=Math.max(mx,Math.ceil(p.e/60)*60);});
  RST=mn/60;REN=mx/60;
  const now=new Date(),nowM=now.getHours()*60+now.getMinutes(),todayKey=ymd(now);
  // Huecos: no en días pasados; hoy, solo desde la hora actual
  const desde=(key<todayKey||diaApartado)?null:(isToday?nowM:mn);
  let rows='';for(let h=RST;h<=REN;h++)rows+=`<div class="ln" style="top:${(h*60-mn)*PX_MIN}px"><span>${h}:00</span></div>`;
  const cols=LANES.map(L=>{
    const mine=segs.filter(sg=>sg.r===L.r||(L.r==='mesa'&&sg.r==='ninguno')).map(sg=>({sg,_s:sg.s,_e:sg.e+(sg.l||0)}));
    placeEvents(mine);
    const items=mine.map(o=>laneBlock(o,mn,isToday,nowM));
    if(desde!=null)laneGaps(mine.concat(persBloq.map(p=>({_s:p.s,_e:p.e}))),key,L,mn,mx,desde).forEach(g=>items.push(g));
    items.sort((a,b)=>a.s-b.s);
    return `<div class="lane ${L.cls}" role="group" aria-label="${L.n}">${items.map(x=>x.html).join('')}</div>`;
  }).join('');
  const nowHtml=(isToday&&nowM>=mn&&nowM<=mx)?`<div class="now" style="top:${(nowM-mn)*PX_MIN}px" aria-hidden="true"></div>`:'';
  const noTime=all.filter(c=>!c.hora&&c.estado!=='cancelada');
  const sinhora=noTime.length?`<div class="sinhora"><span class="sh-l">Sin hora</span>${noTime.map(c=>`<button type="button" class="chip" data-on-click="editAppt('${c.id}')">${esc(cliNombre(c))}</button>`).join('')}</div>`:'';
  const persChips=pers.filter(e=>!e.hora||!e.bloquea);
  const persTira=persChips.length?`<div class="sinhora"><span class="sh-l">Personal</span>${persChips.map(e=>`<button type="button" class="chip chip-pers" data-on-click="editEvento('${e.id}')">${icon('user')}${e.hora?hm(toMin(e.hora))+' · ':''}${esc(e.titulo)}${!e.hora?(e.bloquea?' · todo el día':' · sin hora'):''}</button>`).join('')}</div>`:'';
  const bandas=persBloq.map(p=>{
    const top=(p.s-mn)*PX_MIN,h=Math.max((p.e-p.s)*PX_MIN,30),t=`${hm(p.s)} – ${hm(p.e)}`;
    const inner=`<span class="b-n">${icon('user')}${esc(p.ev.titulo)}</span>${h>=44?`<span class="b-t">${t} · Personal</span>`:''}`;
    return `<button type="button" class="pers" style="top:${top}px;height:${h}px" aria-label="${esc(`${t}, ${p.ev.titulo}, evento personal`)}" data-on-click="editEvento('${p.ev.id}')">${inner}</button>`;
  }).join('');
  canvas.innerHTML=`${persTira}${sinhora}<div class="lanes-head" aria-hidden="true"><span class="lh nails"><i></i>Mesa de uñas</span><span class="lh skin"><i></i>Cabina facial</span></div>
    <div class="lanes-scroll" id="lanesScroll"><div class="lanes" id="tgArea" style="height:${(mx-mn)*PX_MIN+12}px">${rows}<div class="lanes-cols">${cols}</div>${bandas?`<div class="pers-cols">${bandas}</div>`:''}${nowHtml}</div></div>`;
  if(agAutoScroll){
    agAutoScroll=false;
    let target=null;
    if(isToday){const vivo=segs.filter(sg=>sg.e>nowM).sort((a,b)=>a.s-b.s)[0];target=vivo?Math.min(vivo.s,nowM):nowM;}
    else if(segs.length)target=Math.min(...segs.map(sg=>sg.s));
    const sc=document.getElementById('lanesScroll');
    if(sc&&target!=null)sc.scrollTop=Math.max(0,(target-mn)*PX_MIN-28);
  }
}
function renderDay(){
  const key=ymd(agAnchor);selectedDate=key;
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML='';
  renderDayLanes(key,key===ymd(new Date()));
}
function autoScrollDay(timed,isToday){
  /*
    4 casos (hoy):
    1. Hay una cita en curso ahora → muestra su inicio (para ver el nombre)
    2. Hay citas próximas (aún no empiezan) → muestra la PRÓXIMA
    3. Todas las citas ya pasaron → muestra la hora actual
    4. Sin citas → sin scroll
    Días distintos a hoy: muestra la primera cita del día.
  */
  let target=null;
  if(isToday){
    const nowM=new Date().getHours()*60+new Date().getMinutes();
    if(timed.length){
      const enCurso=timed.find(c=>c._s<=nowM&&c._e>nowM);
      if(enCurso){target=enCurso._s;}
      else{
        const proximas=timed.filter(c=>c._s>nowM).sort((a,b)=>a._s-b._s);
        target=proximas.length?proximas[0]._s:nowM;
      }
    }else{target=nowM;}
  }else if(timed.length){
    target=Math.min(...timed.map(c=>c._s));
  }
  if(target==null)return;
  setTimeout(()=>{
    const area=document.getElementById('tgArea');if(!area)return;
    const offsetY=Math.max(0,(target-RST*60)/60*HOUR_PX);
    let anchor=document.getElementById('agFocusAnchor');
    if(!anchor){anchor=document.createElement('div');anchor.id='agFocusAnchor';anchor.style.position='absolute';anchor.style.left='0';anchor.style.width='1px';anchor.style.height='1px';area.appendChild(anchor);}
    anchor.style.top=offsetY+'px';
    anchor.style.scrollMarginTop='120px';
    anchor.scrollIntoView({behavior:'smooth',block:'start'});
  },150);
}
function renderWeek(){
  const ws=startOfWeek(agAnchor),todayKey=ymd(new Date()),days=[];
  for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);days.push(d);}
  setRange(days.map(d=>ymd(d)));
  const head=`<div class="wk-head"><div class="wgut"></div>${days.map(d=>{const k=ymd(d);const n=dayEvents(k).filter(c=>c.estado!=='cancelada').length;return `<button type="button" class="wd ${k===todayKey?'tdy':''}" aria-label="${DOWL[d.getDay()]} ${d.getDate()}, ${n} cita${n!==1?'s':''}" data-on-click="goDay('${k}')"><span class="wdw">${DOW[d.getDay()][0]}</span><span class="dn">${d.getDate()}</span></button>`;}).join('')}</div>`;
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML=head;
  const cols=days.map(d=>{const t=prepDay(ymd(d),true);return `<div class="wcol">${gridLines()}${t.map(c=>evBox(c,true)).join('')}</div>`;}).join('');
  document.getElementById('agendaCanvas').innerHTML=`<div class="tg wk" id="tgScroll"><div class="tg-gutter wk">${gutterHours()}</div>${cols}</div>`;
}
function renderMonth(){
  const y=agAnchor.getFullYear(),m=agAnchor.getMonth();
  const first=new Date(y,m,1),offset=(first.getDay()===0?6:first.getDay()-1);
  const start=new Date(y,m,1-offset),todayKey=ymd(new Date());
  const dows=['L','M','M','J','V','S','D'];let cells='';
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const key=ymd(d),out=d.getMonth()!==m;
    const cnt=dayEvents(key).filter(c=>c.estado!=='cancelada').length;
    const np=dayPersonales(key).length;
    const lblP=np?`, ${np} evento${np!==1?'s':''} personal${np!==1?'es':''}`:'';
    cells+=`<button type="button" class="mcell ${out?'out':''} ${key===todayKey?'tdy':''}" aria-label="${DOWL[d.getDay()]} ${d.getDate()} de ${MONF[d.getMonth()].toLowerCase()}, ${cnt} cita${cnt!==1?'s':''}${lblP}" data-on-click="goDay('${key}')"><span class="md">${d.getDate()}</span>${cnt?`<span class="mcount">${cnt}</span>`:''}${np?'<span class="mpers" aria-hidden="true"></span>':''}</button>`;
  }
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML=`<div class="mdow" aria-hidden="true">${dows.map(x=>`<span>${x}</span>`).join('')}</div>`;
  document.getElementById('agendaCanvas').innerHTML=`<div class="mgrid"><div class="mcells">${cells}</div></div>`;
}
function renderAgenda(){
  const now=new Date(),todayKey=ymd(now),k=ymd(agAnchor),d=agAnchor;
  let title,sub,prevL,nextL,incluyeHoy;
  if(agMode==='dia'||agMode==='lista'){
    const rel=k===todayKey?'Hoy':k===ymd(addDays(now,1))?'Mañana':k===ymd(addDays(now,-1))?'Ayer':'';
    title=rel||(DOWL[d.getDay()][0].toUpperCase()+DOWL[d.getDay()].slice(1));
    sub=(rel?DOWL[d.getDay()]+' ':'')+`${d.getDate()} ${MON[d.getMonth()].toLowerCase()}`+(d.getFullYear()!==now.getFullYear()?' '+d.getFullYear():'');
    prevL='Día anterior';nextL='Día siguiente';incluyeHoy=k===todayKey;
  }else if(agMode==='sem'){
    const ws=startOfWeek(agAnchor),we=addDays(ws,6);
    title='Semana';sub=`${ws.getDate()} ${MON[ws.getMonth()].toLowerCase()} – ${we.getDate()} ${MON[we.getMonth()].toLowerCase()}`;
    prevL='Semana anterior';nextL='Semana siguiente';incluyeHoy=todayKey>=ymd(ws)&&todayKey<=ymd(we);
  }else{
    title=MONF[d.getMonth()];sub=String(d.getFullYear());
    prevL='Mes anterior';nextL='Mes siguiente';incluyeHoy=d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }
  document.getElementById('hoyTitle').textContent=title;
  document.getElementById('agendaLabel').textContent=sub;
  const pb=document.getElementById('agPrev'),nb=document.getElementById('agNext'),tb=document.getElementById('agTodayBtn');
  if(pb)pb.setAttribute('aria-label',prevL);if(nb)nb.setAttribute('aria-label',nextL);if(tb)tb.hidden=incluyeHoy;
  renderAgCount();
  renderHoyHead();
  if(agMode==='lista')renderLista();else if(agMode==='dia')renderDay();else if(agMode==='sem')renderWeek();else renderMonth();
  if(typeof renderAgendaWeather==='function')renderAgendaWeather();
}
function rangoAgenda(){
  // devuelve [desde, hasta] (claves ymd) según el modo actual
  if(agMode==='dia'||agMode==='lista'){const k=ymd(agAnchor);return [k,k];}
  if(agMode==='sem'){const ws=startOfWeek(agAnchor),we=new Date(ws);we.setDate(ws.getDate()+6);return [ymd(ws),ymd(we)];}
  const y=agAnchor.getFullYear(),m=agAnchor.getMonth();
  return [ymd(new Date(y,m,1)),ymd(new Date(y,m+1,0))];
}
function renderAgCount(){
  const el=document.getElementById('agCount');if(!el)return;
  const [a,b]=rangoAgenda();
  const n=DB.citas.filter(c=>c.fecha>=a&&c.fecha<=b&&c.estado!=='cancelada').length;
  el.textContent=`${n} cita${n!==1?'s':''}`;
}

/* ---------------- HOY: resumen, siguiente cita y modo lista ---------------- */
function renderHoyHead(){
  const sub=document.getElementById('hoySub');
  const box=document.getElementById('nextAppt');
  if(!sub||!box)return;
  const [a,b]=rangoAgenda();
  const enRango=DB.citas.filter(c=>c.fecha>=a&&c.fecha<=b&&c.estado!=='cancelada');
  const esperado=enRango.reduce((s,c)=>s+totalNeto(c),0);
  const cobrado=enRango.filter(c=>c.estado==='atendida').reduce((s,c)=>s+montoCita(c),0);
  const n=enRango.length;
  sub.innerHTML=n?`<span class="schip">${n} cita${n!==1?'s':''}</span><span class="schip">${fmtMoney(esperado)} esperado</span><span class="schip ok">${fmtMoney(cobrado)} cobrado</span>`
    :`<span class="schip">Sin citas</span>`;
  // La tarjeta «Siguiente» solo se muestra al ver el día de hoy
  const today=new Date(),key=ymd(today);
  if(!((agMode==='dia'||agMode==='lista')&&ymd(agAnchor)===key)){box.innerHTML='';return;}
  const hoy=DB.citas.filter(c=>c.fecha===key&&c.estado!=='cancelada');
  const nowM=today.getHours()*60+today.getMinutes();
  let next=hoy.filter(c=>c.estado==='agendada'&&c.hora).map(c=>({c,s:toMin(c.hora)})).filter(x=>x.s+(Number(x.c.dur)||60)>nowM).sort((a,b)=>a.s-b.s)[0];
  let when='';
  if(next){const d=next.s-nowM;when=d<=0?'En curso':d<60?`En ${d} min`:`En ${Math.floor(d/60)} h${d%60?' '+(d%60)+' min':''}`;}
  else{
    const fut=DB.citas.filter(c=>c.estado==='agendada'&&c.fecha>key).sort((a,b)=>(a.fecha+(a.hora||'')).localeCompare(b.fecha+(b.hora||'')))[0];
    if(fut){next={c:fut,s:toMin(fut.hora)};when=fechaCorta(fut.fecha);when=when[0].toUpperCase()+when.slice(1);}
  }
  if(!next){box.innerHTML='';return;}
  const c=next.c,cli=DB.clientas.find(x=>x.id===c.clientaId);
  const tel=cli?waTel(cli):'';
  const cat=citaCats(c)[0];
  const t=next.s!=null?hm(next.s):'—';
  const conf=c.confirmadaAt?' · confirmada':'';
  box.innerHTML=`<section class="next ${cat==='skin'?'skin':cat==='otro'?'otro':'nails'}" aria-label="Siguiente cita">
      <div class="nx-b">
        <div class="nx-e">Siguiente · ${esc(when)}</div>
        <div class="nx-n"><span class="nx-t">${t}</span> ${esc(cli?cli.nombre:'Clienta')}</div>
        <div class="nx-s">${esc(svcFull(c))}${conf}</div>
      </div>
      <div class="nx-a">
        <button type="button" class="btn-sm" data-on-click="editAppt('${c.id}')">Abrir</button>
        ${tel?`<a class="icon-btn icon-btn-line wa-ic" href="https://wa.me/${tel}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(cli.nombre)}">${icon('wa')}</a>`:''}
      </div>
    </section>`;
}
function renderLista(){
  const key=ymd(agAnchor);selectedDate=key;setRange([key]);
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML='';
  const all=dayEvents(key).slice().sort((a,b)=>(a.hora||'99').localeCompare(b.hora||'99'));
  const pers=dayPersonales(key);
  const canvas=document.getElementById('agendaCanvas');
  if(!all.length&&!pers.length){canvas.innerHTML=`<div class="empty">${icon('cal')}<p>Sin citas este día.</p><div class="empty-acts"><button type="button" class="btn-sm" data-on-click="openApptSheet()">${icon('plus')}Nueva cita</button><button type="button" class="btn-sm" data-on-click="openEventoSheet()">${icon('user')}Evento personal</button></div></div>`;return;}
  const nowM=new Date().getHours()*60+new Date().getMinutes(),isToday=key===ymd(new Date());
  // los de todo el día van primero; las citas sin hora, al final
  const filas=all.map(c=>({k:c.hora||'99',c})).concat(pers.map(e=>({k:e.hora||'',e}))).sort((a,b)=>a.k.localeCompare(b.k));
  const filaPers=e=>{
    const r=evRango(e);
    const tags=['<span class="tag t-pers">Personal</span>'];
    if(!e.bloquea)tags.push('<span class="tag t-soft">No aparta horario</span>');
    if(e.recordar&&e.hora)tags.push('<span class="tag t-soft">Con aviso</span>');
    return `<button type="button" class="tl tl-pers" data-on-click="editEvento('${e.id}')">
      <span class="tm">${r?hm(r.s):'Todo'}<small>${r?hm(r.e):'el día'}</small></span>
      <span class="bar"></span>
      <span class="bd"><span class="nm">${esc(e.titulo)}</span>${e.notas?`<span class="sv">${esc(e.notas)}</span>`:''}<span class="tags">${tags.join('')}</span></span>
    </button>`;
  };
  canvas.innerHTML=`<div class="card tl-card">`+filas.map(f=>f.e?filaPers(f.e):f.c).map(c=>{
    if(typeof c==='string')return c;
    const pal=PALETTE[c.color]||PALETTE.rosa;
    const s=toMin(c.hora),e=s!=null?s+(Number(c.dur)||60):null;
    let tags=[];
    if(c.estado==='atendida')tags.push('<span class="tag t-ok">Atendida</span>');
    else if(c.estado==='cancelada')tags.push('<span class="tag t-soft">Cancelada</span>');
    else if(isToday&&s!=null&&s<=nowM&&e>nowM)tags.push('<span class="tag t-wine">En curso</span>');
    else if(c.confirmadaAt)tags.push('<span class="tag t-soft">Confirmada</span>');
    else tags.push('<span class="tag t-soft">Agendada</span>');
    if(c.estado==='atendida'){const dd=deudaCita(c);if(dd>0)tags.push(`<span class="tag t-bad">Debe ${fmtMoney(dd)}</span>`);else tags.push('<span class="tag t-ok">Pagada</span>');}
    const cats=citaCats(c);if(cats.includes('skin'))tags.push('<span class="tag t-skin">Skin Care</span>');
    return `<button type="button" class="tl ${c.estado==='cancelada'?'cancelada':''}" data-on-click="editAppt('${c.id}')">
      <span class="tm">${c.hora?hm(s):'—'}${e!=null?`<small>${hm(e)}</small>`:''}</span>
      <span class="bar" style="background:${pal.br}"></span>
      <span class="bd"><span class="nm">${esc(cliNombre(c))}</span><span class="sv">${esc(svcFull(c))}${c.dur?` · ${fmtDur(c.dur)}`:''}</span><span class="tags">${tags.join('')}</span></span>
      <span class="pr">${fmtMoney(totalNeto(c))}</span>
    </button>`;}).join('')+`</div>`;
}
