-- ============================================================================
-- Rhēud · Verificación en dos pasos para el expediente de piel   2026-10-08 · v7
-- Aditiva e idempotente. Políticas RESTRICTIVE: se suman (AND) a las de negocio.
--
-- Regla: si la usuaria tiene un factor TOTP verificado, su sesión debe ser
-- aal2 (ya escribió el código) para leer o escribir expedientes y fotos de
-- piel. Quien no ha activado la verificación en dos pasos no pierde acceso.
--
-- Nota: el rol authenticated NO tiene SELECT sobre auth.mfa_factors (revisado
-- con has_table_privilege), así que la consulta va dentro de una función
-- security definer. Puesta directo en la política, fallaría con
-- "permission denied for table mfa_factors" y bloquearía a todas.
-- ============================================================================

create or replace function public.rheud_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not exists (
           select 1 from auth.mfa_factors f
            where f.user_id = (select auth.uid())
              and f.status = 'verified')
$$;
revoke all on function public.rheud_mfa_ok() from public, anon;
grant execute on function public.rheud_mfa_ok() to authenticated;

do $$
begin
  -- Expedientes de piel
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'expedientes_piel' and policyname = 'mfa expedientes_piel') then
    create policy "mfa expedientes_piel" on public.expedientes_piel
      as restrictive for all to authenticated
      using ((select public.rheud_mfa_ok())) with check ((select public.rheud_mfa_ok()));
  else
    alter policy "mfa expedientes_piel" on public.expedientes_piel to authenticated
      using ((select public.rheud_mfa_ok())) with check ((select public.rheud_mfa_ok()));
  end if;

  -- Fotos de piel (registros)
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'fotos_piel' and policyname = 'mfa fotos_piel') then
    create policy "mfa fotos_piel" on public.fotos_piel
      as restrictive for all to authenticated
      using ((select public.rheud_mfa_ok())) with check ((select public.rheud_mfa_ok()));
  else
    alter policy "mfa fotos_piel" on public.fotos_piel to authenticated
      using ((select public.rheud_mfa_ok())) with check ((select public.rheud_mfa_ok()));
  end if;

  -- Archivos del bucket "expedientes"; para cualquier otro bucket la condición
  -- es verdadera y no cambia nada.
  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects' and policyname = 'mfa expedientes') then
    create policy "mfa expedientes" on storage.objects
      as restrictive for all to authenticated
      using      (bucket_id is distinct from 'expedientes' or (select public.rheud_mfa_ok()))
      with check (bucket_id is distinct from 'expedientes' or (select public.rheud_mfa_ok()));
  else
    alter policy "mfa expedientes" on storage.objects to authenticated
      using      (bucket_id is distinct from 'expedientes' or (select public.rheud_mfa_ok()))
      with check (bucket_id is distinct from 'expedientes' or (select public.rheud_mfa_ok()));
  end if;
end $$;
