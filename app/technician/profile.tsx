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
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
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
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { Technician, AvailabilityStatus } from '../../src/types';
import { CONTRACT_TYPES } from '../../src/constants/contractTypes';
import { LICENSE_CATEGORIES } from '../../src/constants/licenses';
import { AIRPLANES, HELICOPTERS } from '../../src/constants/aircraftTypes';
import { colors, spacing } from '../../src/theme';

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'open_to_offers', label: 'Open to offers' },
  { value: 'unavailable', label: 'Unavailable' },
];

type AvailabilityContract = Technician['availability']['contractTypes'][number];

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
  const { technician, loading, updateProfile, refresh } = useTechnicianDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [form, setForm] = useState<Technician | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (technician) {
      setForm({ ...technician });
      setIsDirty(false);
    }
  }, [technician]);

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
    const current = form.licenseCategories;
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    updateField('licenseCategories', next);
  }

  function toggleAircraftType(code: string) {
    if (!form) return;
    const current = form.aircraftTypes;
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
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
    if (!form || !isDirty) return;
    const selectedLocation = resolveLocationSnapshot(form);
    const profileToSave: Partial<Technician> = selectedLocation
      ? {
          ...form,
          locationCityId: selectedLocation.locationCityId,
          country: selectedLocation.country,
          city: selectedLocation.city,
          baseAirport: selectedLocation.baseAirport,
        }
      : form;
    setSaving(true);
    await updateProfile(profileToSave);
    setSaving(false);
  }

  if (loading || !form) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  const completeness = form.profileCompleteness ?? 0;
  const status = form.availability.status ?? 'open_to_offers';

  return (
    <TechnicianScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <DemoModeBanner role="technician" />
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
              onChange={(country) => updateFields({
                country,
                locationCityId: undefined,
                city: '',
                baseAirport: '',
              })}
            />
            <View style={styles.fieldGap} />
            <CityPickerField
              label="City"
              country={form.country}
              value={form.city}
              onChange={(city, _icao, entry) => updateFields({
                locationCityId: entry.id,
                city,
                baseAirport: entry.iata || entry.icao,
              })}
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

          <SectionTitle title="Experience" />
          <TechnicianCard style={styles.sectionCard}>
            <FieldLabel>Years of experience</FieldLabel>
            <TextInput
              style={styles.input}
              value={String(form.yearsExperience)}
              onChangeText={(v) => {
                const n = parseInt(v, 10);
                if (!isNaN(n) && n >= 0) updateField('yearsExperience', n);
                else if (v === '') updateField('yearsExperience', 0);
              }}
              placeholder="0"
              placeholderTextColor={techUi.textMuted}
              keyboardType="number-pad"
              maxLength={2}
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
                ? form.specialties.map((s) => <TechnicianBadge key={s} label={s} tone="cyan" small />)
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
});
