-- ============================================================================
-- Rhēud · Seguridad, parte 1 (portal por token)                  2026-10-08 · v6.5
-- Compatible con la app y el portal anteriores: no quita nada que ellos usen.
-- La lectura anónima de citas/clientas/premios se cierra en la parte 2
-- (20261008_02), una vez publicado el portal nuevo.
-- Aplicada en producción por partes (01a…01g). Se usa ALTER POLICY en vez de
-- DROP/CREATE para conservar los nombres de las políticas.
-- ============================================================================

-- 01a) Datos del estudio que el portal puede mostrar (opcionales) -----------
alter table public.negocios
  add column if not exists direccion text not null default '',
  add column if not exists telefono  text not null default '',
  add column if not exists maps_url  text not null default '';

-- 01b) Pertenencia: security definer, search_path fijo, solo con sesión ------
create or replace function public.mis_negocios() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.negocio_id from public.miembros m where m.user_id = (select auth.uid())
$$;

-- Las políticas de negocio pasan de "public" (incluía la clave anónima) a
-- "authenticated".
alter policy "rw citas"            on public.citas            to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw clientas"         on public.clientas         to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw servicios"        on public.servicios        to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw expedientes_piel" on public.expedientes_piel to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw fotos_piel"       on public.fotos_piel       to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw premios"          on public.premios          to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw cortesias"        on public.cortesias        to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw cortesias_catalogo" on public.cortesias_catalogo to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));
alter policy "rw egresos"          on public.egresos          to authenticated using (negocio_id in (select public.mis_negocios())) with check (negocio_id in (select public.mis_negocios()));

-- 01c) Membresías solo por invitación --------------------------------------
-- Antes cualquier cuenta podía insertarse en miembros de cualquier negocio.
alter policy "crear mi membresia" on public.miembros to authenticated with check (false);
alter policy "ver mis membresias" on public.miembros to authenticated using (user_id = (select auth.uid()));
alter policy "crear negocio"      on public.negocios to authenticated with check (false);
alter policy "ver mi negocio"     on public.negocios to authenticated using (id in (select public.mis_negocios()));
-- No existía política de UPDATE: las plantillas de promoción no se guardaban.
create policy "editar mi negocio" on public.negocios for update to authenticated
  using (id in (select public.mis_negocios()))
  with check (id in (select public.mis_negocios()));

-- 01d) Token del portal y confirmación -------------------------------------
alter table public.citas add column if not exists portal_token text;
update public.citas set portal_token = encode(extensions.gen_random_bytes(18), 'hex')
  where portal_token is null;
alter table public.citas alter column portal_token set default encode(extensions.gen_random_bytes(18), 'hex');
alter table public.citas alter column portal_token set not null;
create unique index if not exists citas_portal_token_uq on public.citas (portal_token);
create unique index if not exists citas_codigo_uq on public.citas (codigo) where codigo is not null;
alter table public.citas add column if not exists confirmada_at timestamptz;

-- 01e) Funciones del portal: solo lo que la clienta necesita ---------------
create or replace function public._portal_json(p_cita uuid, p_completo boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'codigo',       c.codigo,
    'fecha',        c.fecha,
    'hora',         c.hora,
    'duracion_min', c.duracion_min,
    'estado',       c.estado,
    'confirmada',   c.confirmada_at is not null,
    'servicios', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre',     i->>'n',
                 'rama',       coalesce(i->>'cat', s.categoria, 'nails'),
                 'requisitos', coalesce(s.requisitos, '')))
        from jsonb_array_elements(coalesce(c.items, '[]'::jsonb)) i
        left join public.servicios s on s.id::text = i->>'id'), '[]'::jsonb),
    'precio',          c.precio,
    'descuento_monto', coalesce(c.descuento_monto, 0),
    'pagos_total',     (select coalesce(sum((p->>'monto')::numeric), 0)
                          from jsonb_array_elements(coalesce(c.pagos, '[]'::jsonb)) p),
    'pagos_n',         jsonb_array_length(coalesce(c.pagos, '[]'::jsonb)),
    'pago',            c.pago,
    'abonado',         c.abonado,
    'cobrado',         c.cobrado,
    'negocio', jsonb_build_object('nombre', n.nombre, 'direccion', n.direccion,
                                  'telefono', n.telefono, 'maps_url', n.maps_url),
    'clienta', case when p_completo and cl.id is not null then jsonb_build_object(
                 'id',             cl.id,
                 'nombre',         split_part(cl.nombre, ' ', 1),
                 'sellos',         cl.sellos,
                 'premio_menor',   pm.nombre,
                 'premio_mayor',   px.nombre,
                 'menor_canjeado', cl.menor_canjeado,
                 'mayor_canjeado', cl.mayor_canjeado) end)
  from public.citas c
  join public.negocios n      on n.id  = c.negocio_id
  left join public.clientas cl on cl.id = c.clienta_id
  left join public.premios pm  on pm.id = cl.premio_menor_id
  left join public.premios px  on px.id = cl.premio_mayor_id
  where c.id = p_cita
$$;

-- Enlace nuevo: portal.html#<token> (144 bits). Devuelve también nombre y sellos.
create or replace function public.portal_cita(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._portal_json(c.id, true)
  from public.citas c
  where p_token is not null and length(p_token) >= 32 and c.portal_token = p_token
$$;

-- Enlaces viejos con código RH-XXXX: sin datos de la clienta y solo para
-- citas recientes o futuras.
create or replace function public.portal_cita_codigo(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._portal_json(c.id, false)
  from public.citas c
  where c.codigo = upper(trim(p_codigo)) and c.fecha >= current_date - 30
  limit 1
$$;

grant execute on function public.portal_cita(text), public.portal_cita_codigo(text) to anon, authenticated;

-- 01f) Permisos de funciones -----------------------------------------------
revoke execute on function public._portal_json(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.mis_negocios() from public, anon;
grant execute on function public.mis_negocios() to authenticated;

-- 01g) Comprobantes, confirmaciones, permisos de anon, search_path ---------
alter policy "comprobantes leer" on storage.objects to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] in (select public.mis_negocios()::text));
alter policy "comprobantes subir" on storage.objects to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] in (select public.mis_negocios()::text));
alter policy "comprobantes actualizar" on storage.objects to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] in (select public.mis_negocios()::text))
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] in (select public.mis_negocios()::text));
alter policy "comprobantes borrar" on storage.objects to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] in (select public.mis_negocios()::text));
update storage.buckets
   set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'comprobantes';

-- Conteo diario de confirmaciones: lo escribe pg_cron, la app no lo lee.
alter policy "rw confirmaciones" on public.confirmaciones_diarias to authenticated using (false) with check (false);
revoke all on public.confirmaciones_diarias from anon, authenticated;

-- Sin políticas para anon en estas tablas: se retiran los permisos por defecto.
revoke all on public.negocios, public.miembros, public.servicios, public.egresos,
              public.cortesias, public.cortesias_catalogo, public.expedientes_piel,
              public.fotos_piel from anon;
-- citas, clientas y premios conservan solo SELECT hasta la parte 2.
revoke insert, update, delete, truncate, references, trigger
  on public.citas, public.clientas, public.premios from anon;

alter function public.set_cliente_num()         set search_path = public;
alter function public.touch_updated_at()        set search_path = public;
alter function public.gen_codigo_cita()         set search_path = public;
alter function public.set_codigo_cita()         set search_path = public;
alter function public.preparar_confirmaciones() set search_path = public;
