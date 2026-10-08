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
const MONF=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_START=8,DAY_END=22,HOUR_PX=56,HOUR_PX_WK=48;
let RST=DAY_START,REN=DAY_END;
function setRange(keys){
  let mn=DAY_START,mx=DAY_END;
  keys.forEach(k=>dayEvents(k).forEach(c=>{
    if(!c.hora)return;
    const s=toMin(c.hora),e=s+(Number(c.dur)||60);
    mn=Math.min(mn,Math.floor(s/60));
    mx=Math.max(mx,Math.ceil(e/60));
  }));
  RST=mn;REN=Math.max(mx,mn+1);
}
let agMode='lista',agAnchor=new Date();agAnchor.setHours(0,0,0,0);
let agAutoScroll=true; // activa auto-enfoque al abrir/cambiar día (no en refrescos automáticos)

function toMin(t){if(!t)return null;const p=t.split(':');return (+p[0])*60+(+p[1])}
function minLabel(min){let h=Math.floor(min/60),m=min%60,ap=h>=12?'PM':'AM',hh=h%12||12;return hh+(m?':'+String(m).padStart(2,'0'):'')+' '+ap}
function startOfWeek(d){const x=new Date(d);const day=x.getDay(),diff=(day===0?6:day-1);x.setDate(x.getDate()-diff);x.setHours(0,0,0,0);return x}
function dayEvents(key){return DB.citas.filter(c=>c.fecha===key)}

function agShift(dir){
  if(agMode==='dia')agAnchor.setDate(agAnchor.getDate()+dir);
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
  if(e.target.tagName!=='BUTTON')return;
  agMode=e.target.dataset.m;
  document.querySelectorAll('#agViewSeg button').forEach(b=>b.classList.toggle('on',b===e.target));
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
function evBox(c,narrow){
  const pal=PALETTE[c.color]||PALETTE.rosa;
  const hpx=narrow?HOUR_PX_WK:HOUR_PX;
  const top=Math.max(0,(c._s-RST*60)/60*hpx);
  const h=Math.max(((c._e-c._s)/60)*hpx,narrow?15:40);
  const w=100/(c._cols||1),left=(c._col||0)*w;
  const cli=DB.clientas.find(x=>x.id===c.clientaId);
  const name=esc(cli?cli.nombre:'Clienta');

  // ── Intensidad temporal ──
  const todayKey=ymd(new Date());
  const isDateToday=c.fecha===todayKey;
  const isDatePast=c.fecha<todayKey;
  let extraStyle='';let timeClass='';
  if(c.estado==='cancelada'){
    extraStyle='opacity:0.35;filter:saturate(0.2) grayscale(0.5)';
  }else if(isDatePast){
    // Día pasado completo: siempre tenue
    extraStyle='opacity:0.38;filter:saturate(0.35)';
    timeClass='ev-past';
  }else if(isDateToday){
    const nowM=new Date().getHours()*60+new Date().getMinutes();
    if(c._e<=nowM){
      // Ya pasó hoy
      extraStyle='opacity:0.38;filter:saturate(0.35)';
      timeClass='ev-past';
    }else if(c._s<=nowM){
      // En curso ahora
      timeClass='ev-now';
    }else{
      // Próxima hoy: más vívida cuanto más cerca
      const minsUntil=c._s-nowM;
      const opacity=Math.max(0.55,1-(minsUntil/(7*60))*0.45);
      extraStyle=`opacity:${opacity.toFixed(2)}`;
    }
  }
  // Días futuros: color completo (sin cambios)

  // ── Badge de estado ──
  let badge='';
  if(!narrow&&c.estado!=='agendada'){
    const badgeMap={atendida:'ev-st-ok',cancelada:'ev-st-cancel'};
    const badgeTxt={atendida:'Atendida ✓',cancelada:'Cancelada'};
    badge=`<div class="ev-badge ${badgeMap[c.estado]||''}">${badgeTxt[c.estado]||c.estado}</div>`;
  }

  // ── Indicador "en curso" ──
  const livePin=(!narrow&&timeClass==='ev-now')?`<div class="ev-live-dot"></div>`:'';

  // ── Contenido ──
  let inner;
  if(narrow){
    inner=`<div class="ec">${name.split(' ')[0]}</div>`;
  }else if(h<52){
    inner=`<div class="ec compact">${minLabel(c._s)} · ${name}</div>`;
  }else if(h<72){
    inner=`<div class="et">${minLabel(c._s)}</div><div class="ec">${name}</div>`;
  }else{
    inner=`<div class="et">${minLabel(c._s)}</div><div class="ec">${name}</div><div class="es">${svcDisplay(c)}</div>`;
  }

  const borderW=timeClass==='ev-now'?'4px':'3px';
  return `<div class="ev ${c.estado} ${timeClass}" style="top:${top}px;height:${h}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);background:${pal.bg};border-left:${borderW} solid ${pal.br};color:${pal.tx};${extraStyle}" data-on-click="event.stopPropagation();editAppt('${c.id}')">${livePin}${badge}${inner}</div>`;
}
function gutterHours(){let g='';for(let hh=RST;hh<REN;hh++){const ap=hh>=12?'PM':'AM',h12=hh%12||12;g+=`<div class="hr-cell"><span class="lbl">${h12} ${ap}</span></div>`;}return g}
function gridLines(){let l='';for(let hh=RST;hh<REN;hh++)l+='<div class="line"></div>';return l}
function nowLine(){const now=new Date();const m=now.getHours()*60+now.getMinutes();if(m<RST*60||m>REN*60)return '';return `<div class="nowline" style="top:${(m-RST*60)/60*HOUR_PX}px"></div>`}

function prepDay(key,narrow){
  const timed=dayEvents(key).filter(c=>c.hora).map(c=>{c._s=toMin(c.hora);c._e=c._s+(Number(c.dur)||60);return c;});
  placeEvents(timed);return timed;
}
let agLanes=false;
function toggleLanes(){agLanes=!agLanes;agAutoScroll=true;renderAgenda();}
function segBox(sg,narrow){
  const c=sg.c,pal=PALETTE[c.color]||PALETTE.rosa;
  const top=Math.max(0,(sg.s-RST*60)/60*HOUR_PX),h=Math.max(((sg.e-sg.s)/60)*HOUR_PX,34);
  const cli=DB.clientas.find(x=>x.id===c.clientaId);const name=esc(cli?cli.nombre:'Clienta');
  const isSkin=sg.cat==='skin';
  const bg=isSkin?'var(--skin-bg)':pal.bg,br=isSkin?'var(--skin)':pal.br,tx=isSkin?'var(--skin-ink)':pal.tx;
  const inner=h<48?`<div class="ec compact">${minLabel(sg.s)} · ${name}</div>`:`<div class="et">${minLabel(sg.s)} – ${minLabel(sg.e)}</div><div class="ec">${name}</div>${h>=66&&sg.n?`<div class="es">${esc(sg.n)}</div>`:''}`;
  const clean=sg.l?`<div class="ev-clean" style="top:${top+h}px;height:${Math.max(6,(sg.l/60)*HOUR_PX)}px" title="Limpieza ${sg.l} min"></div>`:'';
  return `<div class="ev ${c.estado}" style="top:${top}px;height:${h}px;left:3px;right:3px;background:${bg};border-left:3px solid ${br};color:${tx};${c.estado==='cancelada'?'opacity:.35':''}" data-on-click="event.stopPropagation();editAppt('${c.id}')">${inner}</div>${clean}`;
}
function renderDayLanes(key,isToday){
  const segs=[];dayEvents(key).filter(c=>c.hora&&c.estado!=='cancelada').forEach(c=>citaSegments(c).forEach(sg=>segs.push(sg)));
  const lanes=[['mesa','Mesa de uñas','lane-mesa'],['cabina','Cabina facial','lane-cab']];
  const otros=segs.filter(sg=>sg.r==='ninguno');
  const head=`<div class="lane-head"><div class="wgut"></div>${lanes.map(l=>`<div class="${l[2]}">${l[1]}</div>`).join('')}</div>`;
  const cols=lanes.map(l=>`<div class="wcol lane">${gridLines()}${segs.filter(sg=>sg.r===l[0]||(l[0]==='mesa'&&sg.r==='ninguno')).map(sg=>segBox(sg)).join('')}</div>`).join('');
  document.getElementById('agendaCanvas').innerHTML=`${head}<div class="tg lanes" id="tgScroll"><div class="tg-gutter">${gutterHours()}</div><div class="tg-area lanes-area" style="display:flex;padding-top:10px">${isToday?nowLine():''}${cols}</div></div>`;
}
function renderDay(){
  const key=ymd(agAnchor);selectedDate=key;
  const lb=document.getElementById('agLanesBtn');if(lb){lb.style.display='';lb.classList.toggle('on',agLanes);}
  if(agLanes){setRange([key]);const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML='';renderDayLanes(key,key===ymd(new Date()));if(agAutoScroll){autoScrollDay(prepDay(key,false),key===ymd(new Date()));agAutoScroll=false;}return;}
  setRange([key]);
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML='';
  const all=dayEvents(key);
  const noTime=all.filter(c=>!c.hora);
  const timed=prepDay(key,false);
  const isToday=key===ymd(new Date());
  const sinhora=noTime.length?`<div class="sinhora">${noTime.map(c=>{const pal=PALETTE[c.color]||PALETTE.rosa;const cli=DB.clientas.find(x=>x.id===c.clientaId);return `<div class="ev ${c.estado}" style="position:static;background:${pal.bg};border-left-color:${pal.br};color:${pal.tx};padding:7px 10px" data-on-click="editAppt('${c.id}')"><div class="ec">${esc(cli?cli.nombre:'Clienta')} · sin hora</div></div>`}).join('')}</div>`:'';
  document.getElementById('agendaCanvas').innerHTML=`${sinhora}
    <div class="tg" id="tgScroll">
      <div class="tg-gutter">${gutterHours()}</div>
      <div class="tg-area" id="tgArea">${gridLines()}${isToday?nowLine():''}${timed.map(c=>evBox(c,false)).join('')}</div>
    </div>`;
  // auto-enfoque: lleva la vista a la primera cita del día, o a la hora actual si es hoy
  if(agAutoScroll){autoScrollDay(timed,isToday);agAutoScroll=false;}
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
      // ¿hay una cita EN CURSO ahora mismo?
      const enCurso=timed.find(c=>c._s<=nowM&&c._e>nowM);
      if(enCurso){
        target=enCurso._s; // muestra desde el inicio para ver el nombre
      }else{
        // ¿hay citas que AÚN NO han empezado?
        const proximas=timed.filter(c=>c._s>nowM).sort((a,b)=>a._s-b._s);
        if(proximas.length){
          target=proximas[0]._s; // la siguiente cita
        }else{
          // ya pasaron todas: muestra la hora actual
          target=nowM;
        }
      }
    }else{
      // sin citas hoy: muestra la hora actual
      target=nowM;
    }
  }else if(timed.length){
    // día pasado o futuro: primera cita del día
    target=Math.min(...timed.map(c=>c._s));
  }
  if(target==null)return;
  setTimeout(()=>{
    const area=document.getElementById('tgArea');if(!area)return;
    const offsetY=Math.max(0,(target-RST*60)/60*HOUR_PX);
    let anchor=document.getElementById('agFocusAnchor');
    if(!anchor){anchor=document.createElement('div');anchor.id='agFocusAnchor';anchor.style.position='absolute';anchor.style.left='0';anchor.style.width='1px';anchor.style.height='1px';area.appendChild(anchor);}
    anchor.style.top=offsetY+'px';
    anchor.style.scrollMarginTop='220px'; // header sticky compacto (~80px) + agenda-sticky (~100px) + 40px de aire
    anchor.scrollIntoView({behavior:'smooth',block:'start'});
  },150);
}
function renderWeek(){
  const ws=startOfWeek(agAnchor),todayKey=ymd(new Date()),days=[];
  for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);days.push(d);}
  setRange(days.map(d=>ymd(d)));
  const head=`<div class="wk-head"><div class="wgut"></div>${days.map(d=>`<div class="wd ${ymd(d)===todayKey?'tdy':''}" data-on-click="goDay('${ymd(d)}')"><div>${DOW[d.getDay()][0]}</div><span class="dn">${d.getDate()}</span></div>`).join('')}</div>`;
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML=head;
  const cols=days.map(d=>{const t=prepDay(ymd(d),true);return `<div class="wcol">${gridLines()}${t.map(c=>evBox(c,true)).join('')}</div>`;}).join('');
  document.getElementById('agendaCanvas').innerHTML=`<div class="tg wk" id="tgScroll"><div class="tg-gutter wk">${gutterHours()}</div>${cols}</div>`;
  const sc=document.getElementById('tgScroll');if(sc)sc.scrollTop=Math.max(0,(Math.max(RST,9)*60-RST*60)/60*HOUR_PX_WK);
}
function renderMonth(){
  const y=agAnchor.getFullYear(),m=agAnchor.getMonth();
  const first=new Date(y,m,1),offset=(first.getDay()===0?6:first.getDay()-1);
  const start=new Date(y,m,1-offset),todayKey=ymd(new Date());
  const dows=['L','M','M','J','V','S','D'];let cells='';
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const key=ymd(d),out=d.getMonth()!==m;
    const evs=dayEvents(key).filter(c=>c.estado!=='cancelada');
    const cnt=evs.length;
    cells+=`<div class="mcell ${out?'out':''} ${key===todayKey?'tdy':''}" data-on-click="goDay('${key}')"><div class="md">${d.getDate()}</div>${cnt?`<div class="mcount">${cnt}</div>`:''}</div>`;
  }
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML=`<div class="mdow">${dows.map(x=>`<span>${x}</span>`).join('')}</div>`;
  document.getElementById('agendaCanvas').innerHTML=`<div class="mgrid"><div class="mcells">${cells}</div></div>`;
}
function renderAgenda(){
  const todayKey=ymd(new Date());let label='';
  if(agMode==='dia'){const d=agAnchor;label=(ymd(d)===todayKey?'Hoy · ':'')+`${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;}
  else if(agMode==='sem'){const ws=startOfWeek(agAnchor),we=new Date(ws);we.setDate(ws.getDate()+6);label=`${ws.getDate()} ${MON[ws.getMonth()]} – ${we.getDate()} ${MON[we.getMonth()]}`;}
  else label=`${MONF[agAnchor.getMonth()]} ${agAnchor.getFullYear()}`;
  document.getElementById('agendaLabel').textContent=label;
  renderAgCount();
  renderHoyHead();
  const lbtn=document.getElementById('agLanesBtn');if(lbtn)lbtn.style.display=agMode==='dia'?'':'none';
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
  const citas=DB.citas.filter(c=>c.fecha>=a&&c.fecha<=b&&c.estado!=='cancelada');
  const n=citas.length;
  const palabra=(agMode==='dia'||agMode==='lista')?'este día':(agMode==='sem'?'esta semana':'este mes');
  if(n===0){el.innerHTML=`<span class="agc-num">0</span> citas ${palabra}`;return;}
  // desglose por estado
  const atend=citas.filter(c=>c.estado==='atendida').length;
  const agend=citas.filter(c=>c.estado==='agendada').length;
  let extra=[];
  if(agend)extra.push(`${agend} por atender`);
  if(atend)extra.push(`${atend} atendida${atend!==1?'s':''}`);
  el.innerHTML=`<span class="agc-num">${n}</span> cita${n!==1?'s':''} ${palabra}${extra.length?` · ${extra.join(' · ')}`:''}`;
}

/* ---------------- HOY: cabecera, siguiente cita y modo lista ---------------- */
function renderHoyHead(){
  const sub=document.getElementById('hoySub');
  const box=document.getElementById('nextAppt');
  if(!sub||!box)return;
  const today=new Date(),key=ymd(today);
  const hoy=DB.citas.filter(c=>c.fecha===key&&c.estado!=='cancelada');
  const esperado=hoy.reduce((s,c)=>s+Number(c.precio||0),0);
  const DOWFULL=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  sub.innerHTML=`${DOWFULL[today.getDay()]} ${today.getDate()} de ${MONF[today.getMonth()].toLowerCase()} · <b>${hoy.length} cita${hoy.length!==1?'s':''}</b>${esperado?` · <b>${fmtMoney(esperado)}</b> esperados`:''}`;
  // siguiente cita: hoy por atender con hora, la más próxima; si no, la próxima futura
  const nowM=today.getHours()*60+today.getMinutes();
  let next=hoy.filter(c=>c.estado==='agendada'&&c.hora).map(c=>({c,s:toMin(c.hora)})).filter(x=>x.s+(Number(x.c.dur)||60)>nowM).sort((a,b)=>a.s-b.s)[0];
  let when='';
  if(next){const d=next.s-nowM;when=d<=0?'en curso':d<60?`en ${d} min`:`en ${Math.floor(d/60)} h ${d%60?String(d%60).padStart(2,'0'):''}`.trim();}
  else{
    const fut=DB.citas.filter(c=>c.estado==='agendada'&&c.fecha>key).sort((a,b)=>(a.fecha+(a.hora||'')).localeCompare(b.fecha+(b.hora||'')))[0];
    if(fut){const d=new Date(fut.fecha+'T00:00:00');next={c:fut,s:toMin(fut.hora)};when=`${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;}
  }
  if(!next){box.innerHTML='';return;}
  const c=next.c,cli=DB.clientas.find(x=>x.id===c.clientaId);
  const fin=next.s!=null?minLabel(next.s+(Number(c.dur)||60)):'';
  const tel=cli&&cli.telefono?String(cli.telefono).replace(/\D/g,''):'';
  box.innerHTML=`<div class="h2"><span class="eyebrow">Siguiente</span><span class="more">${when}</span></div>
    <div class="next-card" data-on-click="editAppt('${c.id}')">
      <div class="nc-top">
        <div class="nc-body">
          <div class="nc-when">${next.s!=null?minLabel(next.s)+(fin?' – '+fin:''):'Sin hora'}</div>
          <div class="nc-name">${esc(cli?cli.nombre:'Clienta')}</div>
          <div class="nc-svc">${esc(svcFull(c))}${c.dur?` · ${c.dur} min`:''}</div>
        </div>
        <div class="nc-price">${fmtMoney(c.precio||0)}</div>
      </div>
      <div class="nc-actions">
        <button class="nc-btn" data-on-click="event.stopPropagation();editAppt('${c.id}')">Abrir cita</button>
        ${tel?`<a class="nc-wa" href="https://wa.me/${tel}" target="_blank" rel="noopener" data-on-click="event.stopPropagation()"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/><path d="M9 9.5c0 3.5 5.5 6 5.5 6l1.5-1.5-2-1.2-.9.9c-1-.5-2-1.5-2.4-2.4l.9-.9L10.4 8z"/></svg></a>`:''}
      </div>
    </div>`;
}
function renderLista(){
  const key=ymd(agAnchor);selectedDate=key;setRange([key]);
  const strip=document.getElementById('agDayStrip');if(strip)strip.innerHTML='';
  const all=dayEvents(key).slice().sort((a,b)=>(a.hora||'99').localeCompare(b.hora||'99'));
  const canvas=document.getElementById('agendaCanvas');
  if(!all.length){canvas.innerHTML=`<div class="empty"><div class="ic">·</div><p>Sin citas este día.</p></div>`;return;}
  const nowM=new Date().getHours()*60+new Date().getMinutes(),isToday=key===ymd(new Date());
  canvas.innerHTML=`<div class="card tl-card">`+all.map(c=>{
    const cli=DB.clientas.find(x=>x.id===c.clientaId);
    const pal=PALETTE[c.color]||PALETTE.rosa;
    const s=toMin(c.hora),e=s!=null?s+(Number(c.dur)||60):null;
    let tags=[];
    if(c.estado==='atendida')tags.push('<span class="tag t-ok">Atendida</span>');
    else if(c.estado==='cancelada')tags.push('<span class="tag t-soft">Cancelada</span>');
    else if(isToday&&s!=null&&s<=nowM&&e>nowM)tags.push('<span class="tag t-soft">En curso</span>');
    else tags.push('<span class="tag t-soft">Agendada</span>');
    if(c.estado==='atendida'){if(c.pago==='pagado')tags.push('<span class="tag t-ok">Pagado</span>');else if(deudaCita(c)>0)tags.push(`<span class="tag t-bad">Debe ${fmtMoney(deudaCita(c))}</span>`);}
    const cats=citaCats(c);if(cats.includes('skin'))tags.push('<span class="tag t-skin">Skin Care</span>');
    return `<div class="tl ${c.estado}" data-on-click="editAppt('${c.id}')">
      <div class="tm">${c.hora?minLabel(s).replace(' ','<br>'):'—'}</div>
      <div class="bar" style="background:${pal.br}"></div>
      <div class="bd"><div class="nm">${esc(cli?cli.nombre:'Clienta')}</div><div class="sv">${esc(svcFull(c))}${c.dur?` · ${c.dur} min`:''}</div>${tags.length?`<div class="tags">${tags.join('')}</div>`:''}</div>
      <div class="pr">${fmtMoney(c.precio||0)}</div>
    </div>`;}).join('')+`</div>`;
}
