/* Rhēud · service worker de la app del estudio (alcance "/").
   - Caché: red primero para HTML/JS/CSS propios (las actualizaciones llegan al
     momento; la copia guardada solo se usa sin conexión) y caché primero para
     vendor/ y assets/ (rutas con versión o que casi no cambian).
   - Nunca guarda nada de Supabase ni de otros orígenes, ni el portal de clientas.
   - Notificaciones push: siempre muestra una notificación por cada push
     (iOS retira el permiso si no se hace).
   Si cambia algo dentro de assets/ (logo, iconos), sube VERSION: esos
   archivos se sirven de la caché y solo se renuevan con una versión nueva. */

const VERSION = 'v7.3.0';
const CACHE = `rheud-${VERSION}`;
const VAPID_PUBLICA = 'BAd_ntg7CVK5fkBBpbAD8rLlznVl27BJku_aKsYERCY4Z2_pwu9GSsCgytUXsEvgED7jOqzfr64xnNocAjgJpaw';
const FUNCION_PUSH = 'https://wrplznjgravcnxkzfarn.supabase.co/functions/v1/rheud-push';

const SHELL = [
  './',
  'manifest.webmanifest',
  'css/app.css',
  'css/ajustes.css',
  'js/pagos.js',
  'js/nucleo.js',
  'js/app/00-eventos.js',
  'js/app/01-datos.js',
  'js/app/02-iconos.js',
  'js/app/02-utilidades.js',
  'js/app/03-agenda.js',
  'js/app/04-finanzas.js',
  'js/app/05-citas.js',
  'js/app/06-insights.js',
  'js/app/07-clientas.js',
  'js/app/08-piel.js',
  'js/app/09-menu.js',
  'js/app/10-lealtad.js',
  'js/app/11-cita-form.js',
  'js/app/12-whatsapp.js',
  'js/app/13-app.js',
  'js/app/14-mas.js',
  'js/app/15-accesibilidad.js',
  'js/app/16-eventos.js',
  'js/app/17-avisos.js',
  'js/push.js',
  'js/seguridad.js',
  'vendor/supabase-js-2.117.1/supabase.js',
  'vendor/qrcodejs-1.0.0/qrcode.min.js',
  'vendor/html5-qrcode-2.3.8/html5-qrcode.min.js',
  'assets/logo.svg',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-192.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'assets/badge-96.png',
];

const SHELL_URL = new URL('./', self.location).href;

/* ---------------- ciclo de vida ---------------- */

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Uno por uno: si falta un archivo, el resto se guarda igual.
    await Promise.allSettled(SHELL.map(async (ruta) => {
      const res = await fetch(new Request(ruta, { cache: 'reload' }));
      if (res.ok && !res.redirected) await cache.put(ruta === './' ? SHELL_URL : new URL(ruta, self.location).href, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith('rheud-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ---------------- caché ---------------- */

function esPortal(path) {
  return path === '/portal' || path === '/portal.html' || path === '/js/portal.js';
}

async function guardar(clave, res) {
  if (!res || !res.ok || res.type !== 'basic' || res.redirected) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(clave, res);
  } catch (_) { /* cuota llena o modo privado: se ignora */ }
}

async function redPrimero(req, clave) {
  try {
    const res = await fetch(req);
    if (res.ok) guardar(clave, res.clone());
    return res;
  } catch (e) {
    const copia = await caches.match(clave);
    if (copia) return copia;
    throw e;
  }
}

async function cachePrimero(req, clave) {
  const copia = await caches.match(clave);
  if (copia) return copia;
  const res = await fetch(req);
  guardar(clave, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Supabase, Google Fonts, clima y cualquier otro origen: sin tocar.
  if (url.origin !== self.location.origin) return;
  if (esPortal(url.pathname) || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') event.respondWith(redPrimero(req, SHELL_URL));
    return;
  }
  // La clave ignora ?v=… para no acumular copias.
  const clave = url.origin + url.pathname;
  if (url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(cachePrimero(req, clave));
  } else if (/^\/(js|css)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(redPrimero(req, clave));
  }
});

/* ---------------- notificaciones push ---------------- */

function urlSegura(u) {
  try {
    const x = new URL(u || './?app', self.location.origin);
    return x.origin === self.location.origin ? x.href : new URL('./?app', self.location.origin).href;
  } catch (_) {
    return new URL('./?app', self.location.origin).href;
  }
}

async function mostrar(event) {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (_) {
    try { d = { body: event.data.text() }; } catch (__) { d = {}; }
  }
  if (!d || typeof d !== 'object') d = {};
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    try {
      if (d.badge > 0) await self.navigator.setAppBadge(d.badge);
      else await self.navigator.clearAppBadge();
    } catch (_) { /* sin permiso de globos: se ignora */ }
  }
  const opciones = {
    body: String(d.body || ''),
    icon: 'assets/icon-192.png',
    badge: 'assets/badge-96.png',
    data: { url: urlSegura(d.url) },
    timestamp: Number(d.ts) || Date.now(),
    lang: 'es-MX',
  };
  if (d.tag) {
    opciones.tag = String(d.tag);
    opciones.renotify = true;
  }
  return self.registration.showNotification(String(d.title || 'Rhēud'), opciones);
}

self.addEventListener('push', (event) => {
  event.waitUntil(mostrar(event).catch(() =>
    // Último recurso: nunca terminar un push sin notificación visible.
    self.registration.showNotification('Rhēud', { body: 'Tienes un aviso nuevo.', icon: 'assets/icon-192.png' })));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = urlSegura(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      const p = new URL(v.url);
      if (p.origin === self.location.origin && !esPortal(p.pathname)) {
        try { await v.focus(); } catch (_) { /* iOS a veces no deja enfocar */ }
        v.postMessage({ tipo: 'rheud-abrir', url: destino });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(destino);
  })());
});

function claveBytes(b64) {
  const t = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/* El navegador cambió la suscripción (Chrome/Firefox; Safari no lo dispara).
   Se vuelve a suscribir y se avisa a la función con el endpoint anterior. Si
   esto falla, la app la vuelve a guardar la próxima vez que se abra. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const anterior = event.oldSubscription;
    let nueva = event.newSubscription;
    if (!nueva) {
      const clave = (anterior && anterior.options && anterior.options.applicationServerKey) || claveBytes(VAPID_PUBLICA);
      nueva = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
    }
    if (!anterior || !nueva || anterior.endpoint === nueva.endpoint) return;
    await fetch(FUNCION_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea: 'renovar', anterior: anterior.endpoint, nueva: nueva.toJSON() }),
    });
  })().catch(() => {}));
});
