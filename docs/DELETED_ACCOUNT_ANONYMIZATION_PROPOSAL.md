# Propuesta — qué más debería anonimizar la eliminación de cuenta (NO IMPLEMENTADO)

Generado: 2026-07-22. Documento de discusión, no un plan aprobado — nada de
esto se ha tocado en código. Acompaña al fix de visibilidad (migración 024
+ guards) del mismo día; ese fix es independiente de esta propuesta y no
depende de que se decida nada de lo que sigue.

## Lo que `supabase/functions/delete-account/index.ts` YA anonimiza hoy

Para un técnico (`deleteAccountTechnician`):
- `documents`: filas borradas + ficheros borrados de Storage.
- `offer_applications.cover_note`: puesto a NULL.
- `chat_messages.body` (mensajes enviados por él): reemplazado por
  `"[Message deleted]"`.
- `technician_profiles`: `first_name`→`"[Deleted]"`, `last_name`→`"[User]"`,
  `email`→`deleted_<uuid>@deleted.invalid`, `phone`→NULL,
  `social_links`→NULL, `birth_date`→`'1900-01-01'`.
- `profiles`: `email` anonimizado, `status`→`'deleted'`.
- `auth.users`: fila borrada (irreversible).

## Lo que NO toca (y por qué importa)

| Campo/tabla | Estado tras "eliminar" | ¿Debería cambiar? |
|---|---|---|
| `technician_profiles.verification_status` | Se queda tal cual (`verified`/`pending`/`rejected`) | Ya no se expone en las pantallas que arreglé hoy (technician_public_view lo excluye, y las pantallas de histórico ya no muestran nada del perfil) — pero el dato crudo en la tabla sigue diciendo "verified" de una persona que ya no existe como tal. |
| `technician_profiles.location_city_id` | Intacto (ciudad/país reales) | La ubicación de residencia es dato razonablemente identificable combinado con otros campos. |
| `technician_profiles.anonymous_code` | Intacto | Es pseudónimo por diseño desde el principio (nunca fue directamente identificador) — probablemente no hace falta tocarlo, pero lo incluyo para que la decisión sea explícita, no accidental. |
| `technician_profiles.availability`, `profile_completeness` | Intactos | Baja sensibilidad, pero tampoco sirven ya para nada una vez borrado. |
| `technician_licenses` (categorías Part-66 + fechas) | Intacto | Ver nota RGPD abajo — esto es el caso más matizado. |
| `technician_habilitations` (ratings, experience_years, vigencia) | Intacto | Mismo matiz que licenses. |
| `technician_aircraft_experience` | Intacto | Igual. |
| `offer_requests` / `offer_applications` (status, timestamps, `identity_revealed`/`documents_unlocked`) | Intactos | Son registros de negocio de LA EMPRESA, no solo del técnico — borrarlos unilateralmente en la eliminación del técnico sería raro (la empresa tiene su propio interés legítimo en conservar su historial de contrataciones). |
| `chat_rooms` | Intacto | Igual razonamiento — pertenece también a la conversación de la empresa. |

## La pregunta central: ¿cualificaciones/ubicación/verified de alguien borrado?

Dos lecturas RGPD en tensión, sin resolver aquí:

1. **Minimización de datos (Art. 5.1.c) + derecho al olvido (Art. 17)**: una
   vez que la persona ejerce su derecho a borrarse, en principio solo
   deberían quedar los datos estrictamente necesarios para que terceros
   (las empresas con relación histórica) cumplan SUS PROPIAS obligaciones —
   no más. Bajo esta lectura, `verification_status`, `location_city_id`,
   y quizás incluso las fechas exactas de vigencia de licenses/
   habilitations deberían anonimizarse o generalizarse (p. ej. "verified"
   → borrar el campo entero, ciudad → NULL).

2. **Obligación legal / interés legítimo (Art. 17.3.b/f, Art. 6.1.c/f)**:
   el mantenimiento aeronáutico tiene requisitos regulatorios reales de
   trazabilidad (EASA Part-145 y similares: qué cualificación tenía quién
   para el trabajo que hizo). Si una empresa aceptó a este técnico para
   una oferta real, es defendible que necesite conservar QUÉ licencia/
   rating tenía en ese momento como registro de cumplimiento — borrar esos
   campos podría ir en contra de esa obligación, no a favor del RGPD.

Estas dos lecturas apuntan en direcciones opuestas para
`technician_licenses`/`technician_habilitations`. No lo decido aquí a
propósito.

## Brecha concreta entre lo prometido y lo que pasa hoy

`app/account/delete.tsx` le dice al técnico, antes de confirmar:
> "Your profile and **all personal information**"

Con el estado actual, `verification_status` y `location_city_id`
sobreviven intactos en `technician_profiles` — no son "toda la información
personal" borrada, aunque ya no sean visibles a través de las pantallas
que arreglé hoy (que es un fix de VISIBILIDAD, no de anonimización de
almacenamiento). Si la respuesta a la sección anterior es "sí, hay que
anonimizar más", el texto de esa pantalla ya es correcto tal cual está —
solo falta que el backend cumpla lo que promete. Si la respuesta es "no,
esos campos se quedan por obligación legal", el texto de esa pantalla
debería matizarse (algo tipo "your personal information, except records
we're required to keep for regulatory compliance").

## Opciones (sin decidir), de menos a más agresivo

**A — Mínimo (encaja con "solo lo prometido explícitamente")**
Anonimizar `location_city_id`→NULL y `verification_status`→NULL (o un
nuevo valor tipo `'deleted'` en el enum) en la misma función Edge. Deja
licenses/habilitations/aircraft_experience intactos.

**B — Moderado**
A + anonimizar `technician_licenses.issued_at/expires_at` y
`technician_habilitations.issued_at/expires_at/experience_years` a NULL,
manteniendo SOLO `license_code`/`aircraft_type_rating_id` (el hecho
"tenía esta cualificación", sin las fechas exactas) — un punto medio entre
las dos lecturas RGPD de arriba.

**C — Agresivo**
B + borrar (no solo anonimizar) `technician_licenses`/
`technician_habilitations`/`technician_aircraft_experience` por completo.
Requeriría decidir qué pasa con las FK de `offer_required_habilitations`/
matching histórico que las referencian indirectamente — probablemente
ninguna, ya que esas tablas no tienen FK directa a estas, pero habría que
verificarlo antes de implementar.

## Qué necesito de ti para avanzar (cuando quieras retomarlo)

1. ¿`verification_status`/`location_city_id` se anonimizan sí o no?
2. ¿Las fechas de vigencia de licenses/habilitations se conservan por la
   obligación regulatoria aeronáutica, o se anonimizan también?
3. Si se decide anonimizar más, ¿lo hacemos en la misma función
   `delete-account` (mismo patrón que ya existe) o se separa en una
   política de retención con expiración por tiempo (p. ej. "se anonimiza
   del todo a los N días")?
4. ¿El texto de `app/account/delete.tsx` necesita matizarse según lo que
   se decida en 1-2?

Ninguna de estas decisiones bloquea el fix de visibilidad ya aplicado
(migración 024 + guards) — ese fix es correcto independientemente de lo
que se decida aquí.
