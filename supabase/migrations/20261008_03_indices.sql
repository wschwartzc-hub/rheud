-- ============================================================================
-- Rhēud · Índices para llaves foráneas sin índice (asesor de rendimiento)
--                                                                2026-10-08 · v7
-- Aditiva. Los índices duplicados de citas (idx_citas_clienta /
-- idx_citas_negocio_fecha) se pueden borrar a mano desde el SQL Editor.
-- ============================================================================
create index if not exists cortesias_clienta_idx          on public.cortesias (clienta_id);
create index if not exists cortesias_negocio_idx          on public.cortesias (negocio_id);
create index if not exists cortesias_catalogo_negocio_idx on public.cortesias_catalogo (negocio_id);
create index if not exists egresos_negocio_fecha_idx      on public.egresos (negocio_id, fecha);
create index if not exists fotos_piel_negocio_idx         on public.fotos_piel (negocio_id);
create index if not exists miembros_negocio_idx           on public.miembros (negocio_id);
create index if not exists miembros_user_idx              on public.miembros (user_id);
create index if not exists premios_negocio_idx            on public.premios (negocio_id);
