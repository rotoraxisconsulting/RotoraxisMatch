import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Button } from '../../src/components/Button';
import { CountryPickerField, CityPickerField } from '../../src/components/LocationPicker';
import { resolveLocationSnapshot } from '../../src/constants/locationCities';
import {
  InitialAvatar,
  TechnicianBadge,
  TechnicianCard,
  TechnicianChip,
  TechnicianPageHeader,
  TechnicianScreen,
  techStyles,
  techUi,
} from '../../src/components/technician/TechnicianUI';
import { useAuth } from '../../src/auth/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { Technician, AvailabilityStatus } from '../../src/types';
import { SocialLinks } from '../../src/types/technician';
import { isValidUrl, normalizeUrl } from '../../src/utils/urlValidation';
import { CONTRACT_TYPES } from '../../src/constants/contractTypes';
import { LICENSE_CATEGORIES, findOrphanedLicenses } from '../../src/constants/licenses';
import { technicianTypeLabel } from '../../src/constants/technicianTypes';
import { TechnicianTypeSelector } from '../../src/components/TechnicianTypeSelector';
import { useTechnicianTypes } from '../../src/auth/useCatalogOptions';
import { confirmAction } from '../../src/utils/platformAlert';
import { AircraftRatingIndex, buildAircraftRatingIndex, getAircraftTypeRatingLabel } from '../../src/constants/aircraftTypeRatings';
import { HabilitationsEditor, HabilitationRow as HabRow } from '../../src/components/technician/HabilitationsEditor';
import { DateField } from '../../src/components/DateField';
import { isValidDateOrder } from '../../src/utils/validityDates';
import { validateProfileYearsExperience } from '../../src/utils/yearsExperienceValidation';
import { technicianRepositoryV2 } from '../../src/repositories/v2/technicianRepositoryV2';
import { catalogRepository } from '../../src/repositories/v2/catalogRepository';
import { catalogRequestRepository } from '../../src/repositories/v2/catalogRequestRepository';
import { colors, spacing } from '../../src/theme';

// Per-license vigencia (technician_licenses has no is_current column — only
// habilitations do; a license's validity is date-driven only).
interface LicenseDetail {
  issuedAt?: string;
  expiresAt?: string;
}

const DATE_FIELD_PALETTE = {
  text: techUi.text,
  muted: techUi.textMuted,
  border: techUi.border,
  surface: techUi.surfaceSoft,
  accent: techUi.accent,
};

type AvailabilityContract = Technician['availability']['contractTypes'][number];

// Dos estados, sin fecha (2026-07-29). El tercero ('available') y el campo
// "Available from" desaparecieron: elegir "Open to offers" sin fecha se
// guardaba como no disponible y volvía como "Unavailable" al recargar.
const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'open_to_offers', label: 'Open to offers' },
  { value: 'unavailable', label: 'Unavailable' },
];

type SupaTechRow = {
  id: string;
  anonymous_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  // Sin `technician_type`: esta pantalla ya no lo pide en su SELECT. Los
  // tipos vienen de `technician_profile_types` (Fase 6 tanda A).
  location_city_id: string;
  availability: {
    immediately?: boolean;
    contract_types?: string[];
  } | null;
  years_experience: number | null;
  verification_status: string;
  social_links: SocialLinks | null;
};

// Las tres claves que la UI ofrece hoy sobre technician_profiles.social_links.
// El tipo SocialLinks admite mas por index signature: si alguna vez llega una
// clave desconocida desde la BD, se conserva al guardar (ver handleSave) en
// vez de borrarse por no tener campo en pantalla.
const SOCIAL_FIELDS: { key: keyof SocialLinks & string; label: string; placeholder: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/your-profile' },
  { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/your-handle' },
  { key: 'website', label: 'Personal website', placeholder: 'your-portfolio.com' },
];

function supaRowToForm(
  row: SupaTechRow,
  licenses: string[],
  aircraftTypes: string[],
  yearsExperience: number,
): Technician {
  const avail = row.availability ?? {};
  const immediately = avail.immediately ?? false;
  const contractTypes = (avail.contract_types ?? []) as AvailabilityContract[];
  const status: AvailabilityStatus = immediately ? 'open_to_offers' : 'unavailable';

  const location = resolveLocationSnapshot({ locationCityId: row.location_city_id });

  return {
    id: row.id,
    anonymousCode: row.anonymous_code,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone ?? '',
    locationCityId: row.location_city_id,
    country: location?.country ?? '',
    city: location?.city ?? '',
    baseAirport: location?.baseAirport ?? '',
    latitude: location?.latitude,
    longitude: location?.longitude,
    licenseCategories: licenses,
    aircraftTypes,
    specialties: [],
    availability: { immediately, status, contractTypes },
    verificationStatus: row.verification_status as Technician['verificationStatus'],
    yearsExperience,
  };
}

function verificationTone(status: string): 'success' | 'warning' | 'error' | 'muted' {
  if (status === 'verified') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'pending') return 'warning';
  return 'muted';
}

function availabilityLabel(status?: AvailabilityStatus): string {
  return AVAILABILITY_OPTIONS.find((opt) => opt.value === status)?.label ?? 'Open to offers';
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitleBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export default function TechnicianProfileScreen() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  // Mismo catalogo que el alta (tabla `technician_types`), para que el
  // selector compartido enseñe exactamente lo mismo en los dos sitios.
  const { options: techTypeOptions, loading: techTypesLoading } = useTechnicianTypes();

  const [techId, setTechId] = useState<string | null>(null);
  const [form, setForm] = useState<Technician | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [noTechProfile, setNoTechProfile] = useState(false);
  // Set only when a save partly succeeds — a deselected license couldn't be
  // removed because a habilitation still references it. Distinct from
  // profileError (a hard failure) since the rest of the save did go through.
  const [licenseRemovalWarning, setLicenseRemovalWarning] = useState<string | null>(null);

  // Habilitations are stored as explicit { licenseCode, aircraftTypeRatingId }
  // rows — never as a flat aircraft-type list saved against a "default"
  // license. See technicianRepositoryV2.replaceHabilitations().
  const [habilitations, setHabilitations] = useState<HabRow[]>([]);
  const [habDirty, setHabDirty] = useState(false);
  // Anios declarados como TEXTO: '' = no declarado (NULL en BD), distinto de
  // '0' = declarado sin experiencia. Estado propio y no `form.yearsExperience`
  // justamente porque el tipo V1 es `number` y no sabe expresar "no declarado".
  //
  // OJO: al vivir FUERA de `form`, no pasa por updateField() y por tanto NO
  // marca el formulario como sucio por si solo. Se edita siempre a traves de
  // updateYearsInput() de abajo, nunca con setYearsInput directamente — ese
  // fue justo el bug de la primera version (el boton "Save changes" no se
  // activaba al cambiar los anios).
  const [yearsInput, setYearsInput] = useState('');
  // Fase 6 tanda A: varios tipos de perfil, EDITABLES aqui (antes se fijaban
  // en el alta y no habia forma de cambiarlos). Ya NO deciden nada mas: el
  // eje Part-66 se muestra siempre y la tabla de completitud la elige lo que
  // el tecnico declara, no su etiqueta. Fuera de `form` porque el tipo V1
  // `Technician` no tiene este campo.
  //
  // `typesLoaded` distingue "aun no ha llegado" de "llego vacio". Sin esa
  // distincion, guardar antes de que responda la consulta mandaria [] a
  // replaceProfileTypes y borraria los tipos del tecnico.
  const [technicianTypes, setTechnicianTypes] = useState<string[]>([]);
  const [typesLoaded, setTypesLoaded] = useState(false);
  const [savedTechnicianTypes, setSavedTechnicianTypes] = useState<string[]>([]);
  // Enlaces sociales, EN CRUDO tal y como los teclea el tecnico (sin
  // normalizar): normalizar en cada pulsacion pelearia con el cursor. La
  // normalizacion pasa una sola vez, al guardar.
  //
  // Vive FUERA de `form` por lo mismo que yearsInput: el tipo V1 `Technician`
  // no tiene socialLinks. Y por lo mismo, editalo SIEMPRE con
  // updateSocialLink() — setSocialInputs a pelo no marcaria el formulario
  // como sucio y el boton "Save changes" se quedaria apagado.
  const [socialInputs, setSocialInputs] = useState<Record<string, string>>({});
  // Claves que ya venian en la BD y para las que esta pantalla no tiene campo.
  // Se reescriben tal cual al guardar; nunca se pierden por no ser visibles.
  const [unknownSocialKeys, setUnknownSocialKeys] = useState<SocialLinks>({});
  // Keyed by license code, only for codes currently in form.licenseCategories
  // — kept in sync by toggleLicense() so a removed license never leaves a
  // stale entry behind.
  const [licenseDetails, setLicenseDetails] = useState<Record<string, LicenseDetail>>({});
  // Resolves BOTH active and inactive rating ids referenced by this
  // technician's own habilitations (loaded ones + newly picked ones) — not
  // the same as the picker's own active-only search list. Needed so a
  // previously-selected, now-deactivated rating still shows a real label
  // instead of a bare UUID (see catalogRepository.getAircraftTypeRatingsByIds).
  const [ratingsById, setRatingsById] = useState<AircraftRatingIndex>(new Map());

  const [requestPanelOpen, setRequestPanelOpen] = useState(false);
  const [requestLicense, setRequestLicense] = useState<string | null>(null);
  const [requestAircraft, setRequestAircraft] = useState('');
  const [requestLabel, setRequestLabel] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  // Auth guards
  useEffect(() => {
    if (!authLoading && !profile) {
      router.replace('/auth/login' as any);
    }
  }, [authLoading, profile]);

  useEffect(() => {
    if (!authLoading && profile?.status === 'pending_verification') {
      router.replace('/auth/pending-verification' as any);
    }
  }, [authLoading, profile]);

  const loadProfile = useCallback(async () => {
    if (!profile?.id) return;
    setProfileLoading(true);
    setProfileError(null);
    setNoTechProfile(false);

    try {
      const { data: techRow, error: techErr } = await supabase
        .from('technician_profiles')
        // Sin `technician_type`: los tipos salen de la tabla puente de abajo.
        .select(
          'id, anonymous_code, first_name, last_name, email, phone, location_city_id, availability, years_experience, verification_status, social_links',
        )
        .eq('user_id', profile.id)
        .maybeSingle();

      if (techErr) throw techErr;

      if (!techRow) {
        setNoTechProfile(true);
        setProfileLoading(false);
        return;
      }

      setTechId(techRow.id);

      const [licResult, habResult, typeResult] = await Promise.all([
        supabase
          .from('technician_licenses')
          .select('license_code, issued_at, expires_at')
          .eq('technician_id', techRow.id),
        supabase
          .from('technician_habilitations')
          .select('id, license_code, aircraft_type_rating_id, experience_years, issued_at, expires_at, is_current')
          .eq('technician_id', techRow.id),
        supabase
          .from('technician_profile_types')
          .select('type_code')
          .eq('technician_id', techRow.id)
          .order('type_code'),
      ]);

      // Un fallo aqui NO se traga: sin tipos cargados, guardar mandaria [] a
      // replaceProfileTypes (que lo rechaza) o, peor, el selector enseñaria
      // el perfil como si no tuviera ninguno. Mejor caer al banner de error.
      if (typeResult.error) throw typeResult.error;
      const loadedTypes = ((typeResult.data ?? []) as { type_code: string }[]).map((r) => r.type_code);
      setTechnicianTypes(loadedTypes);
      setSavedTechnicianTypes(loadedTypes);
      setTypesLoaded(true);

      const licRows = (licResult.data ?? []) as { license_code: string; issued_at: string | null; expires_at: string | null }[];
      const licenses = licRows.map((r) => r.license_code);
      const licenseDetailsMap: Record<string, LicenseDetail> = {};
      licRows.forEach((r) => {
        licenseDetailsMap[r.license_code] = { issuedAt: r.issued_at ?? undefined, expiresAt: r.expires_at ?? undefined };
      });
      setLicenseDetails(licenseDetailsMap);

      const habRows = (habResult.data ?? []) as {
        id: string;
        license_code: string;
        aircraft_type_rating_id: string | null;
        experience_years: number | null;
        issued_at: string | null;
        expires_at: string | null;
        is_current: boolean;
      }[];
      // The rating-id filter stays until migration 029 makes the column NOT
      // NULL — after that it can never exclude anything. It is not a legacy
      // path: a row with no rating id names no aircraft and has nothing to
      // render.
      const normalizedHabs: HabRow[] = habRows
        .filter((r) => r.aircraft_type_rating_id)
        .map((r) => ({
          id: r.id,
          licenseCode: r.license_code,
          aircraftTypeRatingId: r.aircraft_type_rating_id as string,
          experienceYears: r.experience_years ?? undefined,
          issuedAt: r.issued_at ?? undefined,
          expiresAt: r.expires_at ?? undefined,
          isCurrent: r.is_current,
        }));
      setHabilitations(normalizedHabs);
      setHabDirty(false);

      // Resolve every referenced rating id in one batched call — includes
      // inactive ratings, since an existing habilitation may point at one.
      const resolvedRatings = await catalogRepository.getAircraftTypeRatingsByIds(
        normalizedHabs.map((h) => h.aircraftTypeRatingId),
      );
      const resolvedIndex = buildAircraftRatingIndex(resolvedRatings);
      setRatingsById(resolvedIndex);

      // '' cuando la columna es NULL: "no declarado" y "0 anios" son estados
      // distintos y el string vacio es el unico que sabe expresar el primero.
      setYearsInput(techRow.years_experience == null ? '' : String(techRow.years_experience));

      // social_links: se reparte en los tres campos conocidos y un cajon con
      // el resto, para poder devolverlo intacto al guardar.
      const storedSocial = (techRow.social_links ?? {}) as SocialLinks;
      const knownKeys = SOCIAL_FIELDS.map((f) => f.key);
      const loadedInputs: Record<string, string> = {};
      knownKeys.forEach((k) => {
        loadedInputs[k] = storedSocial[k] ?? '';
      });
      setSocialInputs(loadedInputs);
      setUnknownSocialKeys(
        Object.fromEntries(Object.entries(storedSocial).filter(([k]) => !knownKeys.includes(k))),
      );

      const aircraftTypes = [...new Set(
        normalizedHabs
          .map((h) => resolvedIndex.get(h.aircraftTypeRatingId)?.aircraftFamily)
          .filter((v): v is string => Boolean(v)),
      )];

      // Los anios ya no se derivan de technician_aircraft_experience (tabla
      // retirada, migracion 031): salen del campo declarado del perfil, que
      // se carga arriba en yearsInput. El 0 que se pasa aqui solo alimenta el
      // tipo V1 `Technician`, que exige un number y no sabe expresar "no
      // declarado"; la fuente de verdad para mostrar y guardar es yearsInput.
      setForm(supaRowToForm(techRow as SupaTechRow, licenses, aircraftTypes, techRow.years_experience ?? 0));
    } catch (err: any) {
      setProfileError(err?.message ?? 'Failed to load profile. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  // Fase 6 tanda A (2026-08-10): AQUI VIVIA `holdsPart66Qualifications`, que
  // escondia las secciones de Licenses y Habilitations a los tipos que no
  // certifican. Se retira: el eje Part-66 se muestra SIEMPRE.
  //
  // Su premisa original ("son datos que no existen para el") ya no se
  // sostiene. Estar licenciado es propiedad de la PERSONA, no del tipo, asi
  // que un pintor puede tener una B1.1 perfectamente real — y con el gate
  // puesto no tendria donde meterla salvo marcandose "mechanic" para
  // desbloquear el formulario, que es un rodeo absurdo y ademas falsea sus
  // tipos. No se toca `isLicensedTechnicianType`, que sigue viva y en uso en
  // el lado de las ofertas hasta la Tanda C.

  function updateField<K extends keyof Technician>(key: K, value: Technician[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setIsDirty(true);
  }

  // Unico punto de edicion de yearsInput desde la UI: mantiene el flag de
  // sucio en linea con el resto de campos del formulario.
  function updateYearsInput(value: string) {
    setYearsInput(value.replace(/[^0-9]/g, ''));
    setIsDirty(true);
  }

  // Unico punto de edicion de socialInputs desde la UI (ver el comentario del
  // estado): mantiene el flag de sucio en linea con el resto del formulario.
  function updateSocialLink(key: string, value: string) {
    setSocialInputs((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  // Unico punto de edicion de technicianTypes desde la UI. El minimo de uno
  // lo hace cumplir TechnicianTypeSelector, no esto.
  function updateTechnicianTypes(next: string[]) {
    setTechnicianTypes(next);
    setIsDirty(true);
  }

  function updateFields(patch: Partial<Technician>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setIsDirty(true);
  }

  function updateAvailability(patch: Partial<Technician['availability']>) {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, availability: { ...prev.availability, ...patch } };
    });
    setIsDirty(true);
  }

  function toggleLicense(code: string) {
    if (!form) return;
    const held = form.licenseCategories.includes(code);
    const next = held ? form.licenseCategories.filter((c) => c !== code) : [...form.licenseCategories, code];
    updateField('licenseCategories', next);
    setLicenseDetails((prev) => {
      if (held) {
        const { [code]: _removed, ...rest } = prev;
        return rest;
      }
      return prev[code] ? prev : { ...prev, [code]: {} };
    });
  }

  function updateLicenseDetail(code: string, patch: Partial<LicenseDetail>) {
    setLicenseDetails((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
    setIsDirty(true);
  }

  // HabilitationsEditor owns add/remove/vigencia-field mutation internally
  // (mirrors TypeRatingRequirementsEditor) — this is the single point where
  // the resulting array flows back up, marking both dirty flags exactly
  // like the three separate handlers it replaces used to.
  function onChangeHabilitations(next: HabRow[]) {
    setHabilitations(next);
    setHabDirty(true);
    setIsDirty(true);
  }

  async function submitCatalogRequest() {
    if (!profile?.id || !requestLabel.trim()) return;
    setRequestSubmitting(true);
    try {
      await catalogRequestRepository.create({
        requestedBy: profile.id,
        rawText: requestLabel.trim(),
        context: [
          requestLicense && `License: ${requestLicense}`,
          requestAircraft.trim() && `Aircraft/family: ${requestAircraft.trim()}`,
          requestNotes.trim(),
        ]
          .filter(Boolean)
          .join(' — ') || undefined,
      });
      setRequestSubmitted(true);
    } catch (err: any) {
      setProfileError(err?.message ?? 'Could not send the request. Please try again.');
    } finally {
      setRequestSubmitting(false);
    }
  }

  function toggleContractType(type: AvailabilityContract) {
    if (!form) return;
    const current = form.availability.contractTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    updateAvailability({ contractTypes: next });
  }

  async function handleSave() {
    if (!form || !isDirty || !techId) return;

    // Los tipos aun no han llegado: guardar ahora los borraria. No es un
    // caso teorico — basta con pulsar Save mientras la consulta esta en
    // vuelo.
    if (!typesLoaded) {
      setProfileError('Still loading your profile types. Try again in a moment.');
      return;
    }
    if (technicianTypes.length === 0) {
      setProfileError('Select at least one profile type.');
      return;
    }

    // Los anios declarados son OBLIGATORIOS desde que el alta los pide
    // (migracion 044). Aqui se revalida porque esta pantalla es el otro
    // camino de escritura del campo: sin esto, un tecnico podia vaciar la
    // casilla y volver a dejar su perfil en "no declarado".
    //
    // OJO: '' y '0' NO son lo mismo y esa distincion se respeta intacta —
    // esto rechaza SOLO la cadena vacia. Declarar 0 anios sigue siendo una
    // respuesta valida y se guarda como 0, no como NULL.
    const yearsError = validateProfileYearsExperience(yearsInput);
    if (yearsError) {
      setProfileError(yearsError);
      return;
    }

    // Client-side validation only — must never reach the database as a
    // constraint error. Absent dates are neutral (checked inside
    // isValidDateOrder); only an explicit expiresAt on/before issuedAt is
    // flagged.
    const dateErrors: string[] = [];
    form.licenseCategories.forEach((code) => {
      const d = licenseDetails[code];
      if (!isValidDateOrder(d?.issuedAt, d?.expiresAt)) {
        dateErrors.push(`${code}: expiry date must be after the issue date.`);
      }
    });
    habilitations.forEach((h) => {
      if (!isValidDateOrder(h.issuedAt, h.expiresAt)) {
        dateErrors.push(
          `${h.licenseCode} + ${getAircraftTypeRatingLabel(h.aircraftTypeRatingId, ratingsById)}: expiry date must be after the issue date.`,
        );
      }
    });
    if (dateErrors.length > 0) {
      setProfileError(dateErrors.join(' '));
      return;
    }

    // Enlaces sociales: se valida ANTES de tocar la BD, igual que las fechas.
    // Un enlace vacio es valido (campo opcional) y simplemente no se guarda.
    const socialErrors = SOCIAL_FIELDS.filter((f) => !isValidUrl(socialInputs[f.key] ?? '')).map(
      (f) => `${f.label}: enter a valid link (e.g. ${f.placeholder}).`,
    );
    if (socialErrors.length > 0) {
      setProfileError(socialErrors.join(' '));
      return;
    }

    // ── Licencias huerfanas al quitar un tipo (Fase 6 tanda A) ──────────
    //
    // Se PREGUNTA, no se decide. Un tecnico PUEDE tener licencias sin el tipo
    // correspondiente marcado: es un estado valido, no una inconsistencia —
    // el score no depende del tipo, asi que no rompe ni falsea nada. Por eso
    // "No, keep them" no es la opcion de escape, es una respuesta legitima.
    //
    // Solo entran las que quedarian HUERFANAS: una licencia que sigue siendo
    // de un tipo conservado no se pregunta (quita "mechanic" pero sigue
    // siendo "avionic" -> B1.3 entra, B2 no). Ver findOrphanedLicenses, y
    // sobre todo el aviso de LICENSES_BY_TECHNICIAN_TYPE: ese mapa es
    // heuristica para preguntar mejor, jamas una invariante.
    let licensesToSave = form.licenseCategories;
    let habsToSave = habilitations;
    let dropOrphanedHabs = false;

    const orphaned = findOrphanedLicenses(form.licenseCategories, savedTechnicianTypes, technicianTypes);
    if (orphaned.length > 0) {
      const removedTypes = savedTechnicianTypes.filter((t) => !technicianTypes.includes(t));
      const confirmed = await confirmAction({
        title: `Remove ${orphaned.join(', ')} as well?`,
        message:
          `You are removing ${removedTypes.map(technicianTypeLabel).join(', ')} from your profile. ` +
          `${orphaned.join(', ')} ${orphaned.length > 1 ? 'are licences' : 'is a licence'} of that work, ` +
          'along with any type ratings declared under it.\n\n' +
          'Keeping them is perfectly valid — your profile type does not decide which licences you hold, ' +
          'and companies match you on your licences, not on your type.',
        confirmLabel: 'Remove them',
        cancelLabel: 'Keep them',
        destructive: true,
      });
      if (confirmed) {
        licensesToSave = form.licenseCategories.filter((c) => !orphaned.includes(c as any));
        habsToSave = habilitations.filter((h) => !orphaned.includes(h.licenseCode as any));
        // Las habilitaciones hay que reescribirlas aunque el tecnico no haya
        // tocado esa seccion: sin esto, replaceHabilitations no correria y la
        // FK compuesta bloquearia el borrado de la licencia.
        dropOrphanedHabs = habsToSave.length !== habilitations.length;
      }
    }

    // Se persiste la forma normalizada y SIN claves vacias; las claves que no
    // tienen campo en esta pantalla se devuelven intactas. Objeto vacio -> NULL,
    // para no dejar `{}` en la columna.
    const socialToSave: SocialLinks = { ...unknownSocialKeys };
    SOCIAL_FIELDS.forEach((f) => {
      const normalized = normalizeUrl(socialInputs[f.key] ?? '');
      if (normalized !== '') socialToSave[f.key] = normalized;
    });
    const socialDeclared = Object.keys(socialToSave).length > 0;

    const selectedLocation = resolveLocationSnapshot(form);
    const locationCityId = selectedLocation?.locationCityId ?? form.locationCityId;

    const nameParts = form.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;

    // El booleano ES el modelo; `status` es sólo su etiqueta de UI y nunca
    // se persiste.
    const immediately = form.availability.status === 'open_to_offers';

    // Never filter habilitations by which licenses are still selected —
    // technician_habilitations references technician_licenses via a
    // composite FK, so a license the technician deselected but that still
    // has a habilitation here simply won't be removable below (see
    // removeUnreferencedLicenses); silently dropping the habilitation
    // instead would destroy real technician data just to force the license
    // removal through.
    const derivedAircraftTypes = [...new Set(
      habsToSave
        .map((h) => ratingsById.get(h.aircraftTypeRatingId)?.aircraftFamily)
        .filter((v): v is string => Boolean(v)),
    )];
    const trimmedYears = yearsInput.trim();
    const yearsToSave = trimmedYears === '' ? null : Math.max(0, Math.min(70, parseInt(trimmedYears, 10) || 0));

    setSaving(true);
    setProfileError(null);
    setLicenseRemovalWarning(null);
    try {
      // Update main profile row.
      // `.select('id')` no es decorativo: sin él, si tp_update_own no dejara
      // pasar la fila (p. ej. la cuenta deja de estar `active` mientras el
      // formulario está abierto), PostgREST devolvería 0 filas y CERO error,
      // y la pantalla diría "Profile saved" sin haber guardado nada.
      const { data: updatedRows, error: updateErr } = await supabase
        .from('technician_profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          email: form.email,
          phone: form.phone || null,
          ...(locationCityId ? { location_city_id: locationCityId } : {}),
          availability: {
            immediately,
            contract_types: form.availability.contractTypes,
          },
          years_experience: yearsToSave,
          social_links: socialDeclared ? socialToSave : null,
        })
        .eq('id', techId)
        .select('id');

      if (updateErr) throw updateErr;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Could not save your profile — your session may have expired. Sign in again and retry.');
      }

      // 1) Tipos de perfil. Diferencial y con los añadidos antes que los
      // borrados, para que un fallo a mitad nunca deje al tecnico sin
      // ninguno — ver technicianRepositoryV2.replaceProfileTypes.
      await technicianRepositoryV2.replaceProfileTypes(techId, technicianTypes);
      setSavedTechnicianTypes(technicianTypes);

      // 2) Upsert held licenses in place FIRST — never delete+reinsert (see
      // technicianRepositoryV2.upsertLicenses). Ensures any brand-new
      // license code already has a row before a habilitation below can
      // reference it.
      await technicianRepositoryV2.upsertLicenses(
        techId,
        licensesToSave.map((code) => ({
          code,
          issuedAt: licenseDetails[code]?.issuedAt,
          expiresAt: licenseDetails[code]?.expiresAt,
        })),
      );

      // 3) Replace normalized habilitations — each row carries its own
      // explicit licenseCode, never a "default" license applied to every
      // aircraft. Legacy rows (aircraft_type_rating_id IS NULL) are left
      // untouched. The full local set is sent, unfiltered (see above).
      //
      // `dropOrphanedHabs` fuerza la reescritura aunque el tecnico no haya
      // tocado esta seccion: acaba de aceptar retirar licencias, y sus
      // habilitaciones tienen que caer con ellas o la FK compuesta bloqueara
      // el borrado de la licencia en el paso 4.
      if (habDirty || dropOrphanedHabs) {
        await technicianRepositoryV2.replaceHabilitations(
          techId,
          habsToSave.map((h) => ({
            licenseCode: h.licenseCode,
            aircraftTypeRatingId: h.aircraftTypeRatingId,
            experienceYears: h.experienceYears,
            issuedAt: h.issuedAt,
            expiresAt: h.expiresAt,
            isCurrent: h.isCurrent,
          })),
        );
        setHabDirty(false);
        setHabilitations(habsToSave);
      }

      // 4) Only now remove deselected licenses — AFTER habilitations are
      // saved, so the dependency check reflects the technician's actual
      // final state rather than a stale pre-save snapshot.
      const { blocked } = await technicianRepositoryV2.removeUnreferencedLicenses(techId, licensesToSave);

      setForm((prev) => (prev ? {
        ...prev,
        licenseCategories: licensesToSave,
        aircraftTypes: derivedAircraftTypes,
      } : prev));
      setIsDirty(false);

      if (blocked.length > 0) {
        setLicenseRemovalWarning(
          `Saved — but could not remove ${blocked.join(', ')}: the technician still has habilitations declared under ${
            blocked.length > 1 ? 'them' : 'it'
          }. Remove those habilitations first if the license should come off the profile.`,
        );
        await loadProfile();
      }
    } catch (err: any) {
      setProfileError(err?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Loading states ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  if (profileLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  if (noTechProfile) {
    return (
      <TechnicianScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>Profile not set up</Text>
          <Text style={styles.stateBody}>
            Your technician profile hasn&apos;t been created yet. Complete your sign-up to
            configure your profile.
          </Text>
          <Button
            label="Go to dashboard"
            variant="primary"
            onPress={() => router.replace('/technician' as any)}
            style={styles.stateBtn}
          />
        </View>
      </TechnicianScreen>
    );
  }

  if (profileError && !form) {
    return (
      <TechnicianScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>Could not load profile</Text>
          <Text style={styles.stateBody}>{profileError}</Text>
          <Button
            label="Retry"
            variant="primary"
            onPress={loadProfile}
            style={styles.stateBtn}
          />
        </View>
      </TechnicianScreen>
    );
  }

  if (!form) {
    // Unexpected: loading done, no error, no noTechProfile, but form is still null
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  const status = form.availability.status ?? 'open_to_offers';

  return (
    <TechnicianScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[techStyles.content, isWide && techStyles.contentWide]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TechnicianPageHeader
            eyebrow="Technician profile"
            title="My Profile"
            subtitle="Manage the details companies use for matching and verification."
            onBack={() => router.back()}
          />

          <TechnicianCard style={styles.profileCard}>
            <View style={styles.profileTop}>
              <InitialAvatar label={form.fullName || form.anonymousCode} size={54} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>{form.fullName}</Text>
                <Text style={styles.profileCode}>{form.anonymousCode}</Text>
              </View>
              <TechnicianBadge
                label={form.verificationStatus}
                tone={verificationTone(form.verificationStatus)}
                small
              />
            </View>

            <View style={styles.profileMetaRow}>
              <View style={styles.profileMetaItem}>
                <Text style={styles.profileMetaLabel}>Base</Text>
                <Text style={styles.profileMetaValue}>{form.baseAirport || 'N/A'}</Text>
              </View>
              <View style={styles.profileMetaItem}>
                <Text style={styles.profileMetaLabel}>Experience</Text>
                <Text style={styles.profileMetaValue}>{yearsInput.trim() === '' ? 'Not specified' : `${yearsInput.trim()} yr`}</Text>
              </View>
              <View style={styles.profileMetaItem}>
                <Text style={styles.profileMetaLabel}>Status</Text>
                <Text style={styles.profileMetaValue}>{availabilityLabel(status)}</Text>
              </View>
            </View>
          </TechnicianCard>

          {isDirty && (
            <View style={styles.dirtyBanner}>
              <Text style={styles.dirtyText}>Unsaved changes</Text>
            </View>
          )}

          {profileError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{profileError}</Text>
            </View>
          )}

          {licenseRemovalWarning && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>{licenseRemovalWarning}</Text>
            </View>
          )}

          <SectionTitle title="Identity" subtitle="Private details remain controlled by privacy rules." />
          <TechnicianCard style={styles.sectionCard}>
            <FieldLabel>Full name</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.fullName}
              onChangeText={(v) => updateField('fullName', v)}
              placeholder="Full name"
              placeholderTextColor={techUi.textMuted}
              autoCapitalize="words"
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Email</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(v) => updateField('email', v)}
              placeholder="email@example.com"
              placeholderTextColor={techUi.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Phone</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(v) => updateField('phone', v)}
              placeholder="+1 555 000 0000"
              placeholderTextColor={techUi.textMuted}
              keyboardType="phone-pad"
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Total years of experience</FieldLabel>
            <TextInput
              style={styles.input}
              value={yearsInput}
              onChangeText={updateYearsInput}
              placeholder="e.g. 8 — enter 0 if you have none yet"
              placeholderTextColor={techUi.textMuted}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.privacyNote}>
              Required. Companies filter by minimum years of experience, so a profile with
              nothing here is hard to place. Entering 0 is a valid answer.
            </Text>
          </TechnicianCard>
          <Text style={styles.privacyNote}>
            Your identity is private by default and is only shared with accepted company contacts.
          </Text>

          <SectionTitle
            title="Professional links"
            subtitle="Optional. Private until a company accepts."
          />
          <TechnicianCard style={styles.sectionCard}>
            {/* El aviso va ARRIBA, antes del primer campo: el tecnico tiene que
                saber quien vera esto ANTES de escribirlo, no despues. */}
            <Text style={styles.privacyNote}>
              These links stay private. A company can only see them after it accepts your
              application, or after you accept a direct offer from it.
            </Text>
            {SOCIAL_FIELDS.map((field, index) => (
              <View key={field.key}>
                {index > 0 && <View style={styles.fieldGap} />}
                <FieldLabel>{field.label}</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={socialInputs[field.key] ?? ''}
                  onChangeText={(v) => updateSocialLink(field.key, v)}
                  placeholder={field.placeholder}
                  placeholderTextColor={techUi.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            ))}
          </TechnicianCard>

          <SectionTitle
            title="Profile types"
            subtitle="What you work on. Pick as many as apply — you can change this any time."
          />
          <TechnicianCard style={styles.sectionCard}>
            <TechnicianTypeSelector
              options={techTypeOptions}
              selected={technicianTypes}
              onChange={updateTechnicianTypes}
              loading={techTypesLoading}
              palette={{
                text: techUi.text,
                muted: techUi.textMuted,
                border: techUi.border,
                surface: techUi.surfaceSoft,
                accent: techUi.accent,
                accentText: techUi.accent,
                accentSurface: techUi.accent + '1A',
              }}
            />
          </TechnicianCard>

          <SectionTitle title="Location" />
          <TechnicianCard style={styles.sectionCard}>
            <CountryPickerField
              label="Country"
              value={form.country}
              onChange={(country) =>
                updateFields({
                  country,
                  locationCityId: undefined,
                  city: '',
                  baseAirport: '',
                })
              }
            />
            <View style={styles.fieldGap} />
            <CityPickerField
              label="City"
              country={form.country}
              value={form.city}
              onChange={(city, _icao, entry) =>
                updateFields({
                  locationCityId: entry.id,
                  city,
                  baseAirport: entry.iata || entry.icao,
                })
              }
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Base airport</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.baseAirport}
              onChangeText={(v) => updateField('baseAirport', v.toUpperCase())}
              placeholder="e.g. KATL"
              placeholderTextColor={techUi.textMuted}
              autoCapitalize="characters"
              maxLength={4}
            />
          </TechnicianCard>

          <SectionTitle title="Availability" subtitle="Controls how your profile appears in offer matching." />
          <TechnicianCard style={styles.sectionCard}>
            <FieldLabel>Status</FieldLabel>
            <View style={styles.chipRow}>
              {AVAILABILITY_OPTIONS.map((opt) => (
                <TechnicianChip
                  key={opt.value}
                  label={opt.label}
                  selected={status === opt.value}
                  onPress={() => updateAvailability({ status: opt.value })}
                />
              ))}
            </View>

            <View style={styles.fieldGap} />
            <FieldLabel>Contract types</FieldLabel>
            <View style={styles.chipRow}>
              {CONTRACT_TYPES.map((ct) => {
                const code = ct.code as AvailabilityContract;
                return (
                  <TechnicianChip
                    key={ct.code}
                    label={ct.label}
                    selected={form.availability.contractTypes.includes(code)}
                    onPress={() => toggleContractType(code)}
                  />
                );
              })}
            </View>

          </TechnicianCard>

          {/* Eje Part-66 completo (licencias + habilitaciones + peticion de
              catalogo). SIEMPRE visible desde la Fase 6 tanda A: tener
              licencia es propiedad de la persona, no de la etiqueta que
              eligio al registrarse, y esconder la seccion dejaba sin sitio a
              un pintor con una B1.1 real. */}
          <SectionTitle title="Licenses" subtitle="Select all licence categories you hold. Leave empty if you hold none." />
          <TechnicianCard style={styles.sectionCard}>
            <View style={styles.chipRow}>
              {LICENSE_CATEGORIES.map((lic) => (
                <TechnicianChip
                  key={lic.code}
                  label={lic.code}
                  selected={form.licenseCategories.includes(lic.code)}
                  onPress={() => toggleLicense(lic.code)}
                />
              ))}
            </View>

            {form.licenseCategories.length > 0 ? (
              <>
                <View style={styles.fieldGap} />
                <Text style={styles.subSectionLabel}>Validity dates (optional)</Text>
                {form.licenseCategories.map((code) => (
                  <View key={code} style={styles.licenseDetailRow}>
                    <Text style={styles.licenseDetailCode}>{code}</Text>
                    <View style={styles.licenseDetailFields}>
                      <View style={styles.licenseDetailField}>
                        <Text style={styles.fieldLabelXs}>Issued</Text>
                        <DateField
                          value={licenseDetails[code]?.issuedAt}
                          onChange={(v) => updateLicenseDetail(code, { issuedAt: v })}
                          placeholder="Not set"
                          palette={DATE_FIELD_PALETTE}
                        />
                      </View>
                      <View style={styles.licenseDetailField}>
                        <Text style={styles.fieldLabelXs}>Expires</Text>
                        <DateField
                          value={licenseDetails[code]?.expiresAt}
                          onChange={(v) => updateLicenseDetail(code, { expiresAt: v })}
                          placeholder="Not set"
                          palette={DATE_FIELD_PALETTE}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </TechnicianCard>

          <HabilitationsEditor
            value={habilitations}
            onChange={onChangeHabilitations}
            licenseCategories={form.licenseCategories}
            ratingsById={ratingsById}
            onRatingResolved={(r) => setRatingsById((prev) => new Map(prev).set(r.id, r))}
            onRequestCatalog={() => setRequestPanelOpen((v) => !v)}
            dateFieldPalette={DATE_FIELD_PALETTE}
          />

          {requestPanelOpen && (
            <TechnicianCard style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Request a catalog addition</Text>
              <Text style={styles.sectionSub}>
                Sent to the platform team for review — it will not be used for matching until added.
              </Text>
              <View style={styles.fieldGap} />
              <FieldLabel>Category</FieldLabel>
              <View style={styles.chipRow}>
                {LICENSE_CATEGORIES.map((lic) => (
                  <TechnicianChip
                    key={lic.code}
                    label={lic.code}
                    selected={requestLicense === lic.code}
                    onPress={() => setRequestLicense(lic.code)}
                  />
                ))}
              </View>
              <View style={styles.fieldGap} />
              <FieldLabel>Aircraft or family</FieldLabel>
              <TextInput
                style={styles.input}
                value={requestAircraft}
                onChangeText={setRequestAircraft}
                placeholder="e.g. AW169"
                placeholderTextColor={techUi.textMuted}
              />
              <View style={styles.fieldGap} />
              <FieldLabel>Name as it appears on your license</FieldLabel>
              <TextInput
                style={styles.input}
                value={requestLabel}
                onChangeText={setRequestLabel}
                placeholder="e.g. AW169 (PWC 210)"
                placeholderTextColor={techUi.textMuted}
              />
              <View style={styles.fieldGap} />
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={requestNotes}
                onChangeText={setRequestNotes}
                placeholder="Anything else that helps identify it"
                placeholderTextColor={techUi.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={styles.fieldGap} />
              {requestSubmitted ? (
                <Text style={styles.privacyNote}>Request pending catalog addition.</Text>
              ) : (
                <Button
                  label={requestSubmitting ? 'Sending...' : 'Send request'}
                  variant="secondary"
                  size="sm"
                  loading={requestSubmitting}
                  disabled={!requestLabel.trim() || requestSubmitting}
                  onPress={submitCatalogRequest}
                />
              )}
            </TechnicianCard>
          )}

          {/* La seccion "Specialties" se retiro el 2026-07-29: no existe ni
              columna ni tabla de specialties en el esquema public, ni ningun
              camino de escritura (admin incluido). El array salia hardcodeado
              como [] en supaRowToForm y en v2CompatAdapters, asi que la
              seccion solo podia renderizar "Not specified" para siempre, bajo
              un texto que prometia que la verificacion lo rellenaba. El campo
              Technician.specialties sigue en el bloque V1-compat de
              types/technician.ts (lo exige el tipo, no la UI). */}

          <Button
            label={saving ? 'Saving...' : 'Save Changes'}
            variant="primary"
            onPress={handleSave}
            loading={saving}
            disabled={!isDirty}
            fullWidth
            style={styles.saveBtn}
          />

        </ScrollView>
      </KeyboardAvoidingView>
    </TechnicianScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  profileCard: {
    gap: spacing.md,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: techUi.text,
  },
  profileCode: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: techUi.textMuted,
  },
  profileMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  profileMetaItem: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: techUi.borderSoft,
    backgroundColor: techUi.surfaceSoft,
    borderRadius: 16,
    padding: spacing.sm,
  },
  profileMetaLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: techUi.textMuted,
    marginBottom: 4,
  },
  profileMetaValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: techUi.text,
  },
  dirtyBanner: {
    marginTop: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: techUi.amberSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dirtyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: techUi.amber,
  },
  errorBanner: {
    marginTop: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#DC2626',
  },
  warningBanner: {
    marginTop: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: techUi.amberSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: techUi.amber,
  },
  sectionTitleBlock: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: techUi.text,
  },
  sectionSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: techUi.textSoft,
  },
  sectionCard: {
    gap: spacing.sm,
  },
  privacyNote: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: techUi.textMuted,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: techUi.textSoft,
    marginBottom: 6,
  },
  fieldGap: { height: spacing.sm },
  subSectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: techUi.textSoft,
    marginBottom: 4,
  },
  licenseDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: techUi.borderSoft,
  },
  licenseDetailCode: {
    width: 44,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: techUi.text,
  },
  licenseDetailFields: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  licenseDetailField: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabelXs: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: techUi.textMuted,
    marginBottom: 3,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: techUi.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: techUi.text,
    backgroundColor: techUi.surfaceSoft,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  textarea: {
    minHeight: 88,
    paddingTop: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: techUi.accent,
    borderRadius: 16,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  stateTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: techUi.text,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: techUi.textSoft,
    textAlign: 'center',
  },
  stateBtn: {
    marginTop: spacing.sm,
    minWidth: 160,
  },
});
