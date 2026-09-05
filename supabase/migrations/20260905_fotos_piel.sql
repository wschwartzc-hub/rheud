-- ============================================================================
-- Rhēud · Fotos de seguimiento del expediente de piel            2026-09-05 · v6.2
-- Aditiva. Bucket privado "expedientes" + tabla fotos_piel con RLS por negocio.
-- ============================================================================

create table if not exists public.fotos_piel (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid references public.negocios(id),
  clienta_id  uuid not null references public.clientas(id) on delete cascade,
  tipo        text not null default 'seguimiento' check (tipo in ('antes','despues','seguimiento')),
  fecha       date not null default current_date,
  path        text not null,            -- ruta dentro del bucket "expedientes": <negocio_id>/<clienta_id>/<archivo>.jpg
  nota        text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.fotos_piel enable row level security;
drop policy if exists "rw fotos_piel" on public.fotos_piel;
create policy "rw fotos_piel" on public.fotos_piel
  for all
  using      (negocio_id in (select mis_negocios()))
  with check (negocio_id in (select mis_negocios()));
create index if not exists fotos_piel_clienta_idx on public.fotos_piel (clienta_id, fecha desc);

-- Bucket privado (las fotos se sirven con URL firmada, como los comprobantes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes','expedientes', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Solo usuarias autenticadas del negocio, y solo dentro de la carpeta de su negocio
drop policy if exists "expedientes leer"   on storage.objects;
drop policy if exists "expedientes subir"  on storage.objects;
drop policy if exists "expedientes borrar" on storage.objects;
create policy "expedientes leer" on storage.objects for select to authenticated
  using (bucket_id = 'expedientes' and (storage.foldername(name))[1] in (select mis_negocios()::text));
create policy "expedientes subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'expedientes' and (storage.foldername(name))[1] in (select mis_negocios()::text));
create policy "expedientes borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'expedientes' and (storage.foldername(name))[1] in (select mis_negocios()::text));

do $$
begin
  alter publication supabase_realtime add table public.fotos_piel;
exception when others then null;
end $$;
