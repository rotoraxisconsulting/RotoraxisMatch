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
import { AIRPLANES, HELICOPTERS } from '../../src/constants/aircraftTypes';
import { colors, spacing } from '../../src/theme';

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
          .select('license_code')
          .eq('technician_id', techRow.id),
        supabase
          .from('technician_habilitations')
          .select('aircraft_type_code')
          .eq('technician_id', techRow.id),
        supabase
          .from('technician_aircraft_experience')
          .select('value, unit')
          .eq('technician_id', techRow.id),
      ]);

      const licenses = (licResult.data ?? []).map((r: any) => r.license_code as string);
      const aircraftTypes = (habResult.data ?? []).map((r: any) => r.aircraft_type_code as string);
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
    const next = form.licenseCategories.includes(code)
      ? form.licenseCategories.filter((c) => c !== code)
      : [...form.licenseCategories, code];
    updateField('licenseCategories', next);
  }

  function toggleAircraftType(code: string) {
    if (!form) return;
    const next = form.aircraftTypes.includes(code)
      ? form.aircraftTypes.filter((c) => c !== code)
      : [...form.aircraftTypes, code];
    updateField('aircraftTypes', next);
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

    const newCompleteness = computeProfileCompleteness(form);

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
            })),
          );
        if (insLicErr) throw insLicErr;
      }

      // Replace habilitations (each needs a license_code FK from license_categories)
      const { error: delHabErr } = await supabase
        .from('technician_habilitations')
        .delete()
        .eq('technician_id', techId);
      if (delHabErr) throw delHabErr;

      if (form.aircraftTypes.length > 0 && form.licenseCategories.length > 0) {
        const defaultLicense = form.licenseCategories[0];
        const { error: insHabErr } = await supabase
          .from('technician_habilitations')
          .insert(
            form.aircraftTypes.map((code) => ({
              technician_id: techId,
              license_code: defaultLicense,
              aircraft_type_code: code,
            })),
          );
        if (insHabErr) throw insHabErr;
      }

      setForm((prev) => (prev ? { ...prev, profileCompleteness: newCompleteness } : prev));
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
            <TextInput
              style={styles.input}
              value={form.availability.availableFrom ?? ''}
              onChangeText={(v) => updateAvailability({ availableFrom: v || undefined })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={techUi.textMuted}
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
          </TechnicianCard>

          <SectionTitle title="Aircraft types" subtitle="Select aircraft types you have experience with." />
          <TechnicianCard style={styles.sectionCard}>
            <FieldLabel>Airplanes</FieldLabel>
            <View style={styles.chipRow}>
              {AIRPLANES.map((a) => (
                <TechnicianChip
                  key={a.code}
                  label={a.code}
                  selected={form.aircraftTypes.includes(a.code)}
                  onPress={() => toggleAircraftType(a.code)}
                />
              ))}
            </View>
            <View style={styles.fieldGap} />
            <FieldLabel>Helicopters</FieldLabel>
            <View style={styles.chipRow}>
              {HELICOPTERS.map((a) => (
                <TechnicianChip
                  key={a.code}
                  label={a.code}
                  selected={form.aircraftTypes.includes(a.code)}
                  onPress={() => toggleAircraftType(a.code)}
                />
              ))}
            </View>
          </TechnicianCard>

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
