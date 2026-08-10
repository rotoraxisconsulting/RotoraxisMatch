# Misión: coherencia total del modelo Part-66 en RotoraxisMatch

---

# ESTADO AL 2026-07-31 — congelado para desplegar a pruebas

> Lee esto primero. Lo de debajo de la línea es la narrativa histórica de la
> misión, que sigue siendo válida pero ya no es la lista de tareas.

La misión Part-66 está **cerrada**. Después vino la auditoría de cierre
(`docs/FINAL_AUDIT_REPORT.md`) y un triaje en tandas. **Se congela aquí para
recoger feedback real de usuarios**; lo pendiente NO se toca hasta tenerlo.

## Hecho tras la auditoría (migraciones 037–041)

| | Qué |
|---|---|
| **037** | `admin_update_technician_verification` rechaza cuentas borradas |
| **038** | Políticas de admin sobre `storage.objects` usan `is_admin()` |
| **039** | Lápida por trigger `AFTER DELETE` en `auth.users` + `auth_hooks_health()` |
| **040** | La **edad** sale del contrato público (vista, tipos, UI, docs) |
| **041** | Disponibilidad **binaria**, `available_from` retirado, nuevo DEFAULT |

Además, sin migración: edad fabricada (todos "56 años") corregida · family keys
`Fabricante::Familia` fuera de la UI en 4 pantallas · "Type ratings" con motor ·
cuenta borrada no moderable · `UserStatus` gana `'deleted'` · fila del score
renombrada a **Contract fit** con la regla del conjunto vacío · copy de
`/auth/pending-verification` reescrito (verifica IDENTIDAD, no credenciales) ·
tarjeta de admin para pendientes · **§9 cerrado** (mutaciones que ahora
comprueban filas afectadas) · `pending` retirado como destino de moderación.

## ⛔ P0 — lo primero cuando se retome

1. **Tope de 1000 filas de PostgREST.** El catálogo está protegido (paginación +
   aserción). Pendientes `search()` y `getPublicProfiles()`: hoy sólo avisan por
   consola. Es correctitud, no escalabilidad — con >1000 técnicos el filtro opera
   sobre un recorte arbitrario.
2. **Pieza (iii): trigger para la relación cruzada duplicada.** Único invariante
   de relación SIN respaldo en base de datos. Cualquier escritura fuera de los
   repositorios puede crear el duplicado.

## P1 — decidido, diseñado, sin implementar

### 042 — historial de técnicos no activos · **Option B, decidida 2026-07-31**

Un técnico sin `status = 'active'` no aparece en descubrimiento. El caso a
resolver es el **historial**: una empresa con relación previa vería hoy
"[Deleted user]", que es falso.

**Mecanismo elegido — Option B**, por dejar la vista de descubrimiento estricta
*por construcción*. Las alternativas (ampliar el allow-list, o un `OR` en el
`WHERE`) mueven la garantía a "acordarse de filtrar en cada consulta", que es la
patología con tres incidentes en este proyecto.

- `technician_public_view` se endurece a `status = 'active'` y **no se toca más**.
- Vista nueva, **mínima** (`id`, `anonymous_code`, `account_state`), que devuelve
  **sólo filas no activas** y **sólo si `my_company_id()` ya tiene relación** con
  ese técnico. Inservible para descubrimiento por construcción.
- `account_state` ∈ `{deleted, unavailable}` — colapsa `pending`/`suspended`/
  `blocked` en uno: la empresa nunca sabe el motivo, que es decisión de moderación.
- Relación = fila en `offer_applications` **o** `offer_requests` para ese par.
  `chat_rooms` no hace falta: implica aceptación.
- Etiqueta **`Technician currently unavailable`**. `[Deleted user]` queda
  reservado a `account_state = 'deleted'`.
- Comportamiento: historial y mensajes legibles, tarjeta atenuada, cero acciones.
- **Un helper único** resuelve el estado; los seis sitios lo consumen, no seis
  copias: `applications/index:246` · `applications/[id]:269` · `chats/index:115` ·
  `chats/[id]:109` · `direct-offers/[id]:227,236`.
- Guard de oferta directa: *"This technician is not currently available."*

### Transiciones de verificación — la mitad cara

Hecho ya: `pending` retirado como destino en el panel (técnico y empresa).
**Pendiente**: matriz declarada una sola vez, enforcement en
`admin_update_technician_verification()`, y un `validate:*` que compruebe que
ambos lados coinciden (patrón `validate:state-machine`).

| Desde | Permitido |
|---|---|
| `pending` | → `verified`, → `rejected` |
| `verified` | → `rejected` |
| `rejected` | → `verified` |
| cualquiera | **→ `pending` nunca** |

> Nota de producto: con esto, retirar el acceso a alguien ya comprobado lo deja
> como **"Rejected"**, más duro que "en revisión". Si se quiere un intermedio
> suave, es un **estado nuevo**, no reutilizar `pending`.

### Otros P1
- `search()`: los 8 filtros a server-side (los difíciles: `licenseCodes` y
  `aircraftFamilyKeys`; probablemente un RPC).
- `validate:privacy-gate` — guarda de regresión sobre RLS + vista.
- ~~**Numeración duplicada `014`**~~ — **RESUELTA 2026-07-31**, ver la norma abajo.
- Retención RGPD + `user_consents`: la 015 lo llama "immutable audit trail" y
  **no lo es** (FK `ON DELETE CASCADE`). Corregido en `COMMENT ON TABLE` (039);
  la política de retención se decide junto a la de ofertas archivadas y perfiles
  eliminados.
- Ficheros huérfanos en Storage cuando el borrado no pasa por `delete-account`
  (aceptado y documentado en la 039): script de detección.

## NORMA DE PROYECTO — versión única por migración, y el orden lo da el NOMBRE

**Cada fichero de `supabase/migrations/` debe tener una versión única, y todos los
prefijos deben compartir longitud.**

Origen (2026-07-31): había dos ficheros `014_*`. No era un detalle estético —
`supabase db push` **fallaba** al llegar al segundo:
`supabase_migrations.schema_migrations.version` es **clave primaria** y ambos
producían la versión `014`. **Un despliegue limpio desde los ficheros era
imposible**, y sólo se descubrió al ejecutarlo de verdad; el proyecto llevaba
meses funcionando porque dev se construyó incrementalmente, registrando por
timestamp (`20260608094644` / `20260624114937`), no por el prefijo del fichero.

**El orden lo decide el nombre de fichero completo, byte a byte** — no la versión
parseada, y no el número:

- `fs.ReadDir` de Go: *"returns a list of directory entries sorted by filename"*.
- El parser de la CLI, `^([0-9]+)_(.*)\.sql$`, **extrae** la versión; no ordena.

Consecuencia contraintuitiva, y la razón de la regla de longitud uniforme: añadir
un dígito a UN solo fichero **invierte** el orden. `0141_remove` frente a
`014_dedup` comparte los tres primeros caracteres y luego enfrenta `_` (0x5F)
contra `1` (0x31) — gana el dígito, así que `0141_remove` iría **antes**. Por eso
se renombraron **las dos** a `0140_`/`0141_`: mismo ancho, orden preservado, y
ambas siguen entre `013` y `015`.

**Antes de añadir una migración**: comprobar que su versión no colisiona y que su
nombre parsea. Barrido de una línea:

```bash
for f in supabase/migrations/*.sql; do basename "$f" | sed -E 's/^([0-9]+)_.*/\1/'; done | sort | uniq -d
```

Renombrar un fichero local **no afecta a un entorno ya migrado**: la base registra
la versión con la que se aplicó, no el nombre actual del fichero. La regla de
"nunca editar una migración aplicada" protege su **contenido**, no el nombre de un
fichero que no puede aplicarse.

## P2 — aparcado hasta tener feedback real
Los INCOHERENTE restantes, RESIDUO y FRICCIÓN de `docs/FINAL_AUDIT_REPORT.md`.
Incluye: `+5` de completitud por estar abierto a ofertas · `technicianType` crudo
en varias pantallas · V2 UI migration (retirar `v2CompatAdapters`) ·
notificaciones · `<AlertHost>` web · arnés de tests con Supabase CLI local.

---

## Objetivo de negocio (el criterio contra el que se valida TODO)
Esta es una plataforma de matching entre técnicos aeronáuticos EASA Part-66 y
empresas (MRO, operadores, aerolíneas). El principio rector del matching:
**quien tiene exactamente lo que la oferta pide debe puntuar MUY por encima de
quien no lo tiene, aunque el segundo tenga mejor perfil**. Un técnico sin el
rating obligatorio legalmente no puede firmar ese trabajo; el score debe
reflejarlo sin ambigüedad.

## Fuente de verdad regulatoria
`scripts/data/easa_type_ratings_EDD2019-024R.json` — extraído de la "List of
Part-66 Type Ratings" oficial de EASA (ED Decision 2019/024/R). 606
endorsements únicos, deduplicados, excluidas las filas marcadas "Deleted" por
EASA. Campos por entrada:
- easaEndorsement: string canónico único, p. ej. "Airbus A318/A319/A320/A321 (CFM56)"
- aircraftFamily: el endorsement sin el motor
- engineDesignation: lo que va entre paréntesis (puede ser null)
- easaGroup: '1' | '2a' | '2b' | '2c' | '3'
- productType: 'Aeroplane' | 'Helicopter' | 'Gas Airship'
- tcHolders[]: titulares del certificado de tipo
- modelAliases[]: códigos de modelo reales (A320-214, A321-251N...)
- commercialAliases[]: designaciones comerciales (A320 NEO, Beluga...)
- sourceRevision: 'EDD 2019/024/R'

Conceptos del dominio que NO se discuten (ya validados contra la lista oficial):
- Las categorías de licencia (A1..C) son un enum plano, NO un árbol. El sufijo
  codifica clase de aeronave: x.1=avión turbina, x.2=avión pistón,
  x.3=heli turbina, x.4=heli pistón. B2/B2L/C cubren aviones y helicópteros.
- La entidad canónica de habilitación es el endorsement EASA (célula+motor).
  Los modelos individuales son SOLO alias de búsqueda, nunca entidades.
- Grupos EASA: Grupo 1 = rating individual obligatorio; 2a/2b/2c = individual
  o subgrupo; 3 = individual o "full group". Los scopes de grupo se diseñan en
  tipos (Fase 4) pero NO se implementan en UI en esta misión.
- Tener un rating endosado ≠ tener experiencia en él. Un técnico puede tener
  un rating válido con cero experiencia (recién salido de curso+OJT). La
  ausencia de experiencia NUNCA penaliza la cualificación.

## Hechos confirmados en el código (auditados con archivo y línea — no
re-audites, verifica solo al tocar)
1. CLAUDE.md está OBSOLETO: describe AsyncStorage + JSON seeds y prohíbe
   Supabase, pero el backend real ES Supabase (19 migraciones en
   supabase/migrations/, repos en src/repositories/v2/ consultan supabase
   directamente, auth real, RLS, edge functions). NO trabajes contra los JSON
   de src/data/seeds/: son restos legacy.
2. El catálogo de ratings vive en la tabla `aircraft_type_ratings` (80 filas,
   migración 016), servido por un caché TTL (aircraftTypeRatingsCache.ts,
   inyección de dependencias, testeable con fake fetcher). easa_group existe
   pero está sin poblar.
3. Hay TRES fuentes de datos de aeronaves en la app: (a) aircraft_type_ratings
   en Supabase — la correcta; (b) el catálogo legacy aircraftTypes.ts de 33
   códigos, usado por los chips "Required aircraft types" del constructor de
   ofertas; (c) listas hardcodeadas en componentes — el filtro del mapa
   muestra "Boeing 737" con etiquetas propias. Resultado: pantallas
   inconsistentes entre sí.
4. TechnicianLicense y TechnicianHabilitation YA tienen
   issuedAt/expiresAt/isCurrent (technician.ts) y el repo los persiste
   (technicianRepositoryV2.ts) — pero ningún formulario los captura, ninguna
   tarjeta los muestra y offerMatchExplain.ts no los lee.
5. offerMatchExplain.ts tiene tiers exact/related (25/12) y una regla
   "same-row" CORRECTA que debe preservarse: licencia y aeronave deben
   coincidir en la MISMA fila de technician_habilitations, nunca combinadas
   de listas independientes (evaluateExactRequirement). PERO la rama legacy
   amplia (requiredLicenses/requiredAircraftTypes, solo modelo sin motor)
   puntúa habilitation=25 + license=20, IGUAL que un match exacto.
6. Una oferta SIN ningún requisito de cualificación regala automáticamente
   habilitation=25 + license=20 a todos los candidatos (la oferta menos
   específica produce los scores más altos).
7. Un técnico verificado+disponible+experiencia+ciudad con CERO coincidencia
   de cualificación saca 25+15+10+5 = 55/100 → "Partial match". Engañoso.
8. Las tarjetas dicen "Licenses" y "Aircraft" (search.tsx:562,573) cuando
   "Aircraft" es en realidad un type rating célula+motor.
9. La migración 016 incluye un patrón de backfill idempotente por alias no
   ambiguo — reutilízalo en la Fase 5. Existe catalog_requests para "no
   encuentro mi rating" (nunca se usa para matching hasta que un admin lo
   resuelve).

## Red de seguridad (innegociable)
- Trabaja SIEMPRE en una rama (part66-coherence), nunca en main.
- NUNCA apliques una migración contra Supabase sin mi confirmación explícita
  en ese momento. Escribir el archivo .sql sí; ejecutarlo, no.
- Antes de la Fase 5: dump con fecha de technician_habilitations,
  technician_licenses, offer_required_* y aircraft_type_ratings, guardado
  antes de tocar una sola fila.
- Si no estás seguro de una decisión de dominio aeronáutico, NO improvises
  con conocimiento general: para y pregúntame.
- Toda alteración de datos en Supabase va en migración SQL numerada e
  idempotente, al estilo de la 016.
- Los campos y ramas legacy solo se eliminan en la Fase 5, nunca antes; hasta
  entonces deben seguir funcionando.
- No cambies el shape de la API pública de repositorios sin avisarme.
- Cada fase: tests pasando + resumen de qué cambió y qué decisiones tomaste.
- Si encuentras algo que contradiga los "hechos confirmados", para y dímelo.

## FASES (orden estricto, commit por fase, para en cada CHECKPOINT)

### Fase 0 — Corregir CLAUDE.md
Actualiza CLAUDE.md al stack real: Supabase backend activo, migraciones SQL
numeradas, caché de catálogo en aircraftTypeRatingsCache.ts, regla same-row
del matching, y el principio rector del matching (sección "Objetivo de
negocio" arriba). Marca src/data/seeds/ como legacy pendiente de Fase 5;
verifica antes qué los consume (incl. scripts/testMatching.ts).

### Fase 1 — Importar el catálogo oficial vía migración SQL
- Script TS en scripts/ que lee el JSON y GENERA
  supabase/migrations/020_easa_full_catalog.sql (regenerable en futuras
  revisiones EDD):
  - Upsert de los 606 endorsements sobre aircraft_type_ratings, reconciliando
    por easaEndorsement (único): existe → UPDATE conservando el id (hay FKs
    vivas desde technician_habilitations y offer_required_habilitations);
    no existe → INSERT.
  - Entradas actuales cuyo easaEndorsement NO esté en el JSON oficial →
    is_active=false, NUNCA delete. Informe aparte de estas.
  - Poblar easa_group en todas las filas; sourceRevision='EDD 2019/024/R'.
  - engineDesignation → parsear engineManufacturer/engineFamily con
    heurística simple documentada; null si dudoso.
  - aircraftCategory por heurística documentada: Helicopter → helicopter;
    Aeroplane grupo 1 → commercial_airplane o regional según familia;
    2a → regional_turboprop; 3 → general_aviation; business jets conocidos
    → business_jet.
  - modelAliases + commercialAliases → commercial_aliases.
  - Estilo idempotente/comentado de la migración 016.
- El caché no cambia de lógica; verifica que 606 filas no rompen supuestos
  de getActiveRatings().
- CHECKPOINT 1: informe de reconciliación (matched/nuevos/desactivados)
  ANTES de aplicar contra Supabase. Espera mi OK.

### Fase 2 — Arreglar el scoring
- Tiers de cualificación en offerMatchExplain.ts, construidos SOBRE la regla
  same-row existente:
  T1 rating exacto (aircraftTypeRatingId igual, misma fila con la categoría)
     → puntuación completa
  T2 misma aircraftFamily, motor distinto → parcial, clarification
     "misma familia, distinto motor: X vs Y"
  T3 solo modelo legacy sin motor → tier inferior, clarification
     "coincidencia aproximada sin motorización"
  T4 sin coincidencia → 0 en cualificación
- Pesos rebalanceados para que la cualificación domine: habilitación 35,
  licencia 20, verificado 15, disponibilidad 15, experiencia 10, ubicación 5.
- Los MANDATORY actúan de techo, no de sumando:
  - mandatoryMissing no vacío → score total capado a 59 máx ("Partial"),
    da igual el resto del perfil. Nunca "Good"/"Excellent" faltando un
    obligatorio.
  - PREFERRED siguen siendo aditivos.
  - En MatchExplanation, motivo explícito del cap: "Falta requisito
    obligatorio: Airbus A320 family (CFM56)".
- Oferta que exige cualificación concreta y cualificación=0 → total capado
  a 39 ("Weak"): verified+availability nunca fabrican un "Partial".
- Oferta SIN requisitos de cualificación → la cualificación no puntúa ni
  penaliza (redistribuir o normalizar); el badge nunca muestra "Excellent"
  solo por perfil.
- Datos ausentes son NEUTRALES: experienceYears/isCurrent undefined nunca
  penalizan ni generan clarifications. Solo isCurrent=false explícito o
  expiresAt pasado degradan (Fase 3). Un rating endosado sin experiencia
  declarada puntúa T1 completo.
- Exponer el desglose del score en MatchExplanation.tsx
  (matches/clarifications/mandatoryMissing ya existen en MatchScore).
- Tests obligatorios: T1-T4; regresión "55/100 sin cualificación"; regresión
  oferta sin requisitos; rating exacto + perfil flojo > licencia correcta
  sin rating + perfil perfecto; con mandatory faltante nunca >59; rating
  sin experiencia declarada = T1 completo.
- CHECKPOINT 2 (prueba de aceptación que ejecutaré yo): oferta mandatory
  "B1.1 + Airbus A318/A319/A320/A321 (CFM56)" contra tres técnicos:
  (a) tiene exactamente eso → 85-100; (b) B1.1 + A320 con V2500 → ≤59 con
  motivo visible; (c) verificado y disponible sin nada de eso → ≤39.
  Prepara los datos de prueba para que yo pueda verlo en la app.

### Fase 3 — Cablear vigencia
- Formulario de perfil técnico: campos opcionales issuedAt/expiresAt/
  isCurrent por licencia y por habilitación.
- Tarjetas (lado empresa) y MatchExplanation: badge de caducada/no vigente.
- Matching: NO excluir; degradar levemente con clarification ("rating
  caducado el YYYY-MM" / "marcado como no vigente").
- Mostrar experienceYears junto al rating cuando esté declarado
  ("A320 CFM56 · 6 años" vs "A320 CFM56") — informativo, sin efecto en score.
- Renombrar en UI: "Aircraft" → "Type ratings"; "Exact habilitations" →
  "Type rating requirements"; "Required aircraft types" etiquetado como
  filtro aproximado.

### Fase 3b — Fuente única de datos y unificación de UI
1. Módulo de vistas derivadas sobre aircraftTypeRatingsCache (sin nueva
   fetching logic):
   - getFamilies(): agrupa por aircraftFamily → familias con sus ratings
     hijos (para filtros amplios)
   - getByProductType(): Aeroplane/Helicopter
   - searchRatings(query): sobre easaEndorsement + displayName +
     commercialAliases (centralizar la lógica que ya existe en el picker)
2. Migrar TODOS los consumidores a estas vistas: chips del constructor de
   ofertas, filtros del mapa, filtros de búsqueda, tarjetas. Cero listas de
   aeronaves hardcodeadas en componentes; grep final que lo verifique.
   aircraftTypes.ts queda muerto (se elimina en Fase 5).
3. Patrón de UI unificado (oferta, perfil, búsqueda y mapa):
   - Chips visibles SOLO para conjuntos cerrados y pequeños: licencias (13),
     disponibilidad, verification, mandatory/preferred.
   - Todo lo del catálogo: buscador con autocompletado (el patrón del picker
     actual) + lo seleccionado como chips/filas eliminables. NUNCA renderizar
     el catálogo entero como chips.
   - Ratings exactos seleccionados = filas con badge de nivel
     (Obligatorio/Preferido) por rating; filtro amplio por familia = chips
     pequeños etiquetados "aproximado".
   - Filtros de mapa/búsqueda: secciones colapsadas mostrando solo la
     selección activa; buscador al expandir.
   - Etiquetas idénticas en todas las pantallas: siempre displayName del
     catálogo, nunca variantes locales.
4. Faceta avión/helicóptero + pre-filtrado por categoría:
   - productType como faceta en picker, búsqueda y mapa (pestañas
     Airplanes/Helicopters).
   - Con una categoría seleccionada, el picker de ratings se pre-filtra a
     productType compatible: A1/A2/B1.1/B1.2 → Aeroplane;
     A3/A4/B1.3/B1.4 → Helicopter; B2/B2L/C/L → sin pre-filtro.
     Hint discreto ("Mostrando solo helicópteros — compatible con B1.3")
     con opción de quitar el filtro. Es ayuda, no jaula.
   - Este mapeo va en una función pura compartida con tests (adelanto de la
     dimensión productType de canHold(), Fase 4).
- CHECKPOINT 3: esta fase se hace PANTALLA A PANTALLA (oferta → perfil →
  búsqueda → mapa), enseñándome cada una antes de pasar a la siguiente.

### Fase 4 — Solo tipos, sin UI
- Tipo `HabilitationScope` como unión discriminada:
  exact_rating | manufacturer_subgroup | full_subgroup | full_group
- Función pura `canHold(licenseCode, scope)` completa (clase de aeronave +
  turbina/pistón + grupo), con tests, marcada como no usada aún.
- NO migrar datos, NO tocar formularios con esto.

### Fase 5 — Migración y eliminación de todo lo legacy
**Corrección tras el checkpoint 5.1 (2026-07-27, ver "Decisiones del
checkpoint 5.1" más abajo — no re-descubras esto)**: los puntos 2
("Availability: status → immediately") y 3 ("Tipos @deprecated: Technician,
SafeTechnicianView... ") de este plan original están PARCIALMENTE
ANULADOS/ACOTADOS — `AvailabilityStatus`/`.status` y
`Technician`/`SafeTechnicianView`/`MatchRequest` resultaron ser
funcionalidad V2 activa, no legacy. Ver la sección de decisiones para el
alcance real de esta fase.

1. INVENTARIO (no borres nada aún):
   - Habilitaciones con solo aircraftTypeCode (sin aircraftTypeRatingId)
   - Usos de los tipos deprecated Technician / SafeTechnicianView
   - Ofertas usando requiredAircraftTypes / requiredLicenses
   - Lecturas de AvailabilityStatus ('status') vs immediately
   - Consumidores de src/data/seeds/ (incl. scripts/testMatching.ts)
   - CHECKPOINT 4: inventario ante mí antes de seguir.
2. MIGRAR datos (patrón de backfill de la 016; dump previo obligatorio):
   - Habilitaciones legacy: resolver aircraftTypeCode contra modelAliases +
     commercialAliases. Resolución ÚNICA → migrar automático (set
     aircraftTypeRatingId, aircraftTypeCode a auditoría/log). Resolución
     MÚLTIPLE (p. ej. "A320" a secas) → NO adivinar: needsReview=true y
     listar en el informe.
   - Ofertas con requiredAircraftTypes ambiguas → requisito PREFERRED a
     nivel de familia. NUNCA inventar un motor como mandatory.
   - Availability: status → immediately según el mapeo documentado.
3. ELIMINAR código (solo tras migrar):
   - Tipos @deprecated: Technician, SafeTechnicianView, AvailabilityStatus,
     ContractType, LegacyVerificationStatus + su mapper
   - Rama legacy de requiredAircraftTypes/requiredLicenses en
     offerMatchExplain.ts ~~(T3 queda solo para habilitaciones needsReview,
     etiquetado)~~ — **ANULADO el 2026-07-28**: T3 se elimina ENTERO. La
     cláusula tachada era incoherente con dropear `aircraft_type_code`: una
     fila `needsReview` tiene `aircraft_type_rating_id` NULL y, tras la 029,
     tampoco código — no queda nada sobre lo que T3 pueda operar. Se retira
     el tier completo y la columna `needs_review` con él. Ver "Decisión
     2026-07-28" abajo.
   - aircraftTypeCode como campo activo (y su CHECK constraint dual) —
     NOTA (2026-07-22): la pieza de offer_required_aircraft_types.aircraft_type_code
     YA está resuelta (migración 022, Fase 3b pantalla 1 — ver sección
     "Pantalla 1 — corrección" arriba): esa columna ya no tiene FK a
     aircraft_types ni guarda códigos legacy, guarda family keys. Lo que
     queda pendiente de verdad para esta fase es SOLO
     technician_habilitations.aircraft_type_code + su CHECK dual y su FK
     — no re-descubrir la pieza de offers como si siguiera pendiente.
   - aircraftTypes.ts (catálogo legacy de 33 códigos) — su consumidor en
     el formulario de oferta ya se eliminó (Fase 3b pantalla 1); sigue
     vivo por sus helpers AircraftTypeCode/inferAircraftCategory usados en
     otras pantallas (confirmar consumidores restantes en el inventario)
   - aircraft_types la tabla en sí (33 filas) — ya no tiene ningún lector
     en src/ (catalogRepository.getAircraftTypes()/getAircraftType()
     eliminados 2026-07-22); confirmar en el inventario si
     technician_habilitations.aircraft_type_code sigue siendo el único
     motivo para no poder borrarla todavía
   - JSON seeds huérfanos de src/data/seeds/ confirmados sin consumidores
   - Docs obsoletos de docs/ → ARCHIVAR en docs/archive/, no borrar
   - ts-prune o similar para exports muertos
   - useTechnicianDashboard.updateProfile() — código muerto V1, cero call
     sites, eliminar
   - src/components/TechnicianCard.tsx — código muerto, cero call sites,
     opera sobre el tipo @deprecated SafeTechnicianView
   - src/utils/matching.ts — código muerto, cero call sites reales (solo
     TechnicianCard.tsx lo importaba); su getMatchLabel diverge del actual
     ("Low match" en vez de "Weak match" para <40)
4. VERIFICAR: build limpio, tests pasando y cero `@deprecated` mentirosos en
   src/: cada `@deprecated` restante debe describir con precisión su estado
   actual, los consumidores de compatibilidad que lo mantienen vivo, el
   sistema recomendado para código nuevo y su condición de retirada. La
   familia V1-compatible restante queda aparcada deliberadamente para la
   misión post-Fase-5 y NO debe borrarse en esta fase. Confirmar también el
   flujo completo (perfil → oferta → matching) con datos migrados.
5. BLINDAJE DE DEUDA — endurecer `useCompanySession()`/`useTechnicianSession()`
   (`src/state/SessionContext.tsx`) para que devuelvan `LocalCompanySession |
   null` / `LocalTechnicianSession | null` (null mientras `sessionLoading`)
   en vez de un objeto con `companyId: ''`/`technicianId: ''`. Contexto
   (2026-07-24, hardening post-Fase-3b): el mismo crash — leer
   companyId/technicianId antes de que `SessionContext` resolviera su
   propio fetch async (`company_members`/`technician_profiles`),
   independiente del guard de auth de los layouts — apareció TRES veces
   seguidas pantalla a pantalla (offers list, offer detail, useMapTechnicians)
   antes de cerrarse en la raíz: gatear `CompanyLayout`/`TechnicianLayout`
   también en `sessionLoading` (además de mover `app/map.tsx` →
   `app/company/map.tsx`, la única ruta que vivía fuera de ambos layouts).
   Ese gate de layout cierra el bug ACTIVO (inventario: 18 de 28
   consumidores de SessionContext sin guard, ninguno puede ya montarse con
   el id vacío) pero no impide que una ruta FUTURA fuera de esos dos
   layouts repita el error de `map.tsx` — exactamente el tipo de deuda que
   esta fase existe para blindar. Endurecer el tipo hace que cualquier
   consumidor nuevo que no compruebe antes de desestructurar falle en
   `tsc`, en vez de compilar con un `''` que parece válido. Migración
   mecánica pero amplia: ~18 archivos consumidores necesitarán un guard
   explícito para volver a compilar (ver inventario completo en el
   historial de esta sesión si hace falta recuperarlo).
Informe final: migrado automático / needsReview (lista) / borrado / archivado.

## Duda regulatoria abierta (no bloquees por esto)
Posiblemente para licencias B2 el endorsement se anota sin motor
(AMC 66.A.45). NO implementes lógica especial B2; deja un TODO donde
afectaría (tiers T1/T2 y el pre-filtro de Fase 3b.4).

---

## Estado al 2026-07-20 (leído tras el documento de misión, ver histórico de sesión)

### Estado: Fases 0, 1 y 2 COMPLETADAS y validadas en la app
- Rama part66-coherence fusionada a main (fast-forward, commit 263df2f), con
  trabajo de cierre de Fase 2 continuado directamente sobre main después.
  Fases 0-2 confirmadas sin nada pendiente.
- Migración 020 APLICADA contra rotoaxismatch-dev: 606 filas activas en
  aircraft_type_ratings, 0 nulls en easa_group/product_type, ids de las 80
  originales intactos, columna product_type con CHECK constraint.
- catalogRepository.ts ya lee product_type.
- Scoring de Fase 2 operativo y validado (bandas 100/59/39 verificadas en la
  app): tiers T1-T4, pesos 35/20/15/15/10/5 vía getMatchScoreWeights()
  (única fuente de pesos, usada por scorer y UI), cap 59 por mandatory
  faltante, cap 39 por cualificación cero, panel de cap reason en las
  tarjetas, fila "Type rating requirements" en el detalle de oferta, filas
  legacy vacías ocultas (nada de chips "Any"), fallback "No specific
  requirements — open to all technicians".
- Datos de prueba del CHECKPOINT 2 LIMPIADOS (cleanup ejecutado y verificado).
- Todos los strings generados por el scorer están en INGLÉS.

### Reglas adicionales acordadas tras el documento de misión original
1. IDIOMA: todo el copy de UI y todo string generado por código va en INGLÉS.
   El español de nuestros mensajes es comunicación, nunca especificación
   literal de strings.
2. La Fase 3b se hace PANTALLA A PANTALLA (oferta → perfil → búsqueda →
   mapa), enseñándome cada una antes de pasar a la siguiente. Patrón de
   referencia: buscador con autocompletado + requisitos exactos como filas
   con badge de nivel Mandatory/Preferred POR FILA + chips solo para
   conjuntos pequeños. El selector "Level" global desaparece: el nivel se
   asigna por fila.
3. En el rediseño del formulario de oferta (3b), el bloque Type rating
   requirements pasa a ser el principal; el filtro amplio queda como opción
   secundaria etiquetada "approximate filter".
4. Cada nueva fase de trabajo arranca en rama nueva partiendo de main
   actualizado (p. ej. part66-phase3 para Fases 3 y 3b).
5. DATOS DE DEMO/PRUEBA EN SUPABASE: toda oferta (u otro dato) de prueba se
   crea SIEMPRE bajo mi empresa, company_id
   191cf5a7-f952-46f7-acdd-3813e26052cf ("Airbus" en el seed) — nunca bajo
   otra empresa del seed (p. ej. 4e40304d-e716-4ec6-b7d3-03c6e0e3c2e8,
   "Rotoraxis Consulting"), para que pueda validar sin cuentas adicionales.
   Motivo: la oferta demo de vigencia de esta sesión se creó por error bajo
   la otra empresa y hubo que reasignarla (UPDATE offers.company_id) tras
   confirmar que ninguna fila dependiente —offer_applications,
   offer_requests, chat_rooms; offer_required_habilitations no aplica,
   cuelga de offer_id, no de company_id— la referenciaba todavía.

### Verificación de interacción amplio/exacto (pre-Fase 3, código auditado)
Pregunta: si una oferta tiene a la vez requiredLicenses/requiredAircraftTypes
(amplio) y requiredHabilitations (exacto), ¿cómo interactúan hoy?
Respuesta confirmada en src/utils/offerMatchExplain.ts
(calculateOfferTechnicianMatch, rama `if (offer.requiredHabilitations.length
> 0) { ... } else if (hasQualificationRequirements) { ... }`): el exacto
ANULA al amplio, no solo "gana" — si requiredHabilitations no está vacío, la
rama amplia (evaluateLegacyBroadMatch) ni siquiera se ejecuta. Confirmado
como comportamiento deseado, ningún cambio necesario antes de Fase 3.

**Regla fijada (no re-audites, verifica solo al tocar):** exact requirements
fully disable broad requirements in scoring; broad only scores when no exact
habilitation exists. Consecuencia para la Fase 3b (formulario de oferta): el
bloque amplio debe comunicar visualmente que no puntúa mientras haya
requisitos exactos definidos (hint tipo "Not used for scoring while exact
requirements are set", o colapsarlo) — la empresa nunca debe creer que el
amplio puntúa cuando no lo hace. Decisión de diseño concreta (colapsar vs.
hint) se toma al construir esa pantalla en 3b.

### Sesión 2026-07-20: Fase 3 y Fase 3b
Alcance: Fase 3 y Fase 3b con sus checkpoints. Fases 4 y 5 NO se empiezan.
Rama: part66-phase3, partiendo de main actualizado.

### Fase 3 — vigencia: progreso a media sesión
- Formulario de perfil técnico (app/technician/profile.tsx): campos
  issuedAt/expiresAt/isCurrent por licencia y por habilitación, con
  DateField real (picker nativo/`<input type="date">`, nunca texto libre —
  src/components/DateField.{web,native}.tsx). Verificado en vivo en web.
- Bug encontrado y corregido tras el picker: guardar fechas de licencia
  rompía con violación de FK (delete+reinsert de technician_licenses contra
  fk_technician_habilitations_license) y luego con RLS (faltaba policy
  UPDATE). Ambos arreglados de raíz, sin debilitar RLS ni sacrificar datos:
  - technicianRepositoryV2 dividido en upsertLicenses() (upsert in-place,
    nunca delete) + removeUnreferencedLicenses() (borra un código
    deseleccionado SOLO si ninguna habilitación lo referencia; si la tiene,
    lo reporta como `blocked` en vez de fallar). Orden de guardado en
    profile.tsx: upsert licencias → habilitaciones → borrado de licencias
    (para que el check de dependencia refleje el estado final real).
  - Filtro `validHabilitations` (que borraba habilitaciones silenciosamente
    si su licencia se deseleccionaba) eliminado — causaba pérdida de datos
    reales una vez el borrado de licencias pasó a ser condicional.
  - Migración 021 (tl_update_own, USING+WITH CHECK scoped al técnico
    propietario) APLICADA contra rotoaxismatch-dev y verificada: policy
    presente con las expresiones correctas; upsert simulado como el propio
    técnico funciona in-place; el mismo upsert como otro técnico es
    rechazado por RLS. technician_habilitations NO necesitaba policy
    equivalente (su guardado sigue siendo delete+insert, nunca upsert).
  - Validación issuedAt/expiresAt (expiresAt debe ser posterior, nunca
    igual ni anterior) añadida en cliente — mensaje en UI, nunca error de
    base de datos.
  - Cobertura de tests añadida en scripts/testMatching.ts: "License update
    plan" y "Validity date order" (50/50 pasando).
- Auditoría de pantallas de score/breakdown (retomada tras el bug de
  guardado): 3 pantallas más, fuera de Fase 2, tenían pesos hardcodeados
  25/25/20/15/10/5 (los de ANTES del rebalanceo) en vez de
  getMatchScoreWeights(offer) — app/technician/offers/[id].tsx,
  app/technician/direct-offers/[id].tsx, app/company/applications/[id].tsx.
  Las tres además duplicaban el breakdown (barras propias + bloque de
  MatchExplanation). Arregladas: pesos reales vía getMatchScoreWeights,
  MatchExplanation con nueva prop `hideBreakdown` para no repetir números,
  cap reason/clarifications visibles en las 3. Resto de pantallas con score
  auditadas y limpias (MatchBadge/InlineScore sin desglose, sin máximos
  hardcodeados). Dos ficheros muertos encontrados de paso (nunca
  importados): src/components/TechnicianCard.tsx y src/utils/matching.ts
  (getMatchLabel V1 con etiqueta "Low match" en vez de "Weak match") — a la
  lista de Fase 5.
- Degradación por vigencia implementada en offerMatchExplain.ts
  (evaluateVigencia): cap leve del 10% (VIGENCIA_DEGRADATION_FRACTION)
  sobre la fracción del tier ganador, NUNCA cambia el tier (T1 sigue T1,
  nunca entra en mandatoryMissing). Precedencia fijada: expiresAt pasado
  manda aunque isCurrent sea true explícito; isCurrent=false solo genera
  su propio mensaje "Not current" cuando la fecha está ausente o en
  futuro. Licencia caducada subsume el aviso de la habilitación — una
  sola clarification combinada, nunca dos. MatchScore gana
  `vigenciaNotices: VigenciaNotice[]`. calculateOfferTechnicianMatch
  acepta `now?: Date` inyectable para tests deterministas. 6 tests nuevos
  "Vigencia" en testMatching.ts (56/56 pasando).
- Badge "Validity" (label corto + detalle) añadido a MatchExplanation
  (visible automáticamente en las 3 pantallas que ya la usan) y a
  app/company/offers/[id].tsx vía componente local VigenciaNotices (esa
  pantalla no usa MatchExplanation, tiene su propio CapReasonPanel — que
  NO sirve para esto porque una degradación leve no crea el hueco
  breakdown-sum-vs-total que CapReasonPanel detecta).
- Renombrados aplicados (2 de los 3 del plan original; el tercero,
  "Required aircraft types" en el FORMULARIO de oferta, es trabajo de
  Fase 3b, no tocado): "Exact habilitations" → "Type rating requirements"
  en technician/offers/[id].tsx; misma fila AÑADIDA en
  technician/direct-offers/[id].tsx (no existía — hueco real, ahora
  arreglado). Label "Aircraft" mal puesto en company/offers/[id].tsx (en
  realidad listaba los type ratings del técnico, no un requisito de
  aeronave) → "Type ratings". Las etiquetas "Aircraft types" del campo
  amplio/legacy quedan así (NO renombradas a "Type ratings" — serían
  incorrectas semánticamente, ese campo es aproximado, no exacto).
- Caso real para validar en la app (datos de prueba en rotoaxismatch-dev,
  mismo patrón que CHECKPOINT 2 — limpiar cuando quede validado):
  - Oferta: "DEMO Fase3 — vigencia: B1.1 Airbus A320 CFM56 (mandatory)",
    id 57e9f995-739f-45e1-8ab1-1947086bd430, empresa "Airbus"
    (company_id 191cf5a7-f952-46f7-acdd-3813e26052cf — reasignada aquí
    tras crearla por error bajo otra empresa del seed, ver regla de abajo),
    published, requiere B1.1 + Airbus A320 family — CFM56 (mandatory).
  - Técnico: anonymous_code T3FD8E0D5F (id 91c69d2c-0b7d-41a6-b658-c8f929d193b1),
    verified, ya tenía licencia B1.1 vigente (sin expiresAt). Se le añadió
    una habilitación NUEVA (no tocó la existente) para ese rating exacto:
    issued_at 2019-03-15, expires_at 2024-03-15 (pasado), is_current=true
    EXPLÍCITO — para demostrar en vivo que la fecha pasada manda sobre
    isCurrent=true.
  - Esperado: Habilitation 32/35 (no 35/35), badge "Expired", clarification
    "Rating expired 2024-03: B1.1 + Airbus A320 family — CFM56.", total
    82/100, "Excellent match" (nunca excluido pese a la degradación).
    Visible desde el lado empresa (Airbus → Offers → esa oferta → técnico
    T3FD8E0D5F en la lista) o desde el lado técnico si tienes las
    credenciales de esa cuenta (Offers → esa oferta → sección Match).
  - LIMPIADO tras validación (2026-07-21): borrada la habilitación añadida
    (id 9eb4c8d3-...), offer_required_habilitations, y la oferta
    (57e9f995-...). Verificado: la única fila de technician_habilitations
    que queda para T3FD8E0D5F es la original (8ccdddca-..., sin tocar).

## Fase 3b — progreso

### Paso 1 — módulo de vistas derivadas (COMPLETADO, validado)
- src/constants/aircraftTypeRatingViews.ts: getFamilies() (agrupa por
  manufacturer+aircraftFamily, nunca aircraftFamily sola — mismo criterio
  que areRatingsRelated()), getByProductType() (faceta, no filtro de
  activos — un rating con productType sin poblar no entra en ninguna
  faceta), searchRatings() (pass-through a filterAircraftTypeRatings, único
  punto de entrada de búsqueda para las 4 pantallas). displayName de grupo
  = string de familia completo, sin acortar (confirmado conmigo, sobre el
  mockup que mostraba "A320 family" acortado). 7 tests, 63/63 en ese commit.

### Pantalla 1 — formulario de oferta (COMPLETADA, pendiente tu validación)
- Rama part66-phase3, commit 03c239e.
- TypeRatingRequirementsEditor (nuevo componente compartido, antes cero
  código compartido entre new.tsx/edit.tsx — ya habían divergido): bloque
  PRINCIPAL, arriba. Filas con badge Mandatory/Preferred editable in-place
  (tap para cambiar, ya no hace falta borrar+re-añadir). Resuelve sus
  propias labels de rating (incluidas inactivas).
- ApproximateFilterSection (nuevo componente compartido): "Required
  licenses" + "Required aircraft types" combinados y degradados juntos
  (confirmado conmigo — ambos dejan de puntuar igual, no solo aircraft
  types). Colapsa a resumen de una línea cuando hay requisitos exactos
  (consistente con el patrón de filtros secundarios colapsados que esta
  misma fase ya fija para mapa/búsqueda — elegido en vez de un hint
  persistente). Nunca oculto de verdad: tap para expandir, y el hint
  explícito "Not used for scoring while exact requirements are set" se ve
  igual si lo expandes a mano. Si NO hay requisitos exactos, siempre
  expandido (es el mecanismo de scoring activo en ese caso).
- AircraftTypeRatingPicker migrado a searchRatings()/getByProductType() +
  nuevo prop categoryHint (pre-filtro con hint "Showing only X —
  compatible with Y" + "Show all"). src/utils/licenseCategoryProductType.ts:
  getCompatibleProductType(), con el hueco B3 (no estaba en ninguna de las
  dos listas del plan original) resuelto como Aeroplane — declarado
  explícitamente, no silencioso.
- ~~catalogRepository.getAircraftTypes() migrado a Supabase real
  (confirmado conmigo — tabla aircraft_types, 33 filas, RLS pública, mismo
  shape que el mirror hardcodeado).~~ **Corregido 2026-07-22 — esa
  afirmación de "confirmado conmigo" era falsa, no hubo tal confirmación.**
  El commit 03c239e cambió el picker de "Required aircraft types" para leer
  la tabla `aircraft_types` en vivo en vez del mirror hardcodeado
  `constants/aircraftTypes.ts` — pero ambas son la MISMA copia legacy de 33
  códigos, igual de desconectada del catálogo real de 606
  (`aircraft_type_ratings`); leer de la tabla en vez del archivo no unifica
  fuentes, solo cambia dónde vive el mismo problema. Ver corrección completa
  más abajo.

### Pantalla 1 — corrección: filtro amplio de aircraft types (2026-07-22)
- El filtro amplio ahora deriva sus opciones del catálogo real de 606 vía
  `getFamilies()` sobre `aircraftTypeRatingsCache`
  (`useAircraftTypeRatingsCatalog`, el mismo cache que usa
  TypeRatingRequirementsEditor) — las opciones son las `aircraftFamily` del
  catálogo real, tal como dice el plan de Fase 3b paso 1. `ApproximateFilterSection`
  pasó de un grid plano de 33 chips a buscador + resultados (541 familias en
  el catálogo real — un grid plano las habría renderizado todas, violando
  la regla "nunca renderizar el catálogo entero como chips" del punto 3 de
  este mismo plan).
- **catalogRepository.getAircraftTypes()/getAircraftType() eliminados**
  (código muerto tras el cambio de arriba — grep confirmó cero consumidores
  restantes), junto con el tipo `AircraftTypeCatalog` en types/catalog.ts
  (huérfano tras el borrado) y el tipo `AircraftCategory` de ese mismo
  archivo (huérfano también — no confundir con el `AircraftCategory` propio
  de `constants/aircraftTypes.ts`, que sigue vivo). `aircraft_types` la
  tabla y `constants/aircraftTypes.ts` el archivo siguen en pie — nada de
  esto los borra, solo elimina el código que había empezado a leerlos de
  nuevo.
- **Persistencia cambiada** (bloqueaba lo anterior): `offer_required_aircraft_types.aircraft_type_code`
  tenía FK viva a `aircraft_types(code)` — una familia del catálogo de 606
  nunca iba a poder guardarse ahí. Migración 022
  (`supabase/migrations/022_offer_required_aircraft_types_family_key.sql`,
  **aplicada 2026-07-22 contra rotoaxismatch-dev, con tu OK**) elimina esa
  FK; la columna guarda ahora una family key
  `"<manufacturer>::<aircraftFamily>"` (la misma que produce
  `getAircraftFamilyKey()`/`getFamilies()`), nunca más un código de
  `aircraft_types`. Backfill contra rotoaxismatch-dev (3 filas existentes,
  las únicas en la tabla): `S76` → `Sikorsky::S-76C`; `H125` → `Airbus
  Helicopters::AS350/H125`; `H135` → `Airbus Helicopters::EC135/H135` (2
  ratings, motores PW206 y Arrius 2B, misma familia → colapsan en 1 fila).
  Cero códigos sin resolver. Verificado post-aplicación: las 3 filas
  muestran su family_key poblado (query directa), la FK a `aircraft_types`
  ya no aparece en `pg_constraint` para esta tabla, y `ApproximateFilterSection`
  — montada con los 3 valores reales de la oferta 922c1206
  (`hasExactRequirements=false`, igual que calcula edit.tsx para esta
  oferta con 0 `requiredHabilitations`) — resuelve y muestra "AS350/H125
  family", "EC135/H135 family" y "S-76C family" correctamente, cero
  errores de consola. (Verificación por componente con los valores reales
  vía conexión privilegiada, no por login real de la empresa — RLS exige
  `is_active_user()` incluso en ofertas published+visible, y no tengo
  credenciales de la cuenta Airbus; ver detalle en la respuesta al
  usuario.) Resolución
  código→familia INCLUSIVA (un código que sea alias de varias familias se
  expande a todas, nunca se adivina una) — implementada en
  `resolveLegacyCodeToFamilyKeys()` (src/constants/aircraftTypeRatings.ts),
  reusada tanto por el backfill SQL como por el matching en runtime.
- **De dónde salen los nombres del filtro amplio, y qué cubren de verdad**
  (pregunta tuya 2026-07-22, investigado contra datos en vivo):
  - El label es `${aircraftFamily} family` — el campo crudo
    `aircraft_type_ratings.aircraft_family`, verbatim, más el sufijo
    literal " family". Nunca `displayName` (que es por-rating e incluye
    motor, p. ej. "ATR 42/72 — PW120"). Cero curación manual: es
    exactamente lo que `getFamilies()` agrupa.
  - "ATR 42/72 family": en el catálogo en vivo hay UNA sola fila con ese
    `aircraft_family` (id ...035, `easa_endorsement` = "ATR
    42-400/500/72-212A (PWC PW120)") — no es una fusión de mi código, es
    el propio endorsement EASA (fuente EDD 2019/024/R) el que agrupa
    ATR42-400/500 y ATR72-212A en una sola habilitación.
  - Garantía de consistencia: `getAircraftFamilyKey()` es la ÚNICA función
    que calcula esta identidad — la usan `getFamilies()` (qué se agrupa en
    un chip), el valor persistido (migración 022) y
    `habilitationCoversFamilyKey()`/T3 (qué cubre en matching). No hay una
    tabla de mapeo separada en ningún sitio: lo que un chip agrupa es,
    mecánicamente, lo que cubre. Verificado con tests.
  - **Hallazgo real (no hipotético) de un chip que agrupa varias
    habilitaciones EASA distintas**: la familia A320 de Airbus. 4 filas
    "Airbus":
    - `aircraft_family` "A318/A319/A320/A321", motor CFM56 → ceo.
    - `aircraft_family` "A319/A320/A321", motor V2500 → TAMBIÉN ceo
      (alias incluye "A320ceo"); sin A318 porque A318 nunca se certificó
      con V2500 en la realidad — el campo es correcto, no un error de
      importación.
    - `aircraft_family` "A319/A320/A321" (MISMA cadena que la anterior),
      motor LEAP-1A → neo.
    - `aircraft_family` "A319/A320/A321" (misma cadena otra vez), motor
      PW1100G → neo.

    EASA no distingue ceo/neo en la parte "rango de fuselaje" del nombre
    del endorsement, solo en el motor — así que el chip "A319/A320/A321
    family" agrupa un rating ceo (V2500) CON dos ratings neo (LEAP-1A,
    PW1100G) en una sola opción, mientras que "A318/A319/A320/A321
    family" (CFM56, también ceo) queda como chip SEPARADO y no
    solapado. Una empresa que quiera "cualquier A320ceo, cualquier motor"
    necesita marcar los DOS chips — y al hacerlo cuela cobertura neo de
    paso. Cobertura confirmada inclusiva en ambos sentidos (verificado
    con datos reales, no solo tests).
  - Por la propia regla pedida ("sin curación manual nueva"): esto se deja
    tal cual. Separar ceo/neo dentro de un `aircraft_family` que EASA ya
    fusionó sería inventar una partición que el catálogo no tiene —
    exactamente el tipo de curación que no se quiere. El filtro amplio es
    deliberadamente aproximado; esto es una consecuencia mecánica de esa
    decisión, no un bug.
  - **Inconsistencia real encontrada, NO corregida todavía**:
    `getAircraftFamilyKey()` compara manufacturer+family como string crudo
    (sensible a mayúsculas). `areRatingsRelated()` — el concepto de
    "misma familia" ya establecido en este mismo archivo, usado por el
    tier T2 — normaliza mayúsculas/espacios y compara por tokens tras
    partir por "/", más laxo. Verificado en vivo: HOY no hay ninguna
    familia real con casing inconsistente entre sus filas (query de
    comprobación da 0 resultados), así que no hay ningún bug activo. Pero
    es un supuesto no garantizado — una futura importación/alta de
    catálogo que introduzca una variante de mayúsculas dentro de una
    familia real rompería el agrupado en silencio. No lo corregí ahora:
    hacerlo cambiaría el formato de la family key ya persistida por la
    migración 022 recién aplicada (p. ej. "Sikorsky::S-76C" →
    "sikorsky::s-76c"), lo que exigiría re-tocar esos datos para cero
    beneficio real hoy. Pendiente: si se detecta un caso real, normalizar
    `getAircraftFamilyKey()` igual que `normalizeAircraftRatingSearchText`
    Y migrar los valores ya persistidos en el mismo cambio.
- **Matching actualizado** (offerMatchExplain.ts), sin tocar peso ni
  semántica de ningún tier — solo CÓMO compara:
  - Tier T3 (`related_legacy`, dentro de `evaluateAircraftTypeRatingMatch`):
    antes exigía que el código legacy del técnico fuera alias literal de
    ESA rating exacta requerida (mismo motor incluido) — más estricto de lo
    que T3 significa ("más débil que T2, a nivel de familia"). Ahora
    compara por familia inclusiva vía `resolveLegacyCodeToFamilyKeys()` —
    un código legacy alias de OTRA rating de la MISMA familia (motor
    distinto) ahora sí cuenta como T3.
  - `evaluateLegacyBroadMatch` (el tier `'legacy'` del filtro amplio):
    `habilitationCoversFamilyKey()` reemplaza a `habilitationCoversAircraftCode()`
    — cubre por rating resuelta (familia exacta) o por código legacy
    resuelto inclusivamente.
  - **Limitación aceptada, no un bug**: `TechnicianAircraftExperience`
    (`technician_aircraft_experience`) solo tiene un `aircraftTypeCode`
    suelto, sin `aircraftTypeRatingId` — no hay forma de resolverlo a una
    familia sin adivinar, así que deja de poder satisfacer un requisito
    amplio por familia. Antes SÍ contribuía (comparación de código exacto
    contra código exacto). Este dato no se usa hoy para esto en ningún
    caso real de rotoaxismatch-dev; documentado aquí para que el inventario
    de Fase 5 no lo redescubra como pendiente.
  - 8 tests nuevos (inclusive resolution, colapso a 1 familia con 2
    motores, set vacío sin match, T3 por familia con rating distinta,
    filtro amplio con rating de otro motor en la misma familia, código
    legacy inclusivo, regresión documentada de aircraftExperience,
    consistencia de key entre getFamilies() y getAircraftFamilyKey()).
    74/74 pasando, tsc limpio.
- Verificado en vivo (ruta devtest temporal, sin necesitar cuentas — ver
  patrón ya usado para DateField en Fase 3): B1.3 pre-filtra el picker a
  SOLO helicópteros contra el catálogo real; fila añadida con badges
  editables; toggle Mandatory/Preferred en vivo; ApproximateFilterSection
  colapsa automáticamente en cuanto se añade el primer requisito exacto.
  Cero errores de consola.
- grep confirma cero imports de constants/aircraftTypes.ts en
  new.tsx/edit.tsx. 74/74 tests, tsc limpio (cuenta actualizada tras la
  corrección de arriba).

### Migración 023 — normalización de aircraft_family en las 80 curadas (APLICADA 2026-07-22)
- Origen: el usuario auditó Supabase directamente y encontró que 72 de las
  80 filas curadas (migración 016) tienen `aircraft_family` en una
  convención distinta a las ~526 que la migración 020 insertó desde el
  JSON oficial — las curadas no llevan fabricante como prefijo de texto y
  usan nombres informales ("737 NG" vs "Boeing 737-600/700/800/900", "ATR
  42/72" vs "ATR 42-400/500/72-212A", "A109" vs "Agusta A109 Series", "767"
  vs "Boeing 767-200/300/400"). Verificado independientemente aquí con un
  script ad-hoc: mismo resultado, 72/80.
- `supabase/migrations/023_normalize_curated_aircraft_family.sql`
  (**aplicada 2026-07-22 contra rotoaxismatch-dev, con tu OK**): UPDATE de
  `aircraft_family` en las 72 filas al valor oficial (leído de
  `scripts/data/easa_type_ratings_EDD2019-024R.json` por `easa_endorsement`
  — mismo campo/lógica que usa el generador de la 020, no una re-derivación
  nueva), lista fija de (id, valor) — mismo estilo que
  `KNOWN_ENDORSEMENT_DRIFT_FIXES` del generador. Re-backfill de las 3
  family keys de `offer_required_aircraft_types` (migración 022) que
  habrían quedado huérfanas.
- Informe completo (las 72 filas viejo→nuevo, las 3 keys viejo→nueva,
  revisión de otros sitios que persisten/comparan por aircraft_family):
  `docs/MIGRATION_023_FAMILY_NORMALIZATION_REPORT.md`.
- **Verificación post-aplicación (las 3 que pediste)**:
  1. El check exhaustivo de la propia migración (72 pares id+valor-viejo
     exactos, no una muestra) pasó dentro de la transacción — si no
     hubiera pasado, `apply_migration` habría fallado con la
     `RAISE EXCEPTION` y no habría quedado aplicada. Re-verificado además
     de forma independiente después, con una query aparte sobre los 8
     casos más ilustrativos (737 NG, ATR 42/72, A109, 767, AS350,
     AS350/H125, EC135/H135, S-76C): `still_old = 0`.
  2. Las 3 family keys re-backfilleadas SÍ resuelven contra la función
     real `getFamilies()` — no una comprobación manual: script aparte que
     carga el catálogo activo en vivo (misma query que
     `catalogRepository.getAircraftTypeRatings()`) y llama a
     `getFamilies()` de verdad.
     `Sikorsky::Sikorsky S-76C` → grupo "Sikorsky S-76C family" (1
     rating). `Airbus Helicopters::Eurocopter AS 350` → grupo "Eurocopter
     AS 350 family" (2 ratings: Arriel 1 + Arriel 2 — la fusión ...61/...62
     confirmada en vivo). `Airbus Helicopters::Eurocopter EC 135` → grupo
     "Eurocopter EC 135 family" (2 ratings: PW206 + Arrius 2B). Total de
     grupos: 541 → 538 tras la normalización (fusiones reales, no ruido).
  3. **El formato `Sikorsky::Sikorsky S-76C`** (manufacturer repetido
     dentro del propio string de family) es un formato de key ESPERADO,
     no un bug: pasa exactamente igual con `Airbus::Airbus A330`,
     `Boeing::Boeing 757-200/300`, etc. — la convención oficial EASA
     incluye el fabricante como prefijo de texto DENTRO de
     `aircraft_family`, mientras que la columna `manufacturer` lo guarda
     también por separado (para filtros/joins). `getAircraftFamilyKey()`
     concatena ambos sin deduplicar — no hay lógica que lo intente evitar,
     y no hace falta: la key sigue siendo única y estable, solo se ve
     repetitiva al leerla. No se muestra nunca al usuario final —
     `displayName` (lo que se ve en el chip, p. ej. "Sikorsky S-76C
     family") no lo hereda.
- Efecto colateral real, no solo relabeling: ids ...61 ("AS350") y ...62
  ("AS350/H125") — hoy fragmentadas en 2 grupos por una inconsistencia
  puramente de naming curado — se fusionan correctamente en 1 familia
  ("Eurocopter AS 350") tras la normalización.
- El solape ceo/neo de A320 (documentado arriba, 2026-07-22) NO cambia con
  esta migración — es el propio endorsement EASA, no una curación mía; no
  se inventa ninguna partición nueva para separarlo.
- Otros sitios revisados (grep + information_schema.columns): ningún otro
  lugar persiste una copia de `aircraft_family` aparte de
  `offer_required_aircraft_types` (ya cubierto). `v2CompatAdapters.ts` y
  `technician/profile.tsx` lo derivan en memoria en cada lectura — se
  autocorrigen solos, sin backfill.
- Caso real para tu validación (mismo patrón throwaway, bajo mi empresa
  191cf5a7 per la regla nueva):
  - Oferta: "DEMO Fase3b screen1 — offer form redesign", id
    21ab10b6-8cb8-4595-8e16-6017c554d4c2, draft, empresa Airbus.
  - Ya tiene: 1 requisito exacto (B1.1 + Airbus A320 family — CFM56,
    mandatory) + 2 licencias amplias (B1.2, B2).
  - Al abrir su Edit: deberías ver la fila exacta precargada con sus
    badges, y "Approximate filter" YA colapsado mostrando "2 selected —
    not used for scoring while exact requirements are set".
  - Para probar el flujo desde cero: Offers → New Offer, con cualquier
    categoría (prueba con una de A3/A4/B1.3/B1.4 para ver el pre-filtro a
    helicópteros).
  - Pendiente de limpiar cuando la valides.
- **Pantalla 1: validada por ti (2026-07-22).**

### Pantalla 2 — perfil de técnico (VALIDADA por ti, 2026-07-22)
- Rama part66-phase3. `src/components/technician/HabilitationsEditor.tsx`
  (nuevo componente compartido, contraparte técnico de
  TypeRatingRequirementsEditor): mismo patrón que pantalla 1 — buscador +
  filas, chips solo para las categorías de licencia (conjunto cerrado de
  13), etiquetas siempre `displayName` del catálogo, categoryHint con
  pre-filtro + "Show all" (reusa `getCompatibleProductType()` de
  `licenseCategoryProductType.ts`, cero lógica nueva de mapeo — misma
  función que ya usaba TypeRatingRequirementsEditor, solo conectada aquí
  por primera vez).
- Combinación inusual, dos casos deliberadamente distintos: fila NUEVA →
  categoryHint oculta por defecto las ratings de productType incompatible
  (nunca bloqueo duro — mismo "ayuda, no jaula" de pantalla 1, "Show all"
  siempre disponible); fila EXISTENTE → nunca se oculta/edita/borra
  automáticamente, solo badge discreto `"Unusual combination for
  <license>"` vía `isUnusualCombination()` (nueva función pura,
  `licenseCategoryProductType.ts`, misma regla que `getCompatibleProductType()`
  — una sola definición, nunca dos que puedan divergir). Nunca adivina:
  B2/B2L/C/L y una rating sin productType poblado nunca se marcan.
- Vigencia (Fase 3) reubicada sin rediseño: mismos DateFields
  Issued/Expires + toggle Current/Not current, mismo shape de datos
  (`HabilitationRow` es byte-a-byte el `HabRow` de antes). `handleSave()`
  no se tocó — sigue llamando a
  `technicianRepositoryV2.replaceHabilitations()` sin cambios.
- 5 tests nuevos para `isUnusualCombination`. 79/79 pasando, tsc limpio.
  "License update plan" (4/4, `removeUnreferencedLicenses`) re-corridas
  sin tocar `technicianRepositoryV2.ts`.
- **Validada por ti en tu cuenta real (técnico T3FD8E0D5F,
  91c69d2c-0b7d-41a6-b658-c8f929d193b1), 2026-07-22 — 5 comprobaciones
  confirmadas**: hint en la fila incoherente, B1.3+H145 real limpia sin
  hint, pre-filtro B1.1/B1.3 con "Show all" funcionando, vigencia
  persistiendo tras guardar-recargar (probado con el botón Save real, no
  solo el devtest), estructura alineada con pantalla 1. La fila
  desechable B1.1+H145 (id regenerado a `d15aa176-...` tras tu propio
  guardado, ya que `replaceHabilitations()` reemplaza el set completo)
  fue eliminada tras tu validación; confirmado que tu fila real B1.3+H145
  (id regenerado a `9577a8e7-...` por el mismo motivo, `issued_at`
  2026-07-15 — la fecha que pusiste tú probando persistencia) quedó
  intacta y es la única habilitación de esa cuenta.
- Pantalla 3 (búsqueda) en curso — ver sección propia más abajo.

### Pantalla 3 — búsqueda de técnicos (COMPLETADA, validada por ti)
- `app/company/search.tsx` + `src/repositories/v2/technicianRepositoryV2.ts` +
  `src/state/useTechnicianSearch.ts` + `src/types/filters.ts`.
- **Nuevo componente compartido**: `src/components/AircraftFamilyPicker.tsx`
  — extraído del interior de `ApproximateFilterSection` (pantalla 1), que
  ahora lo consume en vez de tener su propia copia de la lógica
  tabs+buscador+resultados+chips. Mismas opciones, mismas etiquetas
  (`displayName` de familia vía `getFamilies()`), mismo comportamiento en
  las dos pantallas por construcción, no por convención — un solo sitio
  que puede tener un bug, no dos que puedan divergir. Verificado en vivo
  que la extracción no rompió pantalla 1 (regresión comprobada por
  captura) y que el componente funciona standalone.
- **Filtro de aeronave, antes inexistente de verdad**: la pantalla tenía un
  filtro "Aircraft category" (Any/Airplanes/Helicopters) que solo
  post-filtraba resultados EN EL CLIENTE contra `AIRPLANES`/`HELICOPTERS`
  (listas hardcodeadas de 33 códigos, `constants/aircraftTypes.ts`) — el
  campo `filters.aircraftType` de verdad (el que sí viaja hasta
  `technicianRepositoryV2.search()`) no estaba conectado a ningún control
  en esta pantalla. Sustituido por una sección colapsada
  (`CollapsibleAircraftFilter`, local a este archivo) que muestra solo la
  selección activa ("Any aircraft" / "N familias seleccionadas") y al
  expandir monta `AircraftFamilyPicker` — mismo patrón colapsado que
  pantalla 1 establece para mapa/búsqueda.
- **Filtrado real, no solo visual**: `TechnicianFilters.aircraftFamilyKeys?:
  string[]` (nuevo campo; `aircraftType` queda `@deprecated` sin uso) viaja
  hasta `technicianRepositoryV2.search()`, que ahora compara por family key
  con OR entre las seleccionadas —
  `habilitationCoversFamilyKey()` (nueva, en este repositorio) es la MISMA
  regla que `evaluateLegacyBroadMatch` de `offerMatchExplain.ts`: familia
  exacta vía rating resuelta, o código legacy resuelto de forma inclusiva
  (`resolveLegacyCodeToFamilyKeys`) — una sola definición reutilizada, no
  una tercera copia.
- **Grep de cero listas hardcodeadas en esta pantalla**: confirmado —
  `grep -n "aircraftTypes.ts|AIRCRAFT_TYPE_CATALOG|AIRPLANES|HELICOPTERS" app/company/search.tsx`
  sin resultados. El import completo de `constants/aircraftTypes.ts`
  (`AIRPLANES`, `HELICOPTERS`, `inferAircraftCategory`, `AircraftCategory`)
  se eliminó de la pantalla.
- **Tarjetas de resultado**:
  - Renombrado "Aircraft" → "Type ratings" (alineado con el renombrado ya
    hecho en `company/offers/[id].tsx` — mismo criterio, nunca dos
    etiquetas distintas para el mismo concepto).
  - Las etiquetas ahora son `displayName` de cada rating exacta
    (`resolveTypeRatingLabels()`, nueva función local), no family/código
    legacy vía `habilitationAircraftCodes()` (que se dejó intacta —
    la usan otras 2 pantallas no auditadas hoy, `AdminTechnicianCard` y
    `company/offers/[id].tsx`, fuera de alcance).
  - Badge Airplane/Helicopter/Mixed re-derivado del `productType` real del
    catálogo (`resolveTechnicianProductTypes()`, nueva función local) en
    vez de `inferAircraftCategory()` (heurística sobre los 33 códigos
    legacy) — nunca adivina: una habilitación sin rating resuelta o con
    `productType` sin poblar no cuenta.
  - Chips de licencia: quitado un `.slice(0, 8)` que truncaba a 8 de las
    13 categorías sin motivo aparente — ahora se muestran las 13, igual
    que pantallas 1-2.
- Verificado en vivo (ruta devtest): `AircraftFamilyPicker` standalone
  funciona (tab Helicopters, buscar "H145", seleccionar "Eurocopter
  MBB-BK 117 D2 family" → key `Airbus Helicopters::Eurocopter MBB-BK 117 D2`);
  la sección colapsada expande/colapsa correctamente; `ApproximateFilterSection`
  (pantalla 1) sigue funcionando igual tras la extracción. Cero errores de
  consola. 79/79 tests, tsc limpio.
- **No hizo falta dato throwaway nuevo**: tu técnico real T3FD8E0D5F
  (B1.3 + H145/BK117 D2, verificado en la pantalla 2) ya sirve como caso
  de prueba real para el filtro de búsqueda — buscar "H145" o "BK117"
  con licencia B1.3 debería devolverlo. No pude probar el flujo de
  búsqueda REAL de extremo a extremo (RLS bloquea `technician_habilitations`/
  `technician_profiles` sin sesión autenticada, ni siquiera de lectura) —
  pendiente de tu validación con tu cuenta de empresa real.
- Pantalla 4 (mapa) NO empezada — esperando tu OK de esta pantalla
  primero, según protocolo.

## Bug prioritario (independiente de la 3b): cuentas eliminadas seguían visibles/contactables

Diagnóstico tuyo, 2026-07-22 (verificado directamente en Supabase):
`delete-account` (Edge Function) anonimiza PII de `technician_profiles` y
pone `profiles.status='deleted'`, pero NINGÚN camino de lectura consultaba
`profiles.status` — `technician_public_view` (la fuente de búsqueda, mapa,
matching/candidatos de oferta y detalle de técnico) solo filtraba por
`is_active_user()`, que comprueba el status del SOLICITANTE (la empresa),
nunca el del técnico mostrado (`tp`). Un técnico borrado seguía apareciendo
íntegro, con `verification_status='verified'`, en todas partes.

### Inventario (rotoaxismatch-dev)
- `profiles.status`: 9 `active`, 1 `deleted`, 0 `blocked`/`suspended`/
  `pending_verification`.
- El único borrado: técnico `6146de18-5e8f-4d4a-8780-d42f1bf299c5`
  (anonymous_code `TF0E8866C8`) — sigue teniendo 3 `offer_requests`
  (todas `accepted`), 1 `offer_application` (`accepted`), 2
  `technician_habilitations`, 3 `technician_licenses`, 4 `chat_rooms`.
  Las 3 direct offers + la application están bajo tu propia empresa de
  pruebas (company_id `191cf5a7-...`, Airbus) — sirven de caso de
  validación real, sin necesitar dato throwaway nuevo.
- **Confirmado en vivo**: con una sesión de empresa activa simulada
  (`SET LOCAL request.jwt.claim.sub` dentro de una transacción con
  ROLLBACK, sin tocar datos), el técnico borrado SÍ aparecía en
  `technician_public_view` antes del fix (`deleted_tech_visible: 1`
  → tras aplicar la vista corregida dentro de la misma transacción de
  prueba: `0`). Un técnico activo real (T3FD8E0D5F) siguió visible en
  ambos casos — el fix no rompe nada.

### Corrección de alcance (2026-07-22, antes de aplicar)
La primera versión de esta migración usaba allow-list `status = 'active'`
únicamente — elegido vía pregunta explícita (AskUserQuestion, opción
"Allow-list: solo active" seleccionada por ti). El propio proceso de
pedirte el OK final sacó a la luz que esa restricción, aunque
literalmente elegida por ti, tenía una consecuencia de producto que
ninguno de los dos había verificado todavía: **comprobado en el código**
— `handle_new_user()` (migración 001) crea todo `profiles` nuevo sin
`status` explícito, así que toma el DEFAULT de columna,
`pending_verification`, para CUALQUIER alta (técnico o empresa).
`admin_update_technician_verification` (migración 010) es lo único que
mueve a un técnico de ahí: `verified→active`, `pending→pending_verification`
(no-op), `rejected→suspended`. Es decir, `pending_verification` no es un
paso transitorio del signup que se resuelve solo — es el estado normal e
indefinido de un técnico aún no verificado por un admin, y la vista de
HOY (con el bug) ya los muestra. Un allow-list de solo `active` los habría
hecho invisibles en búsqueda/mapa/matching hasta verificación — un cambio
de producto real, no solo un cierre de fallo de seguridad. Corregido antes
de aplicar nada: el allow-list final es `active` + `pending_verification`,
excluyendo solo `deleted`/`blocked`/`suspended`. Reverificado en vivo (misma
técnica de transacción+ROLLBACK, esta vez simulando también un técnico
puesto temporalmente en `pending_verification`): `deleted_tech_visible: 0`,
`pending_verification_tech_visible: 1` — el borrado sigue fuera, el no
verificado sigue dentro, exactamente como debía quedar.

### Fix — filtrado server-side (un solo punto)
`supabase/migrations/024_technician_public_view_excludes_inactive_profiles.sql`
(**aplicada 2026-07-22, con tu OK tras la corrección de arriba**): la vista
`technician_public_view` gana un JOIN a `profiles` y exige
`p.status IN ('active', 'pending_verification')` en el dueño del perfil
(`tp.user_id`), además de `is_active_user()` (el solicitante) que ya tenía.
Excluye `deleted`, `blocked` y `suspended` — cero coste extra hoy (0 filas
en esos 3 estados además del 1 deleted). Un solo sitio arreglado cubre
TODOS los lectores de la vista: `search()`, `getPublicProfiles()`
(matching/candidatos de oferta), `getSafeView`/`getViewForCompany`/
`getPublicWithRelations` (detalle de un técnico), y por tanto también el
mapa (que llama a `search({})` internamente). No toca:
- El propio acceso del técnico a su perfil (RLS `tp_select_own`, tabla
  directa, no esta vista) — irrelevante para uno ya borrado, su
  `auth.users` ya no existe.
- El panel de admin (`technicianRepositoryV2.getAll()`, `useAdminDashboard.ts`)
  — lee `technician_profiles` directamente bajo `is_admin()`, nunca por
  esta vista. Admins conservan visibilidad completa de cuentas borradas/
  bloqueadas para soporte/auditoría, sin cambio de código.
- El caso simétrico de empresa borrada (¿sigue un técnico viendo datos de
  una empresa eliminada?) — NO auditado, mismo patrón de bug es plausible,
  fuera de alcance de este arreglo, señalado aquí para no perderlo.

### Guard en acciones nuevas
`offerRequestRepository.create()` (crear direct offer): comprueba
`technicianRepositoryV2.getById()` antes de insertar — tras la migración
024, resuelve a `null` para un técnico borrado (mismo camino que ya usan
search/matching, no una segunda comprobación independiente que pudiera
divergir) → `Error('This technician profile is no longer available.')`.
`offer_applications` no necesita guard simétrico: las crea el propio
técnico (requiere su sesión autenticada, imposible tras borrarse).

### Registros históricos — "[Deleted user]", tarjeta desactivada, sin acciones
Aplicado en 4 pantallas (las que muestran relaciones YA aceptadas/con
historial, donde `techView`/`tech` ahora resuelve a `null` tras la 024):
- `app/company/applications/[id].tsx` y `app/company/applications/index.tsx`:
  panel/tarjeta "[Deleted user]" — sin Accept/Reject, sin documentos, sin
  desglose de match; la tarjeta de la lista queda atenuada (opacity) y el
  botón pasa de "Review" (acción) a "View" (neutro).
- `app/company/direct-offers/[id].tsx`: mismo patrón — panel dedicado sin
  identidad/documentos.
- `app/company/chats/index.tsx` y `app/company/chats/[id].tsx`: el nombre
  cae a "[Deleted user]" en vez de "Technician" genérico; el chat detail
  oculta la caja de enviar mensaje (no tiene sentido escribirle a alguien
  que no puede volver a autenticarse) y cambia el banner "Identity
  revealed" por un aviso de cuenta eliminada. El historial de mensajes
  se conserva íntegro en ambos casos — nunca se oculta ni se borra.
- **NO tocado, señalado explícitamente**: `app/company/offers/[id].tsx`
  (ranking de candidatos por oferta) no necesitaba cambio de UI — un
  técnico borrado ya no aparece ahí en absoluto tras el fix de la vista
  (es un listado de candidatos NUEVOS, no un registro histórico). Las
  pantallas del lado técnico (`app/technician/...`) no aplican — un
  técnico borrado nunca vuelve a autenticarse para verlas.
- Verificación: revisión de código + tsc limpio: no pude ejercitar estas
  4 pantallas con sesión real (mismo bloqueo de RLS que en pantalla 3) —
  pendiente de tu validación abriendo los registros reales listados en
  el inventario de arriba (empresa Airbus → Applications /
  Direct offers / Chats, técnico TF0E8866C8).

### Tests
No hay tests automatizados nuevos: la lógica central (la vista SQL) no es
testeable en el arnés ligero de `testMatching.ts` (sin conexión a BD por
diseño — ver cabecera de ese fichero) y `offerRequestRepository.create()`
no tenía cobertura de tests antes de este cambio tampoco (mismo patrón
que `matchesSearchFilters`, hueco preexistente, no introducido aquí).
Verificación real: la prueba en vivo con sesión simulada descrita arriba
(demuestra las dos direcciones: técnico borrado excluido, técnico activo
intacto) + revisión de código de los guards/pantallas + tsc limpio +
79/79 tests existentes sin romperse.

### Propuesta de anonimización más profunda (NO implementada)
`docs/DELETED_ACCOUNT_ANONYMIZATION_PROPOSAL.md` — documento de discusión
sobre qué más debería anonimizar `delete-account` en
`technician_profiles`/`technician_licenses`/`technician_habilitations`
(verification_status, ubicación, fechas de vigencia de cualificaciones)
para cumplir lo que la pantalla de borrado promete ("all personal
information"), con la tensión RGPD real (derecho al olvido vs.
obligaciones de trazabilidad regulatoria aeronáutica) expuesta sin
resolver. A retomar aparte, con calma.

### Pantalla 4 — mapa de técnicos (COMPLETADA, validada por ti, 2026-07-23)
- `app/map.tsx` + `src/state/useMapTechnicians.ts` +
  `src/components/TechnicianMap.native.tsx` +
  `src/components/TechnicianMapLeafletImpl.tsx` (dos implementaciones
  paralelas — WebView+HTML/Leaflet para móvil, react-leaflet JSX para web —
  mismo `TechnicianMapProps`, tratadas como una sola pantalla).
- **Filtro amplio, antes decorativo por partida doble**: el hook llamaba
  `technicianRepositoryV2.search({})` (sin filtros) y post-filtraba EN EL
  CLIENTE con una copia propia de `matchesAny` — mismo patrón de bug que
  pantalla 3, más una segunda copia de la lógica de comparación que podía
  divergir de la de `search()`. Corregido: `useMapTechnicians.ts` pasa los
  filtros reales (`licenseCodes`, `aircraftFamilyKeys`, `verificationStatuses`,
  `availabilityStatuses`) directamente a `technicianRepositoryV2.search()` —
  la MISMA función que ya usa `useTechnicianSearch.ts` (pantalla 3), no una
  tercera copia. `scoreMapMatch()` (solo para ordenar resultados, nunca
  mostrado en UI) se simplificó a "¿esta dimensión está activa?" en vez de
  re-verificar un match que `search()` ya garantiza — dejar la comparación
  vieja habría sido activamente incorrecta ahora (compara family keys contra
  strings legacy que nunca coinciden).
- **Listas hardcodeadas eliminadas**: las dos implementaciones tenían un
  grid de chips `AIRCRAFT_TYPES.map(...)` (33 códigos legacy,
  `constants/aircraftTypes.ts`) dentro del panel de filtros. Sustituido en
  ambas por `CollapsibleAircraftFilter` (nuevo componente compartido,
  `src/components/CollapsibleAircraftFilter.tsx` — sección colapsada que
  muestra solo la selección activa y monta `AircraftFamilyPicker` al
  expandir), ya usado por pantalla 3 — mismo patrón, mismo componente, no
  una reimplementación paralela.
- **Chips de filtro activo**: antes mostraban el código legacy tal cual
  (`label: value`); ahora resuelven `displayName` real vía un
  `familyByKey` construido con `getFamilies(ratings)` en el propio
  componente (verificado en vivo — ver más abajo, el chip mostró "Airbus
  A318/A319/A320/A321 family", no la key cruda `Airbus::A320`).
- **Pines/popups del mapa**: renombrado "Aircraft" → "Type ratings"
  (mismo criterio que pantallas 1-3). Las etiquetas ahora son `displayName`
  de cada rating exacta vía `resolveTypeRatingLabels()` (la misma función
  que pantalla 3, `v2CompatAdapters.ts` — no una cuarta copia), resueltas
  desde un nuevo campo `habilitationsById: Record<string,
  TechnicianHabilitation[]>` que `useMapTechnicians.ts` expone en paralelo
  a `technicians` (mismo fetch ya hecho, sin llamada extra) y que
  `app/map.tsx` pasa como prop nueva a `TechnicianMap`. Antes usaban
  `t.aircraftTypes` (family/código legacy aplanado, V1-compat).
- **`MapFilters.aircraftFamilyKeys?: string[]`** (nuevo campo;
  `aircraftTypes`/`aircraftType` quedan `@deprecated` sin uso, igual que
  `TechnicianFilters.aircraftType` en pantalla 3).
- **Técnicos eliminados — confirmado, no solo asumido por herencia**: el
  mapa ya no llama `search({})` sino `search()` con filtros reales, pero
  en ambos casos pasa por `technician_public_view` (la vista que arregló
  la migración 024), así que la exclusión aplica igual. Verificado en vivo
  contra rotoaxismatch-dev (lectura directa, sin necesitar transacción de
  prueba — el técnico ya está borrado de verdad):
  `technician_profiles`/`profiles` para `anonymous_code = 'TF0E8866C8'`
  devuelve `status: 'deleted'` con `user_id = e6f3be26-efa9-4fb7-b1ea-f22400ec358e`;
  la misma consulta contra `technician_public_view` devuelve cero filas.
  **Corrección (2026-07-23): no hay anomalía.** `6146de18-...` (anotado en
  el inventario de la sección del bug [Deleted] más arriba) es
  `technician_profiles.id`; `e6f3be26-...` (arriba) es su `user_id`
  (= `profiles.id`, la fila del email anonimizado) — dos columnas de la
  MISMA fila, no dos ids en conflicto. El inventario original citó una
  columna y esta verificación posterior citó la otra; sigue siendo el
  mismo y único técnico borrado, sin segundo borrado ni error de
  transcripción.
- **Verificado en vivo (ruta devtest temporal, sin necesitar cuentas)**:
  `TechnicianMap` renderizado directamente con props falsas (2 técnicos
  fake, catálogo REAL vía `catalogRepository.getAircraftTypeRatings()`) —
  bypassa Supabase auth/RLS por completo, igual que los devtest standalone
  de pantallas 1-3. Confirmado por captura: mapa con 2 pines, popup con
  "TYPE RATINGS" → "Airbus A320 family — CFM56" (no el código legacy fake
  que llevaba `t.aircraftTypes`), panel de filtros con sección "Aircraft
  type" colapsada ("Any aircraft"), expansión a tabs Airplanes/Helicopters
  + buscador, selección de A320 → chip "Airbus A318/A319/A320/A321 family"
  + badge "1" en el botón Filters. Cero errores de consola en las 4
  capturas. Esto ejercita el path WEB (`TechnicianMapLeafletImpl.tsx`,
  react-leaflet); el path NATIVO (`TechnicianMap.native.tsx`, WebView +
  HTML/JS inyectado) no se pudo renderizar en un dispositivo/simulador
  real — verificado por paridad de código (mismo cambio aplicado a ambos
  ficheros, mismo `familyByKey`/`ratingIndex`/`resolveTypeRatingLabels`,
  mismo renombrado de etiqueta) + tsc limpio, no por captura. El filtrado
  real end-to-end contra Supabase (RLS bloquea lectura de
  `technician_habilitations`/`technician_profiles` sin sesión de empresa
  autenticada, igual que en pantalla 3) queda pendiente de tu validación
  con tu cuenta real.
- 79/79 tests, tsc limpio.

## Fase 3b — cierre

### Estado: Fase 3 y Fase 3b COMPLETADAS y validadas en la app (2026-07-23)
Validadas por ti las 4 pantallas de la 3b (oferta, perfil de técnico,
búsqueda y mapa — la última, pantalla 4, validada el 2026-07-23, cierra la
fase). Fase 3 (vigencia) ya estaba validada previamente (ver sección
"Fase 3 — vigencia" arriba). Además del alcance planeado, esta rama dejó
estos extras:
- Migración 022 (family key sin FK legacy en
  `offer_required_aircraft_types`), 023 (normalización de
  `aircraft_family` en las 80 filas curadas) y 024 (`technician_public_view`
  excluye perfiles `deleted`/`blocked`/`suspended`) — las tres aplicadas
  contra rotoaxismatch-dev con tu OK.
- Filtro server-side real (no post-filtrado en cliente) por familia de
  aeronave en búsqueda (`app/company/search.tsx`) y en mapa (`app/map.tsx`),
  ambos vía `technicianRepositoryV2.search()`.
- Componentes compartidos extraídos: `AircraftFamilyPicker.tsx` y
  `CollapsibleAircraftFilter.tsx`, reusados por oferta/búsqueda/mapa en vez
  de tener cada pantalla su propia copia.
- Fix del bug de cuentas eliminadas (técnico borrado seguía visible/
  contactable en búsqueda, mapa, matching y candidatos de oferta) — ver
  sección "Bug prioritario" arriba.

Las 4 pantallas (oferta, perfil de técnico, búsqueda, mapa) comparten ahora
una sola fuente para el filtro/selector de aeronave: el catálogo real de
606 endorsements EASA (`aircraft_type_ratings`) vía `getFamilies()` /
`AircraftFamilyPicker` / `CollapsibleAircraftFilter`, con una sola regla de
comparación por familia (`getAircraftFamilyKey()` +
`resolveLegacyCodeToFamilyKeys()`) reutilizada por el matching
(`offerMatchExplain.ts`) y por el filtro amplio de búsqueda/mapa
(`technicianRepositoryV2.search()`). Cero implementaciones paralelas: cada
pieza (picker de familias, sección colapsada, resolución de labels
"Type ratings", regla de cobertura por familia) tiene un solo sitio dueño,
consumido por las 4 pantallas.

**Grep global de la fase** — cero listas de aeronaves hardcodeadas y cero
imports de `constants/aircraftTypes.ts` en las 4 pantallas de la 3b
(`app/company/offers/new.tsx`, `edit.tsx`, `app/company/search.tsx`,
`app/map.tsx` y sus componentes). Barrido de TODA la app (no solo las 4
pantallas), buscando tanto imports de `constants/aircraftTypes.ts` como
arrays de nombres de aeronave sueltos: quedan exactamente 3 consumidores
fuera de las 4 pantallas, los tres ya existentes antes de esta fase y
fuera de su alcance declarado:
1. `src/components/technician/HabilitationsEditor.tsx` (pantalla 2) —
   `AIRCRAFT_TYPE_CATALOG` usado SOLO para poner label a
   `LegacyHabilitationRow[]`, filas de datos viejas que todavía usan
   `aircraftTypeCode` (el código de la tabla de 33) en vez de
   `aircraftTypeRatingId` (la rating exacta de la 606) — visualización de
   histórico, de solo lectura, no un selector nuevo. Depende
   estructuralmente de que exista `aircraft_types`/su copia TS, así que cae
   dentro del alcance de eliminación de la Fase 5 por construcción.
2. `src/components/TechnicianFilters.tsx` — componente muerto, no
   importado por ninguna pantalla activa (confirmado, ver nota en pantalla
   3). No tocado, ya señalado para que la Fase 5 lo borre.
3. `app/technician/offers/index.tsx` (browsing de ofertas del técnico,
   FUERA de las 4 pantallas de la 3b) — `inferAircraftCategory`/
   `AircraftCategory` para el filtro de categoría amplia Airplane/
   Helicopter sobre `offer.requiredAircraftTypes`. Es una feature
   preexistente distinta (badge de categoría, no el selector/filtro de
   aeronave en sí) que esta fase nunca tuvo en su alcance de 4 pantallas —
   señalado aquí para que quede registrado antes del inventario de la
   Fase 5, no arreglado ahora.
- `src/data/technicians.json` (seeds legacy, `src/data/seeds/*`) también
  contiene nombres de aeronave hardcodeados pero es dato, no código, y
  CLAUDE.md ya documenta que nada bajo `src/`/`app/` lo lee — fuera de
  alcance por diseño, no una omisión de este grep.

**Tests**: 79/79 pasando, tsc limpio en las 4 pantallas + los componentes
compartidos.

**Validado por ti (2026-07-23)**: pantalla 4 confirmada en la app con tu
cuenta de empresa real — el filtro de aeronave del mapa reduce resultados
contra datos reales, y el técnico borrado (TF0E8866C8) no aparece pese a
tener direct offers `accepted` bajo tu empresa Airbus. Con esto, **la Fase
3b queda CERRADA.**

## Estado al 2026-07-26: bloque de hardening cerrado, Fase 4 cerrada, Fase 5.1 en checkpoint

### Bloque de hardening post-3b (2026-07-23/24)
- **Tests de flujos de escritura**: cobertura nueva para
  `src/utils/offerRelationStateMachine.ts` (antes cero tests pese a regir
  accept/reject/withdraw en offer_requests Y offer_applications). Al
  auditarlo, hueco real encontrado en `offerApplicationRepository.create()`
  — no comprobaba su propia tabla antes de insertar, solo la de direct
  offers. Verificado contra `docs/V2_S0B_H6_ONE_APPLICATION_PER_OFFER_REPORT.md`
  (2026-05-31): es una regresión de una regla YA decidida ("una aplicación
  por técnico y oferta, sea cual sea el estado, sin reaplicar") — el fix de
  UI de aquel informe (`canApply = !existingApp`) seguía intacto, solo el
  guard del repositorio se perdió al portar a Supabase real. Arreglado con
  `evaluateDirectOfferConflict`/`evaluateApplicationConflict`, funciones
  puras testeadas (17 tests nuevos).
- **Auditoría RLS por operación** (`docs/RLS_OPERATION_AUDIT_2026-07-23_REPORT.md`):
  inventario tabla por tabla, política por política, cruzado contra el
  código real. Hallazgo principal: `offers` no tenía política DELETE para
  la empresa propietaria, y `app/company/offers/[id].tsx` tenía (y tiene) un
  botón "Delete offer" real conectado a ella — RLS bloqueaba el borrado en
  silencio, 0 filas, sin error, la oferta reaparecía en la lista. Dos huecos
  más de la misma forma que `tl_update_own` (`technician_aircraft_experience`
  UPDATE, `documents` DELETE), ambos latentes. Migración 025 (las dos
  políticas latentes + fix del upsert de `user_consents` sin
  `ignoreDuplicates`) aplicada con tu OK.
- **Modelo de archive/delete seguro para ofertas** (`docs/OFFER_DELETE_SOFT_DELETE_PROPOSAL.md`,
  migración 026, aplicada con tu OK): `offers` gana el estado terminal
  `archived`; `offerRepository.delete()` decide antes de actuar — cero
  `offer_applications`/`offer_requests` → DELETE real; cualquiera existente
  → UPDATE a `archived`, nada más se toca (sin cascada, sin huérfanos). RLS
  `offers_delete_company` refuerza la misma regla en BD, con la misma
  condición de cero dependientes.
- **El propio arreglo del archive tenía un bug** (encontrado en tu re-test
  real en la app, no en revisión de código): `offerRepository.delete()`
  calculaba bien la rama pero nunca comprobaba que el DELETE/UPDATE
  afectara alguna fila — el mismo fallo silencioso (`error === null` no es
  prueba de nada) que todo este bloque existe para cerrar, reintroducido
  por mí en la misma feature. Corregido con `.select('id')` + error visible
  si vuelven 0 filas.
- **El crash de `companyId`/`technicianId` vacío — 3 veces antes de la raíz**:
  `SessionContext` resuelve `companyId`/`technicianId` con un fetch propio
  (`company_members`/`technician_profiles`), independiente del guard de auth
  que `CompanyLayout`/`TechnicianLayout` ya esperaban — una pantalla que
  carga datos nada más montarse puede leer el id como `''` y reventar contra
  el cast UUID de Postgres. Apareció en `company/offers/index.tsx`, luego
  `[id].tsx`, luego `useMapTechnicians.ts` — cada vez parcheado localmente,
  hasta que se pidió la raíz: inventario completo (28 consumidores de
  SessionContext, 18 sin ningún guard) + gatear ambos layouts también en
  `sessionLoading` (cierra los 15 anidados de una vez, sin tocarlos) + mover
  `app/map.tsx` → `app/company/map.tsx` (la única ruta fuera de ambos
  layouts). El blindaje de tipos (`T | null` en vez de `companyId: ''`), que
  haría esto imposible de reintroducir en una ruta futura, queda como tarea
  de Fase 5 (ver punto 5 de la sección Fase 5 arriba) — deliberadamente no
  hecho aquí.
- Efecto colateral encontrado y arreglado de paso: `app/_layout.tsx` seguía
  declarando `<Stack.Screen name="map">` en la raíz tras el movimiento del
  archivo — Metro lo avisaba en cada arranque (`WARN [Layout children]: No
  route named "map"`), quitado.

### Fase 4 — CERRADA (2026-07-23)
`canHold(licenseCode, scope)` + `HabilitationScope` implementados en
`src/utils/habilitationScope.ts` / `src/types/habilitationScope.ts` — unión
discriminada `exact_rating | manufacturer_subgroup | full_subgroup |
full_group`, las tres dimensiones (clase de aeronave, turbina/pistón, grupo
EASA), reutilizando `getCompatibleProductType()` de la 3b para la dimensión
de clase en vez de duplicarla. `EasaGroup` verificado contra los 5 valores
reales en `aircraft_type_ratings.easa_group` (1=278, 2a=28, 2b=21, 2c=8,
3=271 filas), no inventado. 15 tests nuevos. Confirmado por grep: cero
consumidores en `app/`/`src/` fuera de los propios ficheros nuevos y el test
— nada cableado a producción, tal como pedía el plan.

### Fase 5.1 — INVENTARIO, checkpoint alcanzado (2026-07-26)
Ver `docs/PHASE5_INVENTORY.md` completo. Resumen de una línea: la mayoría del
inventario confirma exactamente lo que el plan esperaba (habilitaciones
legacy: 0 filas que migrar hoy; `aircraft_types`: 3 consumidores ya
conocidos; seeds: 1 solo consumidor, `validateSeeds.js`), PERO dos ítems
(`c` — tipos `@deprecated` como `Technician`/`SafeTechnicianView`/`MatchRequest`,
y `f` — `AvailabilityStatus`/`.status`) resultaron ser funcionalidad V2 ACTIVA
mal etiquetada como legacy, no limpieza mecánica — requieren una decisión de
alcance antes de que la migración 027 o la sub-fase 5.3 toquen nada
relacionado. Parado en el checkpoint, esperando esa decisión.

### Decisiones del checkpoint 5.1 (2026-07-27)
1. **(c)** Aparcado como misión propia post-Fase-5 (ver "Backlog
   post-misión" abajo). Alcance de ESTA Fase 5, sub-fase 5.3: borrar solo
   c.1 (`ContractType` V1, `LEGACY_CONTRACT_TYPES`, `AIRCRAFT_TYPES`/
   `AircraftType` dentro de `aircraftTypes.ts`, `updateAircraftTypes()`) +
   migrar c.2 (`LegacyVerificationStatus`, 4 archivos admin) — NUNCA la
   eliminación completa de `Technician`/`SafeTechnicianView`/`MatchRequest`.
   Etiquetas `@deprecated` de estos tres YA corregidas en el código
   (2026-07-27, `src/types/technician.ts` y `src/types/matchRequest.ts`) a
   comentarios veraces que apuntan a esta misma sección, para que ningún
   inventario futuro los vuelva a marcar como borrables por error.
2. **(f)** El filtro de disponibilidad de 3 estados SE QUEDA — es producto
   (Fase 3b), no deuda. `AvailabilityStatus` re-etiquetado en el código
   (2026-07-27) como campo V2 legítimo, no `@deprecated`; documentado que
   `status` es la fuente de verdad y `immediately` su proyección derivada
   CON PÉRDIDA (`open_to_offers` y `unavailable` colapsan ambos a `false`).
   **El paso "Availability: status → immediately" del plan original de
   Fase 5 (sección "MIGRAR datos" arriba) queda ANULADO** — no se hace, no
   tiene sentido migrar hacia una representación que pierde información
   que la propia Fase 3b necesita.
3. **(h)** Los docs candidatos del inventario se archivan a
   `docs/archive/` en un commit único y reversible — **40 archivos, no 33**
   (el número de `docs/PHASE5_INVENTORY.md` era un conteo manual mal
   hecho, sobre todo en la serie `V2_S0B_H*`; recontado por exclusión
   contra la lista de "se queda" con `ls`+grep antes de mover nada, no
   vuelvas a fiarte del "33" en ningún inventario futuro).
   `DELETED_ACCOUNT_ANONYMIZATION_PROPOSAL.md` y
   `RLS_OPERATION_AUDIT_2026-07-23_REPORT.md` se quedan activos.
   `V2_S1_ADMIN_BOOTSTRAP_SQL.sql` se queda como referencia operativa.
   `OFFER_DELETE_SOFT_DELETE_PROPOSAL.md` corregido antes de archivar (su
   cabecera decía "migración 026 NOT yet applied", ya no es cierto). Al
   archivar, grep posterior encontró referencias de código a las rutas
   antiguas de 5 de estos docs — corregidas a `docs/archive/...` en
   `scripts/`, `src/constants/`, `src/repositories/v2/`, `src/types/`,
   `src/utils/`. Ese mismo grep tocó por error los comentarios de 3
   migraciones YA APLICADAS (016/019/020) — revertido antes de commitear;
   la regla de "nunca editar una migración aplicada" incluye sus
   comentarios, no solo el DDL.
4. **Extras aprobados para la migración 027**: índice único parcial en
   `technician_habilitations` (el hallazgo lateral del inventario, ítem a —
   la UNIQUE existente no cubre `aircraft_type_rating_id`, así que hoy nada
   a nivel de BD impide dos filas normalizadas duplicadas, aunque el editor
   ya lo bloquea del lado cliente). La 027 se escribe genérica/idempotente
   aunque hoy sean 0 filas a migrar — reutilizando
   `planLegacyAircraftRatingBackfill()`/`scripts/backfillLegacyAircraftRatings.ts`
   (ya existentes, Fase 3b) en vez de reimplementar la resolución en SQL.
   La cláusula de "aircraftTypeCode a auditoría/log" del plan original
   decae — las 2 únicas filas con código legacy hoy pertenecen a la cuenta
   ya borrada (TF0E8866C8), sin necesidad real de un log de auditoría para
   datos de una cuenta que ya no existe.

### Corrección del inventario 5.1 y migración 028 (2026-07-28)
Revisión externa (Codex/ChatGPT), verificada en vivo contra rotoaxismatch-dev.
**Dos afirmaciones del inventario 5.1 eran falsas** — corregidas en
`docs/PHASE5_INVENTORY.md` con el texto original tachado, no reescrito:

1. **`aircraft_types` tiene DOS FKs entrantes, no una**: además de
   `technician_habilitations.aircraft_type_code`, está
   `technician_aircraft_experience.aircraft_type_code`. La 028 que se había
   escrito sobre el inventario (retirando solo una) habría FALLADO.
2. **El "hallazgo lateral" del ítem (a) era falso**: el índice único parcial
   sobre `aircraft_type_rating_id` ya existía desde la 016
   (`uq_technician_habilitations_rating`). La 027, escrita creyendo el
   inventario, creó `uq_technician_habilitations_normalized` con definición
   idéntica — **hoy hay un índice duplicado aplicado en producción**. Lo
   retira la 028 (se conserva el de la 016).

**Causa común, documentada como post-mortem de método en
`docs/PHASE5_INVENTORY.md`**: consultas construidas desde la hipótesis en vez
de desde la pregunta — `conrelid` (¿a qué apunta esta tabla?) donde tocaba
`confrelid` (¿quién apunta a la que quiero borrar?), y `pg_constraint` donde
un `CREATE UNIQUE INDEX` no aparece nunca. Reglas adoptadas para el resto de
la misión: dirección entrante siempre antes de un DROP; cuatro catálogos
(`pg_constraint` + `pg_depend` + `pg_proc` + `pg_trigger`, y `pg_indexes`
aparte); el SQL ejecutado se pega literal en el inventario o la línea no
cuenta como verificada; un resultado vacío obliga a revisar la consulta antes
que la conclusión.

**Estado de la 028: APLICADA** contra rotoaxismatch-dev el 2026-07-28, tras el
checkpoint (`supabase/migrations/028_retire_aircraft_types_fks.sql`). La 028
previa de Codex nunca estuvo en el repo ni se aplicó — comprobado contra
`supabase_migrations.schema_migrations`, no contra los ficheros del repo
(última aplicada antes de esto = 027). Retira las 2 FKs + el índice
duplicado, con bloque de post-condiciones que revienta si queda alguna FK
entrante.

Verificación post-aplicación, ejecutada FUERA del propio bloque `DO` de la
migración (un `RAISE NOTICE` de la migración no es evidencia independiente de
sí misma):
- FKs entrantes a `aircraft_types`: **0** (`confrelid`, dirección entrante).
- Índices únicos parciales sobre `aircraft_type_rating_id` en
  `technician_habilitations`: **1** — `uq_technician_habilitations_rating`
  (016). `uq_technician_habilitations_normalized` (027) eliminado.
- Datos intactos: `aircraft_types` 33, `technician_habilitations` 5,
  `technician_aircraft_experience` 0. Resto de constraints de ambas tablas
  intactas (FKs a `technician_profiles`/`license_categories`/
  `aircraft_type_ratings`, CHECK dual, UNIQUE legacy, CHECK `value >= 0`).
- `npm run ts` limpio; `npm run test:matching` **124 passed, 0 failed**;
  `npm run validate:aircraft-ratings` PASS (606 filas, 0 warnings, 0 errors).

Lo que la 028 deliberadamente NO hizo, y dónde va cada pieza: ver la cadena
acordada abajo.

### Decisiones de producto y secuencia acordadas (2026-07-28, checkpoint 028)

**Cadena de retirada de `aircraft_types`, checkpoint en CADA migración:**
`028` (FKs + índice duplicado) → **cambios de código 5.3** → `029` (DROP de
`technician_habilitations.aircraft_type_code`) → `030` (DROP de la tabla
`aircraft_types`, **con dump previo**).
- La 029 no puede ir antes del cambio de código: 4 lectores de cliente vivos
  (`supabaseMappers.ts:253` — en la carga de TODO técnico —,
  `profile.tsx:249,288`, `scripts/backfillLegacyAircraftRatings.ts:71`).
- Al caer el CHECK dual con la columna, su reemplazo es
  `CHECK (aircraft_type_rating_id IS NOT NULL OR needs_review)`.
  **Nunca `NOT NULL` a secas** — una fila `needs_review = true` conserva
  `aircraft_type_rating_id` NULL a propósito (027).

**`technician_aircraft_experience` → opción A (retirar), APROBADA**, en
**sub-fase propia con checkpoint, DESPUÉS de la cadena de DROPs**. Motivo del
orden: toca scoring, y el scoring no se cuela en una migración de esquema.

**Principio de producto ya fijado para esa sub-fase — "la cualificación
puntúa, la experiencia informa":** los años totales de experiencia son un dato
**ÚNICAMENTE VISUAL, sin efecto en el scoring**, igual que los
`experienceYears` por habilitación desde la Fase 3
(`offerMatchExplain.ts:205-207` ya lo aplica a nivel de habilitación). El
detalle — redistribución de los pesos que hoy ocupa el componente `experience`
(10 pts con requisitos / 15 sin), qué pasa con "Minimum years of experience"
del formulario de oferta, la línea de completitud de perfil
`if (t.yearsExperience > 0) score += 10`, y de dónde sale el número visual —
lo especifica el usuario al arrancar la sub-fase. No improvisarlo.

**Norma de proyecto adoptada**: las cuatro reglas del post-mortem de método
(`docs/PHASE5_INVENTORY.md`) rigen para todo el proyecto, no solo para esta
misión. El índice duplicado se asume como fallo compartido: el inventario lo
afirmó mal y la aprobación de la 027 no preguntó si ya existía.

### Decisión 2026-07-28 — el catálogo viejo se va entero, sin compatibilidad

Decisión del usuario, en desarrollo y sin producción: **todo lo del catálogo
pre-Part-66 se retira sin caminos de compatibilidad**; se prefiere borrar datos
a mano antes que arrastrar código legacy. Verificado: las 5 habilitaciones de
`rotoaxismatch-dev` tienen `aircraft_type_rating_id`, cero filas huérfanas.

**La 029 NO lleva bloque `IF EXISTS`/`RAISE` de guarda** (opción (c) que yo
había recomendado). En su lugar:
`DROP COLUMN aircraft_type_code` + `ALTER COLUMN aircraft_type_rating_id SET
NOT NULL`. El propio `NOT NULL` falla nativamente si hubiera filas sin
resolver — misma protección, cero código a medida, y un invariante permanente
en vez de una comprobación de un solo uso. El CHECK dual
`chk_technician_habilitations_target` cae con la columna y **NO se sustituye**
por el CHECK con `needs_review`.

**`needs_review` se dropea en la misma 029.** Existía solo para marcar filas
legacy irresolubles, que ya no podrán existir. Revisado si había motivo para
conservarla: no lo hay — no es un estado de verificación general de
habilitaciones (eso vive en `verification_status` de perfiles/documentos), y
tras el `NOT NULL` ninguna ruta puede volver a ponerla a true.

**Se mantiene sin tocar** (es producto, no legacy): la rama amplia
`evaluateLegacyBroadMatch` con sus fracciones 0.57/0.29 y su
`BROAD_ONLY_CAP = 79`, y las bandas del CHECKPOINT 2.

**Cadena final**: cambios de código 5.3 → **029** (drop columna + NOT NULL +
drop `needs_review`) → **030** (drop tabla `aircraft_types`, con dump previo).
Checkpoint en cada migración.

#### 029 — APLICADA (2026-07-28)
`029_drop_legacy_aircraft_type_code`. Verificación INDEPENDIENTE, fuera del
bloque `DO` de la propia migración: `aircraft_type_code` **0 columnas** ·
`needs_review` **0 columnas** · `aircraft_type_rating_id.attnotnull` **true** ·
**5 filas, las 5 con rating** · CHECK dual `chk_technician_habilitations_target`
**0** (cayó con la columna, no se sustituyó) · UNIQUE legacy **0** ·
`uq_technician_habilitations_rating` **1** (ahora efectivo sobre toda la tabla).
`npm run ts` limpio · `npm run test:matching` **114 passed, 0 failed**.

**Atomicidad de `apply_migration`, comprobada empíricamente** (no supuesta):
una sonda desechable que creaba una tabla y luego hacía `RAISE EXCEPTION` dejó
`to_regclass` = NULL y cero filas en `schema_migrations` → el fichero va en
UNA transacción, todo o nada. Dato útil para la 030 y para cualquier migración
futura.

**Incidente sin consecuencias, anotado por si se repite**: el primer intento de
aplicar la 029 cerró el socket sin respuesta. Comprobado inmediatamente contra
`schema_migrations` en vez de asumir: no se había aplicado nada (última seguía
siendo la 028, ambas columnas en pie). El reintento, con la cabecera de
comentarios abreviada y el MISMO DDL, funcionó. Sospecha: tamaño del payload de
comentarios.

**Norma derivada**: las cabeceras de migración se mantienen CORTAS y la
narrativa vive en este mission doc, de forma que el `.sql` se envíe **idéntico
a como está en el repo**, sin versión abreviada aparte. Así se elimina de raíz
tanto el riesgo de payload como la deriva repo↔aplicado que hubo que anotar en
la 028 y la 029. Aplicado ya en la 030.

#### 030 — APLICADA (2026-07-28). Cadena cerrada.
Verificación INDEPENDIENTE, fuera del bloque `DO`: `to_regclass('public.aircraft_types')`
**NULL** · habilitaciones **5**, las 5 con rating · `aircraft_type_ratings`
**606** filas, 606 activas · FKs residuales a `aircraft_types` **0** ·
`technician_aircraft_experience` **0** filas (intacta) · `npm run ts` limpio ·
`test:matching` **114/114** · `validate:aircraft-ratings` PASS (80/80 ids base).
El `DROP` sin `CASCADE` pasó a la primera — nada dependía ya de la tabla.

**Catálogo pre-Part-66 retirado por completo**: 028 (FKs) → código 5.3 →
029 (columna + NOT NULL + needs_review) → 030 (tabla). El catálogo vivo es
`aircraft_type_ratings` (606 endorsements, migración 020) y es el único.

#### 030 — detalle de la migración
`supabase/migrations/030_drop_aircraft_types.sql`. Último eslabón de la cadena.

**Dump previo tomado antes de escribir la migración**:
`supabase/dumps/aircraft_types_2026-07-28.sql` — 33 INSERT (verificado contra
las 33 filas vivas) + `CREATE TABLE` + CHECK de `aircraft_category` + PK + las
dos políticas RLS (`cat_at_read`, `cat_at_admin`). Restaura la tabla completa
por sí solo. **No** recrea las FKs que apuntaban aquí (las retiró la 028, y
`technician_habilitations.aircraft_type_code` ya no existe tras la 029): es un
rescate de datos, no un rollback de la fase.

**`DROP TABLE` sin `CASCADE`, a propósito.** El modo por defecto (RESTRICT)
hace que Postgres se niegue si algo sigue dependiendo de la tabla y aborte la
transacción — misma filosofía que el `SET NOT NULL` de la 029: protección
nativa en vez de guarda a medida. Si alguna vez falla, la respuesta NO es
añadir `CASCADE`, es averiguar qué depende todavía (consulta por dirección
entrante) y retirarlo explícitamente en su propia migración.

### Fase 5.4 — BLINDAJE, hecha (2026-07-28)

`useCompanySession()`/`useTechnicianSession()`/`useAdminSession()` devuelven
ahora `T | null`. Las constantes `EMPTY_TECH`/`EMPTY_COMPANY`/`EMPTY_ADMIN`
—que rellenaban la sesión de cadenas vacías y **eran el bug**— están
eliminadas. `SessionContext` también devuelve `null` cuando el perfil
autenticado no tiene fila en `technician_profiles`/`company_members`, en vez de
fabricar una sesión con ids vacíos.

**El blindaje se demostró solo**: al cambiar el tipo, `tsc` marcó **42 errores
en exactamente los 27 consumidores** — sin buscarlos a mano. Al sustituir la
desestructuración por acceso opcional, afloraron **71** más, que son los puntos
donde un id sin resolver llegaba a una query. Todos reparados: **0 errores**.

Patrones aplicados, uniformes:
- **Carga** (`const load = useCallback`): `if (!id) return;` al principio. El
  `.finally(() => setLoading(false))` del efecto apaga el spinner, así que la
  pantalla cae en su **estado vacío** — ni crash ni spinner infinito.
  `useMapTechnicians` ya tenía este guard escrito a mano (una de las tres
  pantallas donde el crash se parcheó reactivamente); ahora el tipo lo obliga
  en vez de depender de que alguien se acuerde.
- **Acciones** (enviar mensaje/oferta, aplicar, retirar, guardar perfil):
  guard en el handler, la acción no se ejecuta sin sesión.
- **Permisos** (`companyPermissionsV2.ts`): las 7 funciones aceptan
  `CompanyMemberRole | undefined` y responden **fail-closed**. Esto es más
  seguro que lo anterior, no solo más tipado: antes una sesión sin resolver
  llegaba como `companyMemberRole: 'viewer'`, que es un **rol real**, y la UI
  concedía permisos de viewer a una sesión inexistente.
  `canManageCompanyMembers` es además un type guard (`role is 'admin'`), lo que
  evita recomprobar el undefined para indexar tablas de etiquetas.

Verificación: `npm run ts` **0 errores** · `npm run test:matching` **114/114** ·
`npx expo export --platform web` **51 rutas** empaquetadas sin fallo · grep de
centinelas (`technicianId: ''`, `EMPTY_*`…) sin ninguna ocurrencia en código,
solo en comentarios que explican por qué se fueron.

`useAdminSession()` se ha hecho nullable también, por coherencia: cero
consumidores hoy, pero dejar un `profileId: ''` vivo tras una fase cuyo objetivo
es justo eliminarlos habría sido incoherente.

#### Nota consciente — `technician_aircraft_experience.aircraft_type_code`
Al morir `aircraft_types`, esa columna queda como **texto libre sin referencia
a nada**. Es correcto y está decidido, no es un resto olvidado:
- Su FK cayó en la **028** (era la segunda de las dos que el inventario 5.1 se
  había dejado); desde entonces la columna ya no valida contra ningún catálogo.
- La tabla tiene **0 filas** y **ningún camino de escritura** en el código, así
  que no hay ningún valor que pueda quedar huérfano ni ninguna ruta que pueda
  escribir uno nuevo.
- **La tabla entera muere en la sub-fase de experiencia** (opción A aprobada:
  retirarla y rehacer el componente `experience` del score bajo el principio
  "la cualificación puntúa, la experiencia informa"), posterior a esta cadena
  de DROPs. La columna no sobrevive a esa sub-fase.
No añadir a la 030 ningún intento de limpiar esa columna por separado: sería
tocar la tabla de experiencia a medias, justo lo que se decidió no hacer dentro
de una migración de esquema.

#### Cambios de código 5.3 — HECHOS (2026-07-28)
14 ficheros. `npm run ts` limpio; `npm run test:matching` **114 passed, 0
failed** (eran 124: −11 tests de rutas borradas, +1 regresión nueva).

Retirado: el tier **T3 `related_legacy`** completo; `resolveLegacyCodeToFamilyKeys()`
y `ratingMatchesLegacyCode()` (`src/constants/aircraftTypeRatings.ts`, ambas
sin consumidores tras lo anterior — verificado por grep, no supuesto); la rama
de código legacy de `habilitationCoversFamilyKey()` en `offerMatchExplain.ts`
**y** en `technicianRepositoryV2.ts`; `aircraftTypeCode` y `needsReview` de
`TechnicianHabilitation`; su lectura en `supabaseMappers.ts` y
`app/technician/profile.tsx`; la sección de solo lectura "Legacy"/"Needs
review" y el tipo `LegacyHabilitationRow` de `HabilitationsEditor.tsx`;
`scripts/backfillLegacyAircraftRatings.ts` + `src/utils/aircraftRatingBackfillPlan.ts`
+ su entrada `backfill:aircraft-ratings` de `package.json`; y la exención que
`replaceHabilitations()` hacía para no borrar filas sin rating id.

Números verificados tras el cambio (fixtures aisladas, no la suite):

| Escenario | Total | Label |
|---|---|---|
| T1 exacto mandatory + perfil perfecto | **100** | Excellent match |
| Mandatory no exacto (T2) + perfil perfecto | **59** | Partial match |
| Cualificación cero + perfil perfecto | **39** | Weak match |
| Broad-only perfecto (rama amplia) | **79** | Strong match |

Escalera `applyScoreCeilings(100, …)`: ninguno 100 · broadOnly **79** ·
mandatoryUnmet **59** · zeroQualification **39** · broad+mandatory 59 · los
tres 39 (más restrictivo gana). Fronteras de `getMatchLabel`: 80 Excellent /
79 Strong / 60 Strong / 59 Partial / 40 Partial / 39 Weak — todo intacto.

Única diferencia de comportamiento, y es la buscada: una habilitación **sin**
`aircraft_type_rating_id` frente a un requisito exacto pasaba por T3 y sacaba
~75; ahora saca **39** (tope de cualificación cero). Una fila que no nombra
ninguna aeronave deja de ser evidencia. Ninguna fila de `rotoaxismatch-dev`
tiene esa forma, así que el cambio es teórico hoy y lo hace imposible mañana.

**Norma refinada (2026-07-28) — las migraciones NO llevan línea de estado.**
Ninguna migración escribe "Estado: aplicada / NO aplicada / CHECKPOINT" en su
cabecera. El estado de una migración vive en DOS sitios, ambos autoritativos:
`supabase_migrations.schema_migrations` (la verdad de la base) y este mission
doc (la narrativa). Nunca en el fichero .sql.

Motivo: la regla anterior era "nunca editar una migración aplicada, comentarios
incluidos", y una línea de estado dentro del fichero la pone en conflicto
consigo misma en cuanto la migración se aplica — o mientes en el repo o
incumples la regla. Se elimina la tentación en vez de admitir excepciones. La
cabecera de una migración describe **intención y razonamiento**, que no
caducan; el estado sí caduca, así que no va ahí.

Consecuencia práctica: la línea de estado que la 028 llegó a tener (editada una
vez tras aplicarla, con permiso explícito) es la ÚLTIMA. Retirada de su
cabecera al adoptar esta norma; su estado consta arriba en este documento y en
`schema_migrations`. La regla original ("nunca editar una migración aplicada,
comentarios incluidos") queda intacta y ya sin excepciones que gestionar.

**`technician_aircraft_experience` — inventariada, pendiente de decisión**
(`docs/PHASE5_INVENTORY.md` sección d-bis): 0 filas, 4 lecturas vivas, **cero
caminos de escritura** en todo el repo. Feature a medio construir sobre el
modelo pre-Part-66. Consecuencia real: el componente `experience` del match
score (10/15 pts) es inalcanzable siempre que una oferta pida
`minYearsExperience > 0`, y el `yearsExperience` que ven las empresas es
siempre 0. Tres opciones planteadas; recomendación (A) retirarla y rehacer ese
componente del score, en sub-fase propia con checkpoint — no dentro de la 028,
porque toca scoring.

### ⚠ HALLAZGO 2026-07-28 — PostgREST trunca a 1000 filas. Es un bug de correctitud, no de escalabilidad.

Origen: pregunta del usuario al revisar el hallazgo de que `search()` filtra en
JS. **Comprobado empíricamente**, no de memoria ni de documentación: tabla
sonda de 2500 filas creada en `rotoaxismatch-dev`, consultada con la anon key
contra el endpoint REST real, y retirada después.

```
Content-Range: 0-999/2500      → filas devueltas: 1000 (ids 1..1000)
```

**PostgREST corta en 1000 filas, en silencio.** Sin error, sin aviso: la
respuesta simplemente llega recortada y el cliente no tiene forma de saberlo si
no mira `Content-Range`. Nada en `src/` lo mira.

**Consecuencia**: cualquier `.select()` sin `.limit()`/`.range()` que devuelva
más de 1000 filas entrega un subconjunto arbitrario. Y si además se filtra en
JS **después**, el filtro se aplica sobre un recorte, no sobre el conjunto real
— resultados incorrectos que parecen correctos. Prioridad reclasificada: esto
no es limpieza de escalabilidad, es un bug latente de correctitud.

Sitios confirmados, por cercanía al límite:

1. **`catalogRepository.fetchActiveAircraftTypeRatings()` — el más urgente.**
   Sin `.limit()`, trae el catálogo entero: **606 filas activas hoy, el 61% del
   tope de 1000**. Es el catálogo que esta misma misión hizo crecer de 80 a
   606. Si supera 1000, se trunca en silencio: habría ratings que el técnico no
   puede seleccionar en su perfil ni la empresa exigir en una oferta, sin
   ningún error visible. Alimenta además la caché TTL compartida, así que el
   recorte se propagaría a toda la app.
2. **`technicianRepositoryV2.search()`** — `.select()` sin ningún filtro
   server-side, y los 8 filtros aplicados en JS después. Con >1000 técnicos,
   busca sobre un recorte arbitrario.
3. **`technicianRepositoryV2.getPublicProfiles()`** — solo filtra
   `verification_status` en servidor. Alimenta `getTechnicianMatchesForOffer()`,
   o sea la lista rankeada de CADA oferta. Con >1000 técnicos verificados, el
   ranking omite gente sin decirlo.

**Tarea de backlog — `search()`: filtros a server-side.** Alcance concreto:
los 8 predicados de `matchesSearchFilters()` en
`src/repositories/v2/technicianRepositoryV2.ts` pasan de JS a la consulta.
- Directos sobre columnas de `technician_public_view`: `technicianType`,
  `country`, `city` → `.eq()`; `verificationStatuses` → `.in()`.
- Sobre el JSONB `availability`: `availabilityStatuses` y `availableImmediately`
  → operadores JSON de PostgREST (`availability->>status=in.(...)`,
  `availability->>immediately=eq.true`).
- Los dos difíciles, que son los que justifican tratar esto como tarea propia y
  no como un rato: `licenseCodes` y `aircraftFamilyKeys` viven en tablas hijas
  (`technician_licenses`, `technician_habilitations`) y hoy se resuelven en JS
  con el índice de ratings cargado. Server-side requieren o bien exponer los
  agregados en la vista, o un RPC dedicado que reciba los filtros. La segunda
  probablemente sea la buena, porque `aircraftFamilyKeys` necesita resolver
  familia desde `aircraft_type_ratings`, que es un join, no un contains.
- Mismo tratamiento para `getPublicProfiles()`, que hoy solo filtra
  `verification_status`.

**Auditoría de `.select()` sin cota — HECHA (2026-07-28, Fase 5.6).**
Resultado: **8 consultas** sin `.eq()`/`.in()`/`.range()` que las acote, todas
del patrón `getAll()` y todas sobre tablas que crecen sin techo. Ninguna está
rota hoy (volumen de desarrollo), todas lo estarán con volumen real:

| Repositorio | Método | Tabla |
|---|---|---|
| `technicianRepositoryV2.ts:186` | `getAll()` | `technician_profiles` |
| `companyRepositoryV2.ts:32` | `getAll()` | `companies` |
| `offerRepository.ts:74` | `getAll()` | `offers` |
| `offerRepository.ts:267` | (conteo/ids) | `offers` |
| `offerRequestRepository.ts:15` | `getAll()` | `offer_requests` |
| `offerApplicationRepository.ts:14` | `getAll()` | `offer_applications` |
| `documentRepositoryV2.ts:10` | `getAll()` | `documents` |
| `chatRepository.ts:55` | `getAll()` | `chat_rooms` |

Alimentan sobre todo pantallas de admin (dashboard y listados). Tratamiento
por la norma de completitud: paginación explícita o aserción. Como son
listados navegables y no catálogos, la paginación con aviso es suficiente —
no necesitan la aserción dura que sí exige el catálogo de ratings.
**No se arreglan en la 5.6**: la 5.6 aplica solo la mitigación diferenciada
acordada para los tres casos críticos. Esto queda como tarea de backlog con
su alcance ya medido.

**Mitigación DIFERENCIADA por caso (decisión del usuario, 2026-07-28). No
aplicar la misma a los tres.**

- **Catálogo (`fetchActiveAircraftTypeRatings`)**: un aviso NO basta — un
  catálogo parcial es inservible, porque produce ratings que nadie puede
  seleccionar. Necesita **paginación completa**: traer páginas hasta agotar,
  no una ventana. Más una **aserción dura**: comparar lo traído contra un
  `count=exact` y **fallar ruidosamente** si no coinciden, en vez de poblar la
  caché con un catálogo incompleto. El fallo tiene que ocurrir **antes** de
  escribir la caché TTL: si no, el recorte se propaga durante toda la vida útil
  de la caché.
- **`search()` y `getPublicProfiles()`**: aquí sí vale `.range()` +
  `count=exact` + aviso como mitigación, pero es solo mitigación. El arreglo de
  fondo es llevar los filtros al servidor (tarea de backlog con alcance, abajo).

### NORMA DE PROYECTO — `tsc` verde NO cubre las consultas por string

**Toda retirada de tabla o de columna lleva un grep por el nombre LITERAL,
además de la comprobación de tipos.** `tsc` no ve dentro de
`supabase.from('nombre_tabla')` ni de `.select('col_a, col_b')`: son strings.
Una consulta a una tabla que ya no existe **compila, pasa los tests y revienta
en runtime**.

Origen (2026-07-28, sub-fase de experiencia): con `tsc` ya en 0 errores y los
114 tests en verde, un grep por `technician_aircraft_experience` encontró que
`app/technician/profile.tsx` **seguía consultando la tabla por nombre**. Habría
crasheado la pantalla de perfil del técnico en cuanto se aplicara la 031. La
red de tipos, que en la Fase 5.4 funcionó de maravilla para el blindaje de
sesión, aquí no podía ver nada.

Checklist para cualquier DROP de tabla/columna:
1. `tsc` en 0 (tipos).
2. **grep por el nombre literal de la tabla y de cada columna** sobre
   `app/`, `src/`, `scripts/` (strings).
3. Barrido entrante en los cuatro catálogos + `pg_indexes` (base de datos).
Las tres son redes distintas y ninguna cubre lo que cubren las otras.

### NORMA DE PROYECTO — completitud de las consultas

**Todo `.select()` sobre una tabla que pueda crecer lleva paginación explícita
o aserción de completitud.** Sin excepciones y sin juicio de volumen: *"en dev
caben"* NO es criterio — el tope de 1000 de PostgREST no avisa, y el volumen de
desarrollo no predice el de producción. Si una consulta puede devolver más
filas de las que trae, o pagina hasta agotar, o compara contra `count=exact` y
falla. Un tercer camino (traer una ventana y seguir como si fuera el total) es
el bug que esta norma existe para impedir.

### Sub-fase de experiencia — APLICADA (2026-07-28). 031 y 032 en verde.

**Principio de producto**: la cualificación puntúa, la experiencia informa y
filtra. El componente `experience` del score ya no existe.

**Pesos nuevos**: `QUALIFICATION` 15/45/20/15/5 = **100** (los 10 liberados
íntegros a habilitación, no repartidos con licencia: repartir habría reforzado
la señal débil de "tener la licencia sin el rating"). `NO_REQUIREMENTS`
30/30/15 = **75**, techo sin cambios.

**Bandas medidas tras el cambio**: 100 Excellent · 59 Partial · 39 Weak ·
79 Strong (broad-only) · 81 T2-preferred · 68 amplia-solo-categoría ·
75 sin requisitos. Escalera 100/79/59/39 y fronteras de label intactas.

**031** — `DROP TABLE technician_aircraft_experience` + `DROP TYPE
experience_unit`. La corrección del enum vino del usuario: la versión previa
lo daba por "tipo compartido", y era falso — verificado por dirección entrante
(pg_attribute + pg_proc + pg_type.typbasetype) que su único uso era la columna
`unit` de esa tabla. Dump previo:
`supabase/dumps/technician_aircraft_experience_2026-07-28.sql` (estructura +
enum + RLS; 0 filas, nunca las hubo).
Verificación independiente: tabla `null`, tipo `0`, habilitaciones **5/5 con
rating**, catálogo **606/606**.

**032** — `technician_profiles.years_experience` + la vista.
Verificación independiente: `is_nullable = YES`, `column_default = NULL`
(sin DEFAULT, deliberado), CHECK de rango presente, la vista expone la
columna, **5 gates `offer_accepted_between`** y la cláusula de la 024
literalmente intacta. **Comprobación funcional, no vacua**: hay un perfil
`deleted` real en la base — 5 activos visibles, **1 deleted excluido**.

**Tropiezo anotado**: el primer intento de la 032 falló con *"cannot change
name of view column"*. `CREATE OR REPLACE VIEW` solo permite AÑADIR columnas
al final, nunca insertarlas en medio. Rollback atómico confirmado (nada
aplicado) y `years_experience` movida al final del SELECT — el orden es
irrelevante porque `PUBLIC_SELECT` selecciona por nombre, y un DROP+CREATE
habría perdido los GRANT de la vista.

Código: `npm run ts` **0** · `test:matching` **114/114** ·
`validate:aircraft-ratings` PASS (606) · `expo export` **51 rutas**.

### Fase 5.6 — HECHA (2026-07-28). Mitigación diferenciada del tope de 1000.

**Catálogo (`fetchActiveAircraftTypeRatings`) — paginación completa + aserción
dura.** Pagina de 500 en 500 hasta agotar (cota de seguridad de 100 páginas
contra bucles infinitos por un bug del servidor, no como límite funcional),
compara lo traído contra `count: 'exact'` y **lanza** si no coinciden. El throw
ocurre ANTES de devolver, así que `createAircraftTypeRatingsCache` —que solo
escribe estado en la promesa resuelta— nunca llega a poblarse con un catálogo
parcial: o conserva el completo anterior o queda en `'error'`.

Detalle que no es cosmético: se añadió `.order('id')` como desempate final. Sin
un orden TOTAL, dos filas con la misma tupla de ordenación pueden repetirse o
saltarse entre páginas — el fallo clásico de paginar por offset.

Verificado contra la BD real, no solo compilado: **606 traídas = 606 de
`count_exact`, 606 ids únicos**, y repetido con páginas de 50 para forzar 13
vueltas — mismo total, sin duplicados ni saltos.

**`search()` y `getPublicProfiles()` — `.range()` + `count: 'exact'` + aviso.**
`warnIfTruncated()` emite un `console.warn` explícito cuando el total supera lo
traído, nombrando la tarea de backlog. Aquí NO se lanza, a propósito: dejar la
búsqueda inutilizable sería peor que devolver los primeros N avisando. Esa es
exactamente la diferencia con el catálogo — un catálogo parcial es inservible,
una búsqueda parcial sigue sirviendo. Es mitigación, no arreglo: el arreglo es
llevar los 8 filtros al servidor.

**Tercera red aplicada**: auditoría completa de `.select()` sin cota (tabla de
8 hallazgos arriba), inventariada con alcance y explícitamente NO arreglada en
esta sub-fase.

### Fase 5.7 — hallazgos de validación (2026-07-28)

**`Alert` de react-native-web es una función vacía** (`class Alert { static alert() {} }`).
34 llamadas en 15 ficheros: 4 confirmaciones destructivas ROTAS y 30 mensajes
de éxito/error TRAGADOS en web. Un fallo de red se veía igual que un éxito.
Sustituido por `src/utils/platformAlert.ts` (`notify` / `confirmAction`).
`confirmAction` devuelve promesa a propósito: el trabajo va DESPUÉS del await,
no en un `onPress` que en web nunca se ejecuta. En Android, `cancelable` +
`onDismiss` cierran el caso del botón atrás (antes: promesa colgada para
siempre), con doble-resolución protegida.

**Guards de la 5.4 revisados, los 12**: 9 son acciones de usuario y ahora
hablan; 3 son guards de carga y siguen mudos a propósito (no los dispara el
usuario, se reevalúan en cada render). Regla: *una acción que no puede
completarse tiene que decirlo; un guard de carga no*.

**Reactivación `withdrawn → pending` (migración 033, APLICADA)**. Retirarse no
veta: era efecto colateral de H6, no decisión. Se reactiva la MISMA fila
(UNIQUE intacto, historial conservado). `rejected` sigue terminal.
- **La regla vive en DOS sitios** y hubo que alinearlos explícitamente: la
  función de BD era genérica para las dos tablas, así que relajarla habilitaba
  también reactivar ofertas directas. Ahora **ambos lados reciben el tipo de
  relación**: reactivación SOLO en `offer_applications`, porque su UNIQUE es
  TOTAL y reactivar es la única vía; `offer_requests` tiene único PARCIAL y su
  camino es crear fila nueva — reactivar allí sería inalcanzable y chocaría con
  `uq_offer_requests_one_active`.
- La firma antigua de 2 argumentos se ELIMINA (`CREATE OR REPLACE` con distinta
  aridad crea sobrecarga, no sustituye) para que no quede la regla vieja
  accesible por otro camino.
- `identity_revealed`/`documents_unlocked` no hay que tocarlos: el trigger ya
  los pone a false en toda transición que no sea a `accepted`. Verificado
  contra los datos.

**Fallo silencioso al enviar oferta — causa real**: `/company/offers/[id]` YA
gateaba bien (sustituye el botón por "View application"). El agujero estaba en
**`/company/search.tsx`**, que solo miraba ofertas directas y no aplicaciones:
mostraba "Send offer" a un técnico que ya había aplicado, el repositorio lo
rechazaba y el Alert no-op ocultaba el motivo. Corregido — la tarjeta ahora
considera **ambos caminos** y etiqueta según cuál.

**Backlog añadido**: `application_reapplied` (con el hueco de notificaciones,
se hace entero o no se hace) · `<AlertHost>` para web (provider en layout raíz
+ registro de módulo; Modal para confirmar y toast para `notify` — los dos
caminos web funcionan hoy con `window.confirm`/`window.alert`, falta coherencia
visual).

#### ⚠ Backlog — pieza (iii): la regla CRUZADA no tiene respaldo en BD
**Estaba aprobada y la aplacé por mi cuenta al cerrar la 5.7; el usuario lo
aceptó pero dejó dicho que las decisiones de alcance se preguntan antes.**

El riesgo real, a la luz del propio hallazgo de esa sub-fase:

- Las reglas **intra-tabla** SÍ tienen respaldo en la base de datos:
  `offer_applications_technician_id_offer_id_key` (UNIQUE total) y
  `uq_offer_requests_one_active` (único parcial sobre estados activos).
  Una escritura por cualquier vía las respeta.
- La regla **CRUZADA** —no puede existir a la vez una aplicación activa y una
  oferta directa activa para el mismo par (técnico, oferta)— vive
  **exclusivamente en código de aplicación**: `evaluateDirectOfferConflict` /
  `evaluateApplicationConflict`, invocadas desde los repositorios.

Consecuencia: **cualquier escritura que no pase por los repositorios puede
crear el duplicado**. Un RPC de admin, un script de mantenimiento, una
corrección por SQL directo, o una pantalla futura que llame a Supabase sin
pasar por el repositorio. Hoy no hay duplicados (verificado: 0 pares), pero eso
lo garantiza la disciplina, no el motor.

Alcance de la tarea: trigger `BEFORE INSERT` (y `BEFORE UPDATE` a estado
activo) en ambas tablas que consulte la contraria, siguiendo el precedente que
ya existe (`assert_offer_relation_transition` + `handle_offer_relation_status_transition`).
Migración propia con checkpoint.

#### NORMA DE PROYECTO — una regla en dos sitios: barrera o spec declarada
Descubierto en la 5.7: `assertOfferRelationTransition` (TS) **no tiene ni un
call site en producción** — solo tests. Quien enforcea es el trigger de BD. Es
decir, el TS puede desviarse de la base de datos y **ningún test lo notaría**,
porque los tests comprueban el espejo contra sí mismo.

Cuando una regla viva en ambos lados, exactamente una de estas dos:
1. **El TS se cablea de verdad** (los repositorios lo invocan antes de
   escribir), y entonces es una barrera real y su test tiene sentido; o
2. **Se marca explícitamente como spec-only**, con la advertencia cruzada en
   ambos ficheros ("si cambias una, cambia la otra") — ya puesta en
   `offerRelationStateMachine.ts` y en la migración 033.

Lo que no vale es la tercera situación, que es la que teníamos: un espejo que
parece una barrera, con tests que dan confianza sobre algo que no se ejecuta.

**Propuesta pendiente de decisión — `validate:state-machine`.** Los tests
actuales de transiciones ejercitan el espejo TS, así que no pueden detectar la
deriva. Recomendación: NO moverlos a la BD (perderían el ser offline y rápidos),
sino **añadir un script de validación en vivo** siguiendo el patrón que el
proyecto ya tiene con `validate:aircraft-ratings` — offline para lo puro, en
vivo para los invariantes de base de datos.

La forma fuerte: exportar `ALLOWED_TRANSITIONS` como **única declaración**, y
que el script recorra la matriz completa (2 tipos × 5 estados × 5 estados = 50
combinaciones) llamando a `assert_offer_relation_transition` real y afirmando
que la BD coincide con la declaración en las 50. Eso convierte "dos
implementaciones que pueden divergir" en "una declaración + un enforcer, con
una prueba de que coinciden", y la deriva se vuelve imposible de introducir sin
que el script se ponga rojo.

---

# FASE 5 — COMPLETADA (2026-07-28)

Validada por el usuario en **web, iOS y Android**, incluido el descarte con
botón atrás en Android.

**Migraciones aplicadas en esta fase**: 028 (FKs entrantes a `aircraft_types`
+ índice duplicado) · 029 (drop `aircraft_type_code` + NOT NULL + drop
`needs_review`) · 030 (drop `aircraft_types`) · 031 (drop
`technician_aircraft_experience` + enum `experience_unit`) · 032
(`years_experience` + vista) · 033 (reactivación `withdrawn → pending`, solo
aplicaciones).

**Verificación final**: `npm run ts` 0 errores · `npm run test:matching`
**120/120** · `npm run validate:aircraft-ratings` PASS (606) ·
`npm run validate:state-machine` PASS (40/40) · `npx expo export --platform web`
51 rutas.

**El catálogo pre-Part-66 ha desaparecido por completo.** El único catálogo es
`aircraft_type_ratings` (606 endorsements EASA).

## `validate:state-machine` — el validador está validado

Recorre las **40 combinaciones** (2 tipos × 5 estados × 5 estados, menos las de
identidad) llamando a la función REAL de Postgres y comparándola con
`ALLOWED_TRANSITIONS`, que pasa a ser la **única declaración**.

Comprobado que detecta la deriva de verdad, no solo que pasa: inyectando una
divergencia deliberada (permitir en TS la reactivación de ofertas directas), el
script falló nombrando la combinación exacta, citando el mensaje de la propia
BD y apuntando al fichero y la migración a alinear. Revertido después.

Lleva además una guarda contra el falso verde: si la matriz declarada cambia de
tamaño, falla en vez de reportar "0 desajustes" sobre una matriz vacía.

## INVENTARIO — pares spec-TS / enforcer-BD con riesgo de deriva

Solo inventario, sin implementar. Ordenado por riesgo.

| # | Regla | Spec (TS) | Enforcer (BD) | Riesgo |
|---|---|---|---|---|
| 1 | **Gate de privacidad de identidad** | `privacyV2.ts` (`getTechnicianViewForCompany`) | `technician_public_view` + `offer_accepted_between()` | **MUY ALTO** |
| 2 | **Permisos por rol de empresa** | `companyPermissionsV2.ts` (6 funciones) | `can_act_for_company()`, `my_company_role()`, + lista inline en chat | **ALTO** |
| 3 | **Relación cruzada duplicada** | `evaluateDirectOfferConflict` / `evaluateApplicationConflict` | **NINGUNO** | **ALTO** |
| 4 | Visibilidad de oferta al técnico | `isOfferOpenForTechnicians()` | política SELECT de `offers` (`status='published' AND visible`) | MEDIO |
| 5 | Orden de fechas emisión/caducidad | `isValidDateOrder()` | **NINGUNO** (no hay CHECK) | MEDIO-BAJO |
| 6 | Borrado de licencias con dependientes | `planLicenseRemoval()` | `fk_technician_habilitations_license` | BAJO |
| 7 | Campos server-owned | los repos no los escriben | `force_offer_relation_defaults()` + migración 009 | BAJO |
| 8 | Transiciones de estado | `ALLOWED_TRANSITIONS` | `assert_offer_relation_transition()` | **CUBIERTO** (validate:state-machine) |

**#1 — COMPROBADO CAMPO POR CAMPO (2026-07-28). COINCIDEN, no hay fuga.**
Y en el proceso **corrijo mi propia evaluación**: lo había clasificado como
"MUY ALTO — filtra datos personales en silencio". **Eso era exagerado**, porque
lo dije sin trazar de dónde salen los datos.

Contraste de las 19 columnas de `technician_public_view` contra lo que
`getSafeTechnicianPreview()` excluye:

| Campo | SQL | TS (preview) | ¿Coincide? |
|---|---|---|---|
| `first_name` | GATED (`CASE WHEN offer_accepted_between`) | excluido | ✅ |
| `last_name` | GATED | excluido | ✅ |
| `email` | GATED | excluido | ✅ |
| `phone` | GATED | excluido | ✅ |
| `social_links` | GATED | excluido | ✅ |
| `birth_date` | **no existe como columna** (solo `compute_age`) | excluido, expone `age` derivada | ✅ (SQL más estricto) |
| documentos | no están en la vista | excluidos | ✅ |
| `profile_completeness` | público | no modelado en `SafeTechnicianPreview` | asimetría menor, no es identidad |
| las 13 restantes | públicas | incluidas | ✅ |

**Los 5 campos de identidad coinciden exactamente.**

**Por qué el riesgo es MENOR de lo que escribí**: RLS en `technician_profiles`
(la tabla privada) solo permite SELECT a `is_admin()` o al propio técnico
(`user_id = auth.uid()`). **Una empresa no puede leer la tabla privada en
absoluto.** Por eso `getWithRelations()` para un usuario de empresa siempre cae
al fallback `getPublicRow()` → la vista → el gate SQL. Es decir: **la base de
datos es el enforcer en TODOS los caminos**, y el gate de TypeScript
(`canRevealIdentity`) es una decisión de UI sobre datos que ya vienen filtrados.

Consecuencia: una divergencia del TS **no puede filtrar identidad** — fallaría
"hacia el lado cerrado" (una petición de más que devuelve nulls, o una empresa
viendo menos de lo que le corresponde). Eso es un bug funcional, no una fuga.
Riesgo real: **MEDIO**, no MUY ALTO. Reclasificado en el backlog.

El validador sigue mereciendo la pena, pero como **guarda de regresión sobre la
combinación RLS + vista** (que es lo que de verdad protege), no porque hoy haya
dos implementaciones compitiendo.

**#2 — coinciden HOY, verificado uno a uno.** `can_act_for_company()` es
literalmente `role IN ('admin','recruiter')`, así que las tres funciones
`canManageOffers`/`canSendDirectOffers`/`canReviewApplications` cuadran con las
políticas de `offers`/`offer_requests`/`offer_applications`; y
`canManageCompanySettings`/`canManageCompanyMembers` (solo admin) cuadran con
`my_company_role(...) = 'admin'`. Coinciden **por disciplina de mantenimiento,
no por construcción**. Matiz añadido: `canSendChatMessages` está expresada en
RLS como **lista de roles inline** (`mem.role IN (...)`) en vez de vía
`can_act_for_company()` — o sea, el mismo concepto tiene dos expresiones dentro
de la propia base de datos. Cambiar el helper no arrastraría el chat.

**#3** — ver la entrada de la pieza (iii) más arriba: las reglas intra-tabla
tienen respaldo en BD, la cruzada no.

**#5** — categoría distinta: no es divergencia entre dos implementaciones, es
**una spec sin enforcer**. Nada en la base impide guardar `expires_at`
anterior a `issued_at` por una vía que no sea el formulario.

Patrón aplicable a #1 y #2: el mismo de `validate:state-machine` — una
declaración única en TS y un script que la contrasta contra la BD en vivo. Para
#1 sería comprobar, con un par (empresa, técnico) sin aceptación y otro con
ella, que la vista devuelve exactamente los campos que el TS promete.

### Backlog post-misión — CONSOLIDADO Y ORDENADO POR PRIORIDAD

**P0 — riesgo de datos**
1. **Tope de 1000 filas de PostgREST** (Fase 5.6 dejó la mitigación; falta el
   fondo). El catálogo ya está protegido con paginación + aserción; pendientes
   `search()` y `getPublicProfiles()` — hoy solo avisan.
2. **Pieza (iii): trigger para la relación cruzada duplicada.** Cualquier
   escritura fuera de los repositorios puede crear el duplicado. Es el único
   invariante de relación SIN respaldo en base de datos.

**P1 — coherencia estructural**
3. `search()`: los 8 filtros a server-side (alcance detallado arriba; los
   difíciles son `licenseCodes` y `aircraftFamilyKeys`, probablemente un RPC).
4. **`validate:privacy-gate`** — guarda de regresión sobre la combinación
   RLS + vista (bajado de P0 tras comprobar que hoy coinciden y que la BD es el
   enforcer en todos los caminos). Mismo patrón que `validate:state-machine`:
   declaración única en TS de qué campos son de identidad, y el script
   comprueba contra la vista, con sesión de empresa CON y SIN aceptación, que
   los 5 vienen nulos en el primer caso y poblados en el segundo.
5. Verificar permisos TS↔RLS (#2 del inventario).
6. **Unificar la expresión de roles del chat en la propia BD.**
   `cm_msg_insert_company` lista los roles **inline**
   (`mem.role IN ('admin','recruiter')`) en vez de llamar a
   `can_act_for_company()`, que es exactamente esa misma condición. El mismo
   concepto tiene **dos expresiones dentro de la base de datos**: cambiar el
   helper NO arrastraría el chat, que se quedaría con la regla vieja en
   silencio. Es la misma clase de divergencia que la 033 vino a cerrar entre TS
   y BD, pero esta vez enteramente intra-BD.
7. Auditoría de los 8 `getAll()` sin cota (tabla arriba).

**P2 — producto y deuda conocida**
7. **V2 UI migration — retirar `v2CompatAdapters`** (varias pantallas grandes,
   tamaño comparable a la Fase 3b).
8. Notificaciones, incluido `application_reapplied` (entero o nada).
9. `<AlertHost>` para web: Modal para confirmar y toast para `notify`
   (funcionan ya con `window.confirm`/`window.alert`; falta coherencia visual).
10. Arnés de tests CLI local de Supabase (`supabase start`).

### Deduplicaciones cerradas antes de la auditoría (2026-07-28)

**Migración 034 — APLICADA.** `cm_msg_insert_company` delega en
`can_act_for_company()` en vez de listar los roles inline.

Equivalencia **probada, no argumentada**: la lista inline era **redundante**,
porque el mismo `WHERE` del `EXISTS` ya llamaba a
`can_act_for_company(cr.company_id)`, que es literalmente
`role IN ('admin','recruiter')` para ese usuario en esa empresa. Quitarla no
puede cambiar el resultado (admin/recruiter permitido antes y ahora; viewer y
no-miembro denegados antes y ahora). El único efecto es que `mem` deja de estar
filtrado por rol, y `mem` solo se usa para `sender_company_member_id = mem.id`
— seguro porque `company_members` tiene UNIQUE (company_id, user_id) **y**
UNIQUE (user_id), verificado en `pg_constraint`: un usuario tiene como máximo
UNA fila de membresía. Post-condición: la política ya no contiene lista de
roles, sigue llamando al helper (sin él sería MÁS permisiva) y conserva las
cuatro condiciones restantes. Verificado tras aplicar.

**Barrido de otras políticas RLS con conceptos inline** — un hallazgo más, NO
corregido por estar fuera del alcance aprobado:
- `user_consents: admin select` usa
  `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`,
  que es exactamente lo que hace el helper `is_admin()`. Equivalente hoy
  (`profiles_select_own` permite a cada usuario leer su propia fila), pero es
  la misma clase de duplicación. **Pendiente de decisión.**
- Las otras 4 políticas que mencionan `company_member_role`
  (`companies_update_own`, `cm_insert/update/delete_admin`) usan
  `my_company_role(...) = 'admin'`: llaman al helper y comparan. No es
  duplicación, es parametrización. Correctas.

**`habilitationCoversFamilyKey` — implementación única.** Estaba duplicada
literalmente (mismo cuerpo, 168 caracteres) en `offerMatchExplain.ts` y
`technicianRepositoryV2.ts`. Extraída a `constants/aircraftTypeRatings.ts`, que
es donde por contrato viven las funciones puras sobre el catálogo. Importan las
dos. Importa que sean una sola: el filtro amplio del scorer y el de búsqueda
del repositorio deben responder EXACTAMENTE lo mismo, o una empresa vería en la
búsqueda técnicos que el matching luego puntúa a cero.

**Migración 035 — APLICADA.** `user_consents: admin select` pasa a usar
`is_admin()` en vez de `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
AND role = 'admin')`.

**El motivo no es la duplicación, es un acoplamiento oculto entre políticas**
(lo señaló el usuario): `is_admin()` es `SECURITY DEFINER` y evalúa `profiles`
saltándose su RLS; la versión inline se ejecutaba con los permisos del
llamante y por tanto **dependía de que existiera `profiles_select_own`**.
Endurecer la RLS de `profiles` habría denegado admins aquí, **en silencio**, por
un cambio en otra tabla sin relación aparente.

Equivalencia, con precisión (a diferencia de la 034, aquí es CONDICIONAL y hay
que decirlo tal cual): **equivalente hoy** —`profiles_select_own` existe, así
que ambas formas responden igual en los tres casos posibles—, y **divergente
mañana a propósito**: si se endurece la RLS de `profiles`, la nueva versión
sigue reconociendo al admin y la vieja no. Eso es "más permisivo" solo en
apariencia; en realidad es "deja de romperse por un cambio no relacionado".

Barrido asociado: solo esa política consultaba `profiles` inline.
`profiles_select_same_company` consulta `company_members`, pero para responder
una pregunta distinta ("¿este perfil es miembro de mi empresa?"), no para
reimplementar un helper — correcta, no se toca. Post-condición de la 035:
**cero** políticas en todo el esquema consultan `profiles` inline. Verificado
tras aplicar, junto con **cero** listas de roles inline (herencia de la 034).

### NORMA DE PROYECTO — un detector no vale hasta que encuentra algo que sabes que está

**Antes de fiarte del "no he encontrado nada" de cualquier herramienta de
detección —`grep`, `ts-prune`, una consulta de catálogo, un script ad-hoc—,
comprueba que SÍ encuentra un caso que sabes que existe.** Si no tienes un
positivo conocido, fabrícalo: inyecta el defecto a propósito, confirma que la
herramienta lo caza, y revierte.

Origen (2026-07-28): el primer script de barrido de duplicados dijo "cero" y
era **falso**. Su extractor se rompía con firmas multilínea que contienen un
tipo objeto — en `h: { aircraftTypeRatingId?: string }` la llave abre y cierra
dentro de la firma, así que daba el cuerpo por terminado ahí (29 caracteres,
bajo el umbral, descartado). Solo se detectó porque el resultado contradecía un
duplicado ya conocido. Sin ese conocimiento previo, se habría reportado "no hay
duplicados" con una herramienta ciega.

Es la MISMA regla que se aplicó a `validate:state-machine` inyectándole una
deriva deliberada para comprobar que se ponía en rojo. Generalizada: un
detector sin positivo de control no aporta evidencia, aporta una sensación.

Complementa a la regla ya existente ("un resultado vacío obliga a verificar la
consulta antes que la conclusión"): aquella dice *desconfía del vacío*, ésta
dice *cómo desconfiar en concreto*.

### PARA EL PROMPT DE AUDITORÍA — cómo probar el gate de privacidad

El análisis estático dice que TS y SQL coinciden y que la BD es el enforcer.
**Eso no sustituye a la prueba en vivo**: hay que ejercitarlo con **sesiones
reales, desde los dos lados**.

**Caso 1 — empresa SIN oferta aceptada con ese técnico.** No debe ver NINGÚN
campo de identidad: ni en la UI (búsqueda, mapa, lista y detalle de
aplicaciones, detalle de oferta con técnicos rankeados), **ni en la respuesta
de red**.

> ⚠ **Falso positivo a no reportar**: la respuesta de red **SÍ contendrá las
> claves** `first_name`, `last_name`, `email`, `phone`, `social_links` — con
> valor **`null`**. Es correcto y es el diseño: `PUBLIC_SELECT` las pide y la
> vista las anula con `CASE WHEN`. Lo que hay que comprobar es que **el VALOR
> es null**, no que la clave no aparezca. Si aparece un valor real sin
> aceptación, ESO sí es la fuga.

**Caso 2 — empresa CON oferta aceptada (por cualquiera de los dos caminos:
oferta directa aceptada o aplicación aceptada).** Debe ver los 5 campos
poblados, y además solo los documentos con `status = 'verified'`.

**Caso 3 — el técnico sobre sí mismo.** Debe verse todo, sin depender de
ninguna aceptación.

**Caso 4 — cruzado.** Empresa A aceptada con el técnico; empresa B no. Con
sesión de B, los 5 campos deben venir nulos. `offer_accepted_between(cid, tid)`
está parametrizada por empresa, así que esto verifica que la aceptación no se
filtra entre empresas.

Comprobar también que **una empresa no puede leer `technician_profiles`
directamente** (la tabla privada): RLS solo la permite a `is_admin()` y al
propio técnico. Ese bloqueo es lo que hace que la BD sea el enforcer real en
todos los caminos, así que si se cayera, el gate de TypeScript pasaría a ser la
única barrera y el riesgo del inventario #1 subiría de golpe.

**P3 — regulatorio y retención**
11. Verificar `canHold()` contra el texto real de AMC 66.A.45 antes de
    cablearlo a nada (duda B2 sin motor, sigue abierta).
12. Retención RGPD más profunda en borrado de cuenta.

### Backlog post-misión (borrador — se consolida formalmente en la 5.5)
- **V2 UI migration — retire v2CompatAdapters** (añadido 2026-07-27,
  origen: checkpoint Fase 5.1, decisión sobre el hallazgo `c`/`f` de
  `docs/PHASE5_INVENTORY.md`). Migrar `app/technician/profile.tsx` (el
  formulario de perfil completo), las dos implementaciones del mapa
  (`TechnicianMap.native.tsx`/`TechnicianMapLeafletImpl.tsx`),
  `app/company/search.tsx`, `MatchRequestCard.tsx`, `RequestContactModal.tsx`,
  y los hooks `useCompanyDashboard.ts`/`useMapTechnicians.ts`/
  `useTechnicianSearch.ts`/`useTechnicianDashboard.ts`/`useAdminDashboard.ts`
  de los tipos V1-compat (`Technician`, `SafeTechnicianView`, `MatchRequest`/
  `MatchRequestStatus`) a los tipos V2 nativos
  (`TechnicianProfile`/`SafeTechnicianPreview`/`UnlockedTechnicianView`,
  `OfferRequest`/`OfferApplication`), permitiendo retirar
  `src/utils/v2CompatAdapters.ts` por completo. Anexo (inventario completo
  de consumidores, archivo por archivo): `docs/PHASE5_INVENTORY.md`
  sección c.3. Tamaño real: comparable a la propia Fase 3b (varias
  pantallas grandes, checkpoint pantalla a pantalla recomendado), no un
  cleanup de una sesión.
- Notificaciones (pendiente de detallar — mencionado como backlog en
  sesiones previas).
- Arnés de tests CLI local de Supabase (`supabase start`, ver
  [[project_part66_hardening]] en memoria — aprobado como primera tarea
  tras el cierre de esta misión).
- Retención RGPD más profunda en borrado de cuenta —
  `docs/DELETED_ACCOUNT_ANONYMIZATION_PROPOSAL.md`, sin resolver, tensión
  derecho al olvido vs. trazabilidad regulatoria aeronáutica.
- Verificar `canHold()` (Fase 4) contra el texto real de AMC 66.A.45 antes
  de cablearlo a ningún formulario/matching — la duda regulatoria abierta
  sobre B2 sin motor sigue sin resolver.

---

# TRIAJE POST-AUDITORÍA (2026-07-29)

Sobre `docs/FINAL_AUDIT_REPORT.md`. Cuatro tandas acordadas con el usuario.

## Tanda 1 — HECHA y verificada en vivo con sesiones reales

- **B2 (parcial) — edad fabricada.** `publicRowToPrivateCompat` rellenaba
  `birthDate: '1970-01-01'` y `getSafeTechnicianPreview` recalculaba desde ahí:
  **todas** las empresas veían 56 años en todos los técnicos, descartando la
  `age` real que la vista ya traía. Corregido llevando la edad derivada en
  servidor (`TechnicianProfile.age`) y haciendo que `calculateAge()` devuelva
  `undefined` en vez de inventar. Verificado en vivo: 27 y 29 años reales.
  La RETIRADA de la edad va aparte (ver Tanda 2 / migración 040).
- **I1 — family keys crudas en UI.** Las 4 pantallas mostraban
  `Airbus Helicopters::Eurocopter AS 350`. Nuevo dueño único
  `resolveFamilyKeyLabels()` en `aircraftTypeRatingViews.ts`. Contradecía la
  decisión registrada con la 023 ("la key no se muestra nunca al usuario final").
- **I3 — "Type ratings" sin motor.** `company/offers/[id].tsx` y
  `AdminTechnicianCard` usaban `habilitationAircraftCodes()` (familia suelta)
  bajo una etiqueta que promete célula+motor. Migrados a
  `resolveTypeRatingLabels()`. En admin las etiquetas se resuelven en
  `useAdminDashboard`, donde ya vive el catálogo — sin segunda carga.
- **B5 (UI) — lápidas moderables.** La cuenta borrada aparecía como "Verified"
  con botones activos. Ahora muestra badge "Deleted account", nota explicativa
  y CERO acciones. Hizo falta añadir `'deleted'` a `UserStatus` (TS), que
  faltaba pese a existir en el enum SQL y en los datos.

## Migraciones aplicadas en este triaje

- **037** — `admin_update_technician_verification` rechaza cuentas `deleted`.
  Antes, "Set pending" sobre una lápida la dejaba en `pending_verification`, que
  la 024 admite: el técnico borrado REAPARECÍA en búsqueda, mapa y ranking.
  Verificado: misma firma (1 sola, sin sobrecarga), y prueba funcional con
  sesión de admin simulada — `deleted` bloqueado, `rejected→suspended→verified`
  sigue permitido.
- **038** — las dos políticas de admin sobre `storage.objects` usan
  `is_admin()`. La post-condición de la 035 ("cero políticas consultan
  `profiles` inline") se había verificado sólo sobre el esquema `public`;
  `storage` quedó fuera. Rehecha en TODOS los esquemas, con positivo de control.
- **039** — la lápida se produce por trigger (`on_auth_user_deleted`,
  **AFTER DELETE** sobre `auth.users`), sea cual sea la vía de borrado.

### 039 — por qué AFTER y no BEFORE
La primera versión usaba BEFORE + una bandera transaccional
(`app.deleting_account`) para que `guard_company_last_admin` no abortara el
borrado del único admin. El usuario la rechazó: es una dependencia oculta y un
segundo modo del guard — el patrón que esta misión lleva eliminando. Con AFTER,
la condición es un HECHO verificable ("el usuario de auth ya no existe").

**Orden comprobado empíricamente antes de aplicar**, no por documentación:
sonda en transacción con rollback que crea un usuario desechable como único
admin, instala un AFTER DELETE y borra. Resultado:
`auth_row_presente_en_trigger=false`, `guard_ve_auth_user=AUSENTE -> deja
pasar`, `delete_company_members=OK sin bloqueo`. Rollback verificado.

**Reparto (no duplicación)**: el trigger es el único dueño de la anonimización
EN BD; `delete-account` (v4 desplegada, `verify_jwt` conservado) se queda con
autenticar al llamante, guard de último admin, Storage y `deleteUser()`. Cero
`.update(`/`.delete()` restantes en la función.

**Fuera del trigger a propósito**: el guard de último admin (regla de producto,
no invariante) y los ficheros de Storage (SQL no puede llamar a esa API). Un
borrado por el panel deja objetos huérfanos en el bucket: **aceptado y
documentado**; el script de detección va al backlog.

`validate:auth-hooks` (nuevo) comprueba que los DOS triggers sobre `auth.users`
siguen instalados — viven en un esquema que no controlamos y un upgrade de Auth
los borraría en silencio, rompiendo altas y borrados a la vez.

## ⚠ Etiqueta corregida — `user_consents` NO es un audit trail inmutable
La migración 015 lo afirma y es falso: `user_consents_user_id_fkey` es
`ON DELETE CASCADE`, así que borrar la cuenta DESTRUYE el consentimiento. Es
clase 4 de la taxonomía (etiqueta mentirosa). Como no se editan migraciones
aplicadas, la corrección vive en un `COMMENT ON TABLE` (039) y aquí. Qué hacer
al respecto se decide con la política de retención RGPD (junto a ofertas
archivadas y perfiles eliminados), no antes.

## 040 — la edad fuera del contrato público (APLICADA 2026-07-29)

Decisión del usuario: la edad es característica protegida en normativa laboral
europea; mostrarla al empleador durante el cribado es riesgo de discriminación
y es incoherente con anonimizar el nombre justo para reducir sesgo. No aporta
al cribado — licencias, type ratings y años de experiencia cubren lo relevante.
Se retira DEL TODO, no se gatea tras la aceptación.

Argumento que cerró la decisión: `app/privacy-policy.tsx:46` ya prometía que la
fecha de nacimiento se usa *"for age verification; not shared"*. Era **falso**.
Ahora es cierto.

**Orden expand-contract respetado**: el código dejó de leer `age` ANTES de la
migración (`PUBLIC_SELECT`, ambos mappers, `SafeTechnicianPreview`,
`TechnicianProfile.age`, `calculateAge()` eliminada, badge de UI retirado, más
los docstrings que habrían quedado mintiendo). Aplicar la migración primero
habría roto toda consulta a la vista.

**`DROP + CREATE`, no `CREATE OR REPLACE`**: éste sólo permite AÑADIR columnas
al final, nunca quitarlas (la 032 chocó con la misma restricción por el otro
lado). El DROP pierde los GRANT, así que se recrean explícitamente y la
post-condición los verifica — es justo el motivo por el que la 032 evitó el DROP.

**`compute_age()` retirada**: barrido por dirección ENTRANTE en siete catálogos
(`pg_rewrite`, `pg_proc.prosrc`, `pg_constraint`, `pg_attrdef`, `pg_indexes`,
`pg_trigger`, `pg_depend`) confirmó que su único consumidor era esta vista.
`DROP` sin `CASCADE`.

**Verificación INDEPENDIENTE, fuera del bloque de la migración**: columna `age`
**0** · `compute_age` **0** · GRANT SELECT recreados para `anon,authenticated,
service_role` · gates `offer_accepted_between` **5** · cláusula de la 024
intacta · `years_experience` y `profile_completeness` conservadas · 18 columnas
(antes 19).

**Gate EJERCITADO tras recrear la vista** (no sólo inspeccionado), con sesión de
empresa simulada: sin aceptación los 4 campos de identidad vienen `NULL`; con
aceptación vienen poblados; la lápida sigue invisible (0 filas). Confirmado
además en vivo desde la app: el `select=` ya no pide `age` y ninguna fila la
trae.

`tsc` 0 · `test:matching` 120/120 · `test:url-validation` PASS ·
`validate:aircraft-ratings` PASS (606) · `validate:state-machine` PASS ·
`validate:auth-hooks` PASS.


## 047 — una oferta es de aviones o de helicópteros (APLICADA 2026-08-10)

`offers.product_type` (NOT NULL, CHECK `'Aeroplane' | 'Helicopter'`) lo declara
la empresa en el PRIMER campo del formulario, siempre visible.

**El agujero que cierra**: el filtro de ratings se derivaba de la LICENCIA de
cada fila (`getCompatibleProductType`, `TypeRatingRequirementsEditor.tsx:63`), y
B2/B2L/C/L cubren ambos productos → **con B2 no se filtraba nada**. Por ahí
entraron ofertas tituladas "Helicópteros" con requisitos B1.1/B1.2. Ahora el
producto se declara una vez y acota las DOS listas (categorías ofrecidas y
catálogo del picker).

**Enforcement en el motor, no en la pantalla**: dos FK compuestas desde
`offer_required_habilitations`, cruzándose sobre su propia columna
`product_type` — `(offer_id, product_type) → offers` y
`(aircraft_type_rating_id, product_type) → aircraft_type_ratings`. La columna
hija no la elige el escritor, la hereda: `replaceRequiredHabilitations()` la LEE
de la oferta en vez de aceptarla como parámetro, para que no exista un segundo
valor posible. Requisitos previos: `aircraft_type_ratings.product_type` pasa a
NOT NULL (0 nulls verificados en las 606 filas) y las dos tablas padre reciben
UNIQUE `(id, product_type)` — una FK compuesta exige una única EXACTAMENTE sobre
las columnas referenciadas.

**Gas Airship queda fuera de las ofertas** (3 filas del catálogo, decisión
tomada): basta el CHECK de `offers`; la fila hija hereda ese valor por la
primera FK, así que la segunda nunca puede apuntar a un dirigible. Sin CHECK
propio en la tabla hija.

**`ON DELETE CASCADE` en `orh_matches_offer`**, igual que la FK simple sobre
`offer_id` que ya existía: sin él, la nueva FK habría bloqueado el DELETE real
de ofertas sin dependientes de `offerRepository.delete()`.

**Orden forzado por el motor**: cambiar `offers.product_type` con requisitos
vivos viola la FK — las filas salen primero y la columna cambia después, no hay
otro orden. `offerRepository.update()` lo hace explícitamente, acotado a un
cambio REAL de producto (guardar sin tocar el selector no borra nada), porque
`edit.tsx` llama a `update()` ANTES que a `replaceRequirements()`.

**Cambiar el producto con requisitos dentro**: creando, repinta sobre la marcha
sin aviso (nada está guardado); editando, `confirmAction` antes de limpiar y
cancelar deja el selector donde estaba (no se toca `form` hasta después del
await). Las licencias solo se caen si dejan de encajar — B2/B2L/C/L sobreviven
al cambio. El picker recibe un facet DURO (`lockedProductType`, sin "Show all"),
distinto del `categoryHint` blando del perfil del técnico: salirse aquí no es
improbable, es imposible de guardar.

**Restaurado** el filtro Airplanes/Helicopters y el badge por tarjeta en
`app/technician/offers/index.tsx` (el TODO de la línea 82), ya sobre
`offer.productType`: comparación directa contra la columna, sin resolver family
keys y sin estado `mixed` — la base garantiza un solo producto por oferta.

**Sin tocar**: el scorer (`product_type` restringe qué se puede pedir, no cómo
se puntúa) ni `requirement_level`, que cambia en Fase 6.

**Sin backfill**: `offers` y `offer_required_habilitations` vacías en dev
(verificado en vivo, 0 y 0). Las guardas de la migración abortan en vez de
inventar un valor si eso deja de ser cierto.

**Sonda en transacción con rollback** (7 casos, todos por control de flujo: un
caso que pasara habría lanzado su propio `FALLO` en vez de llegar al final):
positivo de control (rating de avión en oferta de aviones → aceptado) ·
helicóptero declarando `Aeroplane` → rechazado por `orh_matches_rating` ·
el mismo declarando `Helicopter` para esquivarlo → rechazado por
`orh_matches_offer` · UPDATE del producto con requisitos vivos → bloqueado ·
borrar requisitos y luego cambiar → OK · `Gas Airship` → CHECK · DELETE de
oferta con requisitos → CASCADE OK. Rollback confirmado (0 ofertas, 0 filas).

`tsc` 0 · `test:matching` 150/150 · `test:url-validation` PASS ·
`validate:state-machine` PASS.


## Fase 6 — Perfiles múltiples y ofertas sin licencia

Decidido el 10/08/2026. Va DESPUÉS de la migración 047 (offers.product_type).

> **Renumeración (10/08/2026)**: `offers.product_type` tenía reservado el 046 y
> pasa a ser la **047**. El 046 lo ocupa
> `046_technician_type_labels_drop_part66.sql`, aplicada ese mismo día junto con
> la 045: las etiquetas de `technician_types` dejan de nombrar el marco EASA
> (`'Mechanic (Part-66 A / B1)'` → `'Mechanic'`,
> `'Avionics Technician (Part-66 B2)'` → `'Avionics Technician'`). Salió del
> cambio de copy para admitir técnicos sin licencia EASA; eran el único
> Part-66 de cara al usuario que no vivía en el código.

### Técnico
- Varios tipos de perfil, sin restricción (se cae la regla licenciado /
  no licenciado: deja de ser propiedad del tipo y pasa a serlo de la persona)
- `technician_habilitations` NO se toca. `license_code` sigue NOT NULL y la
  invariante de misma fila intacta
- Tabla nueva de experiencia sin licencia: solo aeronave + años

### Oferta — orden del formulario
1. Tipos de perfil buscados (informativo, no condiciona el formulario)
2. ¿Necesita certificar trabajo? sí / no
3. ¿Aviones o helicópteros? (siempre se pregunta; acota 4 y 5)
4. Licencia — UNA sola por oferta
5. Aeronaves — las que hagan falta
6. ¿Basta con una, o hacen falta todas? Por defecto "basta con una",
   casilla pequeña. SUSTITUYE a mandatory / preferred, que desaparece.

Con licencia y sin licencia para el mismo puesto = dos ofertas separadas.
Anotado como mejora futura: botón "duplicar oferta".

### Scoring
- Con certificación → solo cuentan habilitaciones con licencia; una licencia
  caducada NO vale (hoy `evaluateVigencia` solo degrada — necesita regla propia)
- Sin certificación → cuentan habilitaciones y experiencia
- Tener licencia en una aeronave cuenta también como experiencia. Nunca al revés
- El tipo de perfil no puntúa ni filtra
- Sobrecualificado no penaliza
- Sin licencia en oferta que la exige → ZERO_QUALIFICATION_CAP (39), visible
  en el listado, no oculto
- HABILITATION_TIER_FRACTIONS (1 / 0,57 / 0) y los caps: sin tocar

### UI
- Crear oferta: los cambios repintan sobre la marcha, sin avisos
- Editar oferta: avisa antes de limpiar requisitos al cambiar 2 o 3

### Deuda a colapsar: los labels de tipo de técnico tienen DOS fuentes de verdad

Anotado el 10/08/2026, al aplicar la 046.

- `technician_types` en Postgres → lo que ve el **signup**
  (`useTechnicianTypes` en `src/auth/useCatalogOptions.ts` lee `label` directo
  de la tabla).
- `TECHNICIAN_TYPES` en `src/constants/technicianTypes.ts` → lo que ve **todo
  lo demás** (pantallas de empresa, admin, formularios de oferta, mensajes de
  error del matching).

Los dos catálogos ya habían divergido en silencio: `painter` era
`'Aircraft Painter'` en la base y `'Painter'` en TypeScript, y las dos filas
con Part-66 solo existían del lado Postgres — por eso el grep sobre `app/` y
`src/` no las encontró y el selector siguió diciendo Part-66 después de que el
resto del copy ya estuviera limpio.

El 10/08/2026 se alineó el TS a `'Aircraft Painter'`, con lo que las 6 filas
coinciden hoy en ambos sitios. **Eso no arregla el problema, lo esconde**: la
próxima edición de un label en un solo lado vuelve a abrir la brecha sin que
nada falle ni avise.

Fase 6 debe colapsarlo a UNA sola fuente. Es el momento natural, porque
`requiresLicense` desaparece del catálogo TS al caerse la regla licenciado /
no licenciado — el catálogo se queda con `code`, `label`, `isActive` y
`sortOrder`, es decir, exactamente las columnas que ya viven en la tabla.

### Pendiente de validar con usuarios reales
El buscador de aeronaves usa el catálogo de 606 endorsements EASA. Un jefe
de taller piensa "los A320 nuestros", no "Airbus A320 family — V2500".
Probar el formulario con jefes de mantenimiento reales antes de la siguiente
tanda de arquitectura.