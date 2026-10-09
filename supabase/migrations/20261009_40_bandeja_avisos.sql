-- ============================================================================
-- Rhēud · Bandeja de avisos y horarios a elección                2026-10-09 · v7.3
-- · notificaciones: la bandeja de cada persona (la campana de la app). La
--   función rheud-push guarda ahí cada aviso, una vez por (persona, tipo, ref),
--   y además lo manda por push a sus dispositivos. Cada quien solo ve y marca
--   como leídos los suyos.
-- · notif_prefs: qué avisos quiere cada persona y cuándo: minutos antes del
--   recordatorio, hora del resumen del día y hora de "confirmar mañana".
-- · El resumen y el aviso de confirmar se revisan cada 15 min (cada quien a su
--   hora); el recordatorio, cada 5 min con la anticipación de cada quien.
-- · Ahora se avisa aunque la persona no tenga notificaciones push activadas:
--   el aviso queda en su bandeja.
-- Requiere 20261008_20 (push) y 20261008_30 (eventos). Aditiva; se puede volver
-- a correr.
-- ============================================================================

-- 40a) Preferencias por persona ----------------------------------------------
create table if not exists public.notif_prefs (
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  negocio_id       uuid not null references public.negocios(id) on delete cascade,
  recordatorio     boolean not null default true,
  recordatorio_min int     not null default 30 check (recordatorio_min between 5 and 240),
  cambios          boolean not null default true,
  resumen          boolean not null default true,
  resumen_hora     text    not null default '08:00' check (resumen_hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  confirmar        boolean not null default true,
  confirmar_hora   text    not null default '18:00' check (confirmar_hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at       timestamptz not null default now(),
  primary key (user_id, negocio_id)
);
create index if not exists notif_prefs_negocio_idx on public.notif_prefs (negocio_id);

alter table public.notif_prefs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'notif_prefs' and policyname = 'mis ajustes de avisos') then
    create policy "mis ajustes de avisos" on public.notif_prefs for all to authenticated
      using      (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()))
      with check (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()));
  end if;
end $$;
revoke all on public.notif_prefs from anon, authenticated;
grant select, insert, update on public.notif_prefs to authenticated;
grant all on public.notif_prefs to service_role;

create or replace trigger trg_notif_prefs_touch before update on public.notif_prefs
  for each row execute function public.touch_updated_at();

-- 40b) Bandeja ---------------------------------------------------------------
create table if not exists public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('recordatorio', 'evento', 'cambios', 'resumen', 'confirmar', 'prueba')),
  ref         text not null,
  titulo      text not null check (length(titulo) <= 200),
  cuerpo      text not null default '' check (length(cuerpo) <= 1000),
  url         text not null default '/?app' check (url like '/%' and length(url) <= 300),
  cita_id     uuid,
  evento_id   uuid,
  created_at  timestamptz not null default now(),
  leida_at    timestamptz,
  unique (user_id, tipo, ref)
);
create index if not exists notificaciones_user_fecha_idx on public.notificaciones (user_id, created_at desc);
create index if not exists notificaciones_negocio_idx on public.notificaciones (negocio_id);

alter table public.notificaciones enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'notificaciones' and policyname = 'ver mis avisos') then
    create policy "ver mis avisos" on public.notificaciones for select to authenticated
      using (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()));
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'notificaciones' and policyname = 'marcar mis avisos') then
    create policy "marcar mis avisos" on public.notificaciones for update to authenticated
      using      (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()))
      with check (user_id = (select auth.uid()) and negocio_id in (select public.mis_negocios()));
  end if;
end $$;
-- La app solo lee y marca como leído; escribe únicamente la función (service_role).
revoke all on public.notificaciones from anon, authenticated;
grant select on public.notificaciones to authenticated;
grant update (leida_at) on public.notificaciones to authenticated;
grant all on public.notificaciones to service_role;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones') then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;

-- 40c) Trigger de citas: avisa si hay alguien más en el estudio --------------
-- (antes solo si había dispositivos con push; ahora el aviso va a la bandeja)
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

  if v_avisar and new.deleted_at is null and exists (
       select 1 from public.miembros m
        where m.negocio_id = new.negocio_id and m.user_id is distinct from (select auth.uid())) then
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

-- 40d) Disparador de pg_cron --------------------------------------------------
-- recordatorios: solo si hay alguna cita agendada o evento con aviso en las
-- próximas 4 h 5 min (la anticipación máxima es 4 h). resumen y confirmar:
-- siempre; la función decide a quién le toca según su hora.
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
    if not exists (
      select 1
        from public.citas c
       where c.estado = 'agendada'
         and c.deleted_at is null
         and c.fecha between v_ahora::date and v_ahora::date + 1
         and (case when c.hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then c.fecha + c.hora::time end)
             between v_ahora and v_ahora + interval '245 minutes'
    ) and not exists (
      select 1
        from public.eventos e
       where e.recordar
         and e.deleted_at is null
         and e.hora <> ''
         and e.fecha between v_ahora::date and v_ahora::date + 1
         and (e.fecha + e.hora::time) between v_ahora and v_ahora + interval '245 minutes'
    ) then
      return;
    end if;
  end if;
  perform public.rheud_push_llamar(jsonb_build_object('tarea', p_tarea));
end
$$;
revoke all on function public.rheud_push_tick(text) from public, anon, authenticated;

-- 40e) Trabajos: resumen y confirmar cada 15 min; limpieza también de la bandeja
do $$ begin perform cron.unschedule('rheud_push_resumen');   exception when others then null; end $$;
do $$ begin perform cron.unschedule('rheud_push_confirmar'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('rheud_push_limpieza');  exception when others then null; end $$;
select cron.schedule('rheud_push_resumen', '*/15 * * * *',
  $cmd$ select public.rheud_push_tick('resumen') $cmd$);
select cron.schedule('rheud_push_confirmar', '7,22,37,52 * * * *',
  $cmd$ select public.rheud_push_tick('confirmar') $cmd$);
select cron.schedule('rheud_push_limpieza', '17 9 * * *',
  $cmd$ delete from public.push_log where enviado_at < now() - interval '45 days';
        delete from public.notificaciones where created_at < now() - interval '90 days' $cmd$);
