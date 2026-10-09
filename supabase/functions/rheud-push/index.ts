// Rhēud · avisos push del estudio (Supabase Edge Function "rheud-push").
//
// Se despliega con verify_jwt = false y se autentica sola:
//  · pg_cron y el trigger de citas mandan la cabecera x-rheud-secret, que se
//    compara (en tiempo constante) con el secreto rheud_push_cron_secret de Vault.
//  · La app llama a {tarea:'probar'} con el JWT de la usuaria en Authorization.
//  · El service worker llama a {tarea:'renovar'} cuando el navegador cambia la
//    suscripción; la prueba de propiedad es conocer el endpoint anterior.
//
// Tareas: recordatorios de citas y eventos personales (cada 5 min), resumen y
// confirmar (cada 15 min, a la hora que eligió cada persona), cambio (trigger de
// citas), probar, renovar. Cada aviso queda en la bandeja (tabla notificaciones)
// de la persona y además llega por push a sus dispositivos.
//
// Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) está implementado con
// WebCrypto en webpush.mjs: sin dependencias de Node y probado con el vector
// del RFC 8291 en tests/push.test.js.

import { createClient } from '@supabase/supabase-js';
import { enviarPush } from './webpush.mjs';
import * as L from './logica.mjs';

type Sub = {
  id: string; negocio_id: string; user_id: string; endpoint: string;
  p256dh: string; auth: string; fallos: number | null;
};
type Vapid = { publicKey: string; privateKey: string; subject: string };
type Config = { vapid: Vapid; secreto: string };
type Mensaje = { title: string; body: string; tag?: string; url?: string; badge?: number };
type Opciones = { ttl: number; urgencia?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string };
type Resultado = { enviadas: number; borradas: number; fallidas: number };
type Cita = {
  id: string; negocio_id?: string; clienta_id: string | null; items?: unknown; fecha: string;
  hora: string | null; estado: string; precio?: number; descuento_monto?: number | null;
  confirmada_at?: string | null; faltan?: number;
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const SUB_COLS = 'id, negocio_id, user_id, endpoint, p256dh, auth, fallos';
const MAX_FALLOS = 30; // fallos seguidos (no 404/410) antes de dar por muerta una suscripción

/* ---------------- configuración (Vault) ---------------- */

let cacheCfg: { cfg: Config; hasta: number } | null = null;

async function config(): Promise<Config> {
  if (cacheCfg && cacheCfg.hasta > Date.now()) return cacheCfg.cfg;
  const { data, error } = await admin.rpc('rheud_push_config');
  if (error) throw new Error('rheud_push_config: ' + error.message);
  const d = (data ?? {}) as Record<string, string | null>;
  const cfg: Config = {
    vapid: { publicKey: d.vapid_public ?? '', privateKey: d.vapid_private ?? '', subject: d.vapid_subject ?? '' },
    secreto: d.cron_secret ?? '',
  };
  if (!cfg.vapid.publicKey || !cfg.vapid.privateKey || !cfg.vapid.subject || !cfg.secreto) {
    throw new Error('Faltan secretos rheud_* en Vault');
  }
  cacheCfg = { cfg, hasta: Date.now() + 5 * 60_000 };
  return cfg;
}

/* ---------------- datos ---------------- */

type Prefs = {
  recordatorio: boolean; recordatorio_min: number; cambios: boolean;
  resumen: boolean; resumen_hora: string; confirmar: boolean; confirmar_hora: string;
};
type Miembro = { user_id: string; prefs: Prefs };

/* Negocios con alguien adentro (miembros). */
async function negociosActivos(): Promise<string[]> {
  const { data, error } = await admin.from('miembros').select('negocio_id').not('user_id', 'is', null);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { negocio_id: string }) => r.negocio_id).filter(Boolean))];
}

/* Miembros del negocio con sus ajustes de avisos (o los de fábrica). */
async function miembrosDe(negocio: string): Promise<Miembro[]> {
  const [m, p] = await Promise.all([
    admin.from('miembros').select('user_id').eq('negocio_id', negocio),
    admin.from('notif_prefs').select('*').eq('negocio_id', negocio),
  ]);
  if (m.error) throw m.error;
  if (p.error) throw p.error;
  const prefs = new Map((p.data ?? []).map((r: Record<string, unknown>) => [r.user_id as string, r]));
  const ids = [...new Set((m.data ?? []).map((r: { user_id: string | null }) => r.user_id).filter((x): x is string => !!x))];
  return ids.map((id) => ({ user_id: id, prefs: L.prefsCon(prefs.get(id)) as Prefs }));
}

async function nombresDe(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const { data, error } = await admin.from('clientas').select('id, nombre').in('id', unicos);
  if (error) throw error;
  return new Map((data ?? []).map((r: { id: string; nombre: string }) => [r.id, r.nombre]));
}

/* ---------------- envío ---------------- */

async function enviarATodas(subs: Sub[], msg: Mensaje, vapid: Vapid, op: Opciones): Promise<Resultado> {
  const contenido = JSON.stringify({ ...msg, ts: Date.now() });
  const res = await Promise.all(subs.map(async (s) => {
    if (!L.endpointPermitido(s.endpoint)) {
      return { s, r: { ok: false, status: 0, vencida: false, error: 'servicio push no reconocido' } };
    }
    try {
      return { s, r: await enviarPush(s, contenido, vapid, op) };
    } catch (e) {
      return { s, r: { ok: false, status: 0, vencida: false, error: String((e as Error)?.message ?? e) } };
    }
  }));
  const out: Resultado = { enviadas: 0, borradas: 0, fallidas: 0 };
  for (const { s, r } of res) {
    if (r.ok) {
      out.enviadas++;
      await admin.from('push_subs').update({ last_ok_at: new Date().toISOString(), fallos: 0 }).eq('id', s.id);
    } else if (r.vencida || (s.fallos ?? 0) + 1 >= MAX_FALLOS) {
      out.borradas++;
      await admin.from('push_subs').delete().eq('id', s.id);
    } else {
      out.fallidas++;
      console.warn('push falló', r.status, r.error, new URL(s.endpoint).host);
      await admin.from('push_subs').update({ fallos: (s.fallos ?? 0) + 1 }).eq('id', s.id);
    }
  }
  return out;
}

/* Guarda el aviso en la bandeja de cada destinataria (una sola vez por
   persona, tipo y ref) y lo manda por push a sus dispositivos. Quien ya lo
   tenía no lo vuelve a recibir, así que las corridas repetidas no duplican. */
async function notificar(
  negocio: string, usuarias: string[], tipo: string, ref: string, msg: Mensaje,
  extra: { cita_id?: string; evento_id?: string }, vapid: Vapid, op: Opciones,
): Promise<{ nuevas: number; enviadas: number }> {
  if (!usuarias.length) return { nuevas: 0, enviadas: 0 };
  const filas = usuarias.map((u) => ({
    negocio_id: negocio, user_id: u, tipo, ref,
    titulo: msg.title.slice(0, 200), cuerpo: (msg.body ?? '').slice(0, 1000), url: msg.url ?? L.URL_APP, ...extra,
  }));
  const { data, error } = await admin.from('notificaciones')
    .upsert(filas, { onConflict: 'user_id,tipo,ref', ignoreDuplicates: true })
    .select('id, user_id');
  if (error) throw error;
  const nuevas = (data ?? []) as { id: string; user_id: string }[];
  if (!nuevas.length) return { nuevas: 0, enviadas: 0 };
  const { data: subs, error: e2 } = await admin.from('push_subs').select(SUB_COLS)
    .eq('negocio_id', negocio).in('user_id', nuevas.map((n) => n.user_id));
  if (e2) throw e2;
  let enviadas = 0;
  for (const n of nuevas) {
    const suyas = ((subs ?? []) as Sub[]).filter((s) => s.user_id === n.user_id);
    if (!suyas.length) continue;
    // al tocar la notificación, la app marca este aviso como leído
    const r = await enviarATodas(suyas, { ...msg, url: L.urlConAviso(msg.url ?? L.URL_APP, n.id) }, vapid, op);
    enviadas += r.enviadas;
  }
  return { nuevas: nuevas.length, enviadas };
}

/* ---------------- tareas programadas ---------------- */

/* Cada 5 min. Cada persona recibe el recordatorio con su anticipación
   (recordatorio_min); la ventana de 10 min cubre una corrida que se atrase. */
async function recordatorios(vapid: Vapid) {
  const ahora = L.ahoraLocal(new Date());
  const fechas = [ahora.fecha, L.fechaMas(ahora.fecha, 1)];
  const out = { citas: 0, eventos: 0, nuevas: 0, enviadas: 0 };
  const op: Opciones = { ttl: 30 * 60, urgencia: 'high' };
  for (const negocio of await negociosActivos()) {
    const miembros = await miembrosDe(negocio);
    if (!miembros.length) continue;
    const [ci, ev] = await Promise.all([
      admin.from('citas').select('id, clienta_id, items, fecha, hora, estado')
        .eq('negocio_id', negocio).eq('estado', 'agendada').in('fecha', fechas).is('deleted_at', null),
      admin.from('eventos').select('id, creado_por, titulo, fecha, hora')
        .eq('negocio_id', negocio).eq('recordar', true).neq('hora', '').in('fecha', fechas).is('deleted_at', null),
    ]);
    if (ci.error) throw ci.error;
    if (ev.error) throw ev.error;

    // citas: agrupa por cita a quienes les toca avisar en esta corrida
    const porCita = new Map<string, { c: Cita; usuarias: string[] }>();
    for (const m of miembros) {
      if (!m.prefs.recordatorio) continue;
      const [desde, hasta] = L.ventanaRecordatorio(m.prefs.recordatorio_min);
      for (const c of L.citasEnVentana(ci.data ?? [], ahora, desde, hasta) as Cita[]) {
        const g = porCita.get(c.id) ?? { c, usuarias: [] };
        g.usuarias.push(m.user_id);
        porCita.set(c.id, g);
      }
    }
    const nombres = porCita.size ? await nombresDe([...porCita.values()].map((g) => g.c.clienta_id)) : new Map();
    for (const { c, usuarias } of porCita.values()) {
      const r = await notificar(negocio, usuarias, 'recordatorio', L.refRecordatorio(c),
        L.msgRecordatorio(c, nombres.get(c.clienta_id ?? '')), { cita_id: c.id }, vapid, op);
      out.citas++; out.nuevas += r.nuevas; out.enviadas += r.enviadas;
    }

    // eventos personales: solo a quien lo creó, con su anticipación
    const evs = (ev.data ?? []).map((e: Record<string, unknown>) => ({ ...e, estado: 'agendada' }));
    for (const m of miembros) {
      const mios = evs.filter((e: Record<string, unknown>) => e.creado_por === m.user_id);
      if (!mios.length) continue;
      const [desde, hasta] = L.ventanaRecordatorio(m.prefs.recordatorio_min);
      for (const e of L.citasEnVentana(mios, ahora, desde, hasta) as Array<{ id: string; titulo: string; fecha: string; hora: string; faltan: number }>) {
        const r = await notificar(negocio, [m.user_id], 'evento', L.refRecordatorioEvento(e),
          L.msgRecordatorioEvento(e), { evento_id: e.id }, vapid, op);
        out.eventos++; out.nuevas += r.nuevas; out.enviadas += r.enviadas;
      }
    }
  }
  return out;
}

/* Cada 15 min: a quien ya le llegó su hora del resumen (y no lo ha recibido hoy). */
async function resumen(vapid: Vapid) {
  const ahora = L.ahoraLocal(new Date());
  const out = { negocios: 0, nuevas: 0, enviadas: 0 };
  for (const negocio of await negociosActivos()) {
    const miembros = await miembrosDe(negocio);
    const usuarias = miembros.filter((m) => m.prefs.resumen && L.horaLlego(m.prefs.resumen_hora, ahora.min)).map((m) => m.user_id);
    if (!usuarias.length) continue;
    const { data, error } = await admin.from('citas')
      .select('id, fecha, hora, estado, precio, descuento_monto')
      .eq('negocio_id', negocio).eq('fecha', ahora.fecha).neq('estado', 'cancelada').is('deleted_at', null);
    if (error) throw error;
    const r = await notificar(negocio, usuarias, 'resumen', ahora.fecha, L.msgResumen(data ?? []), {}, vapid,
      { ttl: 4 * 3600, topic: 'resumen' });
    out.negocios++; out.nuevas += r.nuevas; out.enviadas += r.enviadas;
  }
  return out;
}

/* Cada 15 min: a quien ya le llegó su hora, si quedan citas de mañana sin confirmar. */
async function confirmar(vapid: Vapid) {
  const ahora = L.ahoraLocal(new Date());
  const manana = L.fechaMas(ahora.fecha, 1) as string;
  const out = { negocios: 0, nuevas: 0, enviadas: 0 };
  for (const negocio of await negociosActivos()) {
    const miembros = await miembrosDe(negocio);
    const usuarias = miembros.filter((m) => m.prefs.confirmar && L.horaLlego(m.prefs.confirmar_hora, ahora.min)).map((m) => m.user_id);
    if (!usuarias.length) continue;
    const { data, error } = await admin.from('citas')
      .select('id, clienta_id, fecha, hora, estado, confirmada_at')
      .eq('negocio_id', negocio).eq('fecha', manana).eq('estado', 'agendada').is('confirmada_at', null)
      .is('deleted_at', null);
    if (error) throw error;
    const citas = (data ?? []) as Cita[];
    if (!citas.length) continue;
    const msg = L.msgConfirmar(citas, await nombresDe(citas.map((c) => c.clienta_id)));
    if (!msg) continue;
    const r = await notificar(negocio, usuarias, 'confirmar', manana, msg, {}, vapid, { ttl: 6 * 3600, topic: 'confirmar' });
    out.negocios++; out.nuevas += r.nuevas; out.enviadas += r.enviadas;
  }
  return out;
}

/* Trigger de citas: avisa a las OTRAS personas del estudio. */
async function cambio(body: Record<string, unknown>, vapid: Vapid) {
  if (!L.esUuid(body.cita_id)) return { omitido: 'cita_id inválido' };
  const { data: cita, error } = await admin.from('citas')
    .select('id, negocio_id, clienta_id, items, fecha, hora, estado')
    .eq('id', body.cita_id as string).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!cita) return { omitido: 'la cita ya no existe' };
  const hoy = L.ahoraLocal(new Date()).fecha;
  const antes = (body.antes && typeof body.antes === 'object') ? body.antes as { fecha: string; hora: string; estado: string } : null;
  const tipo = L.tipoCambio(body.op, antes, cita, hoy);
  if (!tipo) return { omitido: 'sin cambio que avisar' };
  const autor = L.esUuid(body.autor) ? body.autor as string : null;
  const usuarias = (await miembrosDe(cita.negocio_id)).filter((m) => m.prefs.cambios && m.user_id !== autor).map((m) => m.user_id);
  if (!usuarias.length) return { nuevas: 0 };
  const nombre = (await nombresDe([cita.clienta_id])).get(cita.clienta_id ?? '');
  const msg = L.msgCambio(tipo, cita, antes ?? cita, nombre, hoy);
  if (!msg) return { omitido: 'sin mensaje' };
  return await notificar(cita.negocio_id, usuarias, 'cambios', `${cita.id}:${tipo}:${Date.now()}`, msg,
    { cita_id: cita.id }, vapid, { ttl: 6 * 3600 });
}

/* ---------------- llamadas desde la app / el service worker ---------------- */

async function probar(req: Request, body: Record<string, unknown>, vapid: Vapid): Promise<[number, unknown]> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return [401, { error: 'Falta la sesión' }];
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return [401, { error: 'Sesión inválida' }];
  let q = admin.from('push_subs').select(SUB_COLS).eq('user_id', data.user.id);
  if (typeof body.endpoint === 'string' && body.endpoint) q = q.eq('endpoint', body.endpoint);
  const { data: subs, error: e2 } = await q;
  if (e2) throw e2;
  if (!subs?.length) return [404, { error: 'Este dispositivo no está registrado', enviadas: 0 }];
  const s0 = (subs as Sub[])[0];
  const msg = L.msgPrueba();
  // también queda en la bandeja, para ver que la campana funciona
  const { data: fila } = await admin.from('notificaciones')
    .insert({ negocio_id: s0.negocio_id, user_id: data.user.id, tipo: 'prueba', ref: String(Date.now()), titulo: msg.title, cuerpo: msg.body, url: msg.url })
    .select('id').maybeSingle();
  const url = fila ? L.urlConAviso(msg.url, fila.id) : msg.url;
  return [200, await enviarATodas(subs as Sub[], { ...msg, url }, vapid, { ttl: 300, urgencia: 'high' })];
}

async function renovar(body: Record<string, unknown>): Promise<[number, unknown]> {
  const anterior = body.anterior;
  const nueva = body.nueva as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const ep = nueva?.endpoint, p256dh = nueva?.keys?.p256dh, auth = nueva?.keys?.auth;
  if (typeof anterior !== 'string' || typeof ep !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string' ||
      !L.endpointPermitido(ep) || p256dh.length > 200 || auth.length > 64) {
    return [400, { error: 'Datos inválidos' }];
  }
  const { data: fila, error } = await admin.from('push_subs').select('id').eq('endpoint', anterior).maybeSingle();
  if (error) throw error;
  if (!fila) return [404, { error: 'Suscripción desconocida' }];
  const { error: e2 } = await admin.from('push_subs')
    .update({ endpoint: ep, p256dh, auth, fallos: 0 }).eq('id', fila.id);
  if (e2) {
    if (e2.code !== '23505') throw e2;
    // La nueva ya estaba registrada: basta con quitar la vieja.
    await admin.from('push_subs').delete().eq('id', fila.id);
  }
  return [200, { ok: true }];
}

/* ---------------- servidor ---------------- */

Deno.serve(async (req: Request) => {
  const cors = L.cabecerasCors(req.headers.get('origin'));
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  let body: Record<string, unknown>;
  try {
    const b = await req.json();
    body = b && typeof b === 'object' ? b : {};
  } catch {
    return responder({ error: 'JSON inválido' }, 400);
  }
  const tarea = String(body.tarea ?? '');

  let cfg: Config;
  try {
    cfg = await config();
  } catch (e) {
    console.error(e);
    return responder({ error: 'Configuración incompleta' }, 500);
  }

  try {
    if (tarea === 'probar') { const [s, r] = await probar(req, body, cfg.vapid); return responder(r, s); }
    if (tarea === 'renovar') { const [s, r] = await renovar(body); return responder(r, s); }

    const secreto = req.headers.get('x-rheud-secret') ?? '';
    if (!(await L.igualesTiempoConstante(secreto, cfg.secreto))) return responder({ error: 'No autorizado' }, 401);

    switch (tarea) {
      case 'recordatorios': return responder(await recordatorios(cfg.vapid));
      case 'resumen': return responder(await resumen(cfg.vapid));
      case 'confirmar': return responder(await confirmar(cfg.vapid));
      case 'cambio': return responder(await cambio(body, cfg.vapid));
      default: return responder({ error: 'Tarea desconocida' }, 400);
    }
  } catch (e) {
    console.error('rheud-push', tarea, e);
    return responder({ error: 'Error interno' }, 500);
  }
});
