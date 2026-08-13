import { isLicensedTechnicianType } from './technicianTypes';

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

// ── La licencia DECIDE el oficio: rama Part-66 de cada categoría ────────
//
// ⚠ ESTE MAPA ES UNA INVARIANTE (2026-08-13). Hasta hoy su cabecera decía en
// mayúsculas justo lo contrario — "heurística de UI, NO una invariante", y
// que un técnico con licencia sin el tipo marcado era un estado válido. Las
// dos afirmaciones dejan de ser ciertas, y conviene entender por qué antes de
// tocar nada aquí.
//
// El oficio de un técnico se decía en DOS sitios que podían contradecirse: la
// casilla que marcó al registrarse y las licencias que declaró. Mientras el
// tipo no puntuaba, la contradicción era inofensiva y este mapa sólo servía
// para preguntar mejor al quitar un tipo. Desde el techo por tipo de perfil
// (commit 5193b27) el tipo SÍ mueve el score, así que la misma contradicción
// pasó a decidir puntuaciones. Se elimina en origen en vez de arbitrarla: la
// dirección es licencia -> casilla, la casilla implicada se marca sola y no
// se puede desmarcar mientras la licencia siga declarada.
//
// Esto NO es criterio nuestro, y de ahí que pueda ser invariante: B1.x es la
// rama mecánica y B2/B2L la aviónica POR DEFINICIÓN de la Part-66, no por un
// reparto que hayamos elegido. Los tres restantes se derivan de la misma
// definición, no de prudencia:
//   - A1–A4 van con su B1 correspondiente: son line maintenance de la misma
//     célula y motor que habilita la B1, no una categoría aparte.
//   - B3 es mecánico de pistón. Rama mecánica, sin ambigüedad.
//   - L (light aircraft) cubre célula y motor: el trabajo es mecánico.
//
// `C` sigue FUERA del mapa, y por el mismo motivo de siempre: es supervisión
// de mantenimiento base y la sostienen tanto perfiles B1 como B2, así que de
// ella NO se puede deducir oficio. Meterla aquí implicaría un oficio que la
// licencia no dice. Para el formulario de oferta —donde la pregunta es otra:
// "¿qué licencias puede pedir un puesto de este tipo?"— la C sí entra, y por
// eso la añade `licensesSelectableForOfferType` y no este mapa: aquí dentro
// significaría otra cosa.
//
// ⚠ AÑADIR UN TIPO LICENCIADO NUEVO SON DOS SITIOS, NO UNO. Este mapa y el
// catálogo `TECHNICIAN_TYPES` (src/constants/technicianTypes.ts, campo
// `requiresLicense`). Un tipo declarado licenciado en el catálogo pero SIN
// rama aquí cae en el caso de escape de `licensesSelectableForOfferType`, que
// devuelve el CATÁLOGO ENTERO — hoy sólo le pasa a `pilot`, que está inactivo
// en los selectores y por eso no se nota. El día que ese tipo se active, o
// que llegue uno nuevo, el formulario de oferta aceptará cualquier licencia
// para él EN SILENCIO: ni error, ni lista vacía, ni aviso. Es la dirección
// segura de fallo elegida a propósito (no restringir antes que dejar un
// puesto licenciado sin ninguna licencia que pedir), pero sigue siendo un
// silencio, así que la rama se escribe aquí a la vez que la fila allí.
export const LICENSES_BY_TECHNICIAN_TYPE: Record<string, LicenseCode[]> = {
  mechanic: ['A1', 'A2', 'A3', 'A4', 'B1.1', 'B1.2', 'B1.3', 'B1.4', 'B3', 'L'],
  avionic: ['B2', 'B2L'],
};

/**
 * Los tipos de perfil que estas licencias IMPLICAN.
 *
 * Es la dirección única de la regla: de la licencia al oficio, nunca al
 * revés. El perfil del técnico marca estos tipos solo y no deja desmarcarlos
 * mientras la licencia siga declarada (app/technician/profile.tsx), y
 * `replaceProfileTypes` los vuelve a exigir al escribir — una pantalla no
 * puede ser el único sitio donde vive una invariante.
 *
 * `C` no implica ninguno (ver el mapa de arriba). Sin licencias -> [], que es
 * lo correcto y no un caso límite: un chapista sin licencias no tiene ningún
 * tipo implicado, y sus tipos manuales siguen siendo enteramente suyos.
 *
 * El orden es el de las claves del mapa (mechanic, avionic), no el de las
 * licencias recibidas: el resultado se compara y se guarda, así que dos
 * llamadas con las mismas licencias en distinto orden tienen que coincidir.
 */
export function typesImpliedByLicenses(codes: readonly string[]): string[] {
  const held = new Set(codes);
  return Object.keys(LICENSES_BY_TECHNICIAN_TYPE).filter((type) =>
    LICENSES_BY_TECHNICIAN_TYPE[type].some((code) => held.has(code)),
  );
}

/**
 * Los tipos de perfil que quedan tras añadir o quitar una licencia.
 *
 * Es la mecánica de las dos mitades de la regla: la licencia nueva marca su
 * tipo, y la última licencia de una rama se lleva el suyo al irse. La ocupa
 * `toggleLicense` en app/technician/profile.tsx; vive aquí, pura, porque es
 * aritmética de conjuntos con casos que hay que poder probar y no una
 * decisión de pantalla.
 *
 * La cuenta es "quita los que implicaban las licencias de ANTES, pon los que
 * implican las de AHORA". De ahí salen las dos propiedades que importan:
 *   - Los tipos MANUALES (chapa, pintura, composite: ninguna licencia los
 *     implica) sobreviven intactos, y pueden convivir con los implicados.
 *   - Ninguna licencia puede dejar colgado el tipo de otra: quitar la B2 de
 *     un B1.1+B2 libera 'avionic' y deja 'mechanic' donde estaba.
 *
 * Consecuencia asumida: un tipo marcado a mano que DESPUÉS pasa a estar
 * implicado se va con la licencia. Distinguir "lo eligió él" de "lo puso la
 * licencia" pediría un tercer estado, y la regla de esta tanda es justamente
 * que sobre ese eje manda la licencia.
 *
 * Puede devolver [] (quitar la única licencia de un perfil sin tipos
 * manuales). Es un estado de FORMULARIO válido y momentáneo, no uno
 * guardable: el mínimo de un tipo lo siguen imponiendo la pantalla y
 * `replaceProfileTypes`, que es donde debe estar.
 */
export function typesAfterLicenseChange(
  currentTypes: readonly string[],
  previousLicenses: readonly string[],
  nextLicenses: readonly string[],
): string[] {
  const impliedBefore = new Set(typesImpliedByLicenses(previousLicenses));
  return [
    ...new Set([
      ...currentTypes.filter((t) => !impliedBefore.has(t)),
      ...typesImpliedByLicenses(nextLicenses),
    ]),
  ];
}

/**
 * Las licencias que una OFERTA para este tipo de técnico puede exigir.
 *
 * Otra pregunta que la de arriba, y por eso otra función: aquélla deduce
 * oficio de una licencia que alguien YA tiene; ésta acota lo que un puesto
 * puede pedir. La `C` entra en las dos ramas licenciadas justamente porque no
 * implica oficio: un puesto de mantenimiento base que certifica lo puede
 * ocupar tanto un B1 como un B2, así que ofrecerla nunca contradice al tipo
 * declarado por la oferta.
 *
 * Los oficios sin licencia (chapista, pintor, composite) devuelven []: no hay
 * eje Part-66 que pedirles. El formulario, además, ni siquiera pinta la
 * pregunta para ellos — ver `isLicensedTechnicianType`, que es quien decide
 * el corte aquí para que las dos decisiones no puedan divergir.
 *
 * Un tipo licenciado SIN rama declarada (hoy sólo `pilot`, inactivo en los
 * selectores, y cualquier código futuro que no esté en el mapa) devuelve el
 * catálogo entero, no []: desconocer su rama es motivo para no restringir,
 * nunca para dejar un puesto licenciado sin ninguna licencia que pedir. Es la
 * misma dirección de error que ya toma `isLicensedTechnicianType`.
 */
export function licensesSelectableForOfferType(code: string): LicenseCode[] {
  if (!isLicensedTechnicianType(code)) return [];
  const branch = LICENSES_BY_TECHNICIAN_TYPE[code];
  if (!branch) return [...LICENSE_CODES];
  return [...branch, 'C'];
}
