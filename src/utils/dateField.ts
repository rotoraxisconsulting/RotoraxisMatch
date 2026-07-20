// Shared by DateField.native.tsx / DateField.web.tsx — pure functions, no
// RN imports, safe to pull into either bundle.
//
// ISO dates are parsed/built from local Y/M/D components (never
// `new Date(iso)` or `.toISOString()`) so a date entered as "2026-07-20"
// never shifts a day in either direction across timezones.

export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function localDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(iso: string): string {
  return isoToLocalDate(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
