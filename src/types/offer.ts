import { TechnicianTypeCode, LicenseCode, ContractTypeCode, AircraftTypeRatingCatalog } from './catalog';
import { OfferStatus } from './enums';
import { PersistedLocation } from './location';

/**
 * Aviones o helicópteros — nunca las dos cosas en la misma oferta
 * (migración 047, `offers.product_type`).
 *
 * Derivado del productType del catálogo en vez de reescrito, para que las dos
 * listas no puedan separarse. `Gas Airship` se excluye a propósito: son 3
 * filas del catálogo y quedan fuera de las ofertas por decisión de producto,
 * que es también lo que impone el CHECK de la columna.
 */
export type OfferProductType = Exclude<
  NonNullable<AircraftTypeRatingCatalog['productType']>,
  'Gas Airship'
>;

/**
 * UNA AERONAVE que la oferta pide (fila de `offer_required_habilitations`).
 *
 * Fase 6 tanda D: perdió `licenseCode` y `requirementLevel`.
 *  - La licencia es de la OFERTA (`Offer.licenseCode`), no de cada fila:
 *    repetirla por fila permitía pedir B1.3 y B2 a la vez, que son dos
 *    profesiones y por tanto dos ofertas.
 *  - `requirementLevel` (mandatory/preferred) se evaluaba por fila y nadie
 *    entendía cómo se combinaban varias — el scorer se quedaba con la mejor,
 *    así que "tres obligatorias" significaba en la práctica "una cualquiera".
 *    Lo sustituye `Offer.requiresAllAircraft`, una decisión por oferta.
 *
 * ⚠ La invariante de MISMA FILA de CLAUDE.md sigue viva y NO se ha relajado:
 * es una regla sobre el TÉCNICO (`technician_habilitations`, cuyo
 * `licenseCode` sigue siendo NOT NULL). Aquí desaparece la ambigüedad que la
 * hacía necesaria — con una sola licencia por oferta no hay dos entre las
 * que confundirse al cruzarla con cada aeronave.
 */
export interface OfferRequiredHabilitation {
  offerId: string;
  aircraftTypeRatingId: string;
  notes?: string;
  createdAt: string;
}

// Fase 7: `PersistedLocation` trae el modelo nuevo (país ISO obligatorio +
// ciudad opcional con o sin coordenadas). `locationCityId` se retiró en F2d;
// `locationCountry` (el nombre) y `locationCity` siguen porque las pantallas
// de oferta los leen.
export interface Offer extends PersistedLocation {
  id: string;
  companyId: string;
  title: string;
  description: string;
  contractType: ContractTypeCode;
  /**
   * Declarado por la empresa, primer campo del formulario. Acota QUÉ puede
   * pedir la oferta (licencias compatibles y ratings del catálogo); no entra
   * en el scoring — el scorer no lo mira.
   */
  productType: OfferProductType;
  /**
   * UN SOLO tipo de perfil por oferta (Fase 6 tanda C, migración 051).
   *
   * Antes era `requiredTechnicianTypes: TechnicianTypeCode[]` en
   * `OfferWithRequirements`, alimentado por la tabla puente
   * `offer_required_technician_types`. Pedir mecánico Y pintor a la vez eran
   * dos puestos en un anuncio; misma regla que ya rige la licencia (una), el
   * producto (aviones o helicópteros, migración 047) y la certificación de
   * aquí abajo: **una oferta afirma una sola cosa**.
   *
   * Vive en `Offer` y no en `OfferWithRequirements` porque ya es una columna
   * de `offers`, no una relación.
   */
  technicianType: TechnicianTypeCode;
  /**
   * ¿El puesto exige poder CERTIFICAR el trabajo — es decir, licencia EASA en
   * vigor — o basta con saber hacerlo?
   *
   * Es propiedad del PUESTO, no del tipo de perfil de quien lo ocupe. Antes
   * esto se deducía del tipo (`isLicensedTechnicianType`), lo que hacía
   * imposible publicar "ayudante para el A320, sin licencia" y convertía al
   * tipo en portero. Un mecánico puede no tener licencia y seguir siendo
   * mecánico.
   *
   * En la tanda C se guarda y se muestra pero NO cambia el scoring: con
   * `true` el comportamiento es idéntico al de antes de existir la columna
   * (de ahí el DEFAULT true de la migración). Que el scorer elija la fuente
   * de evidencia según este booleano —habilitaciones con licencia vs.
   * experiencia declarada— es la Tanda E.
   */
  requiresCertification: boolean;
  /**
   * UNA sola licencia por oferta (Fase 6 tanda D, migración 053).
   *
   * `undefined` EXACTAMENTE cuando `requiresCertification` es false — una
   * oferta que no exige certificar no puede exigir licencia (invariante de
   * la tanda C). No es opcional en el sentido de "puedes no rellenarlo": la
   * base lo ata con un CHECK en las dos direcciones.
   *
   * Antes eran `requiredLicenses: LicenseCode[]` más una `licenseCode` por
   * cada fila de requisito, que permitían pedir B1.3 y B2 a la vez.
   */
  licenseCode?: LicenseCode;
  /**
   * ¿Basta con UNA de las aeronaves listadas, o hacen falta TODAS?
   *
   * `false` por defecto — "basta con una" — porque es la respuesta esperada
   * en la mayoría de casos y porque coincide con lo que el scorer ya hacía
   * (se quedaba con la mejor coincidencia). `true` es lo que hereda el cap
   * que antes disparaba una fila `mandatory` incumplida.
   */
  requiresAllAircraft: boolean;
  // Controlled snapshot copied from the canonical location catalog at create/update time.
  locationCountry: string;
  locationCity: string;
  locationBaseAirport?: string;
  minYearsExperience: number;
  status: OfferStatus;
  visible: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferWithRequirements extends Offer {
  // Fase 6 tanda C: aquí vivía `requiredTechnicianTypes: TechnicianTypeCode[]`.
  // Ahora es `Offer.technicianType`, un valor único y una columna de `offers`.
  // La tabla puente `offer_required_technician_types` se retira en la 052.
  //
  // Fase 6 tanda D: y aquí vivía `requiredLicenses: LicenseCode[]`. Ahora es
  // `Offer.licenseCode`, una sola y también columna de `offers`.
  //
  // Fase 5 (2026-08-04): requiredAircraftTypes — the approximate by-family
  // requirement — was retired with offer_required_aircraft_types. Aircraft is
  // now only ever expressed exactly.
  //
  // Lista de AERONAVES, a secas: la licencia con la que se cruzan es la de la
  // oferta. Vacía para una oferta que sólo exige la categoría de licencia (o
  // que no exige nada).
  requiredHabilitations: OfferRequiredHabilitation[];
}
