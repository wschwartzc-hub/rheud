-- ============================================================================
-- Rhēud · Notificaciones push (PWA)                             2026-10-08 · v7
-- Aditiva e idempotente: se puede volver a correr. Sin cambios destructivos.
-- Requiere 20261008_01 (mis_negocios) y 20261008_12 (citas.deleted_at).
--
-- Antes de usarla, crea los secretos en Vault (los valores NO van en el repo):
--
--   select vault.create_secret('<clave pública VAPID, base64url, 87 caracteres>',
--                              'rheud_vapid_public',  'Rhēud push: VAPID pública');
--   select vault.create_secret('<clave privada VAPID (d), base64url, 43 caracteres>',
--                              'rheud_vapid_private', 'Rhēud push: VAPID privada');
--   select vault.create_secret('mailto:wschwartzc@gmail.com',
--                              'rheud_vapid_subject', 'Rhēud push: contacto VAPID');
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--                              'rheud_push_cron_secret', 'Rhēud push: secreto cron/trigger');
--
-- Para cambiar uno después: select vault.update_secret(id, 'nuevo valor')
--   (el id sale de: select id, name from vault.secrets where name like 'rheud_%').
-- Mientras falte rheud_push_cron_secret, el trigger y los trabajos no llaman a
-- la función (no fallan: simplemente no hacen nada).
-- ============================================================================

-- 20a) pg_net: llamadas HTTP asíncronas desde Postgres (trigger y pg_cron) --
create extension if not exists pg_net with schema extensions;

-- 20b) Suscripciones push: una fila por navegador/dispositivo ---------------
create table if not exists public.push_subs (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%' and length(endpoint) <= 2048),
  p256dh      text not null check (length(p256dh) between 40 and 200),
  auth        text not null check (length(auth) between 16 and 64),
  dispositivo text not null default '' check (length(dispositivo) <= 80),
  prefs       jsonb not null default '{"recordatorio":true,"cambios":true,"resumen":true,"confirmar":true}'::jsonb
              check (jsonb_typeof(prefs) = 'object'),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fallos      int not null default 0
);
create index if not exists push_subs_negocio_idx on public.push_subs (negocio_id);
create index if not exists push_subs_user_idx    on public.push_subs (user_id);

alter table public.push_subs enable row level security;

-- Cada usuaria ve, crea, edita y borra solo sus filas, y solo de sus negocios.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'push_subs' and policyname = 'push_subs propias') then
    create policy "push_subs propias" on public.push_subs
      for all to authenticated
      using      (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()))
      with check (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()));
  else
    alter policy "push_subs propias" on public.push_subs to authenticated
      using      (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()))
      with check (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()));
  end if;
end $$;

revoke all on public.push_subs from anon;
grant select, insert, update, delete on public.push_subs to authenticated;
grant all on public.push_subs to service_role;

-- 20c) Bitácora de envíos: evita repetir un recordatorio/resumen ------------
-- Solo la usa la función (service_role); sin políticas = sin acceso para la app.
create table if not exists public.push_log (
  id          bigserial primary key,
  negocio_id  uuid references public.negocios(id) on delete cascade,
  tipo        text not null,
  ref         text not null,
  enviado_at  timestamptz not null default now(),
  unique (tipo, ref)
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;
grant all on public.push_log to service_role;
grant usage, select on sequence public.push_log_id_seq to service_role;

-- 20d) Configuración para la Edge Function (solo service_role) --------------
create or replace function public.rheud_push_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'vapid_public',  (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'rheud_vapid_public'  limit 1),
    'vapid_private', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'rheud_vapid_private' limit 1),
    'vapid_subject', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'rheud_vapid_subject' limit 1),
    'cron_secret',   (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'rheud_push_cron_secret' limit 1)
  )
$$;
revoke all on function public.rheud_push_config() from public, anon, authenticated;
grant execute on function public.rheud_push_config() to service_role;

-- 20e) Llamada a la función con el secreto en la cabecera -------------------
create or replace function public.rheud_push_llamar(p_cuerpo jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto text;
begin
  select ds.decrypted_secret into v_secreto
    from vault.decrypted_secrets ds where ds.name = 'rheud_push_cron_secret' limit 1;
  if v_secreto is null or v_secreto = '' then
    return null;  -- aún sin configurar
  end if;
  return net.http_post(
    url                  := 'https://wrplznjgravcnxkzfarn.supabase.co/functions/v1/rheud-push',
    body                 := p_cuerpo,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-rheud-secret', v_secreto),
    timeout_milliseconds := 30000
  );
end
$$;
revoke all on function public.rheud_push_llamar(jsonb) from public, anon, authenticated;

-- 20f) Trigger de citas: cita nueva, movida, cancelada o reactivada ---------
-- Filtra aquí lo obvio para no despertar la función de más; la función decide
-- el texto final (supabase/functions/rheud-push/logica.mjs, tipoCambio).
create or replace function public.rheud_push_cita_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
  v_avisar boolean;
begin
  if tg_op = 'INSERT' then
    v_avisar := new.estado = 'agendada' and new.fecha >= v_hoy;
  else
    v_avisar := (new.fecha is distinct from old.fecha
                 or new.hora is distinct from old.hora
                 or new.estado is distinct from old.estado)
            and greatest(new.fecha, old.fecha) >= v_hoy
            and (new.estado = 'agendada' or (new.estado = 'cancelada' and old.estado is distinct from 'cancelada'));
  end if;

  if v_avisar and new.deleted_at is null and exists (select 1 from public.push_subs s where s.negocio_id = new.negocio_id) then
    begin
      perform public.rheud_push_llamar(jsonb_build_object(
        'tarea',   'cambio',
        'cita_id', new.id,
        'autor',   auth.uid(),
        'op',      tg_op,
        'antes',   case when tg_op = 'UPDATE'
                        then jsonb_build_object('fecha', old.fecha, 'hora', old.hora, 'estado', old.estado)
                   end));
    exception when others then
      -- Un aviso nunca debe impedir guardar la cita.
      raise warning 'rheud_push_cita_cambio: %', sqlerrm;
    end;
  end if;
  return new;
end
$$;
revoke all on function public.rheud_push_cita_cambio() from public, anon, authenticated;

create or replace trigger trg_citas_push
  after insert or update of fecha, hora, estado on public.citas
  for each row execute function public.rheud_push_cita_cambio();

-- 20g) Disparador de pg_cron: solo llama a la función si hay algo que hacer --
create or replace function public.rheud_push_tick(p_tarea text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamp := now() at time zone 'America/Monterrey';
begin
  if p_tarea = 'recordatorios' then
    -- ¿Hay alguna cita agendada que empiece en 24–36 min en un negocio con
    -- suscripciones? (La función usa 25–35; el margen cubre los segundos.)
    if not exists (
      select 1
        from public.citas c
       where c.estado = 'agendada'
         and c.deleted_at is null
         and c.fecha between v_ahora::date and v_ahora::date + 1
         and exists (select 1 from public.push_subs s where s.negocio_id = c.negocio_id)
         and (case when c.hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then c.fecha + c.hora::time end)
             between v_ahora + interval '24 minutes' and v_ahora + interval '36 minutes'
    ) then
      return;
    end if;
  elsif not exists (select 1 from public.push_subs) then
    return;
  end if;
  perform public.rheud_push_llamar(jsonb_build_object('tarea', p_tarea));
end
$$;
revoke all on function public.rheud_push_tick(text) from public, anon, authenticated;

-- 20h) Trabajos programados (pg_cron usa UTC; Monterrey = UTC−6 todo el año) -
do $$ begin perform cron.unschedule('rheud_push_recordatorios'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('rheud_push_resumen');       exception when others then null; end $$;
do $$ begin perform cron.unschedule('rheud_push_confirmar');     exception when others then null; end $$;
do $$ begin perform cron.unschedule('rheud_push_limpieza');      exception when others then null; end $$;

-- Recordatorio 30 min antes de cada cita: revisa cada 5 minutos.
select cron.schedule('rheud_push_recordatorios', '*/5 * * * *',
  $cmd$ select public.rheud_push_tick('recordatorios') $cmd$);
-- Resumen del día: 13:55 UTC = 7:55 en Monterrey.
select cron.schedule('rheud_push_resumen', '55 13 * * *',
  $cmd$ select public.rheud_push_tick('resumen') $cmd$);
-- Citas de mañana sin confirmar: 23:55 UTC = 17:55 en Monterrey.
select cron.schedule('rheud_push_confirmar', '55 23 * * *',
  $cmd$ select public.rheud_push_tick('confirmar') $cmd$);
-- La bitácora solo hace falta unos días.
select cron.schedule('rheud_push_limpieza', '17 9 * * *',
  $cmd$ delete from public.push_log where enviado_at < now() - interval '45 days' $cmd$);
