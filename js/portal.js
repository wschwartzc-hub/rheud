/* Rhēud · portal de la clienta.
   Lee una sola cita por token (portal.html#<token>) o, para enlaces viejos,
   por código (portal.html?c=RH-XXXX). Nunca lee tablas directamente: usa las
   funciones portal_cita / portal_cita_codigo, que devuelven solo lo necesario.
   Todo el texto que viene de la base se pinta con textContent. */
(function () {
  'use strict';

  const SB_URL = 'https://wrplznjgravcnxkzfarn.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndycGx6bmpncmF2Y254a3pmYXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzM4MDEsImV4cCI6MjA5NTk0OTgwMX0.qEbNOdPQVJ_rsZTdaaTxMx5JpS5qI1wMlbEM7yImq_c';
  const MAX_SELLOS = 12, HITO = 6, REFRESCO_MS = 30000;

  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Iconos de línea: cadenas fijas del código, nunca datos de la base.
  const ICON = {
    nails: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/></svg>',
    skin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9 14c1.5 1.5 4.5 1.5 6 0M9.5 10h.01M14.5 10h.01"/></svg>',
    otro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
  };

  const $ = (id) => document.getElementById(id);

  /* Crea elementos sin innerHTML. h('p', {class:'x'}, 'texto', otroNodo) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'icon') el.insertAdjacentHTML('afterbegin', ICON[v] || '');
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : String(kid));
    }
    return el;
  }

  /* ---------- formato ---------- */
  function fechaLarga(f) {
    const d = new Date(f + 'T00:00:00');
    if (isNaN(d)) return '';
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  function hora12(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return '';
    let [hh, mm] = hhmm.split(':').map(Number);
    const ap = hh < 12 ? 'a. m.' : 'p. m.';
    hh = hh % 12 || 12;
    return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
  }
  function dur(min) {
    min = Number(min) || 0;
    const hh = Math.floor(min / 60), mm = min % 60;
    if (hh && mm) return `${hh} h ${mm} min`;
    if (hh) return `${hh} h`;
    return `${mm} min`;
  }
  const dinero = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const capital = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  function normalizaCodigo(raw) {
    let c = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!c) return '';
    if (c.startsWith('RH-')) return c;
    if (c.startsWith('RH')) return 'RH-' + c.slice(2);
    return 'RH-' + c;
  }

  /* ---------- red ---------- */
  async function rpc(fn, args) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store'
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  /* ---------- estado ---------- */
  let consulta = null;        // {token} | {codigo}
  let ultimoJSON = '';
  let timer = null;

  function mostrar(vista) {
    $('loading').hidden = vista !== 'loading';
    $('enter').hidden = vista !== 'enter';
    $('result').hidden = vista !== 'result';
    $('foot').hidden = vista !== 'result';
  }

  async function cargar(q, { silencioso = false } = {}) {
    if (!silencioso) mostrar('loading');
    try {
      const data = q.token
        ? await rpc('portal_cita', { p_token: q.token })
        : await rpc('portal_cita_codigo', { p_codigo: q.codigo });
      if (!data) {
        if (silencioso) return;
        consulta = null;
        pedirCodigo(q.token
          ? 'No encontramos tu cita con este enlace. Escribe tu código.'
          : 'No encontramos una cita reciente con ese código. Revísalo e intenta de nuevo.', q.codigo);
        return;
      }
      consulta = q;
      const json = JSON.stringify(data);
      if (json !== ultimoJSON) { ultimoJSON = json; pintar(data); }
      $('updated').textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
      mostrar('result');
      programarRefresco();
    } catch (e) {
      console.error(e);
      if (silencioso) return;
      pedirCodigo('No pudimos conectar. Revisa tu internet e intenta de nuevo.', q.codigo);
    }
  }

  function programarRefresco() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (consulta && document.visibilityState === 'visible') cargar(consulta, { silencioso: true });
    }, REFRESCO_MS);
  }

  function pedirCodigo(msg, valor) {
    clearInterval(timer);
    $('topCode').textContent = '';
    $('err').textContent = msg || '';
    if (valor != null) $('codeInput').value = valor;
    mostrar('enter');
  }

  /* ---------- pintar la cita ---------- */
  function pintar(d) {
    const res = $('result');
    res.replaceChildren();
    $('topCode').textContent = d.codigo || '';
    document.title = 'Rhēud Beauty · ' + (d.codigo || 'Mi cita');

    const estado = d.estado || 'agendada';
    const atendida = estado === 'atendida', cancelada = estado === 'cancelada';
    const nombre = d.clienta && d.clienta.nombre;
    const cuando = [fechaLarga(d.fecha), hora12(d.hora) && 'a las ' + hora12(d.hora)].filter(Boolean).join(' ');

    // "a. m." ya termina en punto: no se agrega otro.
    const fin = /\.$/.test(cuando) ? '' : '.';
    const lead = cancelada ? h('p', { class: 'lead' }, 'Esta cita del ', h('b', null, cuando), ' se canceló.')
      : atendida ? h('p', { class: 'lead' }, 'Tu cita fue el ', h('b', null, cuando), fin, ' ¡Gracias por venir!')
      : h('p', { class: 'lead' }, 'Tu cita es el ', h('b', null, cuando), fin);

    let pasos;
    if (cancelada) {
      pasos = h('div', { class: 'banner bad', role: 'status' }, 'Cita cancelada. Si fue un error, escríbenos para reagendar.');
    } else {
      const conf = d.confirmada || atendida;
      pasos = h('ol', { class: 'steps', 'aria-label': 'Estado de tu cita' },
        h('li', { class: 'done' }, 'Agendada'),
        h('li', { class: conf ? 'done' : null, 'aria-current': conf && !atendida ? 'step' : null }, 'Confirmada'),
        h('li', { class: atendida ? 'done' : null, 'aria-current': atendida ? 'step' : null }, 'Atendida'));
    }

    const servicios = Array.isArray(d.servicios) && d.servicios.length ? d.servicios : [{ nombre: 'Servicio', rama: 'otro' }];
    const lista = h('div', { class: 'svcs' }, servicios.map((s) => {
      const rama = s.rama === 'skin' ? 'skin' : s.rama === 'nails' ? 'nails' : 'otro';
      return h('div', { class: 'svc ' + rama },
        h('span', { class: 'ic', icon: rama }),
        h('span', { class: 'nm' }, s.nombre || 'Servicio'));
    }));

    const pago = window.RheudPagos.resumenPago(d);
    const totalTxt = h('span', { class: 'v' }, dinero(pago.total),
      pago.descuento > 0 ? h('small', null, 'Incluye descuento de ' + dinero(pago.descuento)) : null);
    const resumen = h('div', { class: 'sum' },
      h('span', { class: 'k' }, d.duracion_min ? dur(d.duracion_min) : 'Total'), totalTxt);

    let pagoTag = null;
    if (atendida) {
      if (pago.estado === 'pagado') pagoTag = h('span', { class: 'pay pagado' }, 'Pagado');
      else if (pago.estado === 'parcial') pagoTag = h('span', { class: 'pay parcial' }, `Pagaste ${dinero(pago.cobrado)} · pendiente ${dinero(pago.saldo)}`);
      else pagoTag = h('span', { class: 'pay pendiente' }, 'Pendiente de pago: ' + dinero(pago.saldo));
    }

    const neg = d.negocio || {};
    const acciones = h('div', { class: 'actions' });
    if (!atendida && !cancelada && d.fecha) {
      acciones.append(h('button', { class: 'btn primary', type: 'button', icon: 'cal', onclick: () => descargarICS(d) }, 'Agregar al calendario'));
    }
    const mapa = neg.maps_url && /^https:\/\//i.test(neg.maps_url) ? neg.maps_url
      : neg.direccion ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(neg.direccion) : '';
    if (mapa && !cancelada) acciones.append(h('a', { class: 'btn', href: mapa, target: '_blank', rel: 'noopener noreferrer', icon: 'pin' }, 'Cómo llegar'));
    const tel = String(neg.telefono || '').replace(/\D/g, '');
    if (tel.length >= 10) {
      const wa = 'https://wa.me/' + (tel.length === 10 ? '52' + tel : tel) + '?text=' + encodeURIComponent(`Hola, tengo una pregunta sobre mi cita ${d.codigo || ''}`.trim());
      acciones.append(h('a', { class: 'btn', href: wa, target: '_blank', rel: 'noopener noreferrer', icon: 'chat' }, 'Escribir'));
    }

    res.append(h('section', { class: 'card', 'aria-labelledby': 'tituloCita' },
      h('h1', { id: 'tituloCita' }, nombre ? `Hola, ${capital(nombre)}` : 'Tu cita'),
      lead, pasos, lista, resumen, pagoTag,
      acciones.childElementCount ? acciones : null));

    // Antes de tu cita: requisitos de los servicios (texto del menú)
    if (!atendida && !cancelada) {
      const reqs = [];
      servicios.forEach((s) => String(s.requisitos || '').split(/\s*(?:·|\n|;)\s*/).forEach((r) => { r = r.trim(); if (r && !reqs.includes(r)) reqs.push(r); }));
      if (reqs.length) {
        res.append(h('section', { class: 'card', 'aria-labelledby': 'tituloPrep' },
          h('h2', { id: 'tituloPrep' }, 'Antes de tu cita'),
          h('ul', { class: 'prep' }, reqs.map((r) => h('li', { icon: 'check' }, capital(r))))));
      }
    }

    if (d.clienta) res.append(tarjetaLealtad(d.clienta));
  }

  function tarjetaLealtad(cl) {
    const sellos = Math.max(0, Math.min(MAX_SELLOS, Number(cl.sellos) || 0));
    const faltan6 = Math.max(0, HITO - sellos), faltan12 = Math.max(0, MAX_SELLOS - sellos);
    const premio6 = cl.premio_menor || 'Premio', premio12 = cl.premio_mayor || 'Premio mayor';
    let msg;
    if (sellos >= MAX_SELLOS) msg = '¡Completaste tu tarjeta! Pregunta por tu premio mayor.';
    else if (sellos >= HITO) msg = cl.menor_canjeado ? `Te faltan ${faltan12} ${faltan12 === 1 ? 'sello' : 'sellos'} para tu premio mayor.`
      : `¡Ya tienes tu premio de ${HITO} sellos! Te faltan ${faltan12} para el premio mayor.`;
    else msg = `Te ${faltan6 === 1 ? 'falta 1 sello' : `faltan ${faltan6} sellos`} para tu primer premio.`;

    const qr = h('div', { class: 'qr', role: 'img', 'aria-label': 'Código QR de tu tarjeta de lealtad' });
    const card = h('section', { class: 'card', 'aria-labelledby': 'tituloSellos' },
      h('div', { class: 'loy-head' }, h('h2', { id: 'tituloSellos' }, 'Tus sellos'), h('span', { class: 'loy-count' }, `${sellos} / ${MAX_SELLOS}`)),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': MAX_SELLOS, 'aria-valuenow': sellos, 'aria-label': 'Sellos acumulados' },
        h('div', { class: 'fill', style: `width:${(sellos / MAX_SELLOS) * 100}%` }),
        h('span', { class: 'mark' })),
      h('div', { class: 'marks' },
        h('span', null, `Hoy: ${sellos}`),
        h('span', { class: 'm6' }, `${HITO} · ${premio6}${cl.menor_canjeado ? ' (canjeado)' : ''}`),
        h('span', { class: 'm12' }, `${MAX_SELLOS} · ${premio12}${cl.mayor_canjeado ? ' (canjeado)' : ''}`)),
      h('p', { class: 'loy-msg' }, msg),
      h('div', { class: 'qr-row' }, qr, h('p', null, 'Muéstralo al pagar y sumamos tu sello en ese momento.')));
    try {
      if (window.QRCode && cl.id) {
        new window.QRCode(qr, { text: 'RHEUD-CLI:' + cl.id, width: 200, height: 200, colorDark: '#231C1F', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      }
    } catch (e) { console.error(e); }
    return card;
  }

  /* ---------- calendario (.ics) ---------- */
  function descargarICS(d) {
    const [y, m, dd] = String(d.fecha).split('-');
    const [hh, mi] = (d.hora && /^\d{1,2}:\d{2}/.test(d.hora) ? d.hora : '10:00').split(':').map(Number);
    const ini = new Date(Number(y), Number(m) - 1, Number(dd), hh, mi);
    const fin = new Date(ini.getTime() + (Number(d.duracion_min) || 60) * 60000);
    const f = (t) => `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}00`;
    const esc = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const neg = d.negocio || {};
    const servicios = (d.servicios || []).map((s) => s.nombre).join(', ');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rheud Beauty//Portal//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${esc(d.codigo || stamp)}@rheud-app.netlify.app`, `DTSTAMP:${stamp}`,
      `DTSTART:${f(ini)}`, `DTEND:${f(fin)}`,
      `SUMMARY:${esc('Cita en ' + (neg.nombre || 'Rhēud Beauty'))}`,
      `DESCRIPTION:${esc(servicios + (d.codigo ? '\nCódigo: ' + d.codigo : ''))}`,
      neg.direccion ? `LOCATION:${esc(neg.direccion)}` : null,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Tu cita en Rhēud Beauty', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = h('a', { href: url, download: `cita-${d.codigo || 'rheud'}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ---------- arranque ---------- */
  function leerRuta() {
    const hash = location.hash.replace(/^#/, '');
    const m = hash.match(/^(?:t=)?([a-f0-9]{32,})$/i);
    if (m) return { token: m[1].toLowerCase() };
    const c = new URLSearchParams(location.search).get('c');
    if (c) return { codigo: normalizaCodigo(c) };
    return null;
  }

  $('codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = normalizaCodigo($('codeInput').value);
    if (!/^RH-[A-Z0-9]{4}$/.test(codigo)) { $('err').textContent = 'El código tiene la forma RH-7F3K.'; $('codeInput').focus(); return; }
    $('err').textContent = '';
    history.replaceState(null, '', location.pathname + '?c=' + encodeURIComponent(codigo));
    cargar({ codigo });
  });

  $('otraBtn').addEventListener('click', () => {
    consulta = null; ultimoJSON = '';
    history.replaceState(null, '', location.pathname);
    pedirCodigo('', '');
    $('codeInput').focus();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && consulta) cargar(consulta, { silencioso: true });
  });
  window.addEventListener('hashchange', () => { const q = leerRuta(); if (q) cargar(q); });

  const inicial = leerRuta();
  if (inicial) cargar(inicial);
  else pedirCodigo('');
})();
