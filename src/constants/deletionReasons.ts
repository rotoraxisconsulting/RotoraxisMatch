import { AppRole } from '../types/enums';

/**
 * Motivos de baja. Espejo EXACTO del CHECK de `account_deletion_feedback`
 * (migración 043): si añades uno aquí sin añadirlo allí, el insert falla en
 * la Edge Function y la respuesta se pierde en silencio.
 */
export const DELETION_REASON_CODES = [
  'goal_met_here',
  'goal_met_elsewhere',
  'not_enough_supply',
  'verification_slow',
  'privacy_concerns',
  'just_testing',
  'other',
] as const;

export type DeletionReasonCode = (typeof DELETION_REASON_CODES)[number];

export function isDeletionReasonCode(value: unknown): value is DeletionReasonCode {
  return typeof value === 'string' && (DELETION_REASON_CODES as readonly string[]).includes(value);
}

// Un mismo código, dos redacciones. "No encontré trabajo" y "no encontré
// técnicos" son el MISMO problema de producto visto desde los dos lados del
// mercado (falta de oferta en el lado contrario), así que comparten código y
// se agregan juntos; lo que cambia es cómo se le pregunta a cada uno.
const LABELS: Record<DeletionReasonCode, { technician: string; company: string; admin: string }> = {
  goal_met_here: {
    technician: 'I found a job through AviationJobTalent',
    company: 'I hired someone through AviationJobTalent',
    admin: 'Goal met here',
  },
  goal_met_elsewhere: {
    technician: 'I found a job somewhere else',
    company: 'I hired somewhere else',
    admin: 'Goal met elsewhere',
  },
  not_enough_supply: {
    technician: 'Not enough offers for my licenses and ratings',
    company: 'Not enough technicians for what I need',
    admin: 'Not enough supply',
  },
  verification_slow: {
    technician: 'Verification took too long',
    company: 'Verification took too long',
    admin: 'Verification too slow',
  },
  privacy_concerns: {
    technician: 'I was not comfortable with how my data is handled',
    company: 'I was not comfortable with how my data is handled',
    admin: 'Privacy concerns',
  },
  just_testing: {
    technician: 'I was just trying the app out',
    company: 'I was just trying the app out',
    admin: 'Just testing',
  },
  other: {
    technician: 'Something else',
    company: 'Something else',
    admin: 'Other',
  },
};

export function deletionReasonLabel(code: DeletionReasonCode, role: AppRole | undefined): string {
  const entry = LABELS[code];
  return role === 'company_user' ? entry.company : entry.technician;
}

/** Etiqueta corta para el panel de admin, sin la redacción en primera persona. */
export function deletionReasonAdminLabel(code: DeletionReasonCode): string {
  return LABELS[code].admin;
}

/**
 * `goal_met_here` NO es fuga: es alguien diciendo que el producto funcionó.
 * Agregarlo con el resto convertiría un éxito en una alerta.
 */
export function isSuccessfulExit(code: DeletionReasonCode): boolean {
  return code === 'goal_met_here';
}

/** Tope del texto libre. Coincide con el CHECK de la tabla. */
export const DELETION_COMMENT_MAX_LENGTH = 1000;
