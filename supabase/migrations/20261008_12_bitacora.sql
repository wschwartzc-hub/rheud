-- ============================================================================
-- Rhēud · Borrado suave, bitácora y reglas de datos              2026-10-08 · v7
-- · citas.deleted_at y egresos.deleted_at: "Eliminar" ya no borra la fila; la
--   app ignora las filas con deleted_at y el portal deja de mostrar la cita.
-- · bitacora: cada alta y cada cambio (incluido el borrado suave) en citas,
--   clientas y egresos queda registrado: quién, cuándo, antes y después. Solo
--   lectura para el equipo. Como nada se borra de verdad, el trigger solo
--   escucha altas y cambios.
-- · checks: precio >= 0, descuento entre 0 y el precio, estado válido.
--   Verificado con los datos de producción el 2026-10-08 (0 filas fuera de
--   regla), por eso se validan de inmediato.
-- Requiere 20261008_01 (mis_negocios, portal_cita). Se puede volver a correr.
-- ============================================================================

-- 12a) Borrado suave ---------------------------------------------------------
alter table public.citas   add column if not exists deleted_at timestamptz;
alter table public.egresos add column if not exists deleted_at timestamptz;
create index if not exists citas_vivas_idx on public.citas (negocio_id, fecha) where deleted_at is null;

-- 12b) Bitácora --------------------------------------------------------------
create table if not exists public.bitacora (
  id         bigserial primary key,
  negocio_id uuid,
  tabla      text not null,
  fila       uuid,
  accion     text not null,            -- alta | cambio | borrado | baja
  antes      jsonb,
  despues    jsonb,
  por        uuid default auth.uid(),
  at         timestamptz not null default now()
);
create index if not exists bitacora_fila_idx on public.bitacora (tabla, fila);
create index if not exists bitacora_negocio_at_idx on public.bitacora (negocio_id, at desc);

alter table public.bitacora enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bitacora' and policyname = 'leer bitacora') then
    create policy "leer bitacora" on public.bitacora for select to authenticated
      using (negocio_id in (select public.mis_negocios()));
  end if;
end $$;
-- Solo lectura: escriben únicamente el trigger y baja_clienta (security definer).
revoke all on public.bitacora from anon, authenticated;
grant select on public.bitacora to authenticated;
revoke all on sequence public.bitacora_id_seq from anon, authenticated;

-- En un cambio guarda solo las columnas que cambiaron (sin updated_at).
create or replace function public._bitacora() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb; v_despues jsonb; v_accion text;
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new); v_accion := 'alta';
  else
    select jsonb_object_agg(o.key, o.value) into v_antes
      from jsonb_each(to_jsonb(old)) o where to_jsonb(new) -> o.key is distinct from o.value;
    select jsonb_object_agg(n.key, n.value) into v_despues
      from jsonb_each(to_jsonb(new)) n where to_jsonb(old) -> n.key is distinct from n.value;
    v_antes := coalesce(v_antes, '{}'::jsonb) - 'updated_at';
    v_despues := coalesce(v_despues, '{}'::jsonb) - 'updated_at';
    if v_despues = '{}'::jsonb then return null; end if;
    v_accion := case when v_despues ? 'deleted_at' and v_despues ->> 'deleted_at' is not null then 'borrado' else 'cambio' end;
  end if;
  insert into public.bitacora (negocio_id, tabla, fila, accion, antes, despues)
  values ((to_jsonb(new) ->> 'negocio_id')::uuid, tg_table_name, (to_jsonb(new) ->> 'id')::uuid,
          v_accion, v_antes, v_despues);
  return null;
end $$;
revoke execute on function public._bitacora() from public, anon, authenticated;

create or replace trigger trg_bitacora after insert or update on public.citas
  for each row execute function public._bitacora();
create or replace trigger trg_bitacora after insert or update on public.clientas
  for each row execute function public._bitacora();
create or replace trigger trg_bitacora after insert or update on public.egresos
  for each row execute function public._bitacora();

-- 12c) Reglas de datos -------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'citas_precio_no_negativo' and conrelid = 'public.citas'::regclass) then
    alter table public.citas add constraint citas_precio_no_negativo check (precio >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'citas_descuento_valido' and conrelid = 'public.citas'::regclass) then
    alter table public.citas add constraint citas_descuento_valido
      check (descuento_monto is null or (descuento_monto >= 0 and descuento_monto <= precio));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'citas_estado_valido' and conrelid = 'public.citas'::regclass) then
    alter table public.citas add constraint citas_estado_valido check (estado in ('agendada', 'atendida', 'cancelada'));
  end if;
end $$;

-- 12d) Las citas borradas no se ven en el portal ni cuentan para confirmar --
-- (mismo cuerpo que en 20261008_01 más "deleted_at is null")
create or replace function public.portal_cita(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._portal_json(c.id, true)
  from public.citas c
  where p_token is not null and length(p_token) >= 32 and c.portal_token = p_token
    and c.deleted_at is null
$$;

create or replace function public.portal_cita_codigo(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._portal_json(c.id, false)
  from public.citas c
  where c.codigo = upper(trim(p_codigo)) and c.fecha >= current_date - 30
    and c.deleted_at is null
  limit 1
$$;

create or replace function public.preparar_confirmaciones() returns void
language plpgsql set search_path = public as $$
declare
  manana date := (now() at time zone 'America/Monterrey')::date + 1;
  n int;
begin
  select count(*) into n
  from citas
  where fecha = manana and estado <> 'cancelada' and deleted_at is null;

  insert into confirmaciones_diarias (fecha, total, generado_en)
  values (manana, n, now())
  on conflict (fecha) do update set total = excluded.total, generado_en = now();
end;
$$;
