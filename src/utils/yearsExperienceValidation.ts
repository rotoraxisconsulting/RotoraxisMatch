// Years of experience — the ONE field with different rules depending on
// where it is edited, so the rules live here rather than being retyped in
// each screen (they had already drifted once: the profile screen's copy
// promised "optional" while the product decision was that it is asked for).
//
// The three-way distinction this file protects:
//   ''    -> not declared. NULL in the database. Never penalizes: such a
//            profile still passes every minimum-experience filter
//            (applyMinYearsFilter: `is.null OR >= N`) and is never blocked
//            by the matching engine.
//   '0'   -> declared, no experience. A real answer from a junior, stored
//            as 0, and NOT the same as ''. It DOES fall below any offer
//            asking for a minimum.
//   '8'   -> declared, eight years.
//
// Both entry points below reject '' — signup asks for it, and the profile
// screen must not let a technician erase it back to "not declared". Neither
// rejects '0'.
//
// Range mirrors chk_technician_years_experience_range (migration 032), so an
// out-of-range value is a form message instead of a database constraint
// error surfacing as an opaque failure.
export const MIN_YEARS_EXPERIENCE = 0;
export const MAX_YEARS_EXPERIENCE = 70;

/**
 * The declared number, or null when the input is not a usable declaration
 * (empty, non-numeric, or outside 0..70). Surrounding whitespace is
 * tolerated; anything else is not — '8 years' is a typo, not eight years.
 */
export function parseYearsExperience(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const value = parseInt(trimmed, 10);
  if (value < MIN_YEARS_EXPERIENCE || value > MAX_YEARS_EXPERIENCE) return null;
  return value;
}

const RANGE_MESSAGE = `Years of experience must be a whole number between ${MIN_YEARS_EXPERIENCE} and ${MAX_YEARS_EXPERIENCE}.`;

/** Signup form. Returns the message to show, or null when the value is fine. */
export function validateSignupYearsExperience(raw: string): string | null {
  if (raw.trim() === '') return 'Enter your total years of experience (enter 0 if you have none yet).';
  if (parseYearsExperience(raw) === null) return RANGE_MESSAGE;
  return null;
}

/**
 * Profile screen. Same rule, different wording — the technician already has
 * a profile here, so the message is about not clearing the field rather than
 * about filling it in for the first time.
 */
export function validateProfileYearsExperience(raw: string): string | null {
  if (raw.trim() === '') return 'Total years of experience is required. Enter 0 if you have none yet.';
  if (parseYearsExperience(raw) === null) return RANGE_MESSAGE;
  return null;
}
