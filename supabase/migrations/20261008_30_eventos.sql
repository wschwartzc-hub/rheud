-- ============================================================================
-- Rhēud · Eventos personales en la agenda                        2026-10-08 · v7.2
-- Dentista, comida, recoger a alguien, un día libre… Se ven en la agenda,
-- pueden apartar el horario (para que no se agenden citas encima) y pueden
-- avisar 30 min antes con una notificación, pero NO son citas: no cuentan en
-- el total de citas, cobros, finanzas, estadísticas, portal ni recordatorios a
-- clientas. Van en su propia tabla para que nada de eso los toque.
--   · hora '' = todo el día
--   · bloquea: aparta la mesa y la cabina en ese horario
--   · recordar: notificación 30 min antes a quien lo creó
-- Requiere 20261008_01 (mis_negocios), 20261008_12 (bitácora) y
-- 20261008_20 (push). Aditiva; se puede volver a correr.
-- ============================================================================

-- 30a) Tabla -------------------------------------------------------------------
create table if not exists public.eventos (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   uuid not null references public.negocios(id) on delete cascade,
  creado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  titulo       text not null check (length(btrim(titulo)) between 1 and 120),
  fecha        date not null,
  hora         text not null default '' check (hora = '' or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duracion_min int  not null default 60 check (duracion_min between 5 and 1440),
  bloquea      boolean not null default true,
  recordar     boolean not null default true,
  notas        text not null default '' check (length(notas) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists eventos_negocio_fecha_idx on public.eventos (negocio_id, fecha) where deleted_at is null;
create index if not exists eventos_creado_por_idx on public.eventos (creado_por);

alter table public.eventos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'eventos' and policyname = 'rw eventos') then
    create policy "rw eventos" on public.eventos for all to authenticated
      using (negocio_id in (select public.mis_negocios()))
      with check (negocio_id in (select public.mis_negocios()));
  end if;
end $$;
-- "Eliminar" marca deleted_at (como en citas y gastos): la app no necesita DELETE.
revoke all on public.eventos from anon, authenticated;
grant select, insert, update on public.eventos to authenticated;
grant all on public.eventos to service_role;

create or replace trigger trg_eventos_touch before update on public.eventos
  for each row execute function public.touch_updated_at();
create or replace trigger trg_bitacora after insert or update on public.eventos
  for each row execute function public._bitacora();

-- Tiempo real: los cambios llegan al instante a los otros dispositivos
do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos') then
    alter publication supabase_realtime add table public.eventos;
  end if;
end $$;

-- 30b) Recordatorio push de eventos -------------------------------------------
-- Igual que en 20261008_20, más: también llama a la función si hay un evento
-- con recordatorio que empieza en 24–36 min y quien lo creó tiene el aviso
-- activado en algún dispositivo.
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
         and exists (select 1 from public.push_subs s where s.negocio_id = c.negocio_id)
         and (case when c.hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then c.fecha + c.hora::time end)
             between v_ahora + interval '24 minutes' and v_ahora + interval '36 minutes'
    ) and not exists (
      select 1
        from public.eventos e
       where e.recordar
         and e.deleted_at is null
         and e.hora <> ''
         and e.fecha between v_ahora::date and v_ahora::date + 1
         and exists (select 1 from public.push_subs s
                      where s.negocio_id = e.negocio_id and s.user_id = e.creado_por)
         and (e.fecha + e.hora::time)
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
