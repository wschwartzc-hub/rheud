-- ============================================================================
-- Rhēud · Foto del esquema de producción (solo referencia, NO ejecutar)
-- Generado desde el catálogo de Postgres del proyecto wrplznjgravcnxkzfarn el
-- 2026-10-08, después de aplicar todas las migraciones de supabase/migrations.
-- Solo incluye las tablas de Rhēud del esquema public (el proyecto también
-- aloja las tablas casita_*, que no son de esta app).
--
-- Para cambiar el esquema escribe una migración nueva en supabase/migrations
-- (aditiva y que se pueda volver a correr) y vuelve a generar este archivo.
--
-- Funciones (public):
--   _bitacora() → trigger  [security definer]
--   _proteger_sellos() → trigger
--   _portal_json(p_cita uuid, p_completo boolean) → jsonb  [security definer]
--   ajustar_sellos(p_clienta uuid, p_delta integer) → integer  [security definer]
--   baja_clienta(p_clienta uuid) → void  [security definer]
--   canjear_premio(p_clienta uuid, p_nivel text) → integer  [security definer]
--   gen_codigo_cita() → text
--   mis_negocios() → SETOF uuid  [security definer]
--   portal_cita(p_token text) → jsonb  [security definer]
--   portal_cita_codigo(p_codigo text) → jsonb  [security definer]
--   preparar_confirmaciones() → void
--   rheud_mfa_ok() → boolean  [security definer]
--   rheud_push_cita_cambio() → trigger  [security definer]
--   rheud_push_config() → jsonb  [security definer]
--   rheud_push_llamar(p_cuerpo jsonb) → bigint  [security definer]
--   rheud_push_tick(p_tarea text) → void  [security definer]
--   set_cliente_num() → trigger
--   set_codigo_cita() → trigger
--   sumar_sello(p_cita uuid) → integer  [security definer]
--   touch_updated_at() → trigger
--
-- Storage (buckets privados):
--   comprobantes: leer · subir · actualizar · borrar (carpeta del negocio)
--   expedientes:  leer · subir · borrar (carpeta del negocio)
--                 + "mfa expedientes" (restrictiva: pide verificación en dos
--                   pasos si la usuaria la activó)
--
-- pg_cron: rheud_push_recordatorios */5 · rheud_push_resumen 55 13 ·
--          rheud_push_confirmar 55 23 · rheud_push_limpieza 17 9 (UTC)
-- Vault:   rheud_vapid_public · rheud_vapid_private · rheud_vapid_subject ·
--          rheud_push_cron_secret (los valores no van en el repo)
-- Edge Function: rheud-push (verify_jwt = false, se autentica sola)
-- ============================================================================

-- bitacora
create table public.bitacora (
  id bigint not null default nextval('bitacora_id_seq'::regclass),
  negocio_id uuid,
  tabla text not null,
  fila uuid,
  accion text not null,
  antes jsonb,
  despues jsonb,
  por uuid default auth.uid(),
  at timestamp with time zone not null default now(),
  constraint bitacora_pkey PRIMARY KEY (id)
);
alter table public.bitacora enable row level security;
CREATE INDEX bitacora_fila_idx ON public.bitacora USING btree (tabla, fila);
CREATE INDEX bitacora_negocio_at_idx ON public.bitacora USING btree (negocio_id, at DESC);
create policy "leer bitacora" on public.bitacora as permissive for select to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));

-- citas
create table public.citas (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  clienta_id uuid,
  items jsonb not null default '[]'::jsonb,
  fecha date not null,
  hora text default ''::text,
  duracion_min integer not null default 60,
  color text not null default 'rosa'::text,
  precio numeric not null default 0,
  estado text not null default 'agendada'::text,
  pago text default ''::text,
  metodo text default ''::text,
  pagado_fecha date,
  comprobante_url text default ''::text,
  notas text default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  codigo text,
  cobrado numeric,
  descuento_pct numeric,
  abonado numeric,
  pagos jsonb default '[]'::jsonb,
  descuento_monto numeric,
  cortesia_id uuid,
  portal_token text not null default encode(gen_random_bytes(18), 'hex'::text),
  confirmada_at timestamp with time zone,
  deleted_at timestamp with time zone,
  constraint citas_pkey PRIMARY KEY (id),
  constraint citas_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES clientas(id) ON DELETE SET NULL,
  constraint citas_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  constraint citas_descuento_valido CHECK (((descuento_monto IS NULL) OR ((descuento_monto >= (0)::numeric) AND (descuento_monto <= precio)))),
  constraint citas_estado_valido CHECK ((estado = ANY (ARRAY['agendada'::text, 'atendida'::text, 'cancelada'::text]))),
  constraint citas_precio_no_negativo CHECK ((precio >= (0)::numeric))
);
alter table public.citas enable row level security;
CREATE INDEX citas_clienta_idx ON public.citas USING btree (clienta_id);
CREATE UNIQUE INDEX citas_codigo_uq ON public.citas USING btree (codigo) WHERE (codigo IS NOT NULL);
CREATE INDEX citas_negocio_fecha_idx ON public.citas USING btree (negocio_id, fecha);
CREATE UNIQUE INDEX citas_portal_token_uq ON public.citas USING btree (portal_token);
CREATE INDEX citas_vivas_idx ON public.citas USING btree (negocio_id, fecha) WHERE (deleted_at IS NULL);
CREATE INDEX idx_citas_clienta ON public.citas USING btree (clienta_id);          -- duplicado de citas_clienta_idx
CREATE INDEX idx_citas_estado ON public.citas USING btree (negocio_id, estado);
CREATE INDEX idx_citas_negocio_fecha ON public.citas USING btree (negocio_id, fecha); -- duplicado de citas_negocio_fecha_idx
create policy "portal leer por codigo" on public.citas as permissive for select to anon
  using (false);
create policy "rw citas" on public.citas as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));
CREATE TRIGGER trg_bitacora AFTER INSERT OR UPDATE ON public.citas FOR EACH ROW EXECUTE FUNCTION _bitacora();
CREATE TRIGGER trg_citas_push AFTER INSERT OR UPDATE OF fecha, hora, estado ON public.citas FOR EACH ROW EXECUTE FUNCTION rheud_push_cita_cambio();
CREATE TRIGGER trg_citas_touch BEFORE UPDATE ON public.citas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_set_codigo_cita BEFORE INSERT ON public.citas FOR EACH ROW EXECUTE FUNCTION set_codigo_cita();

-- clientas
create table public.clientas (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  num integer,
  nombre text not null,
  telefono text default ''::text,
  email text default ''::text,
  notas text default ''::text,
  created_at timestamp with time zone not null default now(),
  sellos integer default 0,
  premio_menor_id uuid,
  premio_mayor_id uuid,
  menor_canjeado boolean default false,
  mayor_canjeado boolean default false,
  cumple date,
  forma_una text default ''::text,
  colores_fav text default ''::text,
  alergias text default ''::text,
  notas_prefs text default ''::text,
  consentimiento_salud boolean not null default false,
  consentimiento_fecha date,
  constraint clientas_pkey PRIMARY KEY (id),
  constraint clientas_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);
alter table public.clientas enable row level security;
CREATE INDEX idx_clientas_negocio ON public.clientas USING btree (negocio_id);
CREATE INDEX idx_clientas_nombre ON public.clientas USING btree (negocio_id, lower(nombre));
create policy "portal leer clientas" on public.clientas as permissive for select to anon
  using (false);
create policy "rw clientas" on public.clientas as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));
CREATE TRIGGER trg_bitacora AFTER INSERT OR UPDATE ON public.clientas FOR EACH ROW EXECUTE FUNCTION _bitacora();
CREATE TRIGGER trg_cliente_num BEFORE INSERT ON public.clientas FOR EACH ROW EXECUTE FUNCTION set_cliente_num();
CREATE TRIGGER trg_proteger_sellos BEFORE UPDATE ON public.clientas FOR EACH ROW EXECUTE FUNCTION _proteger_sellos();

-- confirmaciones_diarias
create table public.confirmaciones_diarias (
  fecha date not null,
  total integer default 0,
  generado_en timestamp with time zone default now(),
  constraint confirmaciones_diarias_pkey PRIMARY KEY (fecha)
);
alter table public.confirmaciones_diarias enable row level security;
create policy "rw confirmaciones" on public.confirmaciones_diarias as permissive for all to authenticated
  using (false)
  with check (false);

-- cortesias
create table public.cortesias (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  clienta_id uuid,
  catalogo_id uuid,
  descripcion text not null,
  vigencia_dias integer default 30,
  fecha_inicio date not null default CURRENT_DATE,
  fecha_vence date,
  usada boolean default false,
  fecha_uso date,
  notas text default ''::text,
  created_at timestamp with time zone default now(),
  constraint cortesias_pkey PRIMARY KEY (id),
  constraint cortesias_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES clientas(id) ON DELETE CASCADE,
  constraint cortesias_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);
alter table public.cortesias enable row level security;
CREATE INDEX cortesias_clienta_idx ON public.cortesias USING btree (clienta_id);
CREATE INDEX cortesias_negocio_idx ON public.cortesias USING btree (negocio_id);
create policy "rw cortesias" on public.cortesias as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));

-- cortesias_catalogo
create table public.cortesias_catalogo (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  nombre text not null,
  descripcion text default ''::text,
  vigencia_dias integer default 30,
  created_at timestamp with time zone default now(),
  constraint cortesias_catalogo_pkey PRIMARY KEY (id),
  constraint cortesias_catalogo_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);
alter table public.cortesias_catalogo enable row level security;
CREATE INDEX cortesias_catalogo_negocio_idx ON public.cortesias_catalogo USING btree (negocio_id);
create policy "rw cortesias_catalogo" on public.cortesias_catalogo as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));

-- egresos
create table public.egresos (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  fecha date not null default CURRENT_DATE,
  concepto text not null,
  monto numeric not null default 0,
  notas text default ''::text,
  created_at timestamp with time zone default now(),
  deleted_at timestamp with time zone,
  constraint egresos_pkey PRIMARY KEY (id),
  constraint egresos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);
alter table public.egresos enable row level security;
CREATE INDEX egresos_negocio_fecha_idx ON public.egresos USING btree (negocio_id, fecha);
create policy "rw egresos" on public.egresos as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));
CREATE TRIGGER trg_bitacora AFTER INSERT OR UPDATE ON public.egresos FOR EACH ROW EXECUTE FUNCTION _bitacora();

-- expedientes_piel
create table public.expedientes_piel (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  clienta_id uuid not null,
  tipo text not null default ''::text,
  fototipo text not null default ''::text,
  sensibilidad text not null default ''::text,
  alergias text not null default ''::text,
  contraindicaciones text not null default ''::text,
  objetivo text not null default ''::text,
  rutina text not null default ''::text,
  evolucion jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint expedientes_piel_clienta_id_key UNIQUE (clienta_id),
  constraint expedientes_piel_pkey PRIMARY KEY (id),
  constraint expedientes_piel_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES clientas(id) ON DELETE CASCADE,
  constraint expedientes_piel_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id)
);
alter table public.expedientes_piel enable row level security;
CREATE INDEX expedientes_piel_negocio_idx ON public.expedientes_piel USING btree (negocio_id);
create policy "mfa expedientes_piel" on public.expedientes_piel as restrictive for all to authenticated
  using (( SELECT rheud_mfa_ok() AS rheud_mfa_ok))
  with check (( SELECT rheud_mfa_ok() AS rheud_mfa_ok));
create policy "rw expedientes_piel" on public.expedientes_piel as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));
CREATE TRIGGER expedientes_piel_touch BEFORE UPDATE ON public.expedientes_piel FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- fotos_piel
create table public.fotos_piel (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  clienta_id uuid not null,
  tipo text not null default 'seguimiento'::text,
  fecha date not null default CURRENT_DATE,
  path text not null,
  nota text not null default ''::text,
  created_at timestamp with time zone not null default now(),
  constraint fotos_piel_pkey PRIMARY KEY (id),
  constraint fotos_piel_clienta_id_fkey FOREIGN KEY (clienta_id) REFERENCES clientas(id) ON DELETE CASCADE,
  constraint fotos_piel_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  constraint fotos_piel_tipo_check CHECK ((tipo = ANY (ARRAY['antes'::text, 'despues'::text, 'seguimiento'::text])))
);
alter table public.fotos_piel enable row level security;
CREATE INDEX fotos_piel_clienta_idx ON public.fotos_piel USING btree (clienta_id, fecha DESC);
CREATE INDEX fotos_piel_negocio_idx ON public.fotos_piel USING btree (negocio_id);
create policy "mfa fotos_piel" on public.fotos_piel as restrictive for all to authenticated
  using (( SELECT rheud_mfa_ok() AS rheud_mfa_ok))
  with check (( SELECT rheud_mfa_ok() AS rheud_mfa_ok));
create policy "rw fotos_piel" on public.fotos_piel as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));

-- miembros
create table public.miembros (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  user_id uuid,
  nombre text,
  rol text not null default 'dueña'::text,
  created_at timestamp with time zone not null default now(),
  constraint miembros_pkey PRIMARY KEY (id),
  constraint miembros_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  constraint miembros_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.miembros enable row level security;
CREATE INDEX miembros_negocio_idx ON public.miembros USING btree (negocio_id);
CREATE INDEX miembros_user_idx ON public.miembros USING btree (user_id);
create policy "crear mi membresia" on public.miembros as permissive for insert to authenticated
  with check (false);
create policy "ver mis membresias" on public.miembros as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

-- negocios
create table public.negocios (
  id uuid not null default gen_random_uuid(),
  nombre text not null default 'Rhēud Beauty'::text,
  created_at timestamp with time zone not null default now(),
  promo_template text,
  promo_broadcast text,
  direccion text not null default ''::text,
  telefono text not null default ''::text,
  maps_url text not null default ''::text,
  constraint negocios_pkey PRIMARY KEY (id)
);
alter table public.negocios enable row level security;
create policy "crear negocio" on public.negocios as permissive for insert to authenticated
  with check (false);
create policy "editar mi negocio" on public.negocios as permissive for update to authenticated
  using ((id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((id IN ( SELECT mis_negocios() AS mis_negocios)));
create policy "ver mi negocio" on public.negocios as permissive for select to authenticated
  using ((id IN ( SELECT mis_negocios() AS mis_negocios)));

-- premios
create table public.premios (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  nombre text not null,
  nivel text not null default 'menor'::text,
  descripcion text default ''::text,
  created_at timestamp with time zone default now(),
  constraint premios_pkey PRIMARY KEY (id),
  constraint premios_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);
alter table public.premios enable row level security;
CREATE INDEX premios_negocio_idx ON public.premios USING btree (negocio_id);
create policy "portal leer premios" on public.premios as permissive for select to anon
  using (false);
create policy "rw premios" on public.premios as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));

-- push_log (solo la Edge Function con service_role; sin políticas = sin acceso desde la app)
create table public.push_log (
  id bigint not null default nextval('push_log_id_seq'::regclass),
  negocio_id uuid,
  tipo text not null,
  ref text not null,
  enviado_at timestamp with time zone not null default now(),
  constraint push_log_tipo_ref_key UNIQUE (tipo, ref),
  constraint push_log_pkey PRIMARY KEY (id),
  constraint push_log_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);
alter table public.push_log enable row level security;

-- push_subs
create table public.push_subs (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid not null,
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  dispositivo text not null default ''::text,
  prefs jsonb not null default '{"cambios": true, "resumen": true, "confirmar": true, "recordatorio": true}'::jsonb,
  created_at timestamp with time zone not null default now(),
  last_ok_at timestamp with time zone,
  fallos integer not null default 0,
  constraint push_subs_endpoint_key UNIQUE (endpoint),
  constraint push_subs_pkey PRIMARY KEY (id),
  constraint push_subs_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  constraint push_subs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint push_subs_auth_check CHECK (((length(auth) >= 16) AND (length(auth) <= 64))),
  constraint push_subs_dispositivo_check CHECK ((length(dispositivo) <= 80)),
  constraint push_subs_endpoint_check CHECK (((endpoint ~~ 'https://%'::text) AND (length(endpoint) <= 2048))),
  constraint push_subs_p256dh_check CHECK (((length(p256dh) >= 40) AND (length(p256dh) <= 200))),
  constraint push_subs_prefs_check CHECK ((jsonb_typeof(prefs) = 'object'::text))
);
alter table public.push_subs enable row level security;
CREATE INDEX push_subs_negocio_idx ON public.push_subs USING btree (negocio_id);
CREATE INDEX push_subs_user_idx ON public.push_subs USING btree (user_id);
create policy "push_subs propias" on public.push_subs as permissive for all to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) AND (negocio_id IN ( SELECT mis_negocios() AS mis_negocios))))
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (negocio_id IN ( SELECT mis_negocios() AS mis_negocios))));

-- servicios
create table public.servicios (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  nombre text not null,
  precio numeric not null default 0,
  costo_real numeric not null default 0,
  descripcion text default ''::text,
  incluye text default ''::text,
  activo boolean not null default true,
  orden integer default 0,
  created_at timestamp with time zone not null default now(),
  precios jsonb default '[]'::jsonb,
  categoria text not null default 'nails'::text,
  subfamilia text not null default ''::text,
  duracion_min integer not null default 60,
  limpieza_min integer not null default 0,
  recurso text not null default 'mesa'::text,
  insumos jsonb not null default '[]'::jsonb,
  requisitos text not null default ''::text,
  constraint servicios_pkey PRIMARY KEY (id),
  constraint servicios_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
  constraint servicios_categoria_chk CHECK ((categoria = ANY (ARRAY['nails'::text, 'skin'::text, 'otro'::text]))),
  constraint servicios_duracion_chk CHECK ((((duracion_min >= 0) AND (duracion_min <= 720)) AND ((limpieza_min >= 0) AND (limpieza_min <= 240)))),
  constraint servicios_recurso_chk CHECK ((recurso = ANY (ARRAY['mesa'::text, 'cabina'::text, 'ninguno'::text])))
);
alter table public.servicios enable row level security;
CREATE INDEX servicios_negocio_categoria_idx ON public.servicios USING btree (negocio_id, categoria);
create policy "rw servicios" on public.servicios as permissive for all to authenticated
  using ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)))
  with check ((negocio_id IN ( SELECT mis_negocios() AS mis_negocios)));

-- SELLOS_LOG
