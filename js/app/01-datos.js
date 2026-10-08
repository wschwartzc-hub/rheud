/* ================= SUPABASE ================= */
const SB_URL='https://wrplznjgravcnxkzfarn.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndycGx6bmpncmF2Y254a3pmYXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzM4MDEsImV4cCI6MjA5NTk0OTgwMX0.qEbNOdPQVJ_rsZTdaaTxMx5JpS5qI1wMlbEM7yImq_c';
const sb=window.supabase.createClient(SB_URL,SB_KEY);

const DEFAULT_SVCS=[
  {n:'Gel express liso o glitters',precio:280},
  {n:'Gel semipermanente + manicura rusa',precio:430},
  {n:'Refuerzo y nivelación + gel semipermanente',precio:430},
  {n:'Dry manicure + baño de gel + esmaltado',precio:560},
  {n:'Extensión de uñas (híbrida / Soft Gel 1-3)',precio:730},
  {n:'Retiro de gel',precio:70},
  {n:'Retiro de extensiones',precio:150},
];

/* DB es el caché en memoria; las funciones de UI lo siguen usando igual.
   Cada registro guarda su id real de Supabase en .id (uuid). */
let DB={servicios:[],clientas:[],citas:[],eventos:[],premios:[],cortesiasCat:[],cortesias:[],egresos:[],expedientes:[],fotos:[]};
let NEGOCIO_ID=null;
let PROMO_TEMPLATE='';
let PROMO_BROADCAST='';
const PROMO_DEFAULT=`✨ *PROMOCIONES RHĒUD* ✨

💅 *Manicura · Gel semipermanente · Extensión de uñas · Diseños y más*

🎨 Más de *250 tonos y efectos* para tus diseños
📅 Agenda tu cita con anticipación 💕

{{SERVICIOS}}

😍 *Más de 250 tonos a elegir* 🎨

📍 Rhēud Beauty · Monterrey
Escríbenos para agendar tu espacio 🤍`;
let onlineState=navigator.onLine;
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
const NUC=window.RheudNucleo,resumenPago=window.RheudPagos.resumenPago;

/* ---- escrituras: supabase-js no lanza, devuelve {error}; aquí sí se lanza ---- */
async function guardar(q){const {data,error}=await q;if(error)throw error;return data}
function avisarError(e,msg){console.error(e);toast(msg||'No se pudo guardar. Revisa tu conexión e intenta de nuevo.')}
/* evita dobles toques: la acción queda ocupada y su botón desactivado mientras guarda */
const OCUPADO={};
function ocupar(clave,btn,texto){
  if(OCUPADO[clave])return null;OCUPADO[clave]=true;
  const prev=btn?btn.textContent:'';if(btn){btn.disabled=true;if(texto)btn.textContent=texto;}
  return ()=>{OCUPADO[clave]=false;if(btn){btn.disabled=false;btn.textContent=prev;}};
}
/* inserta o reemplaza por id (el eco de tiempo real puede llegar antes que la respuesta) */
function ponerEnCache(k,obj,alInicio){const l=DB[k];const i=l.findIndex(x=>x.id===obj.id);if(i>=0)l[i]=obj;else if(alInicio)l.unshift(obj);else l.push(obj);return obj}

/* ---- mapeo fila Supabase -> objeto que usa la UI ---- */
function rowToSvc(r){return {id:r.id,n:r.nombre,p:Number(r.precio||0),precios:Array.isArray(r.precios)?r.precios.map(Number):[],costoReal:Number(r.costo_real||0),desc:r.descripcion||'',incluye:r.incluye||'',cat:r.categoria||'nails',sub:r.subfamilia||'',dur:Number(r.duracion_min||60),limpieza:Number(r.limpieza_min||0),recurso:r.recurso||'mesa',insumos:Array.isArray(r.insumos)?r.insumos:[],requisitos:r.requisitos||''}}
function svcToRow(s){return {negocio_id:NEGOCIO_ID,nombre:s.n,precio:Number(s.p||0),precios:Array.isArray(s.precios)?s.precios:[],costo_real:Number(s.costoReal||0),descripcion:s.desc||'',incluye:s.incluye||'',categoria:s.cat||'nails',subfamilia:s.sub||'',duracion_min:Number(s.dur||60),limpieza_min:Number(s.limpieza||0),recurso:s.recurso||'mesa',insumos:Array.isArray(s.insumos)?s.insumos:[],requisitos:s.requisitos||''}}
/* ramas y recursos del negocio */
const CATS={nails:{n:'Nails Studio',short:'Uñas',cls:'t-nails'},skin:{n:'Skin Care',short:'Skin Care',cls:'t-skin'},otro:{n:'Otros',short:'Otro',cls:'t-soft'}};
const RECURSOS={mesa:'Mesa de uñas',cabina:'Cabina facial',ninguno:'Sin recurso'};
const SUBFAMILIAS={nails:['Retiros','Soft Gel','Acrílico','Dry Manicure','Gel Semipermanente','Diseños','Pedicure'],skin:['Limpiezas','Hidrafacial','Peelings','Mascarillas','Aparatología','Cejas y pestañas'],otro:[]};
function svcById(id){return DB.servicios.find(x=>x.id===id)}
function catLabel(c){return (CATS[c]||CATS.otro).n}
function fmtDur(m){m=Number(m)||0;const h=Math.floor(m/60),r=m%60;return h?(r?`${h} h ${r}`:`${h} h`):`${r} min`}
/* cada servicio de la cita ocupa un recurso durante d min y lo deja bloqueado l min más (limpieza);
   la duración de la cita editada a mano alarga o recorta el último bloque (ver js/nucleo.js) */
function citaSegments(c){return NUC.segmentos(toMin(c.hora),c.items,c.dur,svcById).map(sg=>(sg.c=c,sg))}
function citaCats(c){const set=new Set();(c.items||[]).forEach(i=>{const s=svcById(i.id);set.add(i.cat||(s?s.cat:'nails'));});if(!set.size)set.add('nails');return [...set];}
function rowToCli(r){return {id:r.id,num:r.num,nombre:r.nombre,telefono:r.telefono||'',email:r.email||'',notas:r.notas||'',cumple:r.cumple||'',formaUna:r.forma_una||'',coloresFav:r.colores_fav||'',alergias:r.alergias||'',notasPrefs:r.notas_prefs||'',sellos:Number(r.sellos||0),premioMenorId:r.premio_menor_id||null,premioMayorId:r.premio_mayor_id||null,menorCanjeado:!!r.menor_canjeado,mayorCanjeado:!!r.mayor_canjeado,consentSalud:!!r.consentimiento_salud,consentFecha:r.consentimiento_fecha||''}}
function cliToRow(c){return {negocio_id:NEGOCIO_ID,nombre:c.nombre,telefono:c.telefono||'',email:c.email||'',notas:c.notas||''}}
function rowToCita(r){return {id:r.id,codigo:r.codigo||'',clientaId:r.clienta_id,items:r.items||[],servicioId:(r.items&&r.items[0]?r.items[0].id:''),svcName:(r.items||[]).map(i=>i.n).join(' · '),fecha:r.fecha,hora:r.hora||'',dur:Number(r.duracion_min||60),color:r.color||'rosa',precio:Number(r.precio||0),cobrado:(r.cobrado==null?null:Number(r.cobrado)),descPct:(r.descuento_pct==null?null:Number(r.descuento_pct)),descMonto:Number(r.descuento_monto||0),abonado:(r.abonado==null?null:Number(r.abonado)),pagos:Array.isArray(r.pagos)?r.pagos:[],cortesiaId:r.cortesia_id||null,estado:r.estado||'agendada',pago:r.pago||'',metodo:r.metodo||'',pagadoFecha:r.pagado_fecha||'',comprobante:r.comprobante_url||'',notas:r.notas||'',portalToken:r.portal_token||'',confirmadaAt:r.confirmada_at||''}}
function citaToRow(c){return {negocio_id:NEGOCIO_ID,clienta_id:c.clientaId,items:c.items||[],fecha:c.fecha,hora:c.hora||'',duracion_min:Number(c.dur||60),color:c.color||'rosa',precio:Number(c.precio||0),cobrado:(c.cobrado==null?null:Number(c.cobrado)),descuento_pct:(c.descPct==null?null:Number(c.descPct)),descuento_monto:Number(c.descMonto||0),abonado:(c.abonado==null?null:Number(c.abonado)),pagos:Array.isArray(c.pagos)?c.pagos:[],cortesia_id:c.cortesiaId||null,estado:c.estado||'agendada',pago:c.pago||'',metodo:c.metodo||'',pagado_fecha:c.pagadoFecha||null,comprobante_url:c.comprobante||'',notas:c.notas||''}}
/* eventos personales: se ven en la agenda pero no son citas (no cuentan en nada) */
function rowToEvento(r){return {id:r.id,titulo:r.titulo||'',fecha:r.fecha,hora:r.hora||'',dur:Number(r.duracion_min||60),bloquea:r.bloquea!==false,recordar:r.recordar!==false,notas:r.notas||'',creadoPor:r.creado_por||null}}
function eventoToRow(e){return {negocio_id:NEGOCIO_ID,titulo:e.titulo,fecha:e.fecha,hora:e.hora||'',duracion_min:Number(e.dur||60),bloquea:!!e.bloquea,recordar:!!e.recordar,notas:e.notas||''}}
function rowToPremio(r){return {id:r.id,nombre:r.nombre,nivel:r.nivel||'menor',desc:r.descripcion||''}}
function premioToRow(p){return {negocio_id:NEGOCIO_ID,nombre:p.nombre,nivel:p.nivel||'menor',descripcion:p.desc||''}}
function rowToCortesiaCat(r){return {id:r.id,nombre:r.nombre,desc:r.descripcion||'',vigencia:Number(r.vigencia_dias||30)}}
function rowToCortesia(r){return {id:r.id,clientaId:r.clienta_id,catalogoId:r.catalogo_id||null,desc:r.descripcion||'',vigencia:Number(r.vigencia_dias||30),fechaInicio:r.fecha_inicio||'',fechaVence:r.fecha_vence||'',usada:!!r.usada,fechaUso:r.fecha_uso||'',notas:r.notas||''}}
function rowToEgreso(r){return {id:r.id,fecha:r.fecha||'',concepto:r.concepto||'',monto:Number(r.monto||0),notas:r.notas||''}}

/* ---- tablas del caché: se cargan completas y se escuchan en tiempo real ----
   k: clave en DB · orden: [columna, ascendente] · viva: filas que sí entran
   (las citas borradas quedan en la base con deleted_at) · opcional: si falla
   la consulta (tabla aún sin migrar) la app carga igual · alInicio: dónde
   entra una fila nueva. */
const TABLAS={
  servicios:{k:'servicios',map:r=>rowToSvc(r),orden:['created_at',true]},
  clientas:{k:'clientas',map:r=>rowToCli(r),orden:['created_at',true]},
  citas:{k:'citas',map:r=>rowToCita(r),orden:['fecha',true],viva:r=>!r.deleted_at},
  eventos:{k:'eventos',map:r=>rowToEvento(r),orden:['fecha',true],opcional:true,viva:r=>!r.deleted_at},
  premios:{k:'premios',map:r=>rowToPremio(r),orden:['created_at',true],opcional:true},
  cortesias_catalogo:{k:'cortesiasCat',map:r=>rowToCortesiaCat(r),orden:['created_at',true],opcional:true},
  cortesias:{k:'cortesias',map:r=>rowToCortesia(r),orden:['created_at',false],opcional:true,alInicio:true},
  egresos:{k:'egresos',map:r=>rowToEgreso(r),orden:['fecha',false],opcional:true,alInicio:true,viva:r=>!r.deleted_at},
  expedientes_piel:{k:'expedientes',map:r=>rowToExp(r),opcional:true},
  fotos_piel:{k:'fotos',map:r=>rowToFoto(r),orden:['fecha',false],opcional:true,alInicio:true}
};
/* PostgREST corta en 1000 filas: se pide por páginas hasta que llega una incompleta.
   El orden secundario por id hace estable la paginación. */
const PAGINA=1000;
async function traerTodo(tabla){
  const t=TABLAS[tabla];let filas=[];
  for(let desde=0;;desde+=PAGINA){
    let q=sb.from(tabla).select('*').eq('negocio_id',NEGOCIO_ID);
    if(t.orden)q=q.order(t.orden[0],{ascending:t.orden[1]});
    const data=await guardar(q.order('id',{ascending:true}).range(desde,desde+PAGINA-1));
    filas=filas.concat(data||[]);
    if(!data||data.length<PAGINA)break;
  }
  return filas;
}
async function cargarTablas(){
  const nombres=Object.keys(TABLAS);
  const res=await Promise.all(nombres.map(n=>traerTodo(n).then(f=>({f}),e=>({e}))));
  nombres.forEach((n,i)=>{if(res[i].e&&!TABLAS[n].opcional)throw res[i].e;});
  nombres.forEach((n,i)=>{
    const t=TABLAS[n],r=res[i];
    if(r.e){console.error('carga '+n,r.e);return;} // opcional: se queda lo que había
    DB[t.k]=r.f.filter(f=>!t.viva||t.viva(f)).map(t.map);
  });
}
/* ---- carga inicial completa desde Supabase ---- */
async function loadAll(){
  await cargarTablas();
  // sembrar menú por defecto si está vacío
  if(DB.servicios.length===0){
    const rows=DEFAULT_SVCS.map(s=>({negocio_id:NEGOCIO_ID,nombre:s.n,precio:s.precio,costo_real:0,descripcion:'',incluye:''}));
    try{DB.servicios=(await guardar(sb.from('servicios').insert(rows).select())||[]).map(rowToSvc);}
    catch(e){console.error('menú por defecto',e);}
  }
}

/* persist() ya no se usa para guardar (cada acción escribe directo a Supabase).
   Lo dejamos como no-op para compatibilidad con el código existente. */
function persist(){}
