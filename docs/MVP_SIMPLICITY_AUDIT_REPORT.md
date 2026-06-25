# AviationJobTalent MVP Simplicity Audit Report

*Fecha: 2026-06-05 · Revisión completa del estado actual del producto*

---

## 1. Executive Summary

AviationJobTalent está en un estado **sólido y cercano al lanzamiento**. La arquitectura es correcta, los flujos principales funcionan de extremo a extremo, la seguridad es buena y el diseño es coherente. Sin embargo, hay **tres bloqueadores reales antes de lanzar** (olvidar contraseña, eliminación de cuenta/GDPR, y dos migraciones sin aplicar), y un puñado de mejoras pequeñas que evitarían fricciones innecesarias con los primeros usuarios.

El riesgo principal no es técnico: es lanzar con usuarios reales antes de tener resuelto el flujo de recuperación de contraseña y la política de borrado de datos.

**Veredicto: estamos bien encaminados. No hay que rehacer nada. Hay que terminar de pulir y lanzar.**

---

## 2. Current Strengths

Lo que está bien planteado y no hay que tocar:

- **Autenticación completa** — signup por rol, login, pending-verification, set-password para miembros invitados.
- **Routing por roles** — guards correctos en layouts, redirección automática según `profile.role` y `profile.status`.
- **Modelo de privacidad del técnico** — identidad oculta hasta aceptación, `technician_public_view` bien diseñado.
- **RLS en Supabase** — 94 políticas cubren todos los casos de acceso; clientes no pueden escribir datos de otros usuarios.
- **Flujo de ofertas completo** — crear, editar, publicar, cerrar; técnico puede browsear, aplicar, retirar.
- **Ofertas directas completas** — empresa envía, técnico acepta/rechaza, historial en ambas partes.
- **Matching con porcentaje** — `calculateOfferTechnicianMatch` cubre licencias, aircraft types, experiencia y disponibilidad.
- **Chat post-aceptación** — sala creada automáticamente por trigger, RLS correcto.
- **Activity badges** — sistema de notificaciones con `activity_events` + `activity_reads` (triggers en migración 005).
- **Admin funcional** — verificación de técnicos, empresas y documentos desde panel dedicado.
- **Invitación de miembros de empresa** — Edge Function + modal UI + set-password flow completos.
- **Responsive** — layouts mobile-first con variantes para pantallas anchas (web).
- **Validación de formularios** — signup, creación de oferta y edición de perfil validados correctamente.
- **Arquitectura limpia** — repositories + SessionContext + types bien separados.
- **Sin datos demo en producción** — seeds son solo referencia, toda la data viene de Supabase.

---

## 3. MVP Launch Blockers

Cosas que impedirían un lanzamiento responsable si no se resuelven antes:

### P0-A — Migraciones 004 y 005 sin aplicar en Supabase
**Problema:** Las migraciones `004_member_display_names.sql` y `005_activity_event_triggers.sql` están escritas pero NO aplicadas en la base de datos real. Sin ellas:
- Los nombres de miembros de empresa no se guardan (`display_name`).
- Los puntos rojos de notificación nunca aparecen (sin triggers no se crean `activity_events`).
- La columna `display_name` no existe → los SELECTs que la incluyen pueden fallar en producción.

**Solución:** `supabase db push` o aplicar el SQL en el Dashboard antes de lanzar.

---

### P0-B — Sin recuperación de contraseña ("Forgot password")
**Problema:** Si un usuario olvida su contraseña, no puede recuperarla. No hay pantalla ni flujo de reset.
**Impacto real:** Primeros usuarios frustrados e irrecuperables. Alta probabilidad de abandono.
**Solución mínima:** Una pantalla con input de email → `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. El `redirectTo` puede apuntar a `/auth/set-password` que ya existe y ya maneja tokens de Supabase.
**Esfuerzo:** ~2 horas.

---

### P0-C — Sin borrado de cuenta (GDPR)
**Problema:** Técnicos y empresas no pueden eliminar su cuenta ni sus datos personales. En Europa, el RGPD exige el "derecho al olvido". Incluso fuera de Europa, es una práctica estándar y usuarios la esperan.
**Solución mínima para MVP:**
- Botón "Delete my account" en `/technician/profile` y `/company/profile`.
- Edge Function `delete-account` con `service_role` que borre el auth user + datos relacionados (o los anonimiza).
- Mostrar mensaje de confirmación + logout automático.
**Esfuerzo:** ~4 horas.

---

## 4. High-Value Simple Improvements

Mejoras pequeñas que aportan mucho sin complicar:

### Muy recomendable antes de lanzar

**4.1 — Eliminación del archivo document upload sin validación de tipo/tamaño**
Actualmente cualquier archivo se puede subir. Un usuario podría subir un ejecutable o un vídeo de 2 GB.
- Añadir validación de tipo (`image/*`, `application/pdf`) y tamaño máximo (5 MB).
- Una línea de código en el input de documentos.

**4.2 — Limpiar rutas legacy deprecated**
`/company/requests.tsx` y `/technician/requests.tsx` tienen comentarios TODO de borrado. Son redirects vacíos que confunden. Borrarlos reduce la superficie de código y la confusión.

**4.3 — Estado vacío en chat cuando no hay conversaciones**
Si un técnico o empresa entra a Chats y no ha aceptado ninguna conexión todavía, la pantalla queda vacía sin explicación. Un mensaje del tipo "Accept an application or direct offer to start chatting" sería suficiente.

**4.4 — Feedback cuando el email de invitación falla**
Si la Edge Function `invite-company-member` falla (ej. email inválido, Resend no configurado), el admin recibe un error genérico. Añadir mensajes de error más específicos en la UI.

**4.5 — Verificación de email del técnico al registrarse**
Actualmente si Supabase tiene "email confirmation" activado, el técnico no puede hacer login hasta confirmarlo pero la app no le explica esto claramente. Asegurarse de que el mensaje en `/auth/pending-verification` cubra también este caso.

### Mejora opcional (no bloquea lanzamiento)

**4.6 — Skeleton screens en lugar de LoadingScreen completo**
Las pantallas muestran un loading spinner completo mientras cargan. Skeleton screens darían la sensación de respuesta inmediata. No es bloqueante pero mejora la percepción.

**4.7 — Error boundary global**
Si un componente falla silenciosamente, el usuario ve pantalla en blanco. Un `ErrorBoundary` mostraría un mensaje amigable y botón de retry.

**4.8 — Indicador de completitud del perfil del técnico más visible**
El porcentaje existe pero es discreto. Podría ser más prominente para motivar al técnico a completar su perfil y mejorar su matching.

---

## 5. Things to Avoid Before MVP

Features o cambios que NO se deberían hacer antes de lanzar:

- **Pagos / Stripe / Paddle** — no hay modelo de negocio validado aún.
- **IA generativa** — summaries de perfiles, matching con LLMs, recomendaciones automáticas avanzadas.
- **Matching configurable por admin** — los pesos del algoritmo funcionan bien; cambiarlos en producción sin datos reales es prematuro.
- **Notificaciones push móviles** — añade complejidad (APNs, FCM) sin validar que los usuarios usen la app móvil.
- **Sistema de reviews/ratings** — requiere datos suficientes para ser útil.
- **Multi-idioma (i18n)** — el producto está en inglés; añadir idiomas ahora ralentiza el desarrollo.
- **Analytics avanzados** — suficiente con logs de Supabase en MVP.
- **Refactoring de arquitectura** — la arquitectura actual es correcta, no tocar.
- **Rediseño completo de UI** — la paleta se actualizó recientemente; estabilizar antes de iterar más.
- **Paginación del servidor en search** — el volumen de técnicos en MVP no lo justifica aún.
- **Dashboards de métricas de empresa** (ROI de contratación, time-to-hire, etc.) — Post-MVP.

---

## 6. Recommended MVP Scope

Lo que debe incluir el MVP al lanzar, ni más ni menos:

**Técnico:**
- [x] Signup + perfil editable (licencias, aircraft types, disponibilidad, ubicación)
- [x] Browse de ofertas con match %
- [x] Aplicar a ofertas y ver estado
- [x] Recibir y responder ofertas directas
- [x] Chat post-aceptación
- [x] Subir documentos para verificación
- [ ] Recuperar contraseña (P0-B)
- [ ] Eliminar cuenta (P0-C)

**Empresa:**
- [x] Signup + perfil editable
- [x] Crear/publicar/editar ofertas
- [x] Revisar aplicaciones + aceptar/rechazar
- [x] Buscar técnicos con filtros + enviar oferta directa
- [x] Chat post-aceptación
- [x] Invitar miembros del equipo
- [x] Ver historial de ofertas directas enviadas
- [ ] Recuperar contraseña (P0-B)
- [ ] Eliminar cuenta (P0-C)

**Admin:**
- [x] Verificar técnicos, empresas y documentos
- [x] Ver métricas básicas del marketplace

---

## 7. Post-MVP Backlog

Buenas ideas, pero para después de validar el producto:

1. **Notificaciones por email** para actividad clave (aplicación aceptada, nueva oferta directa).
2. **Matching avanzado** con pesos configurables por admin.
3. **Búsqueda geoespacial** en el mapa con radio real.
4. **Historial de verificaciones** (quién verificó, cuándo).
5. **Plan freemium / monetización** con límites de uso.
6. **Notificaciones push** (iOS/Android).
7. **Export de datos** para técnicos (GDPR data portability).
8. **API pública** para integraciones con ATS de empresas.
9. **Ranking de técnicos** dentro de oferta por score.
10. **Filtro de ofertas por fecha de publicación**.
11. **Caducidad automática de ofertas** (ya existe el campo `expires_at`, falta el cron).
12. **Reviews anónimas** de procesos de selección.
13. **Panel de analytics para empresas** (time-to-hire, acceptance rate).
14. **Onboarding guiado** con tooltips para nuevos usuarios.

---

## 8. Technical Risks

### Alto riesgo

**T1 — Migraciones no aplicadas en producción**
La brecha entre el código (que asume `display_name` y triggers de actividad) y el schema real de Supabase causará fallos silenciosos o errores 400 en queries.
→ **Acción inmediata:** `supabase db push` antes de activar usuarios reales.

**T2 — Edge Function `invite-company-member` requiere `APP_PUBLIC_URL` / `SITE_URL`**
Si esta variable de entorno no está configurada en Supabase Dashboard, los invites fallan con error 500. Verificar que está configurada.

**T3 — No hay timeout ni retry en queries Supabase**
Si Supabase tiene latencia puntual, algunas pantallas se quedan cargando indefinidamente. Para MVP es aceptable, pero añadir un timeout global sería prudente.

### Riesgo medio

**T4 — Search con carga completa de técnicos en cliente**
`getOfferMatchesForTechnician()` carga todos los técnicos en cliente y calcula match localmente. Con 100+ técnicos puede tardar varios segundos. Para MVP es aceptable si el volumen inicial es pequeño.

**T5 — `activity_reads` crece linealmente por evento de chat**
Cada mensaje crea una `activity_event`. En chats muy activos (100+ mensajes), el número de rows a marcar como leídas crece. No es un problema en MVP pero debería monitorizarse.

**T6 — Sin límite de tamaño en uploads de documentos**
Sin validación, un usuario podría subir archivos muy grandes. Añadir límite en el cliente y/o en Supabase Storage bucket policies.

### Riesgo bajo

**T7 — `company/requests.tsx` y `technician/requests.tsx` deprecated pero presentes**
No causan errores pero añaden confusión al codebase. Eliminar en próximo sprint.

**T8 — Tokens de set-password expiran rápido**
Los links de invitación de Supabase tienen TTL (~24h). Si el miembro invitado no actúa rápido, el link expira y no hay flujo de reenvío de invitación.

---

## 9. UX / Product Risks

**U1 — Los técnicos no saben por qué su cuenta está "pending"**
La pantalla `/auth/pending-verification` muestra el estado pero no el tiempo estimado. Sin SLA claro, los técnicos pueden sentir que la plataforma está rota o abandonada.
→ Añadir: "We review profiles within 1-2 business days" o similar.

**U2 — La oferta directa es un flujo poco visible para técnicos**
Los técnicos reciben ofertas directas pero el punto de entrada en el dashboard es pequeño. Si no hay badge rojo (porque la migración 005 no está aplicada), pueden perderse ofertas.
→ Bloqueado por P0-A.

**U3 — El técnico no sabe qué afecta a su match %**
El porcentaje de match aparece en las ofertas pero no hay explicación de cómo mejorar el score. Técnicos con perfil incompleto pueden frustrarse al ver 0% y no saber qué hacer.
→ Un tooltip o pantalla de "Improve your match" ayudaría mucho con poco esfuerzo.

**U4 — Empresa sin ofertas publicadas no puede usar la plataforma**
El flujo de búsqueda requiere una oferta publicada para calcular match. Una empresa nueva que sólo quiere explorar técnicos no puede hacer nada útil hasta publicar una oferta. Considerar un "modo exploración" sin oferta.

**U5 — Sin estado vacío claro en chats nuevos**
Primera vez en `/company/chats` o `/technician/chats`: la pantalla está vacía sin explicar cuándo aparecen conversaciones.
→ "Conversations appear here after accepting an application or direct offer."

**U6 — Verificación de documentos sin feedback al técnico**
Cuando un admin rechaza un documento, el técnico ve el estado "rejected" pero no recibe notificación. Sin badge o email, puede tardar días en enterarse.
→ El trigger de actividad de rechazos de documentos no está cubierto en migración 005.

**U7 — La empresa puede bloquear a un técnico accidentalmente**
Rechazar una aplicación es irreversible desde la UI. Si una empresa rechaza por error, no hay forma de deshacer.
→ Añadir confirmación modal antes de rechazar (aplica también a ofertas directas).

---

## 10. Priority Action Plan

### P0 — Imprescindible antes de lanzar

| # | Acción | Tiempo estimado |
|---|--------|-----------------|
| 1 | Aplicar migraciones 004 y 005 en Supabase (`supabase db push`) | 15 min |
| 2 | Verificar que `APP_PUBLIC_URL` está configurada en Supabase env vars | 5 min |
| 3 | Implementar "Forgot password" (pantalla + resetPasswordForEmail → set-password) | 2h |
| 4 | Implementar "Delete account" (Edge Function + botón en perfil) | 4h |

### P1 — Recomendable antes de tener usuarios reales

| # | Acción | Tiempo estimado |
|---|--------|-----------------|
| 5 | Validar tipo y tamaño de archivo en upload de documentos | 1h |
| 6 | Eliminar `/company/requests.tsx` y `/technician/requests.tsx` | 30 min |
| 7 | Añadir estado vacío con explicación en chats (ambos roles) | 1h |
| 8 | Añadir tiempo estimado de revisión en `/auth/pending-verification` | 30 min |
| 9 | Añadir modal de confirmación antes de rechazar aplicación/oferta directa | 1h |

### P2 — Mejora opcional (añade valor sin ser urgente)

| # | Acción | Tiempo estimado |
|---|--------|-----------------|
| 10 | Skeleton screens en dashboards | 3h |
| 11 | Error boundary global | 2h |
| 12 | Tooltip "Cómo mejorar tu match %" para técnicos | 1h |
| 13 | Mensajes de error más específicos en invite-company-member | 1h |
| 14 | Trigger de actividad para rechazo de documentos | 1h |

### Later — Post-MVP

| # | Acción |
|---|--------|
| 15 | Paginación en búsqueda de técnicos |
| 16 | Notificaciones push (iOS/Android) |
| 17 | Notificaciones por email para actividad clave |
| 18 | Caducidad automática de ofertas (cron job) |
| 19 | Export de datos del usuario (GDPR portability) |
| 20 | Analytics de empresa (time-to-hire, acceptance rate) |

---

## Conclusión

### ¿Estamos complicando demasiado el MVP o vamos bien?

**Vamos bien, pero hay que parar de añadir features y resolver los P0.**

El producto tiene más funcionalidad de la estrictamente necesaria para validar la demanda, lo cual no es malo en sí mismo — la arquitectura es sólida y las features están bien implementadas. El riesgo es lanzar sin cubrir los bloqueadores básicos (reset de contraseña, borrado de cuenta) y que eso genere fricción evitable con los primeros usuarios.

El sistema de notificaciones con activity triggers, las pantallas de Direct Offers, los nombres de miembros del equipo, el panel de recommended offers en el dashboard técnico... todo esto añade valor real al producto. No hay features superfluas llamativas.

**Lo que hay que hacer ahora mismo:**
1. `supabase db push` (15 minutos)
2. Forgot password (2 horas)
3. Delete account (4 horas)
4. Lanzar a beta cerrada con los primeros 5-10 usuarios

El resto puede esperar a que los usuarios reales digan qué les duele.
