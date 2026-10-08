-- ============================================================================
-- Rhēud · Baja de clienta (derechos ARCO) y consentimiento      2026-10-08 · v7
-- · clientas.consentimiento_salud / consentimiento_fecha: la clienta autorizó
--   guardar datos de salud (expediente de piel) y fotos.
-- · baja_clienta(clienta): anonimiza la ficha, borra expediente y fotos (las
--   filas; los archivos del bucket los borra la app antes de llamarla) y deja
--   las citas, sin datos personales, para las finanzas.
-- Requiere 20261008_01 (public.mis_negocios). Sin DROP: se puede volver a correr.
-- ============================================================================

alter table public.clientas
  add column if not exists consentimiento_salud boolean not null default false,
  add column if not exists consentimiento_fecha date;

create or replace function public.baja_clienta(p_clienta uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_neg uuid;
begin
  select negocio_id into v_neg from public.clientas where id = p_clienta for update;
  if v_neg is null or not exists (
       select 1 from public.miembros m
        where m.user_id = (select auth.uid()) and m.negocio_id = v_neg and m.rol = 'dueña') then
    raise exception 'Solo la dueña puede eliminar los datos de esta clienta' using errcode = 'P0001';
  end if;

  update public.clientas
     set nombre = 'Clienta eliminada', telefono = '', email = '', notas = '',
         alergias = '', notas_prefs = '', colores_fav = '', forma_una = '', cumple = null,
         consentimiento_salud = false, consentimiento_fecha = null
   where id = p_clienta;
  delete from public.expedientes_piel where clienta_id = p_clienta;
  delete from public.fotos_piel where clienta_id = p_clienta;
  -- las notas de sus citas y cortesías pueden traer datos de salud o personales
  update public.citas set notas = '' where clienta_id = p_clienta and coalesce(notas, '') <> '';
  update public.cortesias set notas = '' where clienta_id = p_clienta and coalesce(notas, '') <> '';

  -- Si ya existe la bitácora (20261008_12), se quitan las copias de sus datos
  -- personales y queda solo el registro de que hubo una baja.
  if to_regclass('public.bitacora') is not null then
    execute 'delete from public.bitacora where tabla = ''clientas'' and fila = $1' using p_clienta;
    execute $q$update public.bitacora set antes = antes - 'notas', despues = despues - 'notas'
              where tabla = 'citas' and fila in (select id from public.citas where clienta_id = $1)$q$ using p_clienta;
    execute 'insert into public.bitacora (negocio_id, tabla, fila, accion) values ($1, ''clientas'', $2, ''baja'')' using v_neg, p_clienta;
  end if;
end $$;

revoke execute on function public.baja_clienta(uuid) from public, anon;
grant execute on function public.baja_clienta(uuid) to authenticated;
