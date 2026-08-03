import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deletedAccountRepository,
  DeletedAccount,
  DeletionFeedback,
} from '../repositories/v2/deletedAccountRepository';
import { DeletionReasonCode, isSuccessfulExit } from '../constants/deletionReasons';

export type DeletedAccountsLoadState = 'loading' | 'success' | 'empty' | 'error';

export interface DeletionReasonTally {
  reason: DeletionReasonCode;
  count: number;
}

export interface DeletionFeedbackSummary {
  /** Cuántas bajas dejaron motivo. El resto se fue sin decir nada, que también es un dato. */
  answered: number;
  /** Bajas por haber conseguido el objetivo AQUÍ: éxito, no fuga. */
  successfulExits: number;
  /** Motivos ordenados por frecuencia, el más común primero. */
  tally: DeletionReasonTally[];
  /** Respuestas con texto libre, lo más reciente primero. */
  withComments: DeletionFeedback[];
}

export interface DeletedAccountsSummary {
  total: number;
  technicians: number;
  companyUsers: number;
  /** Bajas con menos de 24 h de vida: la señal de un alta que no llegó a arrancar. */
  sameDay: number;
  /** Lápidas anteriores a la migración 042, sin fecha de baja registrada. */
  undatedCount: number;
  /** Mediana de días de vida, sólo sobre las que tienen fecha. Null si no hay ninguna. */
  medianLifetimeDays: number | null;
}

interface UseDeletedAccountsReturn {
  accounts: DeletedAccount[];
  summary: DeletedAccountsSummary;
  feedback: DeletionFeedbackSummary;
  state: DeletedAccountsLoadState;
  error: Error | null;
  refresh: () => void;
}

// Mediana y no media: con volúmenes bajos, una sola cuenta de dos años
// desplaza la media lo suficiente como para esconder que casi todas las bajas
// ocurren en los primeros días.
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export function useDeletedAccounts(): UseDeletedAccountsReturn {
  const [accounts, setAccounts] = useState<DeletedAccount[]>([]);
  const [responses, setResponses] = useState<DeletionFeedback[]>([]);
  const [state, setState] = useState<DeletedAccountsLoadState>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev === 'success' ? prev : 'loading'));

    Promise.all([deletedAccountRepository.getAll(), deletedAccountRepository.getFeedback()])
      .then(([data, feedbackRows]) => {
        if (cancelled) return;
        setAccounts(data);
        setResponses(feedbackRows);
        setError(null);
        // 'empty' lo decide la lista de cuentas, no la de respuestas: puede
        // haber bajas sin una sola respuesta, y ese caso NO es una pantalla
        // vacía — es justo el que hay que poder ver.
        setState(data.length === 0 ? 'empty' : 'success');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  const summary = useMemo<DeletedAccountsSummary>(() => {
    const dated = accounts.filter((a) => a.lifetimeDays !== null);
    return {
      total: accounts.length,
      technicians: accounts.filter((a) => a.role === 'technician').length,
      companyUsers: accounts.filter((a) => a.role === 'company_user').length,
      sameDay: dated.filter((a) => a.lifetimeDays === 0).length,
      undatedCount: accounts.length - dated.length,
      medianLifetimeDays: median(dated.map((a) => a.lifetimeDays as number)),
    };
  }, [accounts]);

  const feedback = useMemo<DeletionFeedbackSummary>(() => {
    const counts = new Map<DeletionReasonCode, number>();
    for (const row of responses) {
      counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
    }
    return {
      answered: responses.length,
      successfulExits: responses.filter((row) => isSuccessfulExit(row.reason)).length,
      tally: [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      withComments: responses.filter((row) => row.comment && row.comment.trim().length > 0),
    };
  }, [responses]);

  return { accounts, summary, feedback, state, error, refresh };
}
