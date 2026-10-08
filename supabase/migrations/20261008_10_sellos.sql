-- ============================================================================
-- Rhēud · Sellos ligados a citas atendidas                       2026-10-08 · v7
-- Antes la app escribía clientas.sellos directo: un QR leído varias veces o
-- un toque de más sumaba sellos sin cita. Ahora:
--   · sumar_sello(cita)        un sello por cita atendida, tope 12
--   · ajustar_sellos(clienta, ±n)  ajuste manual (solo la dueña)
--   · canjear_premio(clienta, nivel)  al canjear el mayor, tarjeta nueva
-- Requiere 20261008_01 (public.mis_negocios). Sin DROP: se puede volver a correr.
-- ============================================================================

-- deleted_at también lo agrega 20261008_12; aquí para que esta migración no
-- dependa del orden (sumar_sello ignora citas borradas).
alter table public.citas add column if not exists deleted_at timestamptz;

create table if not exists public.sellos_log (
  cita_id    uuid primary key references public.citas(id) on delete cascade,
  clienta_id uuid not null references public.clientas(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  por        uuid default auth.uid(),
  at         timestamptz not null default now()
);
create index if not exists sellos_log_clienta_idx on public.sellos_log (clienta_id);

alter table public.sellos_log enable row level security;
-- Solo lectura para los miembros del negocio; se escribe únicamente con las funciones.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sellos_log' and policyname = 'leer sellos') then
    create policy "leer sellos" on public.sellos_log for select to authenticated
      using (negocio_id in (select public.mis_negocios()));
  end if;
end $$;
revoke all on public.sellos_log from anon, authenticated;
grant select on public.sellos_log to authenticated;

-- Un sello por cita atendida del negocio de quien llama. Devuelve los sellos de la clienta.
create or replace function public.sumar_sello(p_cita uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_cli uuid; v_neg uuid; v_sellos int;
begin
  select c.clienta_id, c.negocio_id into v_cli, v_neg
    from public.citas c
   where c.id = p_cita and c.estado = 'atendida' and c.deleted_at is null
     and c.negocio_id in (select public.mis_negocios());
  if v_neg is null then
    raise exception 'La cita no existe o no está atendida' using errcode = 'P0001';
  end if;
  if v_cli is null then
    raise exception 'La cita no tiene clienta' using errcode = 'P0001';
  end if;
  -- bloquea la fila de la clienta: dos lecturas simultáneas no suman dos veces
  select coalesce(sellos, 0) into v_sellos from public.clientas where id = v_cli for update;
  if exists (select 1 from public.sellos_log where cita_id = p_cita) then
    raise exception 'Esta cita ya sumó su sello' using errcode = 'P0001';
  end if;
  if v_sellos >= 12 then
    raise exception 'La tarjeta ya está completa (12 sellos): canjea el premio mayor para empezar otra' using errcode = 'P0001';
  end if;
  insert into public.sellos_log (cita_id, clienta_id, negocio_id) values (p_cita, v_cli, v_neg);
  perform set_config('rheud.sellos', 'si', true);
  update public.clientas set sellos = v_sellos + 1 where id = v_cli returning sellos into v_sellos;
  return v_sellos;
end $$;

-- Ajuste manual (−12…12) para la dueña. Devuelve los sellos resultantes (0…12).
create or replace function public.ajustar_sellos(p_clienta uuid, p_delta int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_neg uuid; v_sellos int;
begin
  if p_delta is null or p_delta = 0 or abs(p_delta) > 12 then
    raise exception 'Ajuste de sellos no válido' using errcode = 'P0001';
  end if;
  select negocio_id, coalesce(sellos, 0) into v_neg, v_sellos
    from public.clientas where id = p_clienta for update;
  if v_neg is null or not exists (
       select 1 from public.miembros m
        where m.user_id = (select auth.uid()) and m.negocio_id = v_neg and m.rol = 'dueña') then
    raise exception 'Solo la dueña puede ajustar sellos de esta clienta' using errcode = 'P0001';
  end if;
  perform set_config('rheud.sellos', 'si', true);
  update public.clientas set sellos = greatest(0, least(12, v_sellos + p_delta))
   where id = p_clienta returning sellos into v_sellos;
  return v_sellos;
end $$;

-- Canje: el menor (6 sellos) se marca; el mayor (12) reinicia sellos y banderas.
create or replace function public.canjear_premio(p_clienta uuid, p_nivel text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_neg uuid; v_sellos int; v_menor boolean; v_mayor boolean;
begin
  select negocio_id, coalesce(sellos, 0), coalesce(menor_canjeado, false), coalesce(mayor_canjeado, false)
    into v_neg, v_sellos, v_menor, v_mayor
    from public.clientas
   where id = p_clienta and negocio_id in (select public.mis_negocios())
   for update;
  if v_neg is null then
    raise exception 'Clienta no encontrada' using errcode = 'P0001';
  end if;
  perform set_config('rheud.sellos', 'si', true);
  if p_nivel = 'menor' then
    if v_sellos < 6 then raise exception 'Aún no llega a 6 sellos' using errcode = 'P0001'; end if;
    if v_menor then raise exception 'El premio de 6 sellos ya se canjeó en esta tarjeta' using errcode = 'P0001'; end if;
    update public.clientas set menor_canjeado = true where id = p_clienta;
  elsif p_nivel = 'mayor' then
    if v_sellos < 12 then raise exception 'Aún no llega a 12 sellos' using errcode = 'P0001'; end if;
    -- tarjeta nueva: los sellos_log se conservan (cada cita sigue sin poder sellar dos veces)
    update public.clientas set sellos = 0, menor_canjeado = false, mayor_canjeado = false
     where id = p_clienta returning sellos into v_sellos;
  else
    raise exception 'Nivel de premio no válido' using errcode = 'P0001';
  end if;
  return v_sellos;
end $$;

revoke execute on function public.sumar_sello(uuid), public.ajustar_sellos(uuid, int), public.canjear_premio(uuid, text) from public, anon;
grant execute on function public.sumar_sello(uuid), public.ajustar_sellos(uuid, int), public.canjear_premio(uuid, text) to authenticated;

-- Candado: sellos y banderas de canje solo cambian dentro de las funciones de
-- arriba (marcan la transacción con rheud.sellos). Un UPDATE directo desde la
-- app (por ejemplo una versión vieja en caché) se rechaza en vez de sumar sin cita.
create or replace function public._proteger_sellos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.sellos, new.menor_canjeado, new.mayor_canjeado) is distinct from (old.sellos, old.menor_canjeado, old.mayor_canjeado)
     and coalesce(current_setting('rheud.sellos', true), '') <> 'si' then
    raise exception 'Los sellos solo se cambian con sumar_sello, ajustar_sellos o canjear_premio' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public._proteger_sellos() from public, anon, authenticated;
create or replace trigger trg_proteger_sellos before update on public.clientas
  for each row execute function public._proteger_sellos();
