-- 038 — las políticas de admin sobre storage.objects usan is_admin().
--
-- Intención: cerrar el mismo acoplamiento oculto que cerró la 035 para
-- user_consents, en el único sitio donde quedaba. La post-condición que se
-- anotó entonces ("cero políticas consultan profiles inline") se verificó sólo
-- sobre el esquema `public`; estas dos viven en `storage` y se quedaron fuera.
--
-- Razonamiento (idéntico al de la 035, y por eso mismo no es cosmético):
-- is_admin() es SECURITY DEFINER y evalúa profiles saltándose su RLS. La forma
-- inline se ejecuta con los permisos del llamante y por tanto DEPENDE de que
-- exista profiles_select_own. Endurecer la RLS de `profiles` dejaría a los
-- admins sin acceso a los documentos, en silencio, por un cambio en otra tabla
-- sin relación aparente.
--
-- Equivalencia, con precisión: equivalente HOY (profiles_select_own existe),
-- divergente MAÑANA a propósito — si se endurece la RLS de profiles, la nueva
-- versión sigue reconociendo al admin y la vieja no.
--
-- Alcance: sólo cambia QUIÉN se considera admin. El resto de cada política
-- (bucket_id) queda intacto. No toca las 4 políticas de técnico/empresa.

DROP POLICY IF EXISTS "admin_read_all_docs" ON storage.objects;
CREATE POLICY "admin_read_all_docs"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'technician-documents' AND is_admin());

DROP POLICY IF EXISTS "admin_delete_all_docs" ON storage.objects;
CREATE POLICY "admin_delete_all_docs"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'technician-documents' AND is_admin());
