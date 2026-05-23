import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { TECHNICIAN_TYPES } from '../../../src/constants/technicianTypes';
import { LICENSE_CATEGORIES } from '../../../src/constants/licenses';
import { AIRCRAFT_TYPE_CATALOG } from '../../../src/constants/aircraftTypes';
import { CONTRACT_TYPES } from '../../../src/constants/contractTypes';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../../src/types/catalog';
import { OfferStatus } from '../../../src/types/enums';
import { OfferWithRequirements } from '../../../src/types/offer';
import { LoadingScreen } from '../../../src/components/LoadingScreen';

interface FormState {
  title: string;
  description: string;
  contractType: ContractTypeCode;
  locationCountry: string;
  locationCity: string;
  locationBaseAirport: string;
  minYearsExperience: number;
  requiredTechnicianTypes: TechnicianTypeCode[];
  requiredLicenses: LicenseCode[];
  requiredAircraftTypes: string[];
  status: OfferStatus;
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function validate(form: FormState): string | null {
  if (!form.title.trim()) return 'Title is required.';
  if (form.title.trim().length < 3) return 'Title must be at least 3 characters.';
  if (!form.description.trim()) return 'Description is required.';
  if (!form.locationCountry.trim()) return 'Country is required.';
  if (!form.locationCity.trim()) return 'City is required.';
  if (form.minYearsExperience < 0 || form.minYearsExperience > 30) return 'Years of experience must be between 0 and 30.';
  return null;
}

export default function EditOfferScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [offer, setOffer] = useState<OfferWithRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!id) return;
    offerRepository.getWithRequirements(id).then((o) => {
      setOffer(o);
      if (o) {
        setForm({
          title: o.title,
          description: o.description,
          contractType: o.contractType,
          locationCountry: o.locationCountry,
          locationCity: o.locationCity,
          locationBaseAirport: o.locationBaseAirport ?? '',
          minYearsExperience: o.minYearsExperience,
          requiredTechnicianTypes: o.requiredTechnicianTypes as TechnicianTypeCode[],
          requiredLicenses: o.requiredLicenses as LicenseCode[],
          requiredAircraftTypes: o.requiredAircraftTypes,
          status: o.status,
        });
      }
      setLoading(false);
    });
  }, [id]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleSave(overrideStatus?: OfferStatus) {
    if (!form || !id) return;
    const err = validate(form);
    if (err) { Alert.alert('Validation error', err); return; }

    const status = overrideStatus ?? form.status;

    setSaving(true);
    try {
      await offerRepository.update(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        contractType: form.contractType,
        locationCountry: form.locationCountry.trim(),
        locationCity: form.locationCity.trim(),
        locationBaseAirport: form.locationBaseAirport.trim() || undefined,
        minYearsExperience: form.minYearsExperience,
        status,
        visible: status === 'published',
      });
      await offerRepository.replaceRequirements(id, {
        technicianTypes: form.requiredTechnicianTypes,
        licenses: form.requiredLicenses,
        aircraftTypes: form.requiredAircraftTypes,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save offer.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Offer' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  if (!offer) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Edit Offer' }} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Offer not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Edit Offer' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FormSection label="Offer details">
          <FormField label="Title *">
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.textMuted}
              value={form.title}
              onChangeText={(v) => setField('title', v)}
            />
          </FormField>

          <FormField label="Description *">
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholderTextColor={colors.textMuted}
              value={form.description}
              onChangeText={(v) => setField('description', v)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </FormField>

          <FormField label="Contract type *">
            <View style={styles.segmented}>
              {CONTRACT_TYPES.map((ct) => (
                <TouchableOpacity
                  key={ct.code}
                  style={[styles.segBtn, form.contractType === ct.code && styles.segBtnActive]}
                  onPress={() => setField('contractType', ct.code as ContractTypeCode)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segBtnText, form.contractType === ct.code && styles.segBtnTextActive]}>
                    {ct.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormField>

          <FormField label="Minimum years of experience">
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setField('minYearsExperience', Math.max(0, form.minYearsExperience - 1))}
                activeOpacity={0.7}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{form.minYearsExperience} yrs</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setField('minYearsExperience', Math.min(30, form.minYearsExperience + 1))}
                activeOpacity={0.7}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </FormField>
        </FormSection>

        <FormSection label="Location">
          <FormField label="Country *">
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.textMuted}
              value={form.locationCountry}
              onChangeText={(v) => setField('locationCountry', v)}
            />
          </FormField>
          <FormField label="City *">
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.textMuted}
              value={form.locationCity}
              onChangeText={(v) => setField('locationCity', v)}
            />
          </FormField>
          <FormField label="Base airport (optional)">
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.textMuted}
              value={form.locationBaseAirport}
              onChangeText={(v) => setField('locationBaseAirport', v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={4}
            />
          </FormField>
        </FormSection>

        <FormSection label="Required technician types">
          <Text style={styles.sectionNote}>Leave empty to accept any type.</Text>
          <View style={styles.pills}>
            {TECHNICIAN_TYPES.filter((t) => t.isActive).map((t) => {
              const selected = form.requiredTechnicianTypes.includes(t.code as TechnicianTypeCode);
              return (
                <TouchableOpacity
                  key={t.code}
                  style={[styles.pill, selected && styles.pillActive]}
                  onPress={() => setField('requiredTechnicianTypes', toggle(form.requiredTechnicianTypes, t.code as TechnicianTypeCode))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, selected && styles.pillTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FormSection>

        <FormSection label="Required licenses">
          <Text style={styles.sectionNote}>Leave empty to accept any license.</Text>
          <View style={styles.pills}>
            {LICENSE_CATEGORIES.map((l) => {
              const selected = form.requiredLicenses.includes(l.code as LicenseCode);
              return (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.pill, selected && styles.pillActive]}
                  onPress={() => setField('requiredLicenses', toggle(form.requiredLicenses, l.code as LicenseCode))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, selected && styles.pillTextActive]}>{l.code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FormSection>

        <FormSection label="Required aircraft types">
          <Text style={styles.sectionNote}>Leave empty to accept any aircraft type.</Text>
          <View style={styles.pills}>
            {AIRCRAFT_TYPE_CATALOG.map((a) => {
              const selected = form.requiredAircraftTypes.includes(a.code);
              return (
                <TouchableOpacity
                  key={a.code}
                  style={[styles.pill, selected && styles.pillActive]}
                  onPress={() => setField('requiredAircraftTypes', toggle(form.requiredAircraftTypes, a.code))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, selected && styles.pillTextActive]}>{a.code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FormSection>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.saveBtn, saving && styles.btnDisabled]}
            onPress={() => handleSave()}
            disabled={saving}
            activeOpacity={0.75}
          >
            {saving ? <ActivityIndicator color={colors.white} size="small" /> : null}
            <Text style={styles.saveBtnText}>Save changes</Text>
          </TouchableOpacity>
          {form.status === 'draft' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.publishBtn, saving && styles.btnDisabled]}
              onPress={() => handleSave('published')}
              disabled={saving}
              activeOpacity={0.75}
            >
              <Text style={styles.publishBtnText}>Save & Publish</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 16, color: colors.textSecondary },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
  },
  textarea: {
    minHeight: 96,
    paddingTop: spacing.sm + 2,
  },
  sectionNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  segmented: { flexDirection: 'row', gap: spacing.xs },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  segBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  segBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  segBtnTextActive: { color: colors.white },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stepBtnText: { fontSize: 20, fontWeight: '300', color: colors.text, lineHeight: 24 },
  stepValue: { fontSize: 16, fontWeight: '700', color: colors.text, minWidth: 60, textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  pillActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  pillText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: colors.white },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    gap: spacing.xs,
  },
  saveBtn: { backgroundColor: colors.blue },
  publishBtn: { backgroundColor: colors.success },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  publishBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
