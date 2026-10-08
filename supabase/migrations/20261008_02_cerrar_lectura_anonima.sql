-- ============================================================================
-- Rhēud · Seguridad, parte 2: cierra la lectura anónima         2026-10-08 · v6.5
-- Aplicar DESPUÉS de publicar el portal que usa portal_cita(token): el portal
-- anterior leía estas tablas directamente con la clave anónima y deja de
-- funcionar con este cambio.
-- ============================================================================

-- Antes: USING (true) para anon → cualquiera con la clave pública listaba todas
-- las citas y clientas (teléfono, correo, cumpleaños, alergias, notas).
alter policy "portal leer por codigo" on public.citas    to anon using (false);
alter policy "portal leer clientas"   on public.clientas to anon using (false);
alter policy "portal leer premios"    on public.premios  to anon using (false);

revoke all on public.citas, public.clientas, public.premios from anon;
