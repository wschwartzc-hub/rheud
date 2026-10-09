/* Rhēud · reglas de los avisos push (sin E/S, se prueban con node --test).
   Horas y fechas siempre en America/Monterrey; las citas guardan fecha
   'YYYY-MM-DD' y hora 'HH:MM' locales. */

export const ZONA = 'America/Monterrey';
/* Ajustes de avisos de cada persona (tabla notif_prefs); sin fila, estos. */
export const PREFS_DEFAULT = Object.freeze({
  recordatorio: true, recordatorio_min: 30, cambios: true,
  resumen: true, resumen_hora: '08:00', confirmar: true, confirmar_hora: '18:00',
});
export const URL_APP = '/?app';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------------- fechas ---------------- */

function diaAbs(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/* Fecha y minuto local de `instante` en la zona dada.
   abs = minutos desde 1970-01-01 00:00 *locales*, para comparar con citas. */
export function ahoraLocal(instante = new Date(), zona = ZONA) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instante)) p[x.type] = x.value;
  const fecha = `${p.year}-${p.month}-${p.day}`;
  const min = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return { fecha, min, abs: diaAbs(fecha) * 1440 + min };
}

export function fechaMas(fecha, dias) {
  const d = diaAbs(fecha);
  if (d == null) return null;
  return new Date((d + dias) * 86400000).toISOString().slice(0, 10);
}

/* 'HH:MM' → minutos del día, o null si no es una hora válida. */
export function horaAMin(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora == null ? '' : hora).trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export function minutosCita(c) {
  const d = diaAbs(c && c.fecha);
  const m = horaAMin(c && c.hora);
  return d == null || m == null ? null : d * 1440 + m;
}

/* Citas agendadas que empiezan dentro de [desde, hasta] minutos a partir de
   `ahora` (resultado de ahoraLocal). Cruza la medianoche sin problema.
   Cada cita trae `faltan` (minutos). */
export function citasEnVentana(citas, ahora, desde = 25, hasta = 35) {
  const out = [];
  for (const c of citas || []) {
    if (!c || c.estado !== 'agendada') continue;
    const m = minutosCita(c);
    if (m == null) continue;
    const faltan = m - ahora.abs;
    if (faltan >= desde && faltan <= hasta) out.push({ ...c, faltan });
  }
  return out.sort((a, b) => a.faltan - b.faltan);
}

/* ---------------- textos ---------------- */

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'do', 'van', 'von']);

/* "Daniela Cantú Garza" → "Daniela C.". En la pantalla bloqueada solo va el
   nombre y la inicial del apellido. */
export function nombreCorto(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'Clienta';
  const apellido = p.slice(1).find((x) => !PARTICULAS.has(x.toLowerCase()));
  return apellido ? `${p[0]} ${apellido[0].toLocaleUpperCase('es-MX')}.` : p[0];
}

/* '16:30' → '4:30 PM' (mismo formato que la agenda de la app). */
export function fmtHora(hora) {
  const m = horaAMin(hora);
  if (m == null) return String(hora || '').trim();
  const h = Math.floor(m / 60), mi = m % 60;
  return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/* 'Hoy', 'Mañana' o 'Jue 9 oct'. */
export function fmtDia(fecha, hoy) {
  if (fecha === hoy) return 'Hoy';
  if (hoy && fecha === fechaMas(hoy, 1)) return 'Mañana';
  const d = diaAbs(fecha);
  if (d == null) return '';
  const f = new Date(d * 86400000);
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
}

export function fmtDinero(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function serviciosTexto(items) {
  const n = (Array.isArray(items) ? items : []).map((i) => String((i && i.n) || '').trim()).filter(Boolean);
  if (n.length <= 1) return n[0] || '';
  const todo = n.join(' + ');
  return todo.length <= 48 ? todo : `${n[0]} +${n.length - 1}`;
}

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

function unirPartes(...p) { return p.filter(Boolean).join(' · '); }

/* ---------------- mensajes ---------------- */

export function refRecordatorio(c) {
  // Si la cita se mueve, la nueva hora vuelve a avisar.
  return `${c.id}@${c.fecha}T${c.hora}`;
}

export function msgRecordatorio(c, nombre) {
  return {
    title: `Cita en ${fmtFaltan(c.faltan != null ? c.faltan : 30)}`,
    body: unirPartes(fmtHora(c.hora), nombreCorto(nombre), serviciosTexto(c.items)),
    tag: `cita-${c.id}`,
    url: urlCita(c.id),
  };
}

/* 30 → '30 min', 60 → '1 h', 90 → '1 h 30 min' */
export function fmtFaltan(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

export function urlCita(id) { return `${URL_APP}&cita=${encodeURIComponent(id)}`; }
export function urlEvento(id) { return `${URL_APP}&evento=${encodeURIComponent(id)}`; }
/* La notificación lleva el id del aviso de la bandeja para marcarlo leído. */
export function urlConAviso(url, id) {
  const u = String(url || URL_APP);
  return `${u}${u.includes('?') ? '&' : '?'}n=${encodeURIComponent(id)}`;
}

/* Eventos personales: avisan solo a quien los creó. */
export function refRecordatorioEvento(e) {
  return `ev:${e.id}@${e.fecha}T${e.hora}`;
}

export function msgRecordatorioEvento(e) {
  const t = String((e && e.titulo) || '').trim() || 'Evento personal';
  return {
    title: `En ${fmtFaltan(e.faltan != null ? e.faltan : 30)}: ${t.length > 60 ? t.slice(0, 59) + '…' : t}`,
    body: `${fmtHora(e.hora)} · Evento personal`,
    tag: `evento-${e.id}`,
    url: urlEvento(e.id),
  };
}

/* Total esperado de una cita = precio − descuento (como js/pagos.js). */
export function esperadoCita(c) {
  const base = Math.max(0, num(c.precio));
  return base - Math.min(base, Math.max(0, num(c.descuento_monto)));
}

export function msgResumen(citasHoy) {
  const activas = (citasHoy || []).filter((c) => c && c.estado !== 'cancelada');
  if (!activas.length) return { title: 'Buenos días', body: 'Hoy no tienes citas', tag: 'resumen', url: URL_APP };
  const total = activas.reduce((s, c) => s + esperadoCita(c), 0);
  const n = activas.length;
  const horas = activas.map((c) => horaAMin(c.hora)).filter((m) => m != null).sort((a, b) => a - b);
  let body = `Hoy: ${n} ${n === 1 ? 'cita' : 'citas'} · ${fmtDinero(total)} esperados`;
  if (horas.length) body += ` · primera a las ${fmtHora(`${Math.floor(horas[0] / 60)}:${String(horas[0] % 60).padStart(2, '0')}`)}`;
  return { title: 'Resumen del día', body, tag: 'resumen', url: URL_APP };
}

function nombreDe(nombres, id) {
  if (!nombres) return '';
  return typeof nombres.get === 'function' ? nombres.get(id) : nombres[id];
}

/* Citas de mañana sin confirmar; null si no hay ninguna (no se avisa). */
export function msgConfirmar(citasManana, nombres) {
  const pend = (citasManana || [])
    .filter((c) => c && c.estado === 'agendada' && !c.confirmada_at)
    .sort((a, b) => (horaAMin(a.hora) ?? 9999) - (horaAMin(b.hora) ?? 9999));
  if (!pend.length) return null;
  const n = pend.length;
  const lista = pend.slice(0, 3).map((c) => `${fmtHora(c.hora)} ${nombreCorto(nombreDe(nombres, c.clienta_id))}`.trim()).join(', ');
  return {
    title: n === 1 ? 'Confirma la cita de mañana' : `Confirma las ${n} citas de mañana`,
    body: n > 3 ? `${lista} y ${n - 3} más` : lista,
    tag: 'confirmar',
    url: `${URL_APP}&abrir=confirmar`,
    badge: n,
  };
}

/* Qué tipo de cambio merece aviso: 'nueva' | 'movida' | 'cancelada' |
   'reactivada' | null. Marcar como atendida o editar citas pasadas no avisa. */
export function tipoCambio(op, antes, cita, hoy) {
  if (!cita) return null;
  if (op === 'INSERT') return cita.estado === 'agendada' && cita.fecha >= hoy ? 'nueva' : null;
  if (op !== 'UPDATE' || !antes) return null;
  const a = { fecha: antes.fecha, hora: antes.hora || '', estado: antes.estado };
  if (a.estado !== 'cancelada' && cita.estado === 'cancelada') return a.fecha >= hoy || cita.fecha >= hoy ? 'cancelada' : null;
  if (a.estado === 'cancelada' && cita.estado === 'agendada') return cita.fecha >= hoy ? 'reactivada' : null;
  const movida = a.fecha !== cita.fecha || a.hora !== (cita.hora || '');
  if (movida && cita.estado === 'agendada' && (cita.fecha >= hoy || a.fecha >= hoy)) return 'movida';
  return null;
}

export function msgCambio(tipo, cita, antes, nombre, hoy) {
  const quien = nombreCorto(nombre);
  const cuando = `${fmtDia(cita.fecha, hoy)} ${fmtHora(cita.hora)}`.trim();
  const base = { tag: `cita-${cita.id}`, url: urlCita(cita.id) };
  switch (tipo) {
    case 'nueva':
      return { ...base, title: 'Cita nueva', body: unirPartes(cuando, quien, serviciosTexto(cita.items)) };
    case 'movida': {
      const antesTxt = antes.fecha === cita.fecha
        ? `${fmtDia(antes.fecha, hoy)} ${fmtHora(antes.hora)} → ${fmtHora(cita.hora)}`
        : `${fmtDia(antes.fecha, hoy)} ${fmtHora(antes.hora)} → ${cuando}`;
      return { ...base, title: 'Cita movida', body: `${quien}: ${antesTxt}` };
    }
    case 'cancelada':
      return { ...base, title: 'Cita cancelada', body: unirPartes(cuando, quien) };
    case 'reactivada':
      return { ...base, title: 'Cita reactivada', body: unirPartes(cuando, quien, serviciosTexto(cita.items)) };
    default:
      return null;
  }
}

export function msgPrueba() {
  return { title: 'Notificaciones activadas', body: 'Así te llegarán los avisos de Rhēud en este dispositivo.', tag: 'prueba', url: URL_APP };
}

/* ---------------- suscripciones ---------------- */

/* Ajustes de una persona: lo guardado (fila de notif_prefs) sobre los de
   fábrica, con valores fuera de rango corregidos. */
export function prefsCon(fila) {
  const f = fila && typeof fila === 'object' ? fila : {};
  const sino = (v, d) => (typeof v === 'boolean' ? v : d);
  const hora = (v, d) => (horaAMin(v) != null && /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : d);
  const min = Number(f.recordatorio_min);
  return {
    recordatorio: sino(f.recordatorio, PREFS_DEFAULT.recordatorio),
    recordatorio_min: Number.isFinite(min) ? Math.min(240, Math.max(5, Math.round(min))) : PREFS_DEFAULT.recordatorio_min,
    cambios: sino(f.cambios, PREFS_DEFAULT.cambios),
    resumen: sino(f.resumen, PREFS_DEFAULT.resumen),
    resumen_hora: hora(f.resumen_hora, PREFS_DEFAULT.resumen_hora),
    confirmar: sino(f.confirmar, PREFS_DEFAULT.confirmar),
    confirmar_hora: hora(f.confirmar_hora, PREFS_DEFAULT.confirmar_hora),
  };
}

/* Minutos [desde, hasta] antes de la cita en los que toca avisar. Las corridas
   son cada 5 min; 10 min de margen cubren una corrida atrasada (el aviso no se
   repite: la bandeja guarda uno por persona y cita). */
export function ventanaRecordatorio(min) {
  const m = Math.max(5, Number(min) || PREFS_DEFAULT.recordatorio_min);
  return [m - 9, m + 1];
}

/* ¿Ya es la hora elegida (y no han pasado más de `margen` minutos)? Así, si la
   persona cambia la hora a una que ya pasó hace rato, no le llega tarde. */
export function horaLlego(hora, minAhora, margen = 120) {
  const m = horaAMin(hora);
  return m != null && minAhora >= m && minAhora < m + margen;
}

/* Solo se envía a servicios push conocidos (evita que una fila manipulada
   convierta la función en un cliente HTTP hacia cualquier dirección). */
const HOSTS_PUSH = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function endpointPermitido(ep) {
  try {
    const u = new URL(ep);
    return u.protocol === 'https:' && !u.username && !u.password && HOSTS_PUSH.some((r) => r.test(u.hostname));
  } catch (_) {
    return false;
  }
}

/* ---------------- HTTP ---------------- */

export function origenPermitido(o) {
  return typeof o === 'string' && (
    o === 'https://rheud-app.netlify.app' ||
    /^https:\/\/[a-z0-9-]+--rheud-app\.netlify\.app$/.test(o) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(o));
}

export function cabecerasCors(origen) {
  const h = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origenPermitido(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
}

/* Compara dos secretos sin filtrar por tiempo cuántos caracteres coinciden:
   se comparan sus SHA-256 (mismo largo) recorriendo todos los bytes. */
export async function igualesTiempoConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const te = new TextEncoder();
  const [ha, hb] = await Promise.all([
    globalThis.crypto.subtle.digest('SHA-256', te.encode(a)),
    globalThis.crypto.subtle.digest('SHA-256', te.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

export function esUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
