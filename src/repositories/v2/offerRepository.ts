import { supabase } from '../../lib/supabase';
import { Offer, OfferProductType, OfferRequiredHabilitation, OfferWithRequirements } from '../../types/offer';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../types/catalog';
import { OfferStatus } from '../../types/enums';
import { licensesSelectableForOfferType } from '../../constants/licenses';
import { isLicensedTechnicianType, technicianTypeLabel } from '../../constants/technicianTypes';
import { LocationValue, PersistedLocation } from '../../types/location';
import { locationColumns, persistedLocationFromValue } from '../../utils/locationBridge';
import { OfferSalary } from '../../types/offerSalary';
import { salaryColumns } from '../../utils/offerSalary';
import {
  loadOfferRequirements,
  mapOfferRow,
  throwIfError,
  withRequirements,
  throwIfNoRows,
} from './supabaseMappers';

// Una sola lista de columnas para las siete consultas de `offers` de este
// fichero. Estaba repetida literalmente en cada una, y añadir `product_type`
// (migración 047) exigía acertar siete veces: olvidar una devuelve un Offer
// con `productType` undefined y NADA lo señala hasta que la UI pinta el badge
// vacío o el guardado escribe basura.
// Fase 7 F2b: `location_city` y `location_base_airport` SALEN de esta lista
// porque la migración 059 las retira. Dejar de pedirlas tiene que ir ANTES
// del DROP (expand-contract): un SELECT explícito de una columna inexistente
// no se ignora, revienta todas las consultas de la tabla. Es literalmente el
// mismo aviso que dejó `profile_completeness` en technicianRepositoryV2.
// Entran las cinco del modelo nuevo.
//
// ⚠ FUERA DEL ENCARGO DE F2b, pero encontrado al reescribir esta línea:
// faltaban `license_code` y `requires_all_aircraft`. Las siete consultas de
// ofertas de este fichero pasan por aquí y `mapOfferRow` las lee, así que
// TODA oferta volvía con `licenseCode: undefined` y `requiresAllAircraft:
// false`, dijera lo que dijera la fila. Es la tercera vez que muerde el mismo
// patrón — es justo lo que avisa el comentario original de esta constante
// sobre `product_type`, y la hermana de los dos fallos de `offerPatchToDb` de
// la tanda D.
//
// Hoy no cambia ningún score porque la tabla `offers` está VACÍA (0 filas,
// verificado). En cuanto hubiera una oferta, el scorer estaría puntuando su
// licencia como si no existiera.
const OFFER_COLUMNS =
  'id, company_id, title, description, contract_type, salary_amount, salary_currency, salary_period, product_type, technician_type, requires_certification, license_code, requires_all_aircraft, location_country, location_country_code, location_city_name, location_city_lat, location_city_lng, location_city_geoname_id, min_years_experience, status, visible, expires_at, created_at, updated_at';

/**
 * La localización de una oferta, tal y como la produce el selector.
 *
 * Fase 7 F2c: sustituye a `controlledOfferLocation`, que derivaba los cuatro
 * campos de un aeropuerto del catálogo. Ya no hay aeropuerto que derivar —
 * `CountryCityPicker` entrega país y ciudad directamente.
 *
 * `locationCountry` (el NOMBRE del país) sigue escribiéndose porque su
 * columna es NOT NULL y las pantallas la leen; sale del propio selector, no
 * de una segunda resolución. Muere con `location_city_id` en la migración de
 * retirada.
 */
export interface OfferLocationWrite extends PersistedLocation {
  /** Nombre del país para la columna `location_country`, NOT NULL. */
  locationCountry: string;
}

export function offerLocationFromValue(value: LocationValue): OfferLocationWrite {
  if (!value.country) {
    throw new Error('Offer location must have a country.');
  }
  return {
    ...persistedLocationFromValue(value),
    locationCountry: value.country.name,
  };
}

function offerPatchToDb(patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Record<string, unknown> {
  return {
    ...salaryColumns(patch.salary),
    ...(patch.companyId !== undefined ? { company_id: patch.companyId } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.contractType !== undefined ? { contract_type: patch.contractType } : {}),
    ...(patch.productType !== undefined ? { product_type: patch.productType } : {}),
    ...(patch.technicianType !== undefined ? { technician_type: patch.technicianType } : {}),
    ...(patch.requiresCertification !== undefined ? { requires_certification: patch.requiresCertification } : {}),
    // `license_code` y `requires_certification` están ATADAS por
    // chk_offers_license_matches_certification (migración 053). Escribir una
    // sin la otra deja la fila en un estado que Postgres rechaza y tumba el
    // UPDATE ENTERO — verificado en vivo: apagar la certificación sin poner
    // la licencia a NULL viola el CHECK.
    //
    // Al apagar el interruptor la licencia se va a NULL SIN MIRAR el patch:
    // no es una preferencia del llamante, es el único valor que el CHECK
    // admite ahí. En cualquier otro caso se escribe lo que traiga el patch.
    //
    // Estas dos líneas faltaban desde la tanda D: `license_code` y
    // `requiresAllAircraft` se añadieron a create() y NUNCA aquí, así que
    // editar una oferta para cambiar su licencia o su "hacen falta todas" no
    // guardaba nada — sin error, sin aviso.
    ...(patch.requiresCertification === false
      ? { license_code: null }
      : patch.licenseCode !== undefined
        ? { license_code: patch.licenseCode }
        : {}),
    ...(patch.requiresAllAircraft !== undefined ? { requires_all_aircraft: patch.requiresAllAircraft } : {}),
    ...(patch.locationCountry !== undefined ? { location_country: patch.locationCountry } : {}),
    // Fase 7 F2c — la localización se escribe DIRECTA, y las cinco columnas
    // van SIEMPRE juntas. `locationColumns()` no permite escribir sólo
    // algunas: cambiar el país sin limpiar las coordenadas dejaría el punto
    // de la ciudad anterior colgando del país nuevo.
    //
    // `location_city_id` YA NO SE ESCRIBE. La migración 060 lo hizo opcional
    // porque el formulario dejó de preguntar por un aeropuerto; la columna y
    // su FK siguen ahí, para las filas viejas, hasta su propia migración.
    ...(patch.locationCountryCode !== undefined ? locationColumns(patch as PersistedLocation) : {}),
    ...(patch.minYearsExperience !== undefined ? { min_years_experience: patch.minYearsExperience } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
    ...(patch.expiresAt !== undefined ? { expires_at: patch.expiresAt ?? null } : {}),
  };
}

export function isOfferOpenForTechnicians(offer: Pick<Offer, 'status' | 'visible'> | null | undefined): boolean {
  return Boolean(offer && offer.status === 'published' && offer.visible);
}

/**
 * Una oferta que NO exige certificar el trabajo no tiene eje Part-66: pedir
 * una licencia o un type rating en ella es una contradicción con lo que la
 * propia oferta declara.
 *
 * Fase 6 tanda C: antes esta regla se deducía del TIPO de perfil buscado
 * (`offerTargetsLicensedProfiles`, sobre un array de tipos). Ahora la
 * gobierna el interruptor que la empresa marca explícitamente, que es de
 * quien siempre debió depender — un mecánico puede no tener licencia y
 * seguir siendo mecánico, así que deducirlo del tipo impedía publicar
 * "ayudante para el A320, sin licencia".
 *
 * This runs in the repository, not only in the form, on purpose. Hiding the
 * sections on screen stops the ONE path a user clicks through; it does
 * nothing about a stale form state, a screen that flips the switch after the
 * requirements, or any future caller. The rule belongs where every write
 * passes through.
 *
 * Throws rather than silently stripping the requirements: dropping them
 * quietly would tell the company "saved" while discarding what it typed —
 * the same class of false success `throwIfNoRows` exists to prevent.
 */
// Fase 6 tanda E: AQUÍ VIVÍA `assertRequirementsMatchCertification`, que
// rechazaba aeronaves en una oferta sin certificación.
//
// Se retira porque prohibía justo el caso que abre la fase entera: **"busco un
// ayudante para el A320, sin licencia"**. Sin licencia sí, pero el A320 hay
// que poder decirlo — si no, la experiencia declarada del técnico no tiene
// contra qué compararse y la tanda B se queda sin uso.
//
// La lectura de la tanda C ("sin certificación no hay eje Part-66 que pedir")
// era correcta sólo para la LICENCIA, no para la aeronave. La licencia la
// sigue atando el CHECK chk_offers_license_matches_certification (migración
// 053), en la base y no aquí, así que no queda nada que este assert pudiera
// comprobar que Postgres no compruebe mejor.
//
// Lo que separa una oferta de ayudante de una que certifica es qué EVIDENCIA
// vale, y eso lo decide el scorer (offerMatchExplain), no una prohibición de
// escritura.

/**
 * El OFICIO declarado por la oferta y la LICENCIA que pide tienen que decir
 * lo mismo (2026-08-13). Dos contradicciones, las dos rechazadas:
 *
 *   1. Una licencia que no es de la rama del oficio — un puesto de aviónico
 *      pidiendo B1.2. La rama es definición Part-66, no criterio nuestro:
 *      ver LICENSES_BY_TECHNICIAN_TYPE. (La `C` es de las dos ramas y por eso
 *      `licensesSelectableForOfferType` la admite en ambas.)
 *   2. Exigir certificar en un oficio que no tiene licencias — chapa, pintura
 *      o composite. No es que la respuesta sea "no": es que la pregunta no
 *      existe para ellos, así que un `true` ahí no significa nada.
 *
 * Va en el repositorio y no sólo en el formulario por el mismo motivo que la
 * regla del interruptor de la tanda C: esconder una sección corta EL camino
 * que un usuario recorre a clics, y no hace nada contra un estado de
 * formulario desfasado, una pantalla que cambie el tipo después de la
 * licencia, o cualquier llamante futuro. Hoy, además, la base no puede
 * ayudar: `chk_offers_license_matches_certification` (migración 053) ata la
 * licencia al interruptor, pero NINGÚN CHECK ata licencia y tipo. Si esta
 * regla se asienta, ese CHECK es el sitio natural para ella — pendiente de
 * decidir, sin migración por ahora.
 *
 * Lanza en vez de corregir en silencio: escribir algo distinto de lo que la
 * empresa pidió y responder "guardado" es la clase de éxito falso que este
 * fichero evita en todas partes.
 */
function assertLicenseMatchesTechnicianType(
  technicianType: TechnicianTypeCode,
  requiresCertification: boolean,
  licenseCode: LicenseCode | undefined,
): void {
  if (!isLicensedTechnicianType(technicianType)) {
    if (requiresCertification || licenseCode) {
      throw new Error(
        `A ${technicianTypeLabel(technicianType).toLowerCase()} role holds no EASA licence, so this offer cannot require certified work. Switch off the licence requirement, or change the profile type.`,
      );
    }
    return;
  }

  if (licenseCode && !licensesSelectableForOfferType(technicianType).includes(licenseCode)) {
    throw new Error(
      `${licenseCode} is not a licence of ${technicianTypeLabel(technicianType).toLowerCase()} work, so this offer cannot require it. Pick a licence of that trade, or change the profile type.`,
    );
  }
}

export const offerRepository = {
  async getAll(): Promise<Offer[]> {
    const { data, error } = await supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRow);
  },

  async getById(id: string): Promise<Offer | null> {
    const { data, error } = await supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferRow(data as any) : null;
  },

  async getPublished(): Promise<Offer[]> {
    const { data, error } = await supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .eq('status', 'published')
      .eq('visible', true)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRow);
  },

  async getForCompany(companyId: string): Promise<Offer[]> {
    const { data, error } = await supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRow);
  },

  async getWithRequirements(id: string): Promise<OfferWithRequirements | null> {
    const offer = await this.getById(id);
    if (!offer) return null;
    const reqs = await loadOfferRequirements([id]);
    return withRequirements(offer, reqs[id]);
  },

  async getAllWithRequirements(): Promise<OfferWithRequirements[]> {
    const offers = await this.getAll();
    const reqs = await loadOfferRequirements(offers.map((o) => o.id));
    return offers.map((offer) => withRequirements(offer, reqs[offer.id]));
  },

  async getPublishedWithRequirements(): Promise<OfferWithRequirements[]> {
    const offers = await this.getPublished();
    const reqs = await loadOfferRequirements(offers.map((o) => o.id));
    return offers.map((offer) => withRequirements(offer, reqs[offer.id]));
  },

  async updateStatus(id: string, status: OfferStatus): Promise<Offer | null> {
    const { data, error } = await supabase
      .from('offers')
      .update({ status, visible: status === 'published' })
      .eq('id', id)
      .select(OFFER_COLUMNS)
      .maybeSingle();
    throwIfError(error);
    // `.select()` sin comprobar el resultado seguía siendo un éxito falso: con
    // RLS bloqueando (p. ej. rol `viewer`, que no pasa can_act_for_company)
    // `data` llega null, `error` null, y AMBOS llamantes descartan el retorno
    // — la oferta "cambiaba de estado" y volvía al recargar. Actualizar por id
    // algo que no existe o que no puedes tocar nunca es un resultado válido.
    if (!data) {
      throw new Error('Could not update this offer — it may no longer exist, or you may not have permission.');
    }
    return mapOfferRow(data as any);
  },

  async update(id: string, patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Promise<Offer | null> {
    // Validate before any mutation, including replacing aircraft requirements.
    salaryColumns(patch.salary);
    const existing = await this.getById(id);
    if (!existing) return null;

    // Sobre el estado RESULTANTE, no sobre el patch: un patch que sólo trae el
    // tipo de perfil puede contradecir la licencia que ya está en la fila, y
    // sería justo la contradicción que esto existe para impedir. El valor
    // efectivo de la licencia se calcula igual que lo escribe offerPatchToDb
    // — apagar el interruptor la pone a NULL sin mirar el patch, y un
    // `licenseCode` ausente deja la de la fila.
    const nextRequiresCertification = patch.requiresCertification ?? existing.requiresCertification;
    assertLicenseMatchesTechnicianType(
      patch.technicianType ?? existing.technicianType,
      nextRequiresCertification,
      nextRequiresCertification === false ? undefined : (patch.licenseCode ?? existing.licenseCode),
    );

    // Cambiar el producto de la oferta con requisitos exactos dentro es
    // IMPOSIBLE en Postgres: `orh_matches_offer` (migración 047) ata cada fila
    // de offer_required_habilitations al par (offer_id, product_type) de su
    // oferta, y un UPDATE de esa columna con hijos vivos viola la FK. Las filas
    // tienen que salir primero y la columna cambiar después — no hay otro
    // orden posible.
    //
    // Borrarlas aquí no es una decisión silenciosa: son requisitos del
    // producto contrario, ya inválidos, y la pantalla de edición hace
    // confirmar el cambio antes de llegar a este punto (app/company/offers/
    // edit.tsx). Acotado a un cambio REAL de producto: guardar sin tocar el
    // selector no borra nada.
    if (patch.productType !== undefined && patch.productType !== existing.productType) {
      await this.replaceRequiredHabilitations(id, []);
    }

    // Fase 6 tanda E: apagar el interruptor YA NO BORRA LAS AERONAVES.
    //
    // Esta rama existía porque una oferta sin certificación tenía prohibido
    // nombrar aeronaves. Al levantarse esa prohibición, borrarlas sería
    // destruir justo lo que la oferta sigue queriendo decir: "el puesto es
    // para el A320, sólo que no hace falta que puedas firmarlo".
    //
    // Lo único que se limpia al apagar es la LICENCIA, y lo hace el propio
    // UPDATE de abajo en la misma sentencia — que es lo que exige
    // chk_offers_license_matches_certification. Ver offerPatchToDb.

    // Fase 7 F2c: ya no hay "localización controlada" que recalcular. El
    // patch trae país y ciudad tal y como el selector los produjo, y
    // `offerPatchToDb` escribe las cinco columnas juntas o ninguna.
    const { data, error } = await supabase
      .from('offers')
      .update(offerPatchToDb(patch))
      .eq('id', id)
      .select(OFFER_COLUMNS)
      .maybeSingle();
    throwIfError(error);
    // Mismo motivo que updateStatus: app/company/offers/edit.tsx descarta el
    // retorno, así que sin esto un guardado bloqueado por RLS era invisible.
    if (!data) {
      throw new Error('Could not save this offer — it may no longer exist, or you may not have permission.');
    }
    return mapOfferRow(data as any);
  },

  async create(data: {
    companyId: string;
    title: string;
    description: string;
    contractType: ContractTypeCode;
    salary?: OfferSalary | null;
    productType: OfferProductType;
    technicianType: TechnicianTypeCode;
    requiresCertification: boolean;
    /** Fase 7 F2c: país + ciudad del selector, no un aeropuerto del catálogo. */
    location: LocationValue;
    minYearsExperience: number;
    status?: OfferStatus;
    licenseCode?: LicenseCode;
    requiresAllAircraft?: boolean;
    requiredHabilitations?: { aircraftTypeRatingId: string; notes?: string }[];
  }): Promise<OfferWithRequirements> {
    const status = data.status ?? 'draft';
    assertLicenseMatchesTechnicianType(data.technicianType, data.requiresCertification, data.licenseCode);
    const location = offerLocationFromValue(data.location);
    const { data: inserted, error } = await supabase
      .from('offers')
      .insert({
        company_id: data.companyId,
        title: data.title,
        description: data.description,
        contract_type: data.contractType,
        ...salaryColumns(data.salary ?? undefined),
        product_type: data.productType,
        technician_type: data.technicianType,
        requires_certification: data.requiresCertification,
        // `?? null`: sin licencia elegida la columna va a NULL, que es lo que
        // el CHECK exige cuando no se certifica — y lo que rechaza cuando sí.
        license_code: data.licenseCode ?? null,
        requires_all_aircraft: data.requiresAllAircraft ?? false,
        location_country: location.locationCountry,
        // Fase 7 F2c: las cinco juntas, y sin `location_city_id` — la oferta
        // ya no nace de un aeropuerto. La 060 hizo esa columna opcional.
        ...locationColumns(location),
        min_years_experience: data.minYearsExperience,
        status,
        visible: status === 'published',
      })
      .select(OFFER_COLUMNS)
      .single();
    throwIfError(error);

    const offer = mapOfferRow(inserted as any);
    const habilitations = data.requiredHabilitations ?? [];
    await this.replaceRequiredHabilitations(offer.id, habilitations);
    return withRequirements(offer, {
      requiredHabilitations: habilitations.map((h) => ({ ...h, offerId: offer.id, createdAt: offer.createdAt })),
    });
  },

  /**
   * Live dependents = rows representing an actual transaction against this
   * offer (applications, direct offers). Used to decide, BEFORE acting,
   * whether delete() can remove the row for real or must archive it
   * instead — see docs/OFFER_DELETE_SOFT_DELETE_PROPOSAL.md. Exposed
   * separately (not just inlined into delete()) so the UI can show the
   * right confirmation copy before the user commits to an action.
   */
  async getDependentCounts(offerId: string): Promise<{ applications: number; directOffers: number }> {
    const [applications, directOffers] = await Promise.all([
      supabase.from('offer_applications').select('id', { count: 'exact', head: true }).eq('offer_id', offerId),
      supabase.from('offer_requests').select('id', { count: 'exact', head: true }).eq('offer_id', offerId),
    ]);
    throwIfError(applications.error);
    throwIfError(directOffers.error);
    return { applications: applications.count ?? 0, directOffers: directOffers.count ?? 0 };
  },

  /**
   * Zero applications AND zero direct offers ever referenced this offer →
   * nothing else in the system depends on the row, so a real DELETE is
   * safe and removes it. Otherwise the row is never deleted — it's
   * archived in place (status: 'archived'), leaving every application,
   * direct offer and chat tied to it completely untouched. Re-derives the
   * dependent counts itself rather than trusting a caller's earlier
   * getDependentCounts() result, since state can change between the two
   * calls (e.g. the UI's pre-check for dialog copy vs. this actually
   * running) — worst case a borderline race means this deletes for real
   * instead of archiving, never the reverse, which is the safe direction
   * to be wrong in.
   * offers_delete_company (migration 026) enforces the same
   * zero-dependents rule at the database level too — this method decides
   * the branch proactively so an RLS-blocked delete (0 rows, no error)
   * never happens in normal use, it's a backstop, not the fix itself.
   */
  async delete(id: string): Promise<{ action: 'deleted' | 'archived' }> {
    const { applications, directOffers } = await this.getDependentCounts(id);

    // .delete()/.update() report error: null even when RLS silently matches
    // zero rows (this is exactly the bug this whole method exists to close
    // — see offers_delete_company, migration 026) — error === null is NOT
    // proof the mutation happened. .select('id') forces Postgres to return
    // the affected row(s), so an empty result is detectable and treated as
    // failure instead of silently reported as success.
    if (applications === 0 && directOffers === 0) {
      const { data, error } = await supabase.from('offers').delete().eq('id', id).select('id');
      throwIfError(error);
      if (!data || data.length === 0) {
        throw new Error('Could not delete this offer — it may no longer exist, or you may not have permission.');
      }
      return { action: 'deleted' };
    }

    const { data, error } = await supabase
      .from('offers')
      .update({ status: 'archived' as OfferStatus })
      .eq('id', id)
      .select('id');
    throwIfError(error);
    if (!data || data.length === 0) {
      throw new Error('Could not archive this offer — it may no longer exist, or you may not have permission.');
    }
    return { action: 'archived' };
  },

  // Fase 6 tanda E: AQUÍ VIVÍA `replaceRequirements`, que en la tanda D ya se
  // había quedado sin nada propio que escribir (su tabla,
  // `offer_required_licenses`, la sustituyó `offers.license_code`) y sólo
  // conservaba el assert de coherencia con el interruptor. Retirado el assert,
  // era un envoltorio de una línea alrededor del método de abajo, así que las
  // pantallas llaman ya directamente a `replaceRequiredHabilitations`.
  //
  // Aircraft requirements.
  //
  // Fase 6 tanda D: cada fila es UNA AERONAVE. La licencia con la que se
  // cruza es la de la oferta (`offers.license_code`) y ya no se repite aquí;
  // `requirement_level` desaparece con mandatory/preferred.
  async replaceRequiredHabilitations(
    offerId: string,
    habilitations: { aircraftTypeRatingId: string; notes?: string }[],
  ): Promise<void> {
    const { error: deleteError } = await supabase
      .from('offer_required_habilitations')
      .delete()
      .eq('offer_id', offerId);
    throwIfError(deleteError);

    if (habilitations.length === 0) return;

    // `product_type` se LEE de la oferta, nunca se recibe del llamante: es el
    // valor que las FK compuestas de la migración 047 obligan a que coincida
    // con el de la oferta Y con el del rating. Un parámetro sería una segunda
    // oportunidad de equivocarse (y un llamante podría pasarlo desfasado
    // respecto a lo que la oferta acaba de guardar); leerlo aquí hace que solo
    // exista un valor posible. Si el rating es del otro producto, el insert
    // falla en Postgres — que es exactamente lo que queremos.
    const offer = await this.getById(offerId);
    if (!offer) {
      throw new Error('Could not save the type rating requirements — this offer no longer exists.');
    }

    const { data, error } = await supabase
      .from('offer_required_habilitations')
      .insert(
        habilitations.map((h) => ({
          offer_id: offerId,
          product_type: offer.productType,
          aircraft_type_rating_id: h.aircraftTypeRatingId,
          notes: h.notes ?? null,
        })),
      )
      .select('offer_id');
    throwIfError(error);
    // El delete ya se llevó los requisitos anteriores: si el insert no entra,
    // la oferta se queda SIN requisitos exactos y el scoring cambia por
    // completo, en silencio.
    throwIfNoRows(data, 'Could not save the type rating requirements — you may not have permission to edit this offer.');
  },
};
