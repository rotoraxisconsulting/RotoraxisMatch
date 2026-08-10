// Technician profile completeness (0–100). Lives here, not inline in
// app/technician/profile.tsx, so the weight tables can be asserted directly
// — the bug this file's licensed/non-licensed split fixes was a table that
// silently could not reach 100, which is exactly the kind of thing a unit
// test catches and a screen does not.
import { Technician } from '../types';

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

// ── Perfiles CON licencia declarada ─────────────────────────────────────
// Valores sin tocar. Todas las decisiones registradas sobre esta tabla
// siguen en pie; ver las notas de `social` y `availability` más abajo.
//
// Lo que cambió el 2026-08-10 (Fase 6 tanda A) NO son los pesos, es QUIÉN
// elige entre las dos tablas: antes el TIPO de técnico, ahora si la persona
// declara licencias. Ver getProfileCompletenessWeights().
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

// ── Perfiles SIN licencia declarada ─────────────────────────────────────
// These profiles have no EASA Part-66 licence and no aircraft type rating.
// Under the single old table that made 35 points permanently
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

// ── Quién elige la tabla (Fase 6 tanda A, 2026-08-10) ───────────────────
//
// Lo decide LO QUE EL TÉCNICO DECLARA, no la etiqueta que eligió al
// registrarse. Antes era `isLicensedTechnicianType(technicianType)`, y eso
// deja de tener un único argumento en cuanto un técnico puede llevar varios
// tipos a la vez: un "aviónico + pintor" no es ni una cosa ni la otra.
//
// La propiedad que hace correcta esta versión: EL TECHO DE 100 ES
// ALCANZABLE POR CONSTRUCCIÓN EN LAS DOS RAMAS.
//   - Con licencias, la rama licenciada se activa PORQUE el campo está
//     relleno: sus 20 puntos ya están ganados. La condición de la rama ES
//     el campo.
//   - Sin licencias, el eje entero vale 0 y no hay nada que reclamar.
// No existe entrada que deje puntos huérfanos. El bug de 2026-07-29 (35
// puntos inalcanzables, perfil perfecto clavado en 65%) no es que esté
// arreglado: es que ya no se puede escribir.
//
// Dos efectos ACEPTADOS a propósito (decisión del 2026-08-10):
//
//   1. Un "mechanic" sin licencia ya no topa en 65%: puede llegar a 100.
//      Es la tesis de la Fase 6 — estar licenciado es propiedad de la
//      persona, no del tipo, y la fase introduce ofertas que no exigen
//      certificar. El aviso de que le falta la licencia no se pierde: lo da
//      el match, donde una oferta que exige certificar lo deja en
//      ZERO_QUALIFICATION_CAP (39). Completitud mide "¿has contestado lo
//      que la app te pregunta?"; el match mide "¿estás cualificado?".
//      Mezclar las dos cosas fue exactamente el error de 2026-07-29.
//
//   2. Declarar la PRIMERA licencia BAJA el porcentaje (100 -> 85): se
//      cruza a la tabla licenciada y aparecen los 15 de type ratings, aún
//      sin rellenar. No es un defecto de las dos tablas — con denominador
//      dinámico pasaría igual (65/65 -> 85/100). Es inherente a que
//      declarar una licencia ABRE UNA PREGUNTA NUEVA. La pantalla de perfil
//      lo dice con todas las letras en vez de dejar que parezca un castigo.
export function getProfileCompletenessWeights(holdsLicenses: boolean): ProfileCompletenessWeights {
  return holdsLicenses ? LICENSED_COMPLETENESS_WEIGHTS : NON_LICENSED_COMPLETENESS_WEIGHTS;
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
// La rama sale de `t.licenseCategories`, la MISMA lista que doce líneas más
// abajo otorga los 20 puntos. Derivarla aquí y no recibirla como parámetro
// es deliberado: hace imposible pasar una rama incoherente con el cálculo.
export function computeProfileCompleteness(
  t: Technician,
  yearsDeclared: boolean,
  socialDeclared: boolean,
): number {
  const w = getProfileCompletenessWeights(t.licenseCategories.length > 0);
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
