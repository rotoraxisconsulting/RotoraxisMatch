// V2 — Full EASA Part-66 license list
export const LICENSE_CATEGORIES = [
  { code: 'A1',   label: 'A1 — Line Maintenance: Turbine-powered Aeroplanes', categoryGroup: 'A', sortOrder: 1 },
  { code: 'A2',   label: 'A2 — Line Maintenance: Piston-powered Aeroplanes',  categoryGroup: 'A', sortOrder: 2 },
  { code: 'A3',   label: 'A3 — Line Maintenance: Turbine-powered Helicopters', categoryGroup: 'A', sortOrder: 3 },
  { code: 'A4',   label: 'A4 — Line Maintenance: Piston-powered Helicopters',  categoryGroup: 'A', sortOrder: 4 },
  { code: 'B1.1', label: 'B1.1 — Mechanical: Turbine-powered Aeroplanes',     categoryGroup: 'B1', sortOrder: 5 },
  { code: 'B1.2', label: 'B1.2 — Mechanical: Piston-powered Aeroplanes',      categoryGroup: 'B1', sortOrder: 6 },
  { code: 'B1.3', label: 'B1.3 — Mechanical: Turbine-powered Helicopters',    categoryGroup: 'B1', sortOrder: 7 },
  { code: 'B1.4', label: 'B1.4 — Mechanical: Piston-powered Helicopters',     categoryGroup: 'B1', sortOrder: 8 },
  { code: 'B2',   label: 'B2 — Avionics',                                     categoryGroup: 'B2', sortOrder: 9 },
  { code: 'B2L',  label: 'B2L — Limited Avionics',                            categoryGroup: 'B2', sortOrder: 10 },
  { code: 'B3',   label: 'B3 — Piston-engine non-pressurised aeroplanes',     categoryGroup: 'B3', sortOrder: 11 },
  { code: 'L',    label: 'L — Light Aircraft',                                categoryGroup: 'L',  sortOrder: 12 },
  { code: 'C',    label: 'C — Base Maintenance (Aircraft)',                    categoryGroup: 'C',  sortOrder: 13 },
] as const;

export type LicenseCode = (typeof LICENSE_CATEGORIES)[number]['code'];

export const LICENSE_CODES = LICENSE_CATEGORIES.map((l) => l.code);

// ── Licencias inequívocamente ligadas a un tipo de perfil ───────────────
//
// ⚠ HEURÍSTICA DE UI, **NO** UNA INVARIANTE. Su único uso es decidir qué
// licencias se OFRECEN para retirar cuando un técnico quita un tipo de su
// perfil (Fase 6 tanda A). No filtra, no puntúa, no valida y no restringe
// nada de lo que el técnico puede declarar.
//
// Un técnico PUEDE tener licencias sin el tipo correspondiente marcado. Es
// un estado VÁLIDO, no una inconsistencia: el score no depende del tipo, así
// que no rompe ni falsea nada. La respuesta "No, consérvalas" del diálogo es
// siempre legítima, y equivocarse aquí no corrompe absolutamente nada — como
// mucho la pregunta ofrece una licencia de menos.
//
// Los datos vivos ya lo confirman: hay un perfil `avionic` con A2/B1.1/B1.2/
// B1.3 y un `mechanic` con una B2. Si alguien lee este mapa como norma en
// vez de como sugerencia, esos perfiles pasan a ser "errores" que no lo son.
//
// Cada código tiene su rama, MENOS UNO (corrección del 2026-08-10, sobre un
// primer reparto que dejaba fuera A1–A4, B3 y L por prudencia mal aplicada):
//   - A1–A4 van con su B1 correspondiente: son line maintenance de la misma
//     célula y motor que habilita la B1, no una categoría aparte.
//   - B3 es mecánico de pistón. Rama mecánica, sin ambigüedad.
//   - L (light aircraft) cubre célula y motor: el trabajo es mecánico.
//
// `C` es la ÚNICA que se queda fuera, y por un motivo sólido, no por
// prudencia: es supervisión de mantenimiento base y la sostienen tanto
// perfiles B1 como B2. Si se le asignara una rama, quitar esa rama la
// declararía huérfana cuando la otra sigue sosteniéndola perfectamente. Al no
// tener ninguna, no puede quedar huérfana con NINGUNA combinación de tipos,
// que es exactamente el comportamiento correcto.
export const LICENSES_BY_TECHNICIAN_TYPE: Record<string, LicenseCode[]> = {
  mechanic: ['A1', 'A2', 'A3', 'A4', 'B1.1', 'B1.2', 'B1.3', 'B1.4', 'B3', 'L'],
  avionic: ['B2', 'B2L'],
};

/**
 * Licencias que quedarían HUÉRFANAS al pasar de `previousTypes` a
 * `nextTypes`: las que este mapa liga a un tipo que se va y que NINGÚN tipo
 * conservado reclama.
 *
 * Ejemplo del caso que motivó esto: un técnico "mechanic + avionic" quita
 * "mechanic" -> B1.3 queda huérfana, B2 no.
 *
 * Devuelve [] si no hay ninguna, y entonces no se pregunta nada.
 */
export function findOrphanedLicenses(
  heldLicenses: readonly string[],
  previousTypes: readonly string[],
  nextTypes: readonly string[],
): LicenseCode[] {
  const removed = previousTypes.filter((t) => !nextTypes.includes(t));
  if (removed.length === 0) return [];

  const claimedByRemoved = new Set(removed.flatMap((t) => LICENSES_BY_TECHNICIAN_TYPE[t] ?? []));
  const claimedByKept = new Set(nextTypes.flatMap((t) => LICENSES_BY_TECHNICIAN_TYPE[t] ?? []));

  return heldLicenses.filter(
    (code): code is LicenseCode => claimedByRemoved.has(code as LicenseCode) && !claimedByKept.has(code as LicenseCode),
  );
}
