// Technician profile completeness (0–100). Lives here, not inline in
// app/technician/profile.tsx, so the weight tables can be asserted directly
// — the bug this file's licensed/non-licensed split fixes was a table that
// silently could not reach 100, which is exactly the kind of thing a unit
// test catches and a screen does not.
import { Technician } from '../types';
import { isLicensedTechnicianType } from '../constants/technicianTypes';

export interface ProfileCompletenessWeights {
  fullName: number;
  email: number;
  phone: number;
  city: number;
  country: number;
  baseAirport: number;
  licenses: number;
  aircraftTypes: number;
  social: number;
  availability: number;
  years: number;
}

// ── Licensed types (mechanic, avionics, pilot) ──────────────────────────
// Unchanged. Every previously recorded decision about this table still
// holds; see the notes on `social` and `availability` below.
export const LICENSED_COMPLETENESS_WEIGHTS: ProfileCompletenessWeights = {
  fullName: 10,
  email: 10,
  phone: 5,
  city: 5,
  country: 5,
  baseAirport: 5,
  licenses: 20,
  aircraftTypes: 15,
  social: 10,
  availability: 5,
  years: 10,
};

// ── Non-licensed trades (sheet metal, paint, composite) ─────────────────
// These profiles have no EASA Part-66 licence and no aircraft type rating —
// since the licensed/non-licensed split, the two sections are not even shown
// to them. Under the single old table that made 35 points permanently
// unreachable and pinned their completeness at 65%: a profile filled in
// perfectly, by someone who had answered every question the app asked them,
// displayed as a third empty. The percentage was measuring the app's own
// rule, not the technician.
//
// The 35 orphaned points go to what these profiles CAN answer, weighted by
// what a company actually has left to search on:
//   +10 baseAirport (5 -> 15).  The largest single share. Hangar, paint bay
//       and composite shop work is done at a place; with no licence to
//       filter on, location IS the filter, and a profile with no base is
//       nearly unusable in a search.
//   +10 years (10 -> 20).  With licences and ratings gone, declared
//       experience is the only remaining proxy for skill. It is also
//       required at signup now (migration 044), so this rewards a field
//       every new profile already has rather than inventing a new hurdle.
//   +5 each to phone, city, country (5 -> 10).  Contact and location detail
//       carry proportionally more when there is no qualification block to
//       carry the profile.
//
// Deliberately NOT touched, both being separate product decisions recorded
// on 2026-07-29 and out of scope here: `social` (10) and `availability` (5)
// keep their licensed-branch values exactly.
export const NON_LICENSED_COMPLETENESS_WEIGHTS: ProfileCompletenessWeights = {
  fullName: 10,
  email: 10,
  phone: 10,
  city: 10,
  country: 10,
  baseAirport: 15,
  licenses: 0,
  aircraftTypes: 0,
  social: 10,
  availability: 5,
  years: 20,
};

export function getProfileCompletenessWeights(technicianType: string): ProfileCompletenessWeights {
  return isLicensedTechnicianType(technicianType) ? LICENSED_COMPLETENESS_WEIGHTS : NON_LICENSED_COMPLETENESS_WEIGHTS;
}

// `yearsDeclared` en vez de `t.yearsExperience > 0`: declarar 0 anios ES
// completar el perfil. Penalizar a un junior por ser honesto contradiria el
// principio de la mision (la ausencia de dato no penaliza, pero el dato
// declarado tampoco debe castigar por su valor).
//
// `socialDeclared` (2026-07-29): TRUE con AL MENOS UN enlace declarado — no
// uno por red. Los 10 puntos que quedaron huerfanos al retirar specialties
// vuelven aqui, asi que la escala vuelve a topar en 100 de verdad. Que baste
// con uno es deliberado: el objetivo es "hay una via de contacto profesional
// verificable", no obligar a tener las tres.
//
// `technicianType` decide QUE tabla de pesos se aplica (ver arriba). Un tipo
// desconocido cae en la licenciada, que es el comportamiento previo.
export function computeProfileCompleteness(
  t: Technician,
  yearsDeclared: boolean,
  socialDeclared: boolean,
  technicianType: string,
): number {
  const w = getProfileCompletenessWeights(technicianType);
  let score = 0;
  if (t.fullName?.trim()) score += w.fullName;
  if (t.email?.trim()) score += w.email;
  if (t.phone?.trim()) score += w.phone;
  if (t.city?.trim()) score += w.city;
  if (t.country?.trim()) score += w.country;
  if (t.baseAirport?.trim()) score += w.baseAirport;
  if (t.licenseCategories.length > 0) score += w.licenses;
  if (t.aircraftTypes.length > 0) score += w.aircraftTypes;
  // 2026-07-29: aqui habia `if (t.specialties.length > 0) score += 10;`, una
  // rama muerta (specialties no tenia almacenamiento y siempre llegaba []),
  // que dejaba el maximo real de este score en 90. Esos 10 puntos son ahora
  // los enlaces sociales, que SI tienen columna y camino de escritura.
  if (socialDeclared) score += w.social;
  // NOTA (2026-07-29): con dos estados esto significa "+5 por estar abierto a
  // ofertas". Es discutible que la completitud del PERFIL dependa de si ahora
  // mismo buscas trabajo — pero cambiarlo mueve el % de todos los perfiles, y
  // eso es una decisión de producto propia, no un arrastre de esta tanda.
  // Se deja como estaba y queda señalado.
  if (t.availability.status !== 'unavailable') score += w.availability;
  if (yearsDeclared) score += w.years;
  return Math.min(score, 100);
}
