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
let DB={servicios:[],clientas:[],citas:[],premios:[],cortesiasCat:[],cortesias:[],egresos:[],expedientes:[],fotos:[]};
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
/* cada servicio de la cita ocupa un recurso durante d min y lo deja bloqueado l min más (limpieza) */
function citaSegments(c){
  const s0=toMin(c.hora);if(s0==null)return [];
  const items=(c.items&&c.items.length)?c.items:[];
  const withDur=items.filter(i=>Number(i.d)>0);
  if(!withDur.length){
    const first=items[0]?svcById(items[0].id):null;
    return [{r:(items[0]&&items[0].r)||(first?first.recurso:'mesa')||'mesa',s:s0,e:s0+(Number(c.dur)||60),l:0,cat:(items[0]&&items[0].cat)||(first?first.cat:'nails'),c}];
  }
  let cur=s0;const segs=[];
  items.forEach(i=>{const d=Number(i.d)||0;if(!d)return;segs.push({r:i.r||'mesa',s:cur,e:cur+d,l:Number(i.l)||0,cat:i.cat||'nails',n:i.n,c});cur+=d;});
  return segs;
}
function citaCats(c){const set=new Set();(c.items||[]).forEach(i=>{const s=svcById(i.id);set.add(i.cat||(s?s.cat:'nails'));});if(!set.size)set.add('nails');return [...set];}
function rowToCli(r){return {id:r.id,num:r.num,nombre:r.nombre,telefono:r.telefono||'',email:r.email||'',notas:r.notas||'',cumple:r.cumple||'',formaUna:r.forma_una||'',coloresFav:r.colores_fav||'',alergias:r.alergias||'',notasPrefs:r.notas_prefs||'',sellos:Number(r.sellos||0),premioMenorId:r.premio_menor_id||null,premioMayorId:r.premio_mayor_id||null,menorCanjeado:!!r.menor_canjeado,mayorCanjeado:!!r.mayor_canjeado}}
function cliToRow(c){return {negocio_id:NEGOCIO_ID,nombre:c.nombre,telefono:c.telefono||'',email:c.email||'',notas:c.notas||''}}
function rowToCita(r){return {id:r.id,codigo:r.codigo||'',clientaId:r.clienta_id,items:r.items||[],servicioId:(r.items&&r.items[0]?r.items[0].id:''),svcName:(r.items||[]).map(i=>i.n).join(' · '),fecha:r.fecha,hora:r.hora||'',dur:Number(r.duracion_min||60),color:r.color||'rosa',precio:Number(r.precio||0),cobrado:(r.cobrado==null?null:Number(r.cobrado)),descPct:(r.descuento_pct==null?null:Number(r.descuento_pct)),descMonto:Number(r.descuento_monto||0),abonado:(r.abonado==null?null:Number(r.abonado)),pagos:Array.isArray(r.pagos)?r.pagos:[],cortesiaId:r.cortesia_id||null,estado:r.estado||'agendada',pago:r.pago||'',metodo:r.metodo||'',pagadoFecha:r.pagado_fecha||'',comprobante:r.comprobante_url||'',notas:r.notas||'',portalToken:r.portal_token||'',confirmadaAt:r.confirmada_at||''}}
function citaToRow(c){return {negocio_id:NEGOCIO_ID,clienta_id:c.clientaId,items:c.items||[],fecha:c.fecha,hora:c.hora||'',duracion_min:Number(c.dur||60),color:c.color||'rosa',precio:Number(c.precio||0),cobrado:(c.cobrado==null?null:Number(c.cobrado)),descuento_pct:(c.descPct==null?null:Number(c.descPct)),descuento_monto:Number(c.descMonto||0),abonado:(c.abonado==null?null:Number(c.abonado)),pagos:Array.isArray(c.pagos)?c.pagos:[],cortesia_id:c.cortesiaId||null,estado:c.estado||'agendada',pago:c.pago||'',metodo:c.metodo||'',pagado_fecha:c.pagadoFecha||null,comprobante_url:c.comprobante||'',notas:c.notas||''}}
function rowToPremio(r){return {id:r.id,nombre:r.nombre,nivel:r.nivel||'menor',desc:r.descripcion||''}}
function premioToRow(p){return {negocio_id:NEGOCIO_ID,nombre:p.nombre,nivel:p.nivel||'menor',descripcion:p.desc||''}}
function rowToCortesiaCat(r){return {id:r.id,nombre:r.nombre,desc:r.descripcion||'',vigencia:Number(r.vigencia_dias||30)}}
function rowToCortesia(r){return {id:r.id,clientaId:r.clienta_id,catalogoId:r.catalogo_id||null,desc:r.descripcion||'',vigencia:Number(r.vigencia_dias||30),fechaInicio:r.fecha_inicio||'',fechaVence:r.fecha_vence||'',usada:!!r.usada,fechaUso:r.fecha_uso||'',notas:r.notas||''}}
function rowToEgreso(r){return {id:r.id,fecha:r.fecha||'',concepto:r.concepto||'',monto:Number(r.monto||0),notas:r.notas||''}}

/* ---- carga inicial completa desde Supabase ---- */
async function loadAll(){
  const [sv,cl,ci,pr,cc,co,eg,ex,fo]=await Promise.all([
    sb.from('servicios').select('*').order('created_at',{ascending:true}),
    sb.from('clientas').select('*').order('created_at',{ascending:true}),
    sb.from('citas').select('*').order('fecha',{ascending:true}),
    sb.from('premios').select('*').order('created_at',{ascending:true}),
    sb.from('cortesias_catalogo').select('*').order('created_at',{ascending:true}),
    sb.from('cortesias').select('*').order('created_at',{ascending:false}),
    sb.from('egresos').select('*').order('fecha',{ascending:false}),
    sb.from('expedientes_piel').select('*'),
    sb.from('fotos_piel').select('*').order('fecha',{ascending:false})
  ]);
  if(sv.error||cl.error||ci.error){console.error(sv.error||cl.error||ci.error);throw (sv.error||cl.error||ci.error);}
  DB.servicios=(sv.data||[]).map(rowToSvc);
  DB.clientas=(cl.data||[]).map(rowToCli);
  DB.citas=(ci.data||[]).map(rowToCita);
  DB.premios=(pr&&!pr.error)?(pr.data||[]).map(rowToPremio):[];
  DB.cortesiasCat=(cc&&!cc.error)?(cc.data||[]).map(rowToCortesiaCat):[];
  DB.cortesias=(co&&!co.error)?(co.data||[]).map(rowToCortesia):[];
  DB.egresos=(eg&&!eg.error)?(eg.data||[]).map(rowToEgreso):[];
  DB.expedientes=(ex&&!ex.error)?(ex.data||[]).map(rowToExp):[]; // la tabla puede no existir aún: se tolera
  DB.fotos=(fo&&!fo.error)?(fo.data||[]).map(rowToFoto):[];
  // sembrar menú por defecto si está vacío
  if(DB.servicios.length===0){
    const rows=DEFAULT_SVCS.map(s=>({negocio_id:NEGOCIO_ID,nombre:s.n,precio:s.precio,costo_real:0,descripcion:'',incluye:''}));
    const {data}=await sb.from('servicios').insert(rows).select();
    DB.servicios=(data||[]).map(rowToSvc);
  }
}

/* persist() ya no se usa para guardar (cada acción escribe directo a Supabase).
   Lo dejamos como no-op para compatibilidad con el código existente. */
function persist(){}
