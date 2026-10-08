// Rhēud · avisos push del estudio (Supabase Edge Function "rheud-push").
//
// Se despliega con verify_jwt = false y se autentica sola:
//  · pg_cron y el trigger de citas mandan la cabecera x-rheud-secret, que se
//    compara (en tiempo constante) con el secreto rheud_push_cron_secret de Vault.
//  · La app llama a {tarea:'probar'} con el JWT de la usuaria en Authorization.
//  · El service worker llama a {tarea:'renovar'} cuando el navegador cambia la
//    suscripción; la prueba de propiedad es conocer el endpoint anterior.
//
// Tareas: recordatorios (cada 5 min), resumen (7:55), confirmar (17:55),
// cambio (trigger de citas), probar, renovar.
//
// Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) está implementado con
// WebCrypto en webpush.mjs: sin dependencias de Node y probado con el vector
// del RFC 8291 en tests/push.test.js.

import { createClient } from '@supabase/supabase-js';
import { enviarPush } from './webpush.mjs';
import * as L from './logica.mjs';

type Prefs = Record<string, boolean>;
type Sub = {
  id: string; negocio_id: string; user_id: string; endpoint: string;
  p256dh: string; auth: string; prefs: Prefs | null; fallos: number | null;
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

const SUB_COLS = 'id, negocio_id, user_id, endpoint, p256dh, auth, prefs, fallos';
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

async function negociosConSubs(): Promise<string[]> {
  const { data, error } = await admin.from('push_subs').select('negocio_id');
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { negocio_id: string }) => r.negocio_id))];
}

/* Suscripciones de un negocio que quieren `tipo`, solo de usuarias que siguen
   siendo miembros (si quitan a alguien del estudio deja de recibir avisos). */
async function subsDe(negocio: string, tipo: string, excepto: string | null = null): Promise<Sub[]> {
  const [s, m] = await Promise.all([
    admin.from('push_subs').select(SUB_COLS).eq('negocio_id', negocio),
    admin.from('miembros').select('user_id').eq('negocio_id', negocio),
  ]);
  if (s.error) throw s.error;
  if (m.error) throw m.error;
  const miembros = new Set((m.data ?? []).map((r: { user_id: string }) => r.user_id));
  return ((s.data ?? []) as Sub[]).filter((x) =>
    miembros.has(x.user_id) && x.user_id !== excepto && L.quiere(x, tipo));
}

async function nombresDe(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const { data, error } = await admin.from('clientas').select('id, nombre').in('id', unicos);
  if (error) throw error;
  return new Map((data ?? []).map((r: { id: string; nombre: string }) => [r.id, r.nombre]));
}

/* Registra (tipo, ref) en push_log; false si ya se había enviado. */
async function reclamar(negocio: string, tipo: string, ref: string): Promise<boolean> {
  const { data, error } = await admin.from('push_log')
    .upsert({ negocio_id: negocio, tipo, ref }, { onConflict: 'tipo,ref', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function soltar(tipo: string, ref: string) {
  await admin.from('push_log').delete().eq('tipo', tipo).eq('ref', ref);
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

/* ---------------- tareas programadas ---------------- */

async function recordatorios(vapid: Vapid) {
  const ahora = L.ahoraLocal(new Date());
  const fechas = [ahora.fecha, L.fechaMas(ahora.fecha, 1)];
  const out = { citas: 0, enviadas: 0 };
  for (const negocio of await negociosConSubs()) {
    const subs = await subsDe(negocio, 'recordatorio');
    if (!subs.length) continue;
    const { data, error } = await admin.from('citas')
      .select('id, clienta_id, items, fecha, hora, estado')
      .eq('negocio_id', negocio).eq('estado', 'agendada').in('fecha', fechas).is('deleted_at', null);
    if (error) throw error;
    const proximas = L.citasEnVentana(data ?? [], ahora, 25, 35) as Cita[];
    if (!proximas.length) continue;
    const nombres = await nombresDe(proximas.map((c) => c.clienta_id));
    for (const c of proximas) {
      const ref = L.refRecordatorio(c);
      if (!(await reclamar(negocio, 'recordatorio', ref))) continue;
      const r = await enviarATodas(subs, L.msgRecordatorio(c, nombres.get(c.clienta_id ?? '')), vapid,
        { ttl: 30 * 60, urgencia: 'high' });
      // Si no llegó a ningún dispositivo por un error temporal, la siguiente
      // corrida (5 min después, aún dentro de la ventana) lo reintenta.
      if (!r.enviadas && r.fallidas) await soltar('recordatorio', ref);
      out.citas++;
      out.enviadas += r.enviadas;
    }
  }
  return out;
}

async function resumen(vapid: Vapid) {
  const hoy = L.ahoraLocal(new Date()).fecha;
  const out = { negocios: 0, enviadas: 0 };
  for (const negocio of await negociosConSubs()) {
    const subs = await subsDe(negocio, 'resumen');
    if (!subs.length) continue;
    const ref = `${negocio}:${hoy}`;
    if (!(await reclamar(negocio, 'resumen', ref))) continue;
    const { data, error } = await admin.from('citas')
      .select('id, fecha, hora, estado, precio, descuento_monto')
      .eq('negocio_id', negocio).eq('fecha', hoy).neq('estado', 'cancelada').is('deleted_at', null);
    if (error) { await soltar('resumen', ref); throw error; }
    const r = await enviarATodas(subs, L.msgResumen(data ?? []), vapid, { ttl: 4 * 3600, topic: 'resumen' });
    if (!r.enviadas && r.fallidas) await soltar('resumen', ref);
    out.negocios++;
    out.enviadas += r.enviadas;
  }
  return out;
}

async function confirmar(vapid: Vapid) {
  const manana = L.fechaMas(L.ahoraLocal(new Date()).fecha, 1) as string;
  const out = { negocios: 0, enviadas: 0 };
  for (const negocio of await negociosConSubs()) {
    const subs = await subsDe(negocio, 'confirmar');
    if (!subs.length) continue;
    const { data, error } = await admin.from('citas')
      .select('id, clienta_id, fecha, hora, estado, confirmada_at')
      .eq('negocio_id', negocio).eq('fecha', manana).eq('estado', 'agendada').is('confirmada_at', null)
      .is('deleted_at', null);
    if (error) throw error;
    const citas = (data ?? []) as Cita[];
    if (!citas.length) continue;
    const ref = `${negocio}:${manana}`;
    if (!(await reclamar(negocio, 'confirmar', ref))) continue;
    const msg = L.msgConfirmar(citas, await nombresDe(citas.map((c) => c.clienta_id)));
    if (!msg) continue;
    const r = await enviarATodas(subs, msg, vapid, { ttl: 6 * 3600, topic: 'confirmar' });
    if (!r.enviadas && r.fallidas) await soltar('confirmar', ref);
    out.negocios++;
    out.enviadas += r.enviadas;
  }
  return out;
}

/* Trigger de citas: avisa a las OTRAS usuarias del negocio. */
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
  const subs = await subsDe(cita.negocio_id, 'cambios', autor);
  if (!subs.length) return { enviadas: 0 };
  const nombre = (await nombresDe([cita.clienta_id])).get(cita.clienta_id ?? '');
  const msg = L.msgCambio(tipo, cita, antes ?? cita, nombre, hoy);
  if (!msg) return { omitido: 'sin mensaje' };
  return await enviarATodas(subs, msg, vapid, { ttl: 6 * 3600 });
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
  return [200, await enviarATodas(subs as Sub[], L.msgPrueba(), vapid, { ttl: 300, urgencia: 'high' })];
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
