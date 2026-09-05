-- ============================================================================
-- Rhēud · Multiservicio (Nails Studio + Skin Care)          2026-09-05 · v6.1
-- Migración ADITIVA: no borra ni renombra nada; la app v6.0 sigue funcionando.
-- Ejecutar en el SQL Editor de Supabase (proyecto "rheud") o vía CLI.
-- ============================================================================

-- 1) Catálogo: rama de negocio, duración y recurso por servicio --------------
alter table public.servicios
  add column if not exists categoria    text    not null default 'nails',   -- nails | skin | otro
  add column if not exists subfamilia   text    not null default '',        -- Limpiezas, Hidrafacial, Peelings, Soft Gel…
  add column if not exists duracion_min integer not null default 60,        -- lo que dura el servicio
  add column if not exists limpieza_min integer not null default 0,         -- tiempo que el recurso queda bloqueado después
  add column if not exists recurso      text    not null default 'mesa',    -- mesa | cabina | ninguno
  add column if not exists insumos      jsonb   not null default '[]'::jsonb, -- ["Máquina Hidrafacial","Suero HA"]
  add column if not exists requisitos   text    not null default '';        -- "Ficha de piel vigente · sin retinoides 7 días"

alter table public.servicios drop constraint if exists servicios_categoria_chk;
alter table public.servicios add constraint servicios_categoria_chk
  check (categoria in ('nails','skin','otro'));
alter table public.servicios drop constraint if exists servicios_recurso_chk;
alter table public.servicios add constraint servicios_recurso_chk
  check (recurso in ('mesa','cabina','ninguno'));
alter table public.servicios drop constraint if exists servicios_duracion_chk;
alter table public.servicios add constraint servicios_duracion_chk
  check (duracion_min between 0 and 720 and limpieza_min between 0 and 240);

create index if not exists servicios_negocio_categoria_idx
  on public.servicios (negocio_id, categoria);

-- Nota: citas.items (jsonb) ahora lleva por servicio {id, n, p, d, r, l, cat}:
-- d = duración en min, r = recurso, l = limpieza en min, cat = rama.
-- Las citas anteriores no traen esos campos y la app las trata como "mesa".

-- 2) Expediente de piel (tabla propia: NO expuesta al portal público) --------
create table if not exists public.expedientes_piel (
  id                 uuid primary key default gen_random_uuid(),
  negocio_id         uuid references public.negocios(id),
  clienta_id         uuid not null unique references public.clientas(id) on delete cascade,
  tipo               text not null default '',   -- Normal | Seca | Mixta | Grasa | Sensible
  fototipo           text not null default '',   -- I … VI (Fitzpatrick)
  sensibilidad       text not null default '',   -- Baja | Media | Alta
  alergias           text not null default '',
  contraindicaciones text not null default '',
  objetivo           text not null default '',
  rutina             text not null default '',
  evolucion          jsonb not null default '[]'::jsonb, -- [{fecha:'2026-08-28', servicio:'Hidrafacial MD', nota:'…'}]
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.expedientes_piel enable row level security;
drop policy if exists "rw expedientes_piel" on public.expedientes_piel;
create policy "rw expedientes_piel" on public.expedientes_piel
  for all
  using      (negocio_id in (select mis_negocios()))
  with check (negocio_id in (select mis_negocios()));
-- A diferencia de clientas/citas, aquí NO hay política "portal leer": los datos
-- de piel (alergias, contraindicaciones) nunca salen con la clave anónima.

create index if not exists expedientes_piel_negocio_idx on public.expedientes_piel (negocio_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists expedientes_piel_touch on public.expedientes_piel;
create trigger expedientes_piel_touch before update on public.expedientes_piel
  for each row execute function public.touch_updated_at();

-- 3) Índices que la agenda y finanzas consultan todo el tiempo ---------------
create index if not exists citas_negocio_fecha_idx on public.citas (negocio_id, fecha);
create index if not exists citas_clienta_idx       on public.citas (clienta_id);

-- 4) Realtime: que la nueva tabla también avise a los demás aparatos ---------
do $$
begin
  alter publication supabase_realtime add table public.expedientes_piel;
exception when others then
  null; -- ya estaba en la publicación o la publicación no existe
end $$;
