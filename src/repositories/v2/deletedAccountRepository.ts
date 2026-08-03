import { supabase } from '../../lib/supabase';
import { AppRole, VerificationStatus } from '../../types/enums';
import { DeletionReasonCode, isDeletionReasonCode } from '../../constants/deletionReasons';
import { throwIfError } from './supabaseMappers';

/**
 * Una LÁPIDA: cuenta borrada por su dueño, conservada a propósito.
 *
 * NO lleva ningún dato de contacto, y no es un descuido — el trigger
 * `handle_deleted_user()` (migración 039) sobrescribe email y teléfono, y el
 * usuario de `auth.users` deja de existir. Todo lo que queda aquí es
 * pseudónimo (el código anónimo) o agregado (fechas, recuentos).
 *
 * `deletedAt` es NULL en las lápidas anteriores a la migración 042: su fecha
 * real nunca se registró. NULL significa "no consta", nunca "borrada hoy" —
 * quien lo pinte tiene que decirlo así.
 */
export interface DeletedAccount {
  userId: string;
  role: AppRole;
  /** Alta de la CUENTA (profiles.created_at). */
  accountCreatedAt: string;
  deletedAt: string | null;
  /** Días entre alta y baja; null si falta la fecha de baja. */
  lifetimeDays: number | null;
  // ── Sólo para role='technician' ─────────────────────────────
  technicianId: string | null;
  anonymousCode: string | null;
  technicianType: string | null;
  country: string | null;
  city: string | null;
  /** El estado que tenía CONGELADO al borrarse, no un estado vigente. */
  verificationStatusAtDeletion: VerificationStatus | null;
  /** Rastro que la lápida existe para preservar. */
  applicationsSent: number;
  directOffersReceived: number;
}

/**
 * Una respuesta de la encuesta de salida.
 *
 * NO se puede cruzar con una `DeletedAccount` concreta, y es a propósito: la
 * tabla no guarda user_id y sólo registra el DÍA (migración 043). Quien busque
 * "qué dijo T5353F0227" no lo va a encontrar aquí — ni debe.
 */
export interface DeletionFeedback {
  id: string;
  role: AppRole;
  reason: DeletionReasonCode;
  comment: string | null;
  /** Fecha (YYYY-MM-DD), sin hora. */
  createdOn: string;
}

type ProfileRow = {
  id: string;
  role: AppRole;
  created_at: string;
  deleted_at: string | null;
};

type TechRow = {
  id: string;
  user_id: string;
  anonymous_code: string | null;
  technician_type: string | null;
  verification_status: VerificationStatus | null;
  location_airports: { country_name: string | null; city: string | null } | { country_name: string | null; city: string | null }[] | null;
};

const MS_PER_DAY = 86_400_000;

function lifetimeDays(createdAt: string, deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const created = new Date(createdAt).getTime();
  const deleted = new Date(deletedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(deleted)) return null;
  return Math.max(0, Math.floor((deleted - created) / MS_PER_DAY));
}

/** Cuenta ocurrencias de technician_id sin traerse las filas enteras. */
async function countByTechnician(table: string, technicianIds: string[]): Promise<Record<string, number>> {
  // `.in()` con lista vacía genera `in.()`, que PostgREST rechaza. No es un
  // caso raro: es el estado normal cuando no hay ninguna cuenta borrada.
  if (technicianIds.length === 0) return {};
  const { data, error } = await supabase
    .from(table)
    .select('technician_id')
    .in('technician_id', technicianIds);
  throwIfError(error);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { technician_id: string }[]) {
    counts[row.technician_id] = (counts[row.technician_id] ?? 0) + 1;
  }
  return counts;
}

export const deletedAccountRepository = {
  /**
   * Todas las lápidas, la más reciente primero.
   *
   * Se ordena por `deleted_at DESC NULLS LAST`: las de fecha desconocida van
   * al final, porque colocarlas arriba (orden por defecto de Postgres para
   * DESC) las haría pasar por las bajas más recientes.
   *
   * Sólo lo puede leer un admin: las políticas `profiles_select_admin` y
   * `tp_select_admin` son `is_admin()`. Con cualquier otra sesión esto
   * devuelve cero filas sin error — que es lo correcto, no un fallo.
   */
  async getAll(): Promise<DeletedAccount[]> {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, created_at, deleted_at')
      .eq('status', 'deleted')
      .order('deleted_at', { ascending: false, nullsFirst: false });
    throwIfError(profileError);

    const profiles = (profileData ?? []) as ProfileRow[];
    if (profiles.length === 0) return [];

    const { data: techData, error: techError } = await supabase
      .from('technician_profiles')
      .select('id, user_id, anonymous_code, technician_type, verification_status, location_airports ( country_name, city )')
      .in('user_id', profiles.map((p) => p.id));
    throwIfError(techError);

    const techRows = (techData ?? []) as TechRow[];
    const techByUserId = new Map(techRows.map((row) => [row.user_id, row]));
    const technicianIds = techRows.map((row) => row.id);

    const [applications, directOffers] = await Promise.all([
      countByTechnician('offer_applications', technicianIds),
      countByTechnician('offer_requests', technicianIds),
    ]);

    return profiles.map((profile) => {
      const tech = techByUserId.get(profile.id);
      // PostgREST devuelve el embed como objeto o como array según cardinalidad.
      const loc = Array.isArray(tech?.location_airports)
        ? tech?.location_airports[0]
        : tech?.location_airports;

      return {
        userId: profile.id,
        role: profile.role,
        accountCreatedAt: profile.created_at,
        deletedAt: profile.deleted_at,
        lifetimeDays: lifetimeDays(profile.created_at, profile.deleted_at),
        technicianId: tech?.id ?? null,
        anonymousCode: tech?.anonymous_code ?? null,
        technicianType: tech?.technician_type ?? null,
        country: loc?.country_name ?? null,
        city: loc?.city ?? null,
        verificationStatusAtDeletion: tech?.verification_status ?? null,
        applicationsSent: tech ? applications[tech.id] ?? 0 : 0,
        directOffersReceived: tech ? directOffers[tech.id] ?? 0 : 0,
      };
    });
  },

  /**
   * Respuestas de la encuesta de salida, la más reciente primero.
   *
   * Lectura sólo de admin (`adf_select_admin`). Las filas con un `reason` que
   * no reconocemos se DESCARTAN en vez de colarse como texto suelto: si el
   * CHECK de la tabla y `DELETION_REASON_CODES` se separan alguna vez, es mejor
   * que falte una respuesta a que el panel muestre un código crudo como si
   * fuera una etiqueta.
   */
  async getFeedback(): Promise<DeletionFeedback[]> {
    const { data, error } = await supabase
      .from('account_deletion_feedback')
      .select('id, role, reason, comment, created_on')
      .order('created_on', { ascending: false });
    throwIfError(error);

    const rows = (data ?? []) as {
      id: string;
      role: AppRole;
      reason: string;
      comment: string | null;
      created_on: string;
    }[];

    return rows
      .filter((row) => isDeletionReasonCode(row.reason))
      .map((row) => ({
        id: row.id,
        role: row.role,
        reason: row.reason as DeletionReasonCode,
        comment: row.comment,
        createdOn: row.created_on,
      }));
  },
};
