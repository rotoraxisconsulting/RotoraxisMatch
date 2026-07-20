import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
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
import { CONTRACT_TYPES } from '../../src/constants/contractTypes';
import { LICENSE_CATEGORIES } from '../../src/constants/licenses';
import { AIRCRAFT_TYPE_CATALOG } from '../../src/constants/aircraftTypes';
import { AircraftRatingIndex, buildAircraftRatingIndex, getAircraftTypeRatingLabel } from '../../src/constants/aircraftTypeRatings';
import { AircraftTypeRatingPicker } from '../../src/components/AircraftTypeRatingPicker';
import { DateField } from '../../src/components/DateField';
import { technicianRepositoryV2 } from '../../src/repositories/v2/technicianRepositoryV2';
import { catalogRepository } from '../../src/repositories/v2/catalogRepository';
import { catalogRequestRepository } from '../../src/repositories/v2/catalogRequestRepository';
import { colors, spacing } from '../../src/theme';

interface HabRow {
  id?: string;
  licenseCode: string;
  aircraftTypeRatingId: string;
  experienceYears?: number;
  // Optional vigencia (Fase 3). Absent issuedAt/expiresAt and isCurrent
  // undefined/true are all neutral for matching — only an explicit
  // isCurrent === false or a past expiresAt degrade a match, never exclude
  // it. See offerMatchExplain.ts once that's wired up.
  issuedAt?: string;
  expiresAt?: string;
  isCurrent?: boolean;
}

interface LegacyHabRow {
  id: string;
  licenseCode: string;
  aircraftTypeCode: string;
}

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

function aircraftTypeLabel(code: string): string {
  return AIRCRAFT_TYPE_CATALOG.find((a) => a.code === code)?.label ?? code;
}

type AvailabilityContract = Technician['availability']['contractTypes'][number];

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
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
  location_city_id: string;
  availability: {
    immediately?: boolean;
    available_from?: string | null;
    contract_types?: string[];
  } | null;
  verification_status: string;
  profile_completeness: number;
};

function computeProfileCompleteness(t: Technician): number {
  let score = 0;
  if (t.fullName?.trim()) score += 10;
  if (t.email?.trim()) score += 10;
  if (t.phone?.trim()) score += 5;
  if (t.city?.trim()) score += 5;
  if (t.country?.trim()) score += 5;
  if (t.baseAirport?.trim()) score += 5;
  if (t.licenseCategories.length > 0) score += 20;
  if (t.aircraftTypes.length > 0) score += 15;
  if (t.specialties.length > 0) score += 10;
  if (t.availability.status !== 'unavailable') score += 5;
  if (t.yearsExperience > 0) score += 10;
  return Math.min(score, 100);
}

function supaRowToForm(
  row: SupaTechRow,
  licenses: string[],
  aircraftTypes: string[],
  yearsExperience: number,
): Technician {
  const avail = row.availability ?? {};
  const immediately = avail.immediately ?? false;
  const availableFrom: string | undefined = avail.available_from ?? undefined;
  const contractTypes = (avail.contract_types ?? []) as AvailabilityContract[];
  const status: AvailabilityStatus = immediately ? 'available' : availableFrom ? 'open_to_offers' : 'unavailable';

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
    availability: { immediately, status, availableFrom, contractTypes },
    verificationStatus: row.verification_status as Technician['verificationStatus'],
    profileCompleteness: row.profile_completeness,
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

function EmptyValue() {
  return <Text style={styles.emptyValue}>Not specified</Text>;
}

export default function TechnicianProfileScreen() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [techId, setTechId] = useState<string | null>(null);
  const [form, setForm] = useState<Technician | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [noTechProfile, setNoTechProfile] = useState(false);

  // Habilitations are stored as explicit { licenseCode, aircraftTypeRatingId }
  // rows — never as a flat aircraft-type list saved against a "default"
  // license. See technicianRepositoryV2.replaceHabilitations().
  const [habilitations, setHabilitations] = useState<HabRow[]>([]);
  const [legacyHabilitations, setLegacyHabilitations] = useState<LegacyHabRow[]>([]);
  const [habDirty, setHabDirty] = useState(false);
  const [newHabLicense, setNewHabLicense] = useState<string | null>(null);
  const [newHabRating, setNewHabRating] = useState<string | null>(null);
  const [newHabExperienceYears, setNewHabExperienceYears] = useState('');
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
        .select(
          'id, anonymous_code, first_name, last_name, email, phone, location_city_id, availability, verification_status, profile_completeness',
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

      const [licResult, habResult, expResult] = await Promise.all([
        supabase
          .from('technician_licenses')
          .select('license_code, issued_at, expires_at')
          .eq('technician_id', techRow.id),
        supabase
          .from('technician_habilitations')
          .select('id, license_code, aircraft_type_code, aircraft_type_rating_id, experience_years, issued_at, expires_at, is_current')
          .eq('technician_id', techRow.id),
        supabase
          .from('technician_aircraft_experience')
          .select('value, unit')
          .eq('technician_id', techRow.id),
      ]);

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
        aircraft_type_code: string | null;
        aircraft_type_rating_id: string | null;
        experience_years: number | null;
        issued_at: string | null;
        expires_at: string | null;
        is_current: boolean;
      }[];
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
      const legacyHabs: LegacyHabRow[] = habRows
        .filter((r) => !r.aircraft_type_rating_id && r.aircraft_type_code)
        .map((r) => ({ id: r.id, licenseCode: r.license_code, aircraftTypeCode: r.aircraft_type_code as string }));
      setHabilitations(normalizedHabs);
      setLegacyHabilitations(legacyHabs);
      setHabDirty(false);

      // Resolve every referenced rating id in one batched call — includes
      // inactive ratings, since an existing habilitation may point at one.
      const resolvedRatings = await catalogRepository.getAircraftTypeRatingsByIds(
        normalizedHabs.map((h) => h.aircraftTypeRatingId),
      );
      const resolvedIndex = buildAircraftRatingIndex(resolvedRatings);
      setRatingsById(resolvedIndex);

      // Derived only for the V1-shaped completeness score / summary card —
      // never used as the source of truth for saving.
      const aircraftTypes = [...new Set([
        ...legacyHabs.map((h) => h.aircraftTypeCode),
        ...normalizedHabs
          .map((h) => resolvedIndex.get(h.aircraftTypeRatingId)?.aircraftFamily)
          .filter((v): v is string => Boolean(v)),
      ])];

      const expRows = (expResult.data ?? []) as { value: number; unit: string }[];
      const yearsExperience =
        expRows.length > 0
          ? Math.max(
              ...expRows.map((r) =>
                r.unit === 'years' ? r.value : Math.round(r.value / 2000),
              ),
            )
          : 0;

      setForm(supaRowToForm(techRow as SupaTechRow, licenses, aircraftTypes, yearsExperience));
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

  function updateField<K extends keyof Technician>(key: K, value: Technician[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
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

  function updateHabilitationField(index: number, patch: Partial<Pick<HabRow, 'issuedAt' | 'expiresAt' | 'isCurrent'>>) {
    setHabilitations((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
    setHabDirty(true);
    setIsDirty(true);
  }

  function addHabilitation() {
    if (!newHabLicense || !newHabRating) return;
    if (habilitations.some((h) => h.licenseCode === newHabLicense && h.aircraftTypeRatingId === newHabRating)) return;
    const trimmedYears = newHabExperienceYears.trim();
    const experienceYears = trimmedYears ? Number(trimmedYears) : undefined;
    setHabilitations((prev) => [
      ...prev,
      { licenseCode: newHabLicense, aircraftTypeRatingId: newHabRating, experienceYears },
    ]);
    setNewHabLicense(null);
    setNewHabRating(null);
    setNewHabExperienceYears('');
    setHabDirty(true);
    setIsDirty(true);
  }

  function removeHabilitation(index: number) {
    setHabilitations((prev) => prev.filter((_, i) => i !== index));
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

    const selectedLocation = resolveLocationSnapshot(form);
    const locationCityId = selectedLocation?.locationCityId ?? form.locationCityId;

    const nameParts = form.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;

    const immediately = form.availability.status === 'available';
    const availableFrom =
      form.availability.status === 'open_to_offers'
        ? (form.availability.availableFrom ?? null)
        : null;

    // Habilitation rows can only reference a license the technician is
    // keeping — filter out any that referenced a license removed in this
    // same save (the FK on technician_habilitations requires the pair to
    // exist in technician_licenses).
    const validHabilitations = habilitations.filter((h) => form.licenseCategories.includes(h.licenseCode));
    const derivedAircraftTypes = [...new Set([
      ...legacyHabilitations.map((h) => h.aircraftTypeCode),
      ...validHabilitations
        .map((h) => ratingsById.get(h.aircraftTypeRatingId)?.aircraftFamily)
        .filter((v): v is string => Boolean(v)),
    ])];
    const newCompleteness = computeProfileCompleteness({ ...form, aircraftTypes: derivedAircraftTypes });

    setSaving(true);
    setProfileError(null);
    try {
      // Update main profile row
      const { error: updateErr } = await supabase
        .from('technician_profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          email: form.email,
          phone: form.phone || null,
          ...(locationCityId ? { location_city_id: locationCityId } : {}),
          availability: {
            immediately,
            available_from: availableFrom,
            contract_types: form.availability.contractTypes,
          },
          profile_completeness: newCompleteness,
        })
        .eq('id', techId);

      if (updateErr) throw updateErr;

      // Replace licenses
      const { error: delLicErr } = await supabase
        .from('technician_licenses')
        .delete()
        .eq('technician_id', techId);
      if (delLicErr) throw delLicErr;

      if (form.licenseCategories.length > 0) {
        const { error: insLicErr } = await supabase
          .from('technician_licenses')
          .insert(
            form.licenseCategories.map((code) => ({
              technician_id: techId,
              license_code: code,
              issued_at: licenseDetails[code]?.issuedAt || null,
              expires_at: licenseDetails[code]?.expiresAt || null,
            })),
          );
        if (insLicErr) throw insLicErr;
      }

      // Replace normalized habilitations — each row carries its own explicit
      // licenseCode, never a "default" license applied to every aircraft.
      // Legacy rows (aircraft_type_rating_id IS NULL) are left untouched.
      if (habDirty) {
        await technicianRepositoryV2.replaceHabilitations(
          techId,
          validHabilitations.map((h) => ({
            licenseCode: h.licenseCode,
            aircraftTypeRatingId: h.aircraftTypeRatingId,
            experienceYears: h.experienceYears,
            issuedAt: h.issuedAt,
            expiresAt: h.expiresAt,
            isCurrent: h.isCurrent,
          })),
        );
        setHabilitations(validHabilitations);
        setHabDirty(false);
      }

      setForm((prev) => (prev ? { ...prev, profileCompleteness: newCompleteness, aircraftTypes: derivedAircraftTypes } : prev));
      setIsDirty(false);
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

  const completeness = form.profileCompleteness ?? 0;
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
                <Text style={styles.profileMetaValue}>{form.yearsExperience} yr</Text>
              </View>
              <View style={styles.profileMetaItem}>
                <Text style={styles.profileMetaLabel}>Status</Text>
                <Text style={styles.profileMetaValue}>{availabilityLabel(status)}</Text>
              </View>
            </View>

            <View style={styles.completenessBlock}>
              <View style={styles.completenessRow}>
                <Text style={styles.completenessLabel}>Profile completeness</Text>
                <Text style={styles.completenessValue}>{completeness}%</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${completeness}%` as any }]} />
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
          </TechnicianCard>
          <Text style={styles.privacyNote}>
            Your identity is private by default and is only shared with accepted company contacts.
          </Text>

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

            <View style={styles.fieldGap} />
            <FieldLabel>Available from</FieldLabel>
            <DateField
              value={form.availability.availableFrom}
              onChange={(v) => updateAvailability({ availableFrom: v })}
              placeholder="Not set"
              palette={DATE_FIELD_PALETTE}
            />
          </TechnicianCard>

          <SectionTitle title="Licenses" subtitle="Select all EASA Part-66 categories you hold." />
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

          <SectionTitle
            title="Habilitations"
            subtitle="Each rating is linked to the Part-66 category it was issued under — never guessed."
          />
          <TechnicianCard style={styles.sectionCard}>
            {habilitations.length === 0 && legacyHabilitations.length === 0 ? <EmptyValue /> : null}

            {habilitations.map((h, index) => (
              <View key={h.id ?? `new-${h.licenseCode}-${h.aircraftTypeRatingId}`} style={styles.habItem}>
                <View style={styles.habTopRow}>
                  <View style={styles.habInfo}>
                    <Text style={styles.habLicense}>{h.licenseCode}</Text>
                    <Text style={styles.habRating}>
                      {getAircraftTypeRatingLabel(h.aircraftTypeRatingId, ratingsById)}
                      {h.experienceYears ? ` · ${h.experienceYears} years` : ''}
                    </Text>
                    <View style={styles.chipRow}>
                      <TechnicianBadge label="Declared" tone="cyan" small />
                      {ratingsById.get(h.aircraftTypeRatingId)?.isActive === false ? (
                        <TechnicianBadge label="Inactive catalog entry" tone="warning" small />
                      ) : null}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removeHabilitation(index)} accessibilityRole="button">
                    <Text style={styles.habRemove}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.habVigenciaRow}>
                  <View style={styles.habVigenciaField}>
                    <Text style={styles.fieldLabelXs}>Issued</Text>
                    <DateField
                      value={h.issuedAt}
                      onChange={(v) => updateHabilitationField(index, { issuedAt: v })}
                      placeholder="Not set"
                      palette={DATE_FIELD_PALETTE}
                    />
                  </View>
                  <View style={styles.habVigenciaField}>
                    <Text style={styles.fieldLabelXs}>Expires</Text>
                    <DateField
                      value={h.expiresAt}
                      onChange={(v) => updateHabilitationField(index, { expiresAt: v })}
                      placeholder="Not set"
                      palette={DATE_FIELD_PALETTE}
                    />
                  </View>
                </View>
                <View style={styles.chipRow}>
                  <TechnicianChip
                    label="Current"
                    selected={h.isCurrent !== false}
                    onPress={() => updateHabilitationField(index, { isCurrent: true })}
                  />
                  <TechnicianChip
                    label="Not current"
                    selected={h.isCurrent === false}
                    onPress={() => updateHabilitationField(index, { isCurrent: false })}
                  />
                </View>
              </View>
            ))}

            {legacyHabilitations.map((h) => (
              <View key={h.id} style={styles.habRow}>
                <View style={styles.habInfo}>
                  <Text style={styles.habLicense}>{h.licenseCode}</Text>
                  <Text style={styles.habRating}>{aircraftTypeLabel(h.aircraftTypeCode)} — general, engine not specified</Text>
                  <TechnicianBadge label="Legacy" tone="muted" small />
                </View>
              </View>
            ))}

            <View style={styles.fieldGap} />
            <FieldLabel>Add habilitation — category</FieldLabel>
            {form.licenseCategories.length === 0 ? (
              <Text style={styles.emptyValue}>Add a license above first.</Text>
            ) : (
              <View style={styles.chipRow}>
                {form.licenseCategories.map((code) => (
                  <TechnicianChip
                    key={code}
                    label={code}
                    selected={newHabLicense === code}
                    onPress={() => setNewHabLicense(code)}
                  />
                ))}
              </View>
            )}

            <View style={styles.fieldGap} />
            <FieldLabel>Add habilitation — aircraft + engine rating</FieldLabel>
            <AircraftTypeRatingPicker
              value={newHabRating}
              onSelect={(r) => {
                setNewHabRating(r.id);
                setRatingsById((prev) => new Map(prev).set(r.id, r));
              }}
            />

            <View style={styles.fieldGap} />
            <FieldLabel>Years of experience on this rating (optional)</FieldLabel>
            <TextInput
              style={styles.input}
              value={newHabExperienceYears}
              onChangeText={setNewHabExperienceYears}
              placeholder="e.g. 4"
              placeholderTextColor={techUi.textMuted}
              keyboardType="numeric"
            />

            <View style={styles.fieldGap} />
            <Button
              label="Add habilitation"
              variant="secondary"
              size="sm"
              disabled={!newHabLicense || !newHabRating}
              onPress={addHabilitation}
            />

            <TouchableOpacity onPress={() => setRequestPanelOpen((v) => !v)} style={styles.linkRow}>
              <Text style={styles.linkText}>Can&apos;t find your habilitation? Request it.</Text>
            </TouchableOpacity>
          </TechnicianCard>

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

          <SectionTitle title="Specialties" />
          <TechnicianCard style={styles.sectionCard}>
            <View style={styles.tagRow}>
              {form.specialties.length > 0
                ? form.specialties.map((s) => (
                    <TechnicianBadge key={s} label={s} tone="cyan" small />
                  ))
                : <EmptyValue />}
            </View>
          </TechnicianCard>
          <Text style={styles.privacyNote}>
            Specialties are managed through verification.
          </Text>

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
  completenessBlock: {
    gap: spacing.xs,
  },
  completenessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completenessLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: techUi.textSoft,
  },
  completenessValue: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: techUi.accent,
  },
  progressBg: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: techUi.borderSoft,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: techUi.accent,
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
  habRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: techUi.borderSoft,
  },
  habItem: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: techUi.borderSoft,
  },
  habTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  habVigenciaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  habVigenciaField: {
    flex: 1,
    minWidth: 0,
  },
  habInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  habLicense: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: techUi.text,
  },
  habRating: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: techUi.textSoft,
  },
  habRemove: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: techUi.red,
  },
  linkRow: {
    marginTop: spacing.sm,
  },
  linkText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: techUi.accent,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  emptyValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: techUi.textMuted,
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
