/* ---------------- MÁS: notificaciones y datos del estudio ---------------- */
/* La campana de la cabecera. RheudPush lo agrega el módulo de notificaciones
   (PWA); mientras no exista, se explica cómo activarlas. */
function abrirNotificaciones(){ if(window.RheudPush&&RheudPush.abrir) RheudPush.abrir(); else toast('Notificaciones disponibles al instalar la app'); }

/* Datos del estudio que ve la clienta en su portal (Cómo llegar / Escribir) */
async function openEstudioSheet(){
  const err=document.getElementById('estudioErr');err.textContent='';
  const campos={estDireccion:'',estTelefono:'',estMaps:''};
  Object.keys(campos).forEach(id=>{document.getElementById(id).value='';});
  showSheet('estudioSheet');
  try{
    const {data,error}=await sb.from('negocios').select('direccion,telefono,maps_url').eq('id',NEGOCIO_ID).single();
    if(error)throw error;
    if(data){
      document.getElementById('estDireccion').value=data.direccion||'';
      document.getElementById('estTelefono').value=data.telefono||'';
      document.getElementById('estMaps').value=data.maps_url||'';
    }
  }catch(e){console.error(e);err.textContent='No se pudieron leer los datos guardados. Puedes escribirlos de nuevo.';}
}
async function guardarEstudio(){
  const err=document.getElementById('estudioErr');err.textContent='';
  const direccion=document.getElementById('estDireccion').value.trim();
  const telefono=document.getElementById('estTelefono').value.trim();
  const maps_url=document.getElementById('estMaps').value.trim();
  if(maps_url&&!/^https:\/\/\S+$/i.test(maps_url)){
    err.textContent='El enlace de Google Maps debe empezar con https://';
    document.getElementById('estMaps').focus();return;
  }
  if(telefono&&telefono.replace(/\D/g,'').length<10){
    err.textContent='Escribe el teléfono de WhatsApp a 10 dígitos.';
    document.getElementById('estTelefono').focus();return;
  }
  const btn=document.getElementById('estudioGuardar');btn.disabled=true;btn.textContent='Guardando…';
  try{
    const {error}=await sb.from('negocios').update({direccion,telefono,maps_url}).eq('id',NEGOCIO_ID);
    if(error)throw error;
    closeSheet();toast('Datos del estudio guardados');
  }catch(e){console.error(e);err.textContent='No se pudo guardar. Revisa tu conexión e intenta de nuevo.';}
  finally{btn.disabled=false;btn.textContent='Guardar';}
}
