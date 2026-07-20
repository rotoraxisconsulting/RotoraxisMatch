# Misión: coherencia total del modelo Part-66 en RotoraxisMatch

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
     offerMatchExplain.ts (T3 queda solo para habilitaciones needsReview,
     etiquetado)
   - aircraftTypeCode como campo activo (y su CHECK constraint dual)
   - aircraftTypes.ts (catálogo legacy de 33 códigos)
   - JSON seeds huérfanos de src/data/seeds/ confirmados sin consumidores
   - Docs obsoletos de docs/ → ARCHIVAR en docs/archive/, no borrar
   - ts-prune o similar para exports muertos
   - useTechnicianDashboard.updateProfile() — código muerto V1, cero call
     sites, eliminar
4. VERIFICAR: build limpio, tests pasando, grep de '@deprecated' y 'V1' a
   cero en src/, flujo completo (perfil → oferta → matching) funcionando
   con datos migrados.
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
- Pendiente en Fase 3: badge de caducada/no vigente en tarjetas (lado
  empresa) y en MatchExplanation; degradación leve en matching (nunca
  exclusión) cuando isCurrent=false o expiresAt pasado; renombrado de UI
  ("Aircraft"→"Type ratings", etc.).
