// Pure, offer+technician matching logic — no Supabase/repository imports so
// it can be unit-tested without a database connection (see
// scripts/testMatching.ts).
//
// Core rule (fixes the false-combination bug): a category (license) and an
// aircraft/rating are only ever considered "matched together" when they come
// from the SAME technician_habilitations row. Holding a license and having
// some unrelated habilitation never counts as holding that license for that
// aircraft. See docs/archive/PART66_AIRCRAFT_MODEL_ANALYSIS.md section 6 for the
// original bug report.
//
// Business principle (see CLAUDE.md "Backend / data model notes"): a
// technician who holds exactly what an offer requires must score clearly
// above one who does not, regardless of how good the rest of their profile
// looks — a missing required qualification is a legal blocker, not a minor
// preference gap. Four mechanisms enforce this, applied after the raw
// breakdown is summed:
//   - an offer that requires ALL its listed aircraft (requiresAllAircraft)
//     with any of them unmet at T1 caps the total at
//     INCOMPLETE_AIRCRAFT_SET_CAP (stays in the "Partial" label range at
//     most);
//   - a qualification-requiring offer where the technician scores zero on the
//     axis THE OFFER ASKED FOR (the aircraft when it names one, the license
//     when it names only that — Fase 9) caps the total further, at
//     ZERO_QUALIFICATION_CAP (stays "Weak" — verified/availability/location
//     alone can never manufacture a "Partial" result out of zero real
//     qualification).
//   - a different declared profile type is a strong but SOFT mismatch: it
//     caps the score at PROFILE_TYPE_MISMATCH_CAP while keeping the offer
//     selectable and the percentage visible;
//   - a hard disqualifier (currently fewer declared years than the offer's
//     minimum) caps it at BLOCKER_CAP and is surfaced separately from soft
//     mismatches. See the ceiling ladder below.
//
// ratingIndex: the caller loads the aircraft_type_ratings catalog (via
// catalogRepository/useAircraftTypeRatingsCatalog) and builds the index with
// buildAircraftRatingIndex() BEFORE calling this function — matching never
// queries Supabase directly. An id missing from the index (e.g. a pending
// catalog request, never a real catalog row) simply resolves to no match,
// never a crash.
import { Offer, OfferRequiredHabilitation, OfferWithRequirements } from '../types/offer';
import { LicenseCode } from '../types/catalog';
import { TechnicianHabilitation, TechnicianLicense, TechnicianWithRelations } from '../types/technician';
import {
  MatchScore,
  MatchLabel,
  MatchLevel,
  MatchDisplayLabel,
  VigenciaNotice,
  GENERAL_COMPATIBILITY_LABEL,
} from '../types/matching';
import { TECHNICIAN_TYPES } from '../constants/technicianTypes';
import { AircraftRatingIndex, areRatingsRelated, getAircraftTypeRatingLabel } from '../constants/aircraftTypeRatings';
import { localDateToIso } from './dateField';

// ── EL BLOQUE DE CUALIFICACIÓN VALE SIEMPRE 65 ───────────────────────────
//
// Cuatro tablas, un solo principio: los 65 puntos de cualificación se reparten
// entre LOS EJES QUE LA OFERTA NOMBRE, y un eje que la oferta no ha pedido no
// descuenta nada.
//
//   la oferta nombra…    tabla                       65 repartidos así
//   licencia + aeronave  QUALIFICATION_WEIGHTS       45 habilitación + 20 licencia
//   sólo aeronave        NO_CERTIFICATION_WEIGHTS    65 habilitación
//   sólo licencia        LICENSE_ONLY_WEIGHTS        65 licencia
//   nada                 NO_REQUIREMENTS_WEIGHTS     no hay bloque → la escala baja a 75
//
// Las tres primeras topan en 100, y eso es lo que mantiene MONÓTONA la
// escalera de exigencia: cumplir todo lo que una oferta pide vale 100, pida
// mucho o pida poco. El técnico ve las ofertas en una lista con su porcentaje
// al lado, así que un techo estructural distinto por rama se leería como
// "encajo peor aquí" cuando lo único que cambia es la escala.
//
// El 75 de la cuarta es EL ÚNICO DESCENSO LEGÍTIMO de la escalera, y lo es
// porque allí no hay nada que confirmar: sin requisitos, ninguna señal dice
// que este técnico encaje en ESTA oferta, así que la calidad del perfil por sí
// sola nunca debe alcanzar "Excellent" (>=80).
//
// Cuando un eje sale del reparto, sus puntos van ÍNTEGROS al eje que la oferta
// SÍ nombra, nunca repartidos entre las señales sueltas (verificado, contrato,
// ubicación): ésas no son cualificación, y reforzarlas dejaría que un perfil
// genérico compensara justo lo que la oferta exige. Precedente doble — la
// retirada de `experience` (2026-07-28) y la Fase 6 tanda E.

// Licencia Y aeronave: el bloque se parte, y no a partes iguales — tener el
// rating de la aeronave es la señal fuerte, tener la categoría a secas la
// débil.
//
// ── Sub-fase de experiencia (2026-07-28) ──────────────────────────────
// El componente `experience` YA NO EXISTE. Principio de producto fijado por
// el usuario: **la cualificación puntúa, la experiencia informa y filtra**.
// Los años de experiencia son un dato visual y un FILTRO DURO server-side
// (offer.minYearsExperience contra technician_profiles.years_experience),
// nunca puntos.
//
// Los 10 puntos que liberaba van ÍNTEGROS a habilitación (35 → 45), no
// repartidos con licencia: el bloque de cualificación queda en 65 de
// cualquier forma, pero repartir habría reforzado la señal DÉBIL (tener la
// licencia sin el rating). Concentrarlos afila justo la discriminación que
// esta misión persigue.
const QUALIFICATION_WEIGHTS = { verified: 15, habilitation: 45, license: 20, contractFit: 15, location: 5 } as const;

// Fase 6 tanda E — ofertas que NO exigen certificar ("ayudante para el A320,
// sin licencia"). No hay licencia que puntuar (el CHECK de la 053 la fuerza a
// NULL), así que sus 20 puntos van ÍNTEGROS a habilitación: sin licencia, la
// AERONAVE es toda la cualificación que la oferta pide, y se lleva el bloque
// entero.
const NO_CERTIFICATION_WEIGHTS = { verified: 15, habilitation: 65, license: 0, contractFit: 15, location: 5 } as const;

// Fase 9 — el caso espejo del anterior, y el que faltaba: la oferta exige
// licencia pero NO nombra ninguna aeronave ("necesito un B1.1; la flota ya la
// verás"). Los 45 de habilitación van ÍNTEGROS a licencia, por el mismo motivo
// escrito en la tanda E — si la oferta sólo nombra una licencia, la licencia es
// toda la cualificación que pide.
//
// Antes de esta tabla la rama caía en QUALIFICATION_WEIGHTS y resolvía la fila
// de habilitación por el tier ancho (0,29 → 13 de 45): descontaba 32 puntos por
// una aeronave que la oferta nunca pidió. El candidato perfecto sacaba 68 y
// quedaba POR DEBAJO del 75 de una oferta que no pide nada — la escalera dejaba
// de ser monótona justo donde el técnico la lee, en su lista de ofertas.
const LICENSE_ONLY_WEIGHTS = { verified: 15, habilitation: 0, license: 65, contractFit: 15, location: 5 } as const;

// habilitation/license are always 0 here (never awarded, never penalized —
// see the no-requirements branch below) — kept as explicit fields rather
// than omitted so `weights` stays a single consistent shape instead of a
// union, which is both simpler to read and avoids TypeScript narrowing
// gymnastics at every access site.
//
// Suma 75, NO 100, y es deliberado: es el techo de la rama sin requisitos.
// Los 15 que liberaba `experience` se reparten DENTRO de ese techo
// (25/25/10 → 30/30/15), así que el máximo de esta rama no cambia.
const NO_REQUIREMENTS_WEIGHTS = { verified: 30, habilitation: 0, license: 0, contractFit: 30, location: 15 } as const;

export interface MatchScoreWeights {
  verified: number;
  habilitation: number;
  license: number;
  contractFit: number;
  location: number;
}

// Which weight set applies to a given offer, and therefore what each
// breakdown component's maximum actually is right now. Exported so UI that
// renders score.breakdown (e.g. the technician-match cards on the offer
// detail screen) can show real denominators instead of hardcoding them —
// hardcoded maximums silently drift out of sync whenever these weights
// change here.
export function getMatchScoreWeights(offer: OfferWithRequirements): MatchScoreWeights {
  // Fase 6 tanda D: `licenseCode != null` sustituye a
  // `requiredLicenses.length > 0`. Es la razón por la que la columna quedó
  // NULLABLE con un CHECK atado a `requiresCertification` (migración 053): si
  // fuera NOT NULL, TODA oferta tendría licencia, NO_REQUIREMENTS_WEIGHTS no
  // se aplicaría nunca y las ofertas sin certificar saltarían de la escala de
  // 75 a la de 100 — cambiar el scorer por la puerta de atrás.
  //
  // Fase 6 tanda E: tres ramas, no dos. Una oferta que no certifica PERO
  // nombra aeronaves sí tiene cualificación que pedir — sólo que no de papel.
  //
  // Fase 9: cuatro. La que faltaba es la simétrica de la anterior — exige
  // licencia y no nombra aeronave.
  if (!offerAsksForQualification(offer)) return NO_REQUIREMENTS_WEIGHTS;
  if (!offer.requiresCertification) return NO_CERTIFICATION_WEIGHTS;
  // `licenseCode != null` no es redundante con requiresCertification: el CHECK
  // de la 053 ata la licencia a la exigencia en la dirección que importa, pero
  // el scorer nunca da por hecho lo que la base garantiza. Sin licencia y con
  // aeronaves, la evaluación cae igualmente en el evaluador de conocimiento
  // (ver `evaluate` más abajo), así que esa combinación se queda donde estaba.
  if (offer.licenseCode != null && offer.requiredHabilitations.length === 0) return LICENSE_ONLY_WEIGHTS;
  return QUALIFICATION_WEIGHTS;
}

// ¿La oferta pide ALGO comprobable sobre la cualificación? Una licencia, una
// aeronave, o las dos. Si no pide nada, no hay nada que confirmar ni que
// penalizar y se cae en NO_REQUIREMENTS_WEIGHTS.
function offerAsksForQualification(offer: Pick<OfferWithRequirements, 'requiredHabilitations' | 'licenseCode'>): boolean {
  return offer.requiredHabilitations.length > 0 || offer.licenseCode != null;
}

// Within the habilitation budget: T1 (exact) gets the full amount; T2
// (same family, different engine) gets a smaller fraction — still real,
// still surfaced as a clarification, never silently equal to an exact
// match.
//
// Fase 5.3 (2026-07-28): T3 ('related_legacy' — a bare legacy
// aircraft_type_code resolving to the required family) is GONE with the
// pre-Part-66 aircraft_types catalog. It had exactly one input, that
// column, and migration 029 removes it; a habilitation now names an
// aircraft through the rating catalog or not at all.
const HABILITATION_TIER_FRACTIONS = { exact: 1, related_family: 0.57, not_met: 0 } as const;

// The license-category branch (evaluateLicenseCategoryMatch) keeps its own
// fraction: 0.29 when the technician holds a required license category and
// the offer never named a specific aircraft. Deliberately well below T2's
// 0.57 — holding a category confirms no aircraft experience whatsoever.
//
// Fase 5 (2026-08-04): this map used to carry a second entry,
// legacy_aircraft_confirmed (0.57), for an offer that required an aircraft
// FAMILY approximately. That requirement is gone with
// offer_required_aircraft_types, so the tier had no remaining input and was
// removed with it. 0.29 and BROAD_ONLY_CAP below are untouched.
const BROAD_TIER_FRACTIONS = { legacy_category_only: 0.29 } as const;

// Fase 3 — vigencia: a SLIGHT cut, applied on top of whichever tier fraction
// already applies, whenever the row that produced the winning match is
// expired or explicitly marked not current. Deliberately small — holding an
// expired-but-real qualification is not the same as not holding it (T1
// stays T1, missingRequirements is never triggered by this alone); it is a
// paperwork/renewal flag, not a disqualification.
const VIGENCIA_DEGRADATION_FRACTION = 0.1;

// Ladder of score ceilings, loosest to tightest — Fase 5.3 (2026-07-27),
// checkpoint-confirmed. Applied together via applyScoreCeilings() below,
// most-restrictive-wins by construction (sequential Math.min, order never
// matters): an exact match has no ceiling at all; anything else is capped
// at progressively lower labels the weaker the confirmed evidence is.
//
//   no ceiling      — exact (T1) match: a confirmed, same-row qualification.
//   BROAD_ONLY_CAP  — the requirement was only ever satisfied via the
//                     approximate broad license/aircraft filter
//                     (evaluateLegacyBroadMatch), never a confirmed exact
//                     rating — can never read as "Excellent" (>=80).
//   INCOMPLETE_AIRCRAFT_SET_CAP — la oferta declaró que hacen falta TODAS
//                     las aeronaves listadas (requiresAllAircraft) y alguna
//                     no se cumple en T1.
//                     Fase 6 tanda D: era MANDATORY_UNMET_CAP, disparado por
//                     una fila marcada `mandatory`. Mismo valor y misma
//                     posición en la escalera — lo único que cambia es de
//                     dónde sale el flag: de una etiqueta por fila que nadie
//                     entendía, a una decisión declarada de la oferta.
//   ZERO_QUALIFICATION_CAP — the offer asks for real qualification and the
//                     technician scored ZERO ON THE AXIS IT ASKED FOR —
//                     stricter than the two above, applies even for a
//                     preferred-only mismatch.
//                     Fase 9: qué eje es lo decide la oferta. Si nombra
//                     aeronave, la habilitación; si sólo nombra licencia, la
//                     licencia. Preguntar siempre por la habilitación tumbaba
//                     a TODA la rama de sólo-licencia, cuyo peso de
//                     habilitación es 0 por construcción.
//   PROFILE_TYPE_MISMATCH_CAP — the offer asks for a different trade than
//                     every type declared by the technician. This is a strong
//                     ranking penalty, NOT an eligibility blocker: the offer
//                     stays selectable and displays its low percentage.
//   BLOCKER_CAP     — a hard disqualifier applies (MatchScore.blockers), such
//                     as fewer declared years than the offer's stated
//                     minimum. A blocker is a different KIND of statement:
//                     this pair does not meet an explicit hard requirement.
// Fase 6 tanda E: AQUÍ VIVÍA `BROAD_ONLY_CAP = 79`, y se retira porque era
// INALCANZABLE — no por un cambio de criterio. El máximo bruto de la rama que
// lo alimentaba es 15 (verified) + round(45 × 0,29) = 13 + 20 (license) + 15
// (contractFit) + 5 (location) = 68, así que su `Math.min(total, 79)` nunca
// recortó nada en ninguna entrada posible. Retirarlo no mueve ni un score.
//
// La frase que se le atribuía —"sabes de la aeronave pero no lo has demostrado
// con papel"— no era suya: describe el tier `related_family` (0,57), que sí
// tiene esa semántica y sigue en pie.
//
// Si algún día sube `BROAD_TIER_FRACTIONS.legacy_category_only`, revisa si
// hace falta un techo para esa rama; hoy no lo hay porque no puede pasar de 68.
const INCOMPLETE_AIRCRAFT_SET_CAP = 59;
const ZERO_QUALIFICATION_CAP = 39;
const PROFILE_TYPE_MISMATCH_CAP = 19;
const BLOCKER_CAP = 19;

// Single place the whole ceiling ladder is combined — see the comment
// above for what each one means and why "most restrictive wins" needs no
// special-casing (Math.min chains regardless of which flags are true, or
// how many). Exported for direct testing of the combination itself,
// independent of whether today's branch structure can produce every
// combination in practice (see scripts/testMatching.ts).
export function applyScoreCeilings(
  total: number,
  flags: {
    hasIncompleteAircraftSet: boolean;
    isZeroQualification: boolean;
    hasProfileTypeMismatch: boolean;
    hasBlocker: boolean;
  },
): number {
  let capped = total;
  if (flags.hasIncompleteAircraftSet) capped = Math.min(capped, INCOMPLETE_AIRCRAFT_SET_CAP);
  if (flags.isZeroQualification) capped = Math.min(capped, ZERO_QUALIFICATION_CAP);
  if (flags.hasProfileTypeMismatch) capped = Math.min(capped, PROFILE_TYPE_MISMATCH_CAP);
  if (flags.hasBlocker) capped = Math.min(capped, BLOCKER_CAP);
  return capped;
}

// Profile-type explanations are read by a human (recruiter or technician),
// so they always name the type the way the rest of the product does — "Avionics
// Technician", never the raw `avionic` code. Falls back to the code only if
// a profile somehow carries a type absent from the catalog, which is a data
// problem to surface, never a reason to render nothing. `isActive` is
// deliberately not consulted: a type retired from the pickers must still
// label the rows already storing it.
function technicianTypeLabel(code: string): string {
  return TECHNICIAN_TYPES.find((t) => t.code === code)?.label ?? code;
}

type HabilitationTier = 'exact' | 'related_family' | 'not_met';

interface RequirementOutcome {
  tier: HabilitationTier;
  matchText?: string;
  clarificationText?: string;
  vigenciaDegraded?: boolean;
  vigenciaNotice?: VigenciaNotice;
  // Fase 6 tanda E: la cualificación EXISTE pero está caducada, en una oferta
  // que exige certificar. Se distingue de "no la tiene" porque el mensaje es
  // distinto y accionable — renovar, no formarse.
  expiredText?: string;
}

function toYearMonth(iso: string): string {
  return iso.slice(0, 7); // 'YYYY-MM-DD' -> 'YYYY-MM'
}

/**
 * Fase 6 tanda E — la vigencia deja de ser un solo booleano.
 *
 * `expired` (licencia o rating con fecha pasada) y `not_current` (el técnico
 * ha marcado a mano que hace tiempo que no lo toca) degradaban IGUAL hasta
 * ahora, y no son lo mismo:
 *
 *  - Una caducidad es un hecho REGISTRAL con fecha. En una oferta que exige
 *    certificar, no autoriza a firmar: cuenta como no tener la cualificación.
 *  - `isCurrent = false` es una AUTODECLARACIÓN en un campo opcional.
 *    Excluir por ella castigaría al técnico por ser honesto, que es
 *    justamente lo que el resto del modelo evita.
 *
 * Sin certificación las tres siguen degradando sin excluir: para trabajar de
 * ayudante la vigencia del papel no decide nada.
 */
type VigenciaOutcome = { kind: 'ok' | 'expired' | 'not_current'; notice?: VigenciaNotice };

// Fase 3 — vigencia. Checked against whichever row actually produced the
// match (T1/T2), plus the technician's own TechnicianLicense row for the
// same category (licenses have no isCurrent — only issued/expiresAt).
//
// Precedence (fixed by design, not incidental): an expired date ALWAYS wins
// over isCurrent, even isCurrent === true explicitly — the default true
// never rescues a rating past its expiry date. isCurrent === false only
// matters when the date is absent or still in the future (the "declared
// not current ahead of expiry" case) — its own distinct message, never
// combined with an "expired" one for the same row.
//
// A license-level expiry subsumes the row-level check entirely: it affects
// every habilitation declared under that category, and if the row is ALSO
// individually expired/not-current that would be a second, redundant
// notice about the same underlying fact — so license expiry always wins
// and produces exactly one notice, never two.
function evaluateVigencia(
  row: Pick<TechnicianHabilitation, 'expiresAt' | 'isCurrent'>,
  license: TechnicianLicense | undefined,
  licenseCode: string,
  ratingLabel: string,
  today: string,
): VigenciaOutcome {
  const licenseExpired = Boolean(license?.expiresAt && license.expiresAt < today);
  if (licenseExpired) {
    return {
      kind: 'expired',
      notice: {
        label: 'Expired',
        detail: `License ${licenseCode} expired ${toYearMonth(license!.expiresAt!)} — all its ratings affected, including ${ratingLabel}.`,
      },
    };
  }

  const rowExpired = Boolean(row.expiresAt && row.expiresAt < today);
  if (rowExpired) {
    return {
      kind: 'expired',
      notice: { label: 'Expired', detail: `Rating expired ${toYearMonth(row.expiresAt!)}: ${ratingLabel}.` },
    };
  }

  if (row.isCurrent === false) {
    return {
      kind: 'not_current',
      notice: { label: 'Not current', detail: `Rating marked as not current: ${ratingLabel}.` },
    };
  }

  return { kind: 'ok' };
}

// Fase 6 tanda D: la licencia ya no viene en `req` — es de la OFERTA, y se
// pasa aparte. El emparejamiento sigue siendo exactamente igual de estricto:
// se cruza contra las filas del técnico que tienen ESA licencia, nunca
// combinando un chequeo de licencia con otro de aeronave por separado.
function evaluateHabilitationRequirement(
  req: Pick<OfferRequiredHabilitation, 'aircraftTypeRatingId'>,
  offerLicenseCode: LicenseCode,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
  today: string,
): RequirementOutcome {
  const reqLabel = getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex);
  const rating = ratingIndex.get(req.aircraftTypeRatingId);
  const sameLicenseRows = technician.habilitations.filter((h) => h.licenseCode === offerLicenseCode);
  const license = technician.licenses.find((l) => l.licenseCode === offerLicenseCode);

  // T1 — exact: same license, same rating, in the same row. Deliberately
  // does not look at experienceYears — optional, informational only, never
  // a penalty (a rating endorsed with no declared experience is still a
  // full, legally valid match). isCurrent/expiresAt DO matter — see
  // evaluateVigencia — but only degrade the match slightly, never exclude
  // it: this stays tier 'exact' either way.
  //
  // TODO(open regulatory question, see mission brief): EASA AMC 66.A.45
  // may record some B2 endorsements without an engine designation. Not
  // special-cased here — would affect this tier and T2 below, and the
  // category pre-filter planned for a later phase.
  const exactRow = sameLicenseRows.find((h) => h.aircraftTypeRatingId === req.aircraftTypeRatingId);
  if (exactRow) {
    const vigencia = evaluateVigencia(exactRow, license, offerLicenseCode, reqLabel, today);
    // Fase 6 tanda E: una CADUCIDAD (licencia o rating) en una oferta que
    // exige certificar no es una degradación, es una descalificación —
    // legalmente no puede firmar ese trabajo. Cae a 'not_met', que arrastra
    // la habilitación a 0 y con ella el ZERO_QUALIFICATION_CAP (39).
    // `isCurrent = false` sigue degradando y nunca excluye.
    if (vigencia.kind === 'expired') {
      return { tier: 'not_met', expiredText: `${offerLicenseCode} + ${reqLabel}`, vigenciaNotice: vigencia.notice };
    }
    return {
      tier: 'exact',
      matchText: `${offerLicenseCode} + ${reqLabel}`,
      vigenciaDegraded: vigencia.kind === 'not_current',
      vigenciaNotice: vigencia.notice,
    };
  }

  // T2 — related_family: same license, a different rating in the same
  // aircraft family (same manufacturer, overlapping family), different
  // engine.
  const relatedRow = sameLicenseRows.find(
    (h): h is TechnicianHabilitation & { aircraftTypeRatingId: string } =>
      Boolean(h.aircraftTypeRatingId) && areRatingsRelated(h.aircraftTypeRatingId as string, req.aircraftTypeRatingId, ratingIndex),
  );
  if (relatedRow) {
    const heldLabel = getAircraftTypeRatingLabel(relatedRow.aircraftTypeRatingId, ratingIndex);
    const vigencia = evaluateVigencia(relatedRow, license, offerLicenseCode, heldLabel, today);
    if (vigencia.kind === 'expired') {
      return { tier: 'not_met', expiredText: `${offerLicenseCode} + ${heldLabel}`, vigenciaNotice: vigencia.notice };
    }
    return {
      tier: 'related_family',
      clarificationText: `Same family, different engine: ${reqLabel} vs ${heldLabel}.`,
      vigenciaDegraded: vigencia.kind === 'not_current',
      vigenciaNotice: vigencia.notice,
    };
  }

  // T3 used to sit here: a bare legacy aircraft_type_code resolving to the
  // required family, scored at 0.29 of the habilitation budget. Removed in
  // Fase 5.3 (2026-07-28) together with the pre-Part-66 aircraft_types
  // catalog — its only possible input was that column, which migration 029
  // drops. Nothing replaces it: a habilitation row either resolves to a
  // catalog rating (T1/T2) or contributes no aircraft evidence at all.
  //
  // Fase 6 tanda E: la rama SIN certificación no pasa por aquí — tiene su
  // propio evaluador (evaluateAircraftKnowledgeRequirement), porque su
  // pregunta es otra: no "¿puede firmar esto?" sino "¿ha trabajado en esto?".
  //
  // NOTE for anyone reading the original Fase 5 plan: its step 3 said "T3
  // stays, only for needsReview habilitations, labeled". That step is VOID
  // — a needsReview row had a NULL rating id AND (after 029) no code, so
  // there would be nothing left for T3 to match on. The needs_review column
  // goes with it. See docs/MISSION_PART66.md.

  // T3 — not_met (was T4 before the old T3 was removed above).
  return { tier: 'not_met' };
}

/**
 * Fase 6 tanda E — el evaluador de las ofertas que NO exigen certificar.
 *
 * Pregunta distinta, evidencia distinta: aquí no importa quién puede FIRMAR el
 * trabajo sino quién SABE HACERLO, así que cuentan las dos tablas.
 *
 * ── La regla "la licencia cuenta también como experiencia, nunca al revés" ──
 * Se aplica como UNIÓN DE CONJUNTOS sobre `aircraftTypeRatingId`, calculada
 * aquí en lectura y NUNCA persistida: las dos tablas apuntan al mismo catálogo
 * de ratings, así que una habilitación en el A320 ya demuestra experiencia en
 * el A320 sin copiar ninguna fila. Al revés no vale, y por eso este evaluador
 * no lo usa la rama que certifica.
 *
 * La licencia de la habilitación NO se mira: para trabajar de ayudante en un
 * A320 da igual bajo qué categoría lo tocaste. Eso no rompe la invariante de
 * misma fila — la invariante impide combinar "tiene B1.1" con "tiene A320"
 * para concluir "tiene B1.1 EN A320", una afirmación sobre certificación. Aquí
 * no se afirma nada sobre certificación: sólo que estuvo en ese avión.
 */
function evaluateAircraftKnowledgeRequirement(
  req: Pick<OfferRequiredHabilitation, 'aircraftTypeRatingId'>,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
  today: string,
): RequirementOutcome {
  const reqLabel = getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex);

  // T1 — la aeronave pedida está en la unión. Se busca PRIMERO en las
  // habilitaciones para poder arrastrar su vigencia (la experiencia declarada
  // no tiene fechas que degradar).
  const exactHab = technician.habilitations.find((h) => h.aircraftTypeRatingId === req.aircraftTypeRatingId);
  if (exactHab) {
    const license = technician.licenses.find((l) => l.licenseCode === exactHab.licenseCode);
    const vigencia = evaluateVigencia(exactHab, license, exactHab.licenseCode, reqLabel, today);
    // Sin certificación una caducidad NO excluye: degrada, como siempre. Para
    // trabajar de ayudante el papel vencido no borra la experiencia.
    return {
      tier: 'exact',
      matchText: `Worked on ${reqLabel}`,
      vigenciaDegraded: vigencia.kind !== 'ok',
      vigenciaNotice: vigencia.notice,
    };
  }

  const exactExperience = technician.aircraftExperience.find((e) => e.aircraftTypeRatingId === req.aircraftTypeRatingId);
  if (exactExperience) {
    return {
      tier: 'exact',
      matchText:
        exactExperience.years != null
          ? `Worked on ${reqLabel} — ${exactExperience.years} years declared`
          : `Worked on ${reqLabel}`,
    };
  }

  // T2 — misma familia, otro motor. Misma fracción (0,57) y mismo significado
  // que en la rama que certifica: evidencia real, nunca igual a la exacta.
  const relatedIds = [
    ...technician.habilitations.map((h) => h.aircraftTypeRatingId),
    ...technician.aircraftExperience.map((e) => e.aircraftTypeRatingId),
  ].filter((id): id is string => Boolean(id));
  const relatedId = relatedIds.find((id) => areRatingsRelated(id, req.aircraftTypeRatingId, ratingIndex));
  if (relatedId) {
    return {
      tier: 'related_family',
      clarificationText: `Same family, different engine: ${reqLabel} vs ${getAircraftTypeRatingLabel(relatedId, ratingIndex)}.`,
    };
  }

  return { tier: 'not_met' };
}

// The fallback branch, used only when an offer states NO exact
// category+rating requirement. Two outcomes:
//   - 'legacy_category_only': the technician holds one of the license
//     categories the offer asks for. Nothing here confirms they have ANY
//     relevant aircraft experience, only the category — so it scores at
//     0.29 (BROAD_TIER_FRACTIONS) and carries its own clarification.
//   - 'not_met': no evidence at all.
interface BroadOutcome {
  tier: 'legacy_category_only' | 'not_met';
  matchText?: string;
  clarificationText?: string;
}

// Fase 5 (2026-08-04) — this was evaluateLegacyBroadMatch, and it evaluated
// TWO independent offer-side sets: required licenses and required aircraft
// FAMILIES (offer_required_aircraft_types, the approximate filter). Its two
// aircraft-bearing branches — "license + aircraft satisfied by the SAME
// technician_habilitations row" and "aircraft only" — both scored
// 'legacy_aircraft_confirmed' at 0.57.
//
// With the approximate filter retired, an offer can no longer express an
// aircraft requirement approximately: aircraft is stated exactly, as a
// license+rating pair in requiredHabilitations, which is evaluated by
// evaluateHabilitationRequirement above and never reaches this function.
// Both branches lost their only input and went with it, along with the
// ratingIndex parameter they needed. What remains is purely a license-
// category check, hence the name.
//
// The same-row rule the deleted branch enforced is NOT lost — it lives on
// where it actually matters, in the exact path (see the "same row" contract
// in evaluateHabilitationRequirement and CLAUDE.md). Nothing here combines
// an independent license check with an independent aircraft check, because
// there is no aircraft check left to combine.
// Fase 6 tanda D: `offer.requiredLicenses` (array) pasó a `offer.licenseCode`
// (una sola, y ausente exactamente cuando la oferta no exige certificar).
// Esta rama pasa de residual a NORMAL: "exijo B1.1, me da igual la aeronave"
// es justo lo que la tanda hace fácil de expresar.
function evaluateLicenseCategoryMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
): BroadOutcome {
  const required = offer.licenseCode;
  if (!required) return { tier: 'not_met' };

  // The offer never asked for a specific aircraft, so there is nothing to
  // confirm beyond the license category itself — the technician could hold
  // this license with zero aircraft experience on record.
  const holds =
    technician.licenses.some((l) => l.licenseCode === required) ||
    technician.habilitations.some((h) => h.licenseCode === required);

  return holds
    ? {
        tier: 'legacy_category_only',
        matchText: 'Required license category present in profile',
        clarificationText: 'Category-only match — no specific aircraft requirement to verify.',
      }
    : { tier: 'not_met' };
}

const TIER_RANK: Record<HabilitationTier, number> = { not_met: 0, related_family: 1, exact: 2 };

function upgradeTier(current: HabilitationTier, next: HabilitationTier): HabilitationTier {
  return TIER_RANK[next] > TIER_RANK[current] ? next : current;
}

// A match score is always computed for a specific offer + technician pair.
// Never store this value on a technician_profile row.
//
// now: injectable "current time" for the vigencia (expired/not-current)
// check — defaults to the real clock. Tests pass a fixed Date so expired-
// vs-future fixtures are deterministic regardless of when they run (same
// dependency-injection style as aircraftTypeRatingsCache.ts).
export function calculateOfferTechnicianMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
  now: Date = new Date(),
): MatchScore {
  const hasQualificationRequirements = offerAsksForQualification(offer);
  const weights = getMatchScoreWeights(offer);
  const today = localDateToIso(now);

  let verified = 0;
  let habilitation = 0;
  let license = 0;
  let contractFit = 0;
  let location = 0;

  const matches: string[] = [];
  const clarifications: string[] = [];
  const vigenciaNotices: VigenciaNotice[] = [];
  const missingRequirements: string[] = [];
  const blockers: string[] = [];
  let profileTypeMismatch = false;
  let level: MatchLevel = 'not_met';

  if (technician.verificationStatus === 'verified') {
    verified = weights.verified;
    matches.push('Verified profile');
  }

  const offerLicenseCode = offer.licenseCode;

  if (offer.requiredHabilitations.length > 0) {
    // Fase 6 tanda E — LA FUENTE DE EVIDENCIA LA ELIGE LA OFERTA.
    //
    //   requiresCertification = true  -> sólo technician_habilitations, y sólo
    //     las de LA licencia de la oferta. La experiencia declarada no puntúa
    //     por mucha que sea: es un requisito legal, no una preferencia. Quien
    //     no puede firmar no sirve para el puesto, sepa lo que sepa.
    //
    //   requiresCertification = false -> habilitaciones Y experiencia
    //     declarada, en unión. La pregunta es si sabe hacer el trabajo.
    //
    // Es el interruptor que la tanda C dejó montado sin conectar.
    const evaluate = offer.requiresCertification && offerLicenseCode
      ? (req: OfferRequiredHabilitation) => evaluateHabilitationRequirement(req, offerLicenseCode, technician, ratingIndex, today)
      : (req: OfferRequiredHabilitation) => evaluateAircraftKnowledgeRequirement(req, technician, ratingIndex, today);

    //
    // Evaluated once up front (not inline in the loop below) so the
    // vigencia degradation can be scoped correctly: only the row(s) that
    // actually produced the WINNING tier should shave points off the
    // score, even though every degraded row's notice is still surfaced —
    // same "always show, only the best one scores" pattern T2
    // clarifications already follow.
    const evaluations = offer.requiredHabilitations.map((req) => ({ req, outcome: evaluate(req) }));

    let bestTier: HabilitationTier = 'not_met';
    for (const { outcome } of evaluations) {
      bestTier = upgradeTier(bestTier, outcome.tier);
    }
    const vigenciaDegraded = evaluations.some(({ outcome }) => outcome.tier === bestTier && outcome.vigenciaDegraded);

    // Fase 6 tanda D: `everyMandatoryExact` (por fila) pasa a
    // `everyAircraftExact` (por oferta). El cálculo es el mismo — "¿está
    // TODO cumplido en T1?" — pero ahora sólo importa cuando la oferta ha
    // declarado que hacen falta todas las aeronaves.
    let everyAircraftExact = true;

    for (const { req, outcome } of evaluations) {
      if (outcome.tier === 'exact' && outcome.matchText) matches.push(outcome.matchText);
      if (outcome.tier === 'related_family' && outcome.clarificationText) {
        clarifications.push(outcome.clarificationText);
      }
      if (outcome.vigenciaNotice) vigenciaNotices.push(outcome.vigenciaNotice);

      // La etiqueta lleva la licencia SÓLO cuando la oferta la exige: en una
      // oferta de ayudante, "B1.1 + A320" prometería una certificación que
      // nadie ha pedido ni comprobado.
      const ratingLabel = getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex);
      const aircraftLabel = offer.requiresCertification && offerLicenseCode
        ? `${offerLicenseCode} + ${ratingLabel}`
        : ratingLabel;

      // Fase 6 tanda E: una cualificación CADUCADA en oferta que certifica
      // llega aquí como 'not_met' con su propio texto. Se nombra siempre —
      // aunque la oferta no exija todas las aeronaves — porque no es "te
      // falta esto", es "lo tienes pero vencido", y eso es accionable.
      if (outcome.expiredText) missingRequirements.push(`${outcome.expiredText} — expired`);

      if (outcome.tier !== 'exact') {
        // Cualquier cosa por debajo de T1 significa que esta aeronave no
        // está cumplida exactamente. Una coincidencia degradada por vigencia
        // SIGUE siendo tier 'exact' — degradar nunca degrada a "no cumplida".
        everyAircraftExact = false;
        if (offer.requiresAllAircraft) {
          // La oferta dijo que hacen falta TODAS: esto es lo que dispara el
          // cap y hay que nombrarlo.
          missingRequirements.push(aircraftLabel);
        } else if (outcome.tier === 'not_met') {
          // Basta con una: no cumplir ésta no es un fallo, es información.
          clarifications.push(`The offer also lists ${aircraftLabel}; not present in the profile`);
        }
      }
    }

    // Con una sola licencia por oferta, "¿tiene la licencia?" es UNA pregunta,
    // no una por fila: antes era `licenseHeldForAll`, que recorría requisitos
    // que en la práctica repetían siempre el mismo código.
    //
    // Fase 6 tanda E: en una oferta que no certifica, `weights.license` es 0
    // (NO_CERTIFICATION_WEIGHTS), así que este cálculo no puede sumar nada
    // aunque el técnico tenga licencias. No hace falta condicionarlo: los 20
    // puntos ya están en habilitación.
    const licenseHeld =
      offerLicenseCode != null &&
      (technician.licenses.some((l) => l.licenseCode === offerLicenseCode) ||
        technician.habilitations.some((h) => h.licenseCode === offerLicenseCode));

    // `everyAircraftExact` sólo degrada el nivel cuando la oferta EXIGE todas
    // las aeronaves. Con "basta con una", cubrir una de tres es un match
    // exacto y punto — que es exactamente lo que hacía el modelo anterior:
    // `everyMandatoryExact` sólo lo ponían a false las filas `mandatory`, así
    // que una lista toda `preferred` lo dejaba en true. Sin esta condición,
    // "basta con una" degradaría a 'related' un match que sí es exacto.
    const requiredSetSatisfied = !offer.requiresAllAircraft || everyAircraftExact;
    level = bestTier === 'exact' && requiredSetSatisfied ? 'exact' : bestTier !== 'not_met' ? 'related' : 'not_met';
    const vigenciaFraction = vigenciaDegraded ? 1 - VIGENCIA_DEGRADATION_FRACTION : 1;
    habilitation = Math.round(weights.habilitation * HABILITATION_TIER_FRACTIONS[bestTier] * vigenciaFraction);
    license = licenseHeld ? weights.license : 0;
  } else if (hasQualificationRequirements) {
    // No aircraft named — the offer only states its license category, so
    // fall back to the category check.
    const broad = evaluateLicenseCategoryMatch(offer, technician);
    if (broad.tier !== 'not_met') {
      level = 'legacy';
      if (broad.matchText) matches.push(broad.matchText);
      if (broad.clarificationText) clarifications.push(broad.clarificationText);
      // Fase 9: con LICENSE_ONLY_WEIGHTS el peso de habilitación es 0, así que
      // esta fila sale 0 — que es lo correcto y lo que arregla la fase: la
      // oferta no nombró ninguna aeronave, luego no hay eje de aeronave que
      // puntuar NI que descontar. La fracción 0,29 sobrevive porque describe
      // una evidencia real ("tiene la categoría, nada confirma la aeronave") y
      // volvería a aplicarse si alguna rama futura vuelve a puntuar la
      // aeronave aquí; hoy multiplica a cero.
      habilitation = Math.round(weights.habilitation * BROAD_TIER_FRACTIONS[broad.tier]);
      license = weights.license;
    } else {
      level = 'not_met';
      habilitation = 0;
      license = 0;
      // La SEGUNDA fuente de missingRequirements, y la que sobrevive intacta
      // a la tanda D: no depende de mandatory/preferred, sino de que la
      // oferta pida una licencia que el técnico no tiene.
      missingRequirements.push(`Required license: ${offer.licenseCode}`);
    }
  } else {
    // The offer specifies no qualification requirement at all — habilitation
    // and license simply never enter the score (not awarded, not
    // penalized). weights here is NO_REQUIREMENTS_WEIGHTS, so the other
    // four components already sum to at most 75.
    level = 'legacy';
    matches.push('The offer does not require a specific license or aircraft');
  }

  // ── Contract fit (antes, mal llamada "Availability") ─────────────────
  // Esta fila NUNCA midió disponibilidad: mide si el técnico acepta el TIPO
  // DE CONTRATO de la oferta. El nombre viejo mentía, y encima la
  // disponibilidad real (immediately) no entra en el score en absoluto — es
  // filtro y etiqueta, no puntos: un estado binario no debe mover un ranking.
  //
  // REGLA DEL CONJUNTO VACÍO: no declarar tipos de contrato significa
  // "abierto a cualquiera", así que puntúa COMPLETO. Sólo saca cero quien SÍ
  // declaró y ninguno coincide. Sin esto, renombrar la fila la habría hecho
  // honesta pero habría dejado 15 puntos inalcanzables para quien no rellena
  // un campo OPCIONAL — exactamente lo que se decidió no hacer con los años
  // de experiencia ("la ausencia de dato nunca penaliza").
  const techContractTypes = technician.availability.contractTypes as string[];
  const openToAnyContract = techContractTypes.length === 0;
  if (openToAnyContract || techContractTypes.includes(offer.contractType)) {
    contractFit = weights.contractFit;
  }

  // offer.minYearsExperience SIGUE sin puntuar y sin entrar en breakdown —
  // "la cualificación puntúa, la experiencia informa" no cambia. Lo que sí
  // hace ahora es descalificar: ver la sección de blockers más abajo.

  // ── Localización: SÓLO EL PAÍS (Fase 7 tanda F2c) ────────────────────
  //
  // Mismo país, los puntos enteros. Distinto país, cero. No hay grados.
  //
  // Antes se puntuaba por aeropuerto, o por código de aeropuerto, o por
  // nombre de ciudad — tres formas de acertar sobre un catálogo de 255
  // aeropuertos que decidía por accidente qué países existían. La ciudad ya
  // NO puntúa: ni la elegida del directorio ni la escrita a mano. Informa y
  // coloca el pin del mapa, nada más.
  //
  // Consecuencia asumida, y es la correcta si el criterio es el país: un
  // técnico de Alicante y otro de Bilbao puntúan IGUAL para una oferta en
  // Madrid. Puntuar la ciudad exigiría decidir cuánto vale cada kilómetro, y
  // eso es una pregunta que este producto no responde — hay ofertas donde
  // mudarse es normal y otras donde 40 km ya son demasiado.
  //
  // Comparación exacta sobre el código ISO, sin normalizar: las dos columnas
  // son NOT NULL con FK a `location_countries`, así que ya vienen en
  // mayúsculas y validadas por Postgres. Normalizar aquí sugeriría que puede
  // llegar texto libre, y no puede.
  if (technician.locationCountryCode === offer.locationCountryCode) {
    location = weights.location;
  }

  // ── Profile type: strong SOFT mismatch ────────────────────────────────
  // A matching type awards no points. A different type applies a low ceiling
  // so generic signals such as verification, contract fit and country cannot
  // manufacture a plausible-looking match for another trade. It deliberately
  // does NOT add a blocker: cross-trade offers remain selectable and the UI
  // keeps showing the resulting percentage.
  //
  // A technician can declare several types (Fase 6 tanda A), so this is a
  // membership check: matching ANY declared type is sufficient. The offer
  // always declares exactly one type (`offers.technician_type` is NOT NULL).
  if (technician.technicianTypes.includes(offer.technicianType)) {
    matches.push(`Technician type: ${technicianTypeLabel(offer.technicianType)}`);
  } else {
    const profileIs = technician.technicianTypes.map(technicianTypeLabel).join(', ');
    profileTypeMismatch = true;
    clarifications.push(
      `Profile type differs — the offer is for ${technicianTypeLabel(offer.technicianType)}; this profile declares ${profileIs || 'no type'}.`,
    );
  }

  // ── Hard blockers ────────────────────────────────────────────────────
  // These live HERE, in the pure function, rather than in either
  // matchingV2.ts wrapper: both matching directions and all direct screen
  // callers must produce the same result. A blocker caps the total; it never
  // awards or subtracts component points.

  // Minimum declared experience. `yearsExperience` absent (undefined/NULL)
  // is NOT a blocker — deliberate product rule, the same one the server-side
  // prefilter encodes as `years_experience.is.null OR >= N` (see
  // applyMinYearsFilter in technicianRepositoryV2): the ABSENCE OF DATA NEVER
  // PENALIZES. Only a value the technician actually declared, below the
  // offer's stated minimum, disqualifies. `!= null` rather than a typeof
  // check so a NULL that survives a mapper is treated as "not declared"
  // instead of comparing as 0 and blocking everyone who left the field empty.
  const declaredYears = technician.yearsExperience;
  if (offer.minYearsExperience > 0 && declaredYears != null && declaredYears < offer.minYearsExperience) {
    blockers.push(
      `The offer requires at least ${offer.minYearsExperience} years of experience; this profile declares ${declaredYears}.`,
    );
  }

  const rawTotal = verified + habilitation + license + contractFit + location;

  // Every score ceiling is applied in one place — see applyScoreCeilings()
  // and the ladder documented above it. Most restrictive always wins,
  // however many apply at once.
  // Fase 9 — `isZeroQualification` pregunta por EL EJE QUE LA OFERTA PIDE, no
  // por habilitación siempre. Con LICENSE_ONLY_WEIGHTS el peso de habilitación
  // es 0, así que un `habilitation === 0` pelado se cumpliría SIEMPRE en esa
  // rama y el tope de 39 caería sobre todo el mundo — incluido el candidato
  // perfecto, que pasaría de 68 a 39 y empeoraría justo el problema que la
  // fase arregla. La regla que el tope defiende no cambia ni un ápice: en una
  // oferta que nombra aeronave, tener la licencia sin el rating sigue topado
  // en ZERO_QUALIFICATION_CAP.
  const zeroOnRequestedAxis =
    offer.requiredHabilitations.length > 0 ? habilitation === 0 : license === 0;

  const total = applyScoreCeilings(rawTotal, {
    hasIncompleteAircraftSet: missingRequirements.length > 0,
    isZeroQualification: hasQualificationRequirements && zeroOnRequestedAxis,
    hasProfileTypeMismatch: profileTypeMismatch,
    hasBlocker: blockers.length > 0,
  });

  return {
    offerId: offer.id,
    technicianId: technician.id,
    total,
    label: getMatchLabel(total),
    breakdown: { verified, habilitation, license, contractFit, location },
    level,
    matches,
    clarifications,
    vigenciaNotices,
    missingRequirements,
    profileTypeMismatch,
    blockers,
  };
}

export function getMatchLabel(total: number): MatchLabel {
  if (total >= 80) return 'Excellent match';
  if (total >= 60) return 'Strong match';
  if (total >= 40) return 'Partial match';
  return 'Weak match';
}

// PRESENTATION ONLY — the scoring is untouched. An offer with no
// qualification requirement already falls into NO_REQUIREMENTS_WEIGHTS on its
// own (topping out at 75, never "Excellent"); this only decides what the
// resulting number is CALLED on screen. See GENERAL_COMPATIBILITY_LABEL in
// types/matching.ts for why non-licensed offers get their own wording.
//
// Fase 6 tanda C: lo decide el interruptor que la empresa marca, no el TIPO
// de perfil buscado. Antes se deducía con offerTargetsLicensedProfiles() y
// eso arrastraba el problema de fondo de toda la fase — que la etiqueta del
// puesto gobernara si hacía falta licencia.
export function getMatchDisplayLabel(
  offer: Pick<Offer, 'requiresCertification'>,
  score: Pick<MatchScore, 'label'>,
): MatchDisplayLabel {
  return offer.requiresCertification ? score.label : GENERAL_COMPATIBILITY_LABEL;
}
