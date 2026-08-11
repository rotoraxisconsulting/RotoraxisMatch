import { supabase } from '../../lib/supabase';
import { Offer, OfferProductType, OfferRequiredHabilitation, OfferWithRequirements } from '../../types/offer';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../types/catalog';
import { OfferStatus } from '../../types/enums';
import { resolveLocationSnapshot } from '../../constants/locationCities';
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
const OFFER_COLUMNS =
  'id, company_id, title, description, contract_type, product_type, technician_type, requires_certification, location_city_id, location_country, location_city, location_base_airport, min_years_experience, status, visible, expires_at, created_at, updated_at';

type OfferLocationInput = {
  locationCityId?: string;
  locationCountry?: string;
  locationCity?: string;
  locationBaseAirport?: string;
};

function controlledOfferLocation(reference: OfferLocationInput): Pick<Offer, 'locationCityId' | 'locationCountry' | 'locationCity' | 'locationBaseAirport'> {
  const location = resolveLocationSnapshot({
    locationCityId: reference.locationCityId,
    country: reference.locationCountry,
    city: reference.locationCity,
    baseAirport: reference.locationBaseAirport,
  });

  if (!location) {
    throw new Error('Offer location must reference a valid catalog city.');
  }

  return {
    locationCityId: location.locationCityId,
    locationCountry: location.country,
    locationCity: location.city,
    locationBaseAirport: location.baseAirport,
  };
}

function hasOfferLocationPatch(patch: Partial<Offer>): boolean {
  return (
    patch.locationCityId !== undefined ||
    patch.locationCountry !== undefined ||
    patch.locationCity !== undefined ||
    patch.locationBaseAirport !== undefined
  );
}

function offerPatchToDb(patch: Partial<Omit<Offer, 'id' | 'createdAt'>>): Record<string, unknown> {
  return {
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
    ...(patch.locationCityId !== undefined ? { location_city_id: patch.locationCityId } : {}),
    ...(patch.locationCountry !== undefined ? { location_country: patch.locationCountry } : {}),
    ...(patch.locationCity !== undefined ? { location_city: patch.locationCity } : {}),
    ...(patch.locationBaseAirport !== undefined ? { location_base_airport: patch.locationBaseAirport } : {}),
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
function assertRequirementsMatchCertification(requirements: {
  requiresCertification: boolean;
  // Fase 6 tanda D: `licenses` desapareció del parámetro. La licencia es
  // ahora `offers.license_code`, y su coherencia con el interruptor la impone
  // el CHECK chk_offers_license_matches_certification (migración 053) — en la
  // base, no sólo aquí. Lo que sigue sin poder comprobar un CHECK es la
  // relación entre el interruptor y las filas de OTRA tabla, que es
  // exactamente lo que queda en esta función.
  habilitations?: readonly unknown[];
}): void {
  if (requirements.requiresCertification) return;
  if ((requirements.habilitations?.length ?? 0) === 0) return;

  throw new Error(
    'This offer does not require certified work, so it cannot require an aircraft type rating. ' +
      'Remove those requirements, or turn certification back on.',
  );
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
    const existing = await this.getById(id);
    if (!existing) return null;

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

    // Apagar la certificación con AERONAVES vivas (Fase 6 tanda C, corregido
    // en la D). Aquí NO hay ninguna FK que fuerce el orden, al contrario que
    // arriba: lo que lo fuerza es la INVARIANTE — una oferta que declara no
    // necesitar certificación no puede exigir un rating, y
    // assertRequirementsMatchCertification lo rechaza. Sin esta limpieza, un
    // llamante que actualizara la columna y no llamara después a
    // replaceRequirements dejaría la oferta en un estado que el repositorio
    // se niega a aceptar pero que la base ya tiene guardado.
    //
    // La LICENCIA no se limpia aquí: desde la tanda D vive en
    // `offers.license_code` y la pone a NULL el propio UPDATE de abajo, en la
    // misma sentencia que apaga el interruptor — que es lo que el CHECK
    // exige. Aquí había un DELETE sobre `offer_required_licenses`, resto de
    // cuando esa tabla era la fuente de licencias: con la migración 054
    // aplicada habría lanzado excepción (tiene throwIfError debajo) y
    // reventado el guardado.
    //
    // Acotado a un cambio REAL de true -> false: guardar sin tocar el
    // interruptor no borra nada, y encenderlo no borra nada tampoco.
    if (patch.requiresCertification === false && existing.requiresCertification) {
      await this.replaceRequiredHabilitations(id, []);
    }

    const locationPatch = hasOfferLocationPatch(patch)
      ? controlledOfferLocation({ ...existing, ...patch })
      : {};
    const { data, error } = await supabase
      .from('offers')
      .update(offerPatchToDb({ ...patch, ...locationPatch }))
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
    productType: OfferProductType;
    technicianType: TechnicianTypeCode;
    requiresCertification: boolean;
    locationCityId: string;
    locationCountry?: string;
    locationCity?: string;
    locationBaseAirport?: string;
    minYearsExperience: number;
    status?: OfferStatus;
    licenseCode?: LicenseCode;
    requiresAllAircraft?: boolean;
    requiredHabilitations?: { aircraftTypeRatingId: string; notes?: string }[];
  }): Promise<OfferWithRequirements> {
    // Checked BEFORE the insert: failing after it would leave an orphan
    // offer row behind for a save the caller was told had failed.
    assertRequirementsMatchCertification({
      requiresCertification: data.requiresCertification,
      habilitations: data.requiredHabilitations ?? [],
    });
    const status = data.status ?? 'draft';
    const location = controlledOfferLocation(data);
    const { data: inserted, error } = await supabase
      .from('offers')
      .insert({
        company_id: data.companyId,
        title: data.title,
        description: data.description,
        contract_type: data.contractType,
        product_type: data.productType,
        technician_type: data.technicianType,
        requires_certification: data.requiresCertification,
        // `?? null`: sin licencia elegida la columna va a NULL, que es lo que
        // el CHECK exige cuando no se certifica — y lo que rechaza cuando sí.
        license_code: data.licenseCode ?? null,
        requires_all_aircraft: data.requiresAllAircraft ?? false,
        location_city_id: location.locationCityId,
        location_country: location.locationCountry,
        location_city: location.locationCity,
        location_base_airport: location.locationBaseAirport,
        min_years_experience: data.minYearsExperience,
        status,
        visible: status === 'published',
      })
      .select(OFFER_COLUMNS)
      .single();
    throwIfError(error);

    const offer = mapOfferRow(inserted as any);
    const habilitations = data.requiredHabilitations ?? [];
    // `offer.requiresCertification` y no `data.`: lo que vale es lo que la
    // base acaba de guardar, no lo que el llamante creía estar mandando.
    await this.replaceRequirements(offer.id, {
      requiresCertification: offer.requiresCertification,
      habilitations,
    });
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

  /**
   * Fase 6 tanda D: este método se ha quedado sin nada propio que escribir.
   *
   * Escribía `offer_required_licenses` (el conjunto de categorías que la
   * oferta pedía). Esa tabla la sustituye `offers.license_code` — UNA sola
   * licencia, columna de `offers`, escrita por create()/update(). La tabla
   * queda sin lectores ni escritores y se dropea en la migración 054.
   *
   * Se conserva como puerta de entrada porque sigue haciendo dos cosas que
   * importan: valida la coherencia con el interruptor de certificación ANTES
   * de tocar nada, y delega en replaceRequiredHabilitations. Las pantallas
   * llaman a un solo sitio para guardar requisitos, como hasta ahora.
   */
  async replaceRequirements(offerId: string, requirements: {
    // Fase 6 tanda C: ya no se recibe `technicianTypes`. El tipo es una
    // columna de `offers` y lo escribe update()/create(), no este método.
    // Lo que sí llega es el interruptor, porque es lo que decide si estos
    // requisitos son legales siquiera.
    requiresCertification: boolean;
    // Optional — omit to leave existing aircraft requirements untouched.
    habilitations?: { aircraftTypeRatingId: string; notes?: string }[];
  }): Promise<void> {
    // Before anything is written, never after: a rejected save must leave the
    // offer's existing requirements exactly as they were.
    assertRequirementsMatchCertification({
      requiresCertification: requirements.requiresCertification,
      habilitations: requirements.habilitations,
    });

    if (requirements.habilitations !== undefined) {
      await this.replaceRequiredHabilitations(offerId, requirements.habilitations);
    }
  },

  // Aircraft requirements. Independent from replaceRequirements() above so a
  // caller that only flips the certification switch never has to reload or
  // resend the aircraft rows it doesn't manage.
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
