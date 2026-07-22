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

### Pantalla 3 — búsqueda de técnicos (COMPLETADA, pendiente tu validación)
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

### Fix — filtrado server-side (un solo punto)
`supabase/migrations/024_technician_public_view_excludes_inactive_profiles.sql`
(**escrita, NO aplicada — pendiente tu OK**): la vista `technician_public_view`
gana un JOIN a `profiles` y exige `p.status = 'active'` en el dueño del
perfil (`tp.user_id`), además de `is_active_user()` (el solicitante) que
ya tenía. **Allow-list, no deny-list** (confirmado contigo): excluye
`deleted`, `blocked`, `suspended` y `pending_verification` de golpe —
mismo bug, mismo fix, cero coste extra hoy (0 filas en esos 3 estados
además de deleted). Un solo sitio arreglado cubre TODOS los lectores de
la vista: `search()`, `getPublicProfiles()` (matching/candidatos de
oferta), `getSafeView`/`getViewForCompany`/`getPublicWithRelations`
(detalle de un técnico), y por tanto también el mapa (que llama a
`search({})` internamente). No toca:
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
