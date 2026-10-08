/* Rhēud · notificaciones push (PWA). Script clásico que se carga después de
   js/app/13-app.js y usa sus globales (sb, NEGOCIO_ID, showSheet, closeSheet,
   toast). Expone window.RheudPush y window.abrirNotificaciones().

   iPhone/iPad: Apple solo permite push (iOS 16.4+) en la app agregada a la
   pantalla de inicio; desde Safari normal se muestran las instrucciones. El
   permiso se pide únicamente dentro del clic en "Activar notificaciones". */
(function () {
  'use strict';

  // Clave pública VAPID (la privada vive en Supabase Vault). Si se cambia,
  // cambiarla también en sw.js.
  const VAPID_PUBLICA = 'BAd_ntg7CVK5fkBBpbAD8rLlznVl27BJku_aKsYERCY4Z2_pwu9GSsCgytUXsEvgED7jOqzfr64xnNocAjgJpaw';
  const FUNCION = 'rheud-push';
  const PREFS_DEFAULT = { recordatorio: true, cambios: true, resumen: true, confirmar: true };
  const TIPOS = [
    { k: 'recordatorio', t: 'Recordatorio de cita', d: '30 minutos antes de cada cita.' },
    { k: 'cambios', t: 'Citas nuevas o cambios', d: 'Cuando se agenda, mueve o cancela una cita desde otro dispositivo.' },
    { k: 'resumen', t: 'Resumen del día', d: 'A las 8:00: tus citas de hoy y lo que esperas cobrar.' },
    { k: 'confirmar', t: 'Confirmar citas de mañana', d: 'A las 18:00, si quedan citas de mañana sin confirmar.' },
  ];
  const ETIQUETAS = {
    activadas: 'Activadas',
    desactivadas: 'Desactivadas',
    bloqueadas: 'Bloqueadas en Ajustes',
    instalar: 'Agrega la app a tu inicio',
    'no-soportado': 'No disponibles aquí',
  };
  const LS_SYNC = 'rheud_push_sync';

  const svg = (d, cls) => `<svg class="aj-svg${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONOS = {
    compartir: '<path d="M8.5 9H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.5"/><path d="M12 3v11"/><path d="M8.5 6.5 12 3l3.5 3.5"/>',
    agregar: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
    app: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><rect x="9.5" y="7" width="5" height="5" rx="1.3"/><path d="M11 18h2"/>',
    campana: '<path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
    campanaNo: '<path d="M6.3 6.3A6 6 0 0 0 6 8.5C6 15 3.5 17 3.5 17H17"/><path d="M9 3.3A6 6 0 0 1 18 8.5c0 3 .5 5 1.2 6.3"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/><path d="m3 3 18 18"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    cambio: '<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5"/>',
    mas: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };
  const ICONO_TIPO = { recordatorio: 'reloj', cambios: 'cambio', resumen: 'sol', confirmar: 'check' };

  /* ---------------- entorno ---------------- */

  function esIOS() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function esStandalone() {
    if (navigator.standalone === true) return true;
    try {
      return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;
    } catch (_) { return false; }
  }
  function soportado() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function esAndroid() { return /Android/.test(navigator.userAgent || ''); }
  function nombreDispositivo() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPod/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
    const so = /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
    const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
      : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return nav ? `${so} · ${nav}` : so;
  }
  function b64urlABytes(s) {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function negocio() {
    try { return typeof NEGOCIO_ID !== 'undefined' ? NEGOCIO_ID : null; } catch (_) { return null; }
  }
  function cliente() {
    try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; }
  }
  function avisar(m) {
    if (typeof window.toast === 'function') window.toast(m);
  }
  function leerLS(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function escribirLS(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* modo privado */ } }

  /* ---------------- service worker ---------------- */

  let registro = null;
  function registrar() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (!registro) {
      registro = navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => {
        console.warn('No se pudo registrar el service worker:', e);
        registro = null;
        return null;
      });
    }
    return registro;
  }

  function conLimite(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado')), ms))]);
  }

  async function swActivo() {
    const reg = await registrar();
    if (!reg) throw new Error('Este navegador no permitió instalar el servicio de avisos.');
    return conLimite(navigator.serviceWorker.ready, 15000);
  }

  async function suscripcionActual() {
    const reg = await registrar();
    if (!reg || !reg.pushManager) return null;
    try { return await reg.pushManager.getSubscription(); } catch (_) { return null; }
  }

  /* ---------------- estado ---------------- */

  async function estado() {
    if (esIOS() && !esStandalone()) return 'instalar';
    if (!soportado()) return 'no-soportado';
    if (Notification.permission === 'denied') return 'bloqueadas';
    const reg = await registrar();
    if (!reg) return 'no-soportado';
    const sub = await suscripcionActual();
    return sub && Notification.permission === 'granted' ? 'activadas' : 'desactivadas';
  }

  /* ---------------- servidor ---------------- */

  async function usuaria() {
    const c = cliente();
    if (!c) return null;
    try {
      const { data } = await c.auth.getSession();
      return data && data.session ? data.session.user : null;
    } catch (_) { return null; }
  }

  function esConflictoRls(e) {
    return !!e && (e.code === '42501' || /row-level security/i.test(e.message || ''));
  }

  async function guardar(sub) {
    const c = cliente();
    const neg = negocio();
    if (!c || !neg) throw new Error('Inicia sesión para activar las notificaciones.');
    const j = sub.toJSON();
    const fila = { negocio_id: neg, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, dispositivo: nombreDispositivo() };
    const { error } = await c.from('push_subs').upsert(fila, { onConflict: 'endpoint' });
    if (error) throw error;
    const u = await usuaria();
    escribirLS(LS_SYNC, `${j.endpoint}|${u ? u.id : ''}|${new Date().toDateString()}`);
  }

  function mismaClave(sub) {
    const k = sub && sub.options && sub.options.applicationServerKey;
    if (!k) return true;
    const a = new Uint8Array(k), b = b64urlABytes(VAPID_PUBLICA);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  /* ---------------- acciones ---------------- */

  function pedirPermiso() {
    // Safari viejo usa callback; los actuales, promesa.
    return new Promise((res) => {
      const r = Notification.requestPermission(res);
      if (r && typeof r.then === 'function') r.then(res);
    });
  }

  /* Debe llamarse directo desde el clic: requestPermission va antes de
     cualquier await, si no iOS ignora la petición. */
  function activar() {
    if (esIOS() && !esStandalone()) return Promise.resolve('instalar');
    if (!soportado()) return Promise.resolve('no-soportado');
    const permiso = Notification.permission === 'granted' ? Promise.resolve('granted') : pedirPermiso();
    return permiso.then(async (p) => {
      if (p !== 'granted') return p === 'denied' ? 'bloqueadas' : 'desactivadas';
      const reg = await swActivo();
      const opciones = { userVisibleOnly: true, applicationServerKey: b64urlABytes(VAPID_PUBLICA) };
      let sub = await reg.pushManager.getSubscription();
      if (sub && !mismaClave(sub)) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe(opciones);
      try {
        await guardar(sub);
      } catch (e) {
        if (!esConflictoRls(e)) throw e;
        // El endpoint quedó registrado a otra cuenta que usó este navegador:
        // se pide uno nuevo para esta cuenta.
        await sub.unsubscribe();
        sub = await reg.pushManager.subscribe(opciones);
        await guardar(sub);
      }
      return 'activadas';
    });
  }

  async function desactivar() {
    const sub = await suscripcionActual();
    if (sub) {
      const c = cliente();
      if (c) {
        try {
          const { error } = await c.from('push_subs').delete().eq('endpoint', sub.endpoint);
          if (error) console.warn('push_subs delete', error);
        } catch (e) { console.warn(e); }
      }
      try { await sub.unsubscribe(); } catch (e) { console.warn(e); }
    }
    escribirLS(LS_SYNC, null);
    return estado();
  }

  async function llamarPrueba(endpoint) {
    const c = cliente();
    if (!c || !c.functions) return { ok: false, detalle: 'sin cliente' };
    try {
      const { data, error } = await c.functions.invoke(FUNCION, { body: { tarea: 'probar', endpoint } });
      if (error) {
        const st = error.context && error.context.status;
        return { ok: false, status: st, detalle: error.message || String(error) };
      }
      return { ok: !!(data && data.enviadas > 0), detalle: (data && data.error) || '' };
    } catch (e) {
      return { ok: false, detalle: e.message || String(e) };
    }
  }

  /* Pide al servidor una notificación real. Si el servidor no responde,
     muestra una local para comprobar al menos el permiso. */
  async function probar() {
    const sub = await suscripcionActual();
    if (!sub) throw new Error('Activa primero las notificaciones.');
    let r = await llamarPrueba(sub.endpoint);
    if (!r.ok && r.status === 404) {
      try { await guardar(sub); r = await llamarPrueba(sub.endpoint); } catch (_) { /* se queda con r */ }
    }
    if (r.ok) return { servidor: true };
    const reg = await registrar();
    if (reg) {
      await reg.showNotification('Prueba local de Rhēud', {
        body: 'El permiso funciona en este dispositivo. El servidor de avisos todavía no respondió.',
        icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', tag: 'prueba',
      });
    }
    return { servidor: false, detalle: r.detalle };
  }

  /* Al cerrar sesión, este dispositivo deja de recibir avisos de esa cuenta
     (importante en un iPad compartido: los avisos llevan nombres de clientas).
     Se borra la fila mientras la sesión sigue viva y se cancela la suscripción;
     quien entre después decide si las activa. Nunca bloquea más de 3 s. */
  async function olvidarEsteDispositivo() {
    if (!(await usuaria())) return;
    const sub = await suscripcionActual();
    if (!sub) return;
    const { error } = await cliente().from('push_subs').delete().eq('endpoint', sub.endpoint);
    if (error) console.warn('push_subs delete', error);
    await sub.unsubscribe();
    escribirLS(LS_SYNC, null);
  }

  function protegerCierreDeSesion() {
    const c = cliente();
    if (!c || !c.auth || typeof c.auth.signOut !== 'function' || c.auth.__rheudPush) return;
    const original = c.auth.signOut.bind(c.auth);
    c.auth.signOut = async function (opciones) {
      if (!opciones || opciones.scope !== 'others') {
        try { await conLimite(olvidarEsteDispositivo(), 3000); } catch (_) { /* no impide salir */ }
      }
      return original(opciones);
    };
    c.auth.__rheudPush = true;
  }

  /* Al abrir la app: si este dispositivo ya tiene permiso y suscripción, se
     vuelve a guardar (máximo una vez al día) por si el servidor la perdió. */
  async function sincronizar() {
    if (!soportado() || Notification.permission !== 'granted' || (esIOS() && !esStandalone())) return;
    const sub = await suscripcionActual();
    if (!sub || !negocio()) return;
    const u = await usuaria();
    if (!u) return;
    if (leerLS(LS_SYNC) === `${sub.endpoint}|${u.id}|${new Date().toDateString()}`) return;
    try { await guardar(sub); } catch (e) { console.warn('No se pudo sincronizar la suscripción push:', e); }
  }

  /* ---------------- hoja #notifSheet ---------------- */

  let hoja = null;
  let prefs = { ...PREFS_DEFAULT };

  function crearHoja() {
    if (hoja) return hoja;
    hoja = document.createElement('div');
    hoja.className = 'sheet ntf-sheet';
    hoja.id = 'notifSheet';
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-modal', 'true');
    hoja.setAttribute('aria-labelledby', 'notifTitulo');
    hoja.innerHTML = '<div class="grab"></div><h3 id="notifTitulo">Notificaciones</h3>' +
      '<div class="ntf-cuerpo" id="notifCuerpo" aria-live="polite"></div>' +
      '<button type="button" class="btn btn-line" data-ntf="cerrar">Cerrar</button>';
    const toastEl = document.getElementById('toast');
    if (toastEl && toastEl.parentNode === document.body) document.body.insertBefore(hoja, toastEl);
    else document.body.appendChild(hoja);
    hoja.addEventListener('click', alClic);
    hoja.addEventListener('change', alCambiar);
    return hoja;
  }

  function htmlInstalar() {
    const ua = navigator.userAgent || '';
    const otroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return `<p class="ntf-intro">Para recibir avisos en tu ${/iPad/.test(ua) || !/iPhone|iPod/.test(ua) ? 'iPad' : 'iPhone'}, primero agrega Rhēud a tu pantalla de inicio. Apple solo permite notificaciones en apps agregadas así.</p>
      <ol class="ntf-pasos">
        <li><span class="ntf-ic">${svg(ICONOS.compartir)}</span><span class="ntf-tx">Toca <b>Compartir</b> ${svg(ICONOS.compartir, 'aj-svg-mini')} en la barra del navegador. Si no lo ves, toca primero <b>Más</b> ${svg(ICONOS.mas, 'aj-svg-mini')}.</span></li>
        <li><span class="ntf-ic">${svg(ICONOS.agregar)}</span><span class="ntf-tx">Elige <b>Agregar a pantalla de inicio</b> (desliza hacia abajo si no aparece). Si ves <b>Abrir como app web</b>, déjalo activado y toca <b>Agregar</b>.</span></li>
        <li><span class="ntf-ic">${svg(ICONOS.app)}</span><span class="ntf-tx">Abre <b>Rhēud</b> desde el nuevo icono e inicia sesión otra vez: la app instalada tiene su propia sesión.</span></li>
        <li><span class="ntf-ic">${svg(ICONOS.campana)}</span><span class="ntf-tx">Ahí entra a <b>Notificaciones</b> y toca <b>Activar notificaciones</b>.</span></li>
      </ol>
      <p class="ntf-nota">Necesitas iOS 16.4 o más reciente.${otroNavegador ? ' Si en este navegador no aparece la opción, abre esta página en Safari.' : ''}</p>`;
  }

  function htmlNoSoportado() {
    if (esIOS()) {
      return `<div class="ntf-estado neutro">${svg(ICONOS.campanaNo)}<span>Este iPhone todavía no puede recibir avisos</span></div>
        <p>Las notificaciones de apps web necesitan iOS 16.4 o más reciente. Actualiza en <b>Ajustes</b> → <b>General</b> → <b>Actualización de software</b>.</p>`;
    }
    return `<div class="ntf-estado neutro">${svg(ICONOS.campanaNo)}<span>Este navegador no admite notificaciones</span></div>
      <p>En iPhone usa la app agregada a la pantalla de inicio desde Safari. En Android o computadora, abre Rhēud en Chrome, Edge o Firefox.</p>`;
  }

  function htmlBloqueadas() {
    let pasos;
    if (esIOS()) {
      pasos = 'Abre <b>Ajustes</b> → <b>Notificaciones</b> → <b>Rhēud</b> y activa <b>Permitir notificaciones</b>. Luego vuelve a abrir Rhēud.';
    } else if (esAndroid()) {
      pasos = 'Toca el icono a la izquierda de la dirección → <b>Permisos</b> → <b>Notificaciones</b> → <b>Permitir</b>. Si instalaste la app: mantén presionado su icono → <b>Información de la app</b> → <b>Notificaciones</b>.';
    } else {
      pasos = 'Haz clic en el icono a la izquierda de la dirección → <b>Notificaciones</b> → <b>Permitir</b>, y recarga la página.';
    }
    return `<div class="ntf-estado bloq">${svg(ICONOS.campanaNo)}<span>Las notificaciones están bloqueadas<small>Las bloqueaste en este dispositivo; solo se pueden permitir desde los ajustes.</small></span></div>
      <p>${pasos}</p>
      <button type="button" class="btn btn-line" data-ntf="revisar">Ya lo cambié</button>`;
  }

  function htmlDesactivadas() {
    const lista = TIPOS.map((t) => `<li>${svg(ICONOS[ICONO_TIPO[t.k]])}<span><b>${t.t}</b><small>${t.d}</small></span></li>`).join('');
    return `<p class="ntf-intro">Recibe avisos en este dispositivo aunque la app esté cerrada:</p>
      <ul class="ntf-lista">${lista}</ul>
      <button type="button" class="btn btn-primary" data-ntf="activar">Activar notificaciones</button>
      <p class="ntf-nota">${esIOS() ? 'Tu iPhone te pedirá permiso: toca <b>Permitir</b>.' : 'El navegador te pedirá permiso: elige <b>Permitir</b>.'} Después podrás elegir qué avisos recibir.</p>`;
  }

  function htmlActivadas() {
    const togs = TIPOS.map((t) => `<label class="ntf-tog"><span class="ntf-tog-tx"><b>${t.t}</b><small>${t.d}</small></span>` +
      `<input type="checkbox" role="switch" data-pref="${t.k}"${prefs[t.k] !== false ? ' checked' : ''} disabled><span class="ntf-sw" aria-hidden="true"></span></label>`).join('');
    return `<div class="ntf-estado ok">${svg(ICONOS.check)}<span>Activadas en este dispositivo<small>${nombreDispositivo()}</small></span></div>
      <div class="ntf-togs">${togs}</div>
      <button type="button" class="btn btn-line" data-ntf="probar">Enviar notificación de prueba</button>
      <button type="button" class="btn btn-ghost aj-peligro" data-ntf="desactivar">Desactivar en este dispositivo</button>`;
  }

  async function cargarPrefs() {
    const c = cliente();
    const sub = await suscripcionActual();
    if (!c || !sub) return;
    try {
      const { data, error } = await c.from('push_subs').select('prefs').eq('endpoint', sub.endpoint).maybeSingle();
      if (error) throw error;
      if (data && data.prefs) prefs = { ...PREFS_DEFAULT, ...data.prefs };
      else { prefs = { ...PREFS_DEFAULT }; await guardar(sub); }
    } catch (e) {
      console.warn('No se pudieron leer las preferencias:', e);
    }
    if (!hoja) return;
    hoja.querySelectorAll('input[data-pref]').forEach((i) => {
      i.checked = prefs[i.dataset.pref] !== false;
      i.disabled = false;
    });
  }

  async function pintar() {
    const c = hoja && hoja.querySelector('#notifCuerpo');
    const est = await estado();
    reflejarEstado(est);
    if (!c) return est;
    c.dataset.estado = est;
    if (est === 'instalar') c.innerHTML = htmlInstalar();
    else if (est === 'no-soportado') c.innerHTML = htmlNoSoportado();
    else if (est === 'bloqueadas') c.innerHTML = htmlBloqueadas();
    else if (est === 'desactivadas') c.innerHTML = htmlDesactivadas();
    else { c.innerHTML = htmlActivadas(); cargarPrefs(); }
    return est;
  }

  function cerrarHoja() {
    if (typeof window.closeSheet === 'function') window.closeSheet();
    else if (hoja) hoja.classList.remove('show');
  }

  async function abrir() {
    crearHoja();
    await pintar();
    if (typeof window.showSheet === 'function') window.showSheet('notifSheet');
    else hoja.classList.add('show');
  }

  function mensajeError(e) {
    const m = (e && e.message) || '';
    if (/sesi[oó]n/i.test(m)) return m;
    if (/network|fetch|conexi/i.test(m)) return 'Sin conexión. Intenta de nuevo.';
    return 'No se pudo activar. Intenta de nuevo.';
  }

  function alClic(e) {
    const b = e.target.closest('[data-ntf]');
    if (!b || b.disabled) return;
    const acc = b.dataset.ntf;
    if (acc === 'cerrar') { cerrarHoja(); return; }
    if (acc === 'revisar') { pintar(); return; }
    if (acc === 'activar') {
      b.disabled = true;
      b.textContent = 'Activando…';
      // activar() pide el permiso de inmediato, dentro de este mismo clic.
      activar()
        .then((est) => {
          if (est === 'activadas') avisar('Notificaciones activadas');
          else if (est === 'bloqueadas') avisar('Permiso bloqueado');
        })
        .catch((err) => { console.error(err); avisar(mensajeError(err)); })
        .then(() => pintar());
      return;
    }
    if (acc === 'probar') {
      b.disabled = true;
      b.textContent = 'Enviando…';
      probar()
        .then((r) => avisar(r.servidor ? 'Listo: llegará en unos segundos' : 'Prueba local enviada'))
        .catch((err) => { console.error(err); avisar((err && err.message) || 'No se pudo enviar'); })
        .then(() => { b.disabled = false; b.textContent = 'Enviar notificación de prueba'; });
      return;
    }
    if (acc === 'desactivar') {
      b.disabled = true;
      desactivar()
        .then(() => avisar('Notificaciones desactivadas'))
        .catch((err) => { console.error(err); avisar('No se pudo desactivar'); })
        .then(() => pintar());
    }
  }

  async function alCambiar(e) {
    const inp = e.target.closest('input[data-pref]');
    if (!inp) return;
    const c = cliente();
    const sub = await suscripcionActual();
    if (!c || !sub) return;
    const anterior = { ...prefs };
    prefs = { ...prefs, [inp.dataset.pref]: inp.checked };
    inp.disabled = true;
    try {
      const { data, error } = await c.from('push_subs').update({ prefs }).eq('endpoint', sub.endpoint).select('id');
      if (error) throw error;
      if (!data || !data.length) {
        await guardar(sub);
        const r = await c.from('push_subs').update({ prefs }).eq('endpoint', sub.endpoint);
        if (r.error) throw r.error;
      }
    } catch (err) {
      console.error(err);
      prefs = anterior;
      inp.checked = prefs[inp.dataset.pref] !== false;
      avisar('No se guardó. Revisa tu conexión.');
    } finally {
      inp.disabled = false;
    }
  }

  /* ---------------- fila en "Más" y estado visible ---------------- */

  function reflejarEstado(est) {
    document.documentElement.dataset.notif = est;
    const s = document.getElementById('ajNotifEstado');
    if (s) s.textContent = ETIQUETAS[est] || '';
  }

  function inyectarFila() {
    const cont = document.getElementById('masAjustes');
    if (!cont || document.getElementById('ajNotif')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aj-fila';
    b.id = 'ajNotif';
    b.innerHTML = `<span class="aj-ic">${svg(ICONOS.campana)}</span><span class="aj-tx"><b>Notificaciones</b><small id="ajNotifEstado"></small></span><span class="aj-chev">${svg(ICONOS.chevron)}</span>`;
    b.addEventListener('click', () => { abrir(); });
    cont.appendChild(b);
    estado().then(reflejarEstado);
  }

  /* ---------------- abrir desde una notificación ---------------- */

  function manejarDestino(url) {
    let u;
    try { u = new URL(url || location.href, location.href); } catch (_) { return; }
    if (u.searchParams.get('abrir') !== 'confirmar') return;
    // Si la app sigue en el login o cargando, espera a que esté lista.
    cuandoAppLista(() => {
      if (typeof window.openConfirmaciones !== 'function') return;
      try { window.openConfirmaciones(); } catch (e) { console.error(e); }
    });
  }

  function limpiarBadge() {
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  }

  function cuandoAppLista(fn) {
    const app = document.getElementById('app');
    if (!app) return;
    const lista = () => app.style.display !== 'none' && !!negocio();
    if (lista()) { fn(); return; }
    const o = new MutationObserver(() => { if (lista()) { o.disconnect(); fn(); } });
    o.observe(app, { attributes: true, attributeFilter: ['style'] });
  }

  /* ---------------- arranque ---------------- */

  window.RheudPush = { estado, abrir, activar, desactivar, probar, sincronizar };
  protegerCierreDeSesion();
  if (typeof window.abrirNotificaciones !== 'function') {
    window.abrirNotificaciones = function () { return window.RheudPush.abrir(); };
  }

  if ('serviceWorker' in navigator) {
    // Registrar temprano hace la app instalable y deja listo el servicio de avisos.
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', () => { registrar(); });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.tipo === 'rheud-abrir') { limpiarBadge(); manejarDestino(e.data.url); }
    });
  }

  new MutationObserver(() => {
    if (!document.getElementById('ajNotif') && document.getElementById('masAjustes')) inyectarFila();
  }).observe(document.body, { childList: true, subtree: true });
  inyectarFila();

  cuandoAppLista(() => {
    limpiarBadge();
    sincronizar();
    estado().then(reflejarEstado);
    if (/[?&]abrir=/.test(location.search)) {
      manejarDestino(location.href);
      try {
        const u = new URL(location.href);
        u.searchParams.delete('abrir');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      } catch (_) { /* sin history */ }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    limpiarBadge();
    // Al volver de Ajustes, refleja el permiso nuevo.
    if (hoja && hoja.classList.contains('show')) pintar();
    else estado().then(reflejarEstado);
  });
})();
