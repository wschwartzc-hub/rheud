/* ================= ACCESIBILIDAD =================
   - Hojas (.sheet, role="dialog"): al abrir, el foco va al primer control; Tab
     queda atrapado dentro; Escape cierra (usa el botón [data-sheet-close] de la
     hoja, que sabe si debe «volver» o «cerrar»); el resto de la app queda inert.
     showSheet/closeSheet (13-app.js) recuerdan y devuelven el foco al botón que
     abrió la hoja.
   - Segmentados, pestañas y chips: el estado visual (.on / .sel) se refleja en
     aria-pressed o aria-selected, sin tocar cada función que los pinta.
   - Pestañas (role="tablist"): flechas izquierda/derecha. */
(function(){
  'use strict';
  const FOCUSABLE='button:not([disabled]),[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const app=document.getElementById('app');

  function hojaAbierta(){
    const abiertas=[...document.querySelectorAll('.sheet.show')];
    return abiertas.length?abiertas[abiertas.length-1]:null;
  }
  function focusables(root){
    return [...root.querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null||el.getClientRects().length);
  }
  function enfocarPrimero(sheet){
    if(!sheet.classList.contains('show'))return;
    if(sheet.contains(document.activeElement))return;
    const f=focusables(sheet)[0];
    if(f)f.focus({preventScroll:true});
    sheet.scrollTop=0;
  }

  /* Abrir / cerrar hojas */
  const obsHojas=new MutationObserver(muts=>{
    muts.forEach(m=>{
      const s=m.target;
      if(s.classList.contains('show')&&!s._abierta){s._abierta=true;setTimeout(()=>enfocarPrimero(s),60);}
      else if(!s.classList.contains('show'))s._abierta=false;
    });
    const hay=!!document.querySelector('.sheet.show');
    if(app)app.inert=hay;
  });
  document.querySelectorAll('.sheet').forEach(s=>obsHojas.observe(s,{attributes:true,attributeFilter:['class']}));

  document.addEventListener('keydown',e=>{
    const sheet=hojaAbierta();
    if(sheet&&e.key==='Escape'){
      e.preventDefault();
      const x=sheet.querySelector('[data-sheet-close]');
      if(x)x.click();else if(typeof closeSheet==='function')closeSheet();
      return;
    }
    if(sheet&&e.key==='Tab'){
      const f=focusables(sheet);if(!f.length)return;
      const first=f[0],last=f[f.length-1];
      if(!sheet.contains(document.activeElement)){e.preventDefault();first.focus();return;}
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      return;
    }
    // Pestañas: flechas para moverse y activar
    const tab=e.target.closest&&e.target.closest('[role="tab"]');
    if(tab&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
      const tabs=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
      const i=tabs.indexOf(tab),n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
      e.preventDefault();n.focus();n.click();
    }
  });

  /* Estado de segmentados, pestañas y chips → atributos ARIA */
  const SEL='.seg > button, .tabs > [role="tab"], .chips > .chip, .chip-row > .chip, .cc-cat-picker > .cc-pick-item, .cortesia-picker > .cc-pick-item, .menu-subs > button, .svc-var > .svc-var-chip, .colorchips > .swatch';
  function sync(){
    document.querySelectorAll(SEL).forEach(b=>{
      const on=b.classList.contains('on')||b.classList.contains('sel');
      if(b.getAttribute('role')==='tab')b.setAttribute('aria-selected',String(on));
      else b.setAttribute('aria-pressed',String(on));
    });
  }
  let pend=false;
  const programar=()=>{if(pend)return;pend=true;requestAnimationFrame(()=>{pend=false;sync();});};
  new MutationObserver(programar).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  sync();
})();
