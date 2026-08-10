import { VerificationStatus } from './enums'; // owned by enums.ts — not re-exported here
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';

// Disponibilidad: DOS estados, 2026-07-29.
//
// ── Corrección de la corrección (hallazgos B1/I2 de la auditoría) ──────
// La nota de 2026-07-27 decía que `status` era la fuente de verdad y
// `immediately` su proyección con pérdida. Era al revés, y se comprobó
// contra los datos: `status` NO SE PERSISTE en ninguna fila — cero de 7
// tenían la clave. Lo persistido siempre fue `immediately` (+ el difunto
// `available_from`), y `status` se derivaba en memoria al leer.
//
// La consecuencia era un bug real: elegir "Open to offers" SIN fecha se
// guardaba como `immediately=false, available_from=null` y al recargar
// volvía a derivarse como "Unavailable". El técnico veía un estado que no
// había elegido, y el filtro "Open to offers" de empresa no casaba con
// nadie: ningún perfil tenía fecha.
//
// Resuelto colapsando a DOS estados, sin fecha. Ahora `immediately` ES el
// modelo y `status` es sólo su etiqueta para UI y filtros, 1:1 y SIN
// PÉRDIDA en los dos sentidos:
//     immediately === true   <->  'open_to_offers'
//     immediately === false  <->  'unavailable'
// No queda ningún estado que no se pueda reconstruir desde el booleano.
export type AvailabilityStatus = 'open_to_offers' | 'unavailable';

// `immediately` es lo ÚNICO que se persiste (jsonb `availability`).
// `status` viaja sólo en memoria, puesto por withAvailabilityStatus() para
// que UI y filtros hablen en términos legibles. Nunca lo escribas al PATCH.
export interface Availability {
  immediately?: boolean;
  status?: AvailabilityStatus;
  // Fase 5.3 — narrowed from (ContractType | ContractTypeCode)[] now that
  // the V1 ContractType half (deleted, zero real consumers confirmed) is
  // gone. Every write path (app/technician/profile.tsx) already only ever
  // produces ContractTypeCode values via constants/contractTypes.ts's
  // CONTRACT_TYPES; this is a type-level correction, not a runtime change
  // — old persisted JSON isn't affected either way.
  contractTypes: ContractTypeCode[];
}

/**
 * V1-shaped type, kept alive on purpose via v2CompatAdapters.ts
 * (v2TechnicianToV1). This is the real, working form-state shape behind
 * app/technician/profile.tsx (the entire technician profile screen) and
 * the admin dashboard/technician-list screens today — NOT dead code and
 * NOT safely deletable as a quick cleanup (confirmed by consumer grep,
 * docs/PHASE5_INVENTORY.md item c, 2026-07-26). Retiring it in favor of
 * TechnicianProfile everywhere is tracked as its own future mission ("V2 UI
 * migration — retire v2CompatAdapters", see docs/MISSION_PART66.md
 * backlog), not part of the Part-66 coherence mission's Fase 5.
 */
export interface Technician {
  id: string;
  anonymousCode: string;
  fullName: string;
  email: string;
  phone: string;
  locationCityId?: string;
  country: string;
  city: string;
  baseAirport: string;
  latitude?: number;
  longitude?: number;
  licenseCategories: string[];
  aircraftTypes: string[];
  specialties: string[];
  availability: Availability;
  verificationStatus: VerificationStatus;
  profileCompleteness: number;
  yearsExperience: number;
}

/**
 * V1-shaped type, kept alive on purpose via v2CompatAdapters.ts
 * (v2SafePreviewToSafeView / v2UnlockedViewToSafeView). This is the real,
 * working shape behind company/search.tsx, both map implementations
 * (TechnicianMap.native.tsx / TechnicianMapLeafletImpl.tsx),
 * useCompanyDashboard.ts, useMapTechnicians.ts, and useTechnicianSearch.ts
 * today — NOT dead code and NOT safely deletable as a quick cleanup
 * (consumer grep refreshed after the dead V1 cards/modals were removed,
 * 2026-07-27). Retiring it in favor of
 * SafeTechnicianPreview/UnlockedTechnicianView (privacy.ts) everywhere is
 * tracked as its own future mission ("V2 UI migration — retire
 * v2CompatAdapters", see docs/MISSION_PART66.md backlog), not part of the
 * Part-66 coherence mission's Fase 5.
 */
export type SafeTechnicianView = Omit<Technician, 'fullName' | 'email' | 'phone'> & {
  matchingScore?: number;
  fullName?: string;
  email?: string;
  phone?: string;
};

// --- V2 types ---

export interface TechnicianLicense {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

// A habilitation row always carries an explicit licenseCode — category and
// aircraft/rating are never inferred by combining independent lists.
//
// aircraftTypeRatingId: normalized exact aircraft+engine rating (FK into
//   aircraft_type_ratings, e.g. "Airbus A320 family — CFM56"). The ONLY way
//   a habilitation names an aircraft. Optional here purely because the
//   column stays nullable until migration 029 sets it NOT NULL; every row
//   in existence already has it.
//
// Fase 5.3 (2026-07-28): the legacy `aircraftTypeCode` field is GONE, along
// with `needsReview` (which only ever existed to flag a legacy code that
// could not be resolved to a catalog rating). The pre-Part-66 aircraft_types
// catalog is being retired outright with no compatibility path — decision
// recorded in docs/MISSION_PART66.md. If you are about to re-add a bare
// aircraft code here to make something easier: don't. A habilitation names
// an aircraft through the rating catalog or it does not name one at all.
//
// experienceYears / isCurrent are optional, per-rating declarations.
// experienceYears is INFORMATIONAL ONLY and never enters the match score —
// "qualification scores, experience informs" (see offerMatchExplain.ts).
export interface TechnicianHabilitation {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  aircraftTypeRatingId?: string;
  experienceYears?: number;
  isCurrent?: boolean;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

// Sub-fase de experiencia (2026-07-28): TechnicianAircraftExperience ha sido
// eliminado con su tabla (migracion 031). Era experiencia por codigo de
// aeronave del modelo pre-Part-66: 0 filas, 4 lecturas vivas y CERO caminos
// de escritura — una feature a medio construir cuyo unico efecto real era
// dejar el componente `experience` del score permanentemente inalcanzable.
// Lo sustituye TechnicianProfile.yearsExperience (arriba): visual y
// filtrable, nunca puntuable.

/**
 * Objeto JSONB plano clave -> URL, persistido tal cual en
 * technician_profiles.social_links. La forma NO cambio al encender la UI el
 * 2026-07-29: `linkedin` ya era la unica clave con nombre y las otras dos
 * entraban por el index signature; ahora son claves con nombre tambien, que
 * es lo que la pantalla de perfil escribe.
 *
 * Invariantes de escritura (app/technician/profile.tsx):
 *  - Una clave vacia NO se guarda: se omite del objeto. Nunca `""`.
 *  - Si no queda ninguna clave, la columna se pone a NULL, no a `{}`.
 *  - Las URLs se persisten ya normalizadas (ver utils/urlValidation.ts).
 *
 * Visibilidad: es un campo PRIVADO. Solo sale por technician_public_view
 * cuando offer_accepted_between() abre la identidad — el mismo gate que
 * firstName/email/phone. No lo muevas a SafeTechnicianPreview.
 */
export interface SocialLinks {
  linkedin?: string;
  instagram?: string;
  /** Web personal o portfolio del tecnico. No confundir con Company.website. */
  website?: string;
  [key: string]: string | undefined;
}

/**
 * Full private technician profile — the authoritative internal record.
 * Contains ALL fields including private identity data (firstName, lastName,
 * email, phone, birthDate, socialLinks).
 *
 * Usage rules:
 *   ✓ Technician own-profile screens (app/technician/*)
 *   ✓ Admin screens (app/admin/*)
 *   ✓ Repository internals (reading/writing the local store)
 *   ✗ Company-facing screens — must use SafeTechnicianPreview or UnlockedTechnicianView
 *
 * Future Supabase: this type maps to a direct SELECT on technician_profiles.
 * Companies never receive this shape — they receive technician_public_view rows
 * (private fields gated by CASE WHEN offer_accepted_between()).
 */
export interface TechnicianProfile {
  id: string;
  userId: string;
  anonymousCode: string;

  // Private
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  // ISO date — dato PRIVADO, nunca sale hacia una empresa.
  // EMPTY STRING cuando la fila viene de `technician_public_view`: esa vista
  // no expone `birth_date` ni ninguna edad derivada (migración 040).
  // Nunca rellenar esto con una fecha inventada: hacerlo produjo el bug de
  // "todos los técnicos tienen 56 años" (época Unix + calculateAge).
  birthDate: string;

  // Public
  //
  // Fase 6 tanda A (2026-08-10): un técnico puede tener VARIOS tipos, sin
  // restricción de mezcla — se puede ser aviónico y pintor a la vez. Vive en
  // la tabla puente `technician_profile_types` (migración 048), NO en la
  // columna `technician_profiles.technician_type`, que sigue existiendo por
  // compatibilidad y se retirará cuando no queden lectores.
  //
  // Invariante: NUNCA vacío para un perfil persistido. El signup exige al
  // menos uno y la pantalla de perfil no deja guardar con cero.
  technicianTypes: TechnicianTypeCode[];
  // Location FK only. Country, city, base airport and coordinates are derived
  // from the canonical location catalog when building views.
  // Required: every persisted technician profile must reference a valid location_airports entry.
  locationCityId: string;

  availability: Availability;

  // Sub-fase de experiencia (2026-07-28) — años TOTALES de carrera,
  // autodeclarados por el técnico en su perfil.
  //
  // `undefined`/NULL = NO DECLARADO, distinto de 0 = declarado sin experiencia.
  // Esa distinción es el motivo de que sea un campo propio y no la suma de
  // habilitations.experienceYears: una suma no puede expresarla (sumar nada
  // da 0), y la regla de la misión es que la AUSENCIA DE DATO NUNCA PENALIZA.
  // El filtro duro por offer.minYearsExperience excluye solo a quien tenga un
  // valor DECLARADO por debajo del mínimo; quien no ha declarado sigue
  // apareciendo, marcado "not specified".
  //
  // NO puntúa. "La cualificación puntúa, la experiencia informa."
  yearsExperience?: number;

  /** ADMIN-ONLY in Supabase — technician cannot write this field; set via admin-only RLS policy */
  verificationStatus: VerificationStatus;
  profileCompleteness: number;

  socialLinks?: SocialLinks;

  createdAt: string;
  updatedAt: string;
}

export interface TechnicianWithRelations extends TechnicianProfile {
  licenses: TechnicianLicense[];
  habilitations: TechnicianHabilitation[];
}
