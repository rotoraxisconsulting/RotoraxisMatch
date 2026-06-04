import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { CheckCircle, FileText, MapPin, Minus, Plus, Save } from 'lucide-react-native';
import { colors, spacing } from '../../../src/theme';
import {
  CompanyCard,
  CompanyChip,
  CompanyPageHeader,
  CompanyScreen,
  EmptyPanel,
  IconBox,
  companyStyles,
  companyUi,
} from '../../../src/components/company/CompanyUI';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { TECHNICIAN_TYPES } from '../../../src/constants/technicianTypes';
import { LICENSE_CATEGORIES } from '../../../src/constants/licenses';
import { AIRPLANES, HELICOPTERS, inferAircraftCategory } from '../../../src/constants/aircraftTypes';
import type { AircraftCategory } from '../../../src/constants/aircraftTypes';
import { CONTRACT_TYPES } from '../../../src/constants/contractTypes';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../../src/types/catalog';
import { OfferStatus } from '../../../src/types/enums';
import { OfferWithRequirements } from '../../../src/types/offer';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { CountryPickerField, CityPickerField } from '../../../src/components/LocationPicker';

interface FormState {
  title: string;
  description: string;
  contractType: ContractTypeCode;
  locationCityId: string;
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

function computeErrors(form: FormState) {
  return {
    title: !form.title.trim() ? 'Title is required.'
      : form.title.trim().length < 3 ? 'Title must be at least 3 characters.'
      : undefined,
    description: !form.description.trim() ? 'Description is required.' : undefined,
    location: !form.locationCityId ? 'Please select a country and city.' : undefined,
  };
}
type FormErrors = { title?: string; description?: string; location?: string };

export default function EditOfferScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [offer, setOffer] = useState<OfferWithRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [aircraftTab, setAircraftTab] = useState<AircraftCategory>('airplane');

  useEffect(() => {
    if (!id) return;
    offerRepository.getWithRequirements(id).then((o) => {
      setOffer(o);
      if (o) {
        setForm({
          title: o.title,
          description: o.description,
          contractType: o.contractType,
          locationCityId: o.locationCityId,
          locationCountry: o.locationCountry,
          locationCity: o.locationCity,
          locationBaseAirport: o.locationBaseAirport ?? '',
          minYearsExperience: o.minYearsExperience,
          requiredTechnicianTypes: o.requiredTechnicianTypes as TechnicianTypeCode[],
          requiredLicenses: o.requiredLicenses as LicenseCode[],
          requiredAircraftTypes: o.requiredAircraftTypes,
          status: o.status,
        });
        // Infer initial tab from existing aircraft types
        const inferred = inferAircraftCategory(o.requiredAircraftTypes);
        if (inferred === 'helicopter') setAircraftTab('helicopter');
      }
      setLoading(false);
    });
  }, [id]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
    if (key === 'title') setErrors((e) => ({ ...e, title: undefined }));
    if (key === 'description') setErrors((e) => ({ ...e, description: undefined }));
    if (['locationCityId', 'locationCountry', 'locationCity'].includes(key as string)) {
      setErrors((e) => ({ ...e, location: undefined }));
    }
  }

  async function handleSave(overrideStatus?: OfferStatus) {
    if (!form || !id) return;
    const errs = computeErrors(form);
    if (Object.values(errs).some(Boolean)) { setErrors(errs); return; }

    const status = overrideStatus ?? form.status;

    setSaving(true);
    try {
      await offerRepository.update(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        contractType: form.contractType,
        locationCityId: form.locationCityId,
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
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  if (!offer) {
    return (
      <CompanyScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFound}>
          <EmptyPanel title="Offer not found" subtitle="This offer is no longer available." />
        </View>
      </CompanyScreen>
    );
  }

  return (
    <CompanyScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[companyStyles.content, isWide && companyStyles.contentWide]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CompanyPageHeader
          eyebrow="Offer editor"
          title="Edit Offer"
          subtitle={offer.title}
          onBack={() => router.back()}
        />

        <FormSection title="Offer details" subtitle="Update the role information technicians will see." icon={FileText}>
          <FormField label="Title" error={errors.title}>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              placeholderTextColor={companyUi.textMuted}
              value={form.title}
              onChangeText={(v) => setField('title', v)}
            />
          </FormField>

          <FormField label="Description" error={errors.description}>
            <TextInput
              style={[styles.input, styles.textarea, errors.description && styles.inputError]}
              placeholderTextColor={companyUi.textMuted}
              value={form.description}
              onChangeText={(v) => setField('description', v)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </FormField>

          <FormField label="Contract type">
            <View style={styles.chipRow}>
              {CONTRACT_TYPES.map((ct) => (
                <CompanyChip
                  key={ct.code}
                  label={ct.label}
                  selected={form.contractType === ct.code}
                  onPress={() => setField('contractType', ct.code as ContractTypeCode)}
                />
              ))}
            </View>
          </FormField>

          <FormField label="Minimum years of experience">
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => setField('minYearsExperience', Math.max(0, form.minYearsExperience - 1))}
                activeOpacity={0.75}
              >
                <Minus color={companyUi.textSoft} size={17} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.stepValue}>{form.minYearsExperience} yrs</Text>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => setField('minYearsExperience', Math.min(30, form.minYearsExperience + 1))}
                activeOpacity={0.75}
              >
                <Plus color={companyUi.textSoft} size={17} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </FormField>
        </FormSection>

        <FormSection title="Location" subtitle="Keep the operational base clear for matching." icon={MapPin}>
          <CountryPickerField
            label="Country"
            value={form.locationCountry}
            onChange={(country) => {
              setField('locationCityId', '');
              setField('locationCountry', country);
              setField('locationCity', '');
              setField('locationBaseAirport', '');
            }}
          />
          <CityPickerField
            label="City"
            country={form.locationCountry}
            value={form.locationCity}
            onChange={(city, _icao, entry) => {
              setField('locationCityId', entry.id);
              setField('locationCity', city);
              setField('locationBaseAirport', entry.iata || entry.icao);
            }}
          />
          {errors.location ? <Text style={styles.fieldError}>{errors.location}</Text> : null}
          <FormField label="Base airport">
            <TextInput
              style={[styles.input, styles.readonlyInput]}
              placeholderTextColor={companyUi.textMuted}
              value={form.locationBaseAirport}
              editable={false}
              maxLength={4}
            />
          </FormField>
        </FormSection>

        <ChoiceSection title="Required technician types" helper="Leave empty to accept any type.">
          {TECHNICIAN_TYPES.filter((t) => t.isActive).map((t) => (
            <CompanyChip
              key={t.code}
              label={t.label}
              selected={form.requiredTechnicianTypes.includes(t.code as TechnicianTypeCode)}
              onPress={() => setField('requiredTechnicianTypes', toggle(form.requiredTechnicianTypes, t.code as TechnicianTypeCode))}
            />
          ))}
        </ChoiceSection>

        <ChoiceSection title="Required licenses" helper="Leave empty to accept any license.">
          {LICENSE_CATEGORIES.map((l) => (
            <CompanyChip
              key={l.code}
              label={l.code}
              selected={form.requiredLicenses.includes(l.code as LicenseCode)}
              onPress={() => setField('requiredLicenses', toggle(form.requiredLicenses, l.code as LicenseCode))}
            />
          ))}
        </ChoiceSection>

        <ChoiceSection title="Required aircraft types" helper="Leave empty to accept any aircraft type.">
          <View style={styles.categoryTabs}>
            <CompanyChip label="Airplanes" selected={aircraftTab === 'airplane'} onPress={() => setAircraftTab('airplane')} />
            <CompanyChip label="Helicopters" selected={aircraftTab === 'helicopter'} onPress={() => setAircraftTab('helicopter')} />
          </View>
          {(aircraftTab === 'airplane' ? AIRPLANES : HELICOPTERS).map((a) => (
            <CompanyChip
              key={a.code}
              label={a.code}
              selected={form.requiredAircraftTypes.includes(a.code)}
              onPress={() => setField('requiredAircraftTypes', toggle(form.requiredAircraftTypes, a.code))}
            />
          ))}
          {form.requiredAircraftTypes.filter((c) => inferAircraftCategory([c]) !== aircraftTab).length > 0 && (
            <Text style={styles.otherCategoryNote}>
              +{form.requiredAircraftTypes.filter((c) => inferAircraftCategory([c]) !== aircraftTab).length} selected in other category
            </Text>
          )}
        </ChoiceSection>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.disabled]}
            onPress={() => handleSave()}
            disabled={saving}
            activeOpacity={0.75}
          >
            {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Save color={colors.white} size={16} strokeWidth={2} />}
            <Text style={styles.primaryButtonText}>Save changes</Text>
          </TouchableOpacity>
          {form.status === 'draft' ? (
            <TouchableOpacity
              style={[styles.publishButton, saving && styles.disabled]}
              onPress={() => handleSave('published')}
              disabled={saving}
              activeOpacity={0.75}
            >
              <CheckCircle color={colors.white} size={16} strokeWidth={2} />
              <Text style={styles.primaryButtonText}>Save and publish</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </CompanyScreen>
  );
}

function FormSection({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<any>;
  children: React.ReactNode;
}) {
  return (
    <CompanyCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <IconBox icon={icon} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </CompanyCard>
  );
}

function ChoiceSection({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <CompanyCard style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{helper}</Text>
      <View style={styles.choiceWrap}>{children}</View>
    </CompanyCard>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  section: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: companyUi.text,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  fieldError: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.red,
  },
  inputError: {
    borderColor: '#FECACA',
    backgroundColor: companyUi.redSoft,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: companyUi.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: companyUi.text,
    backgroundColor: companyUi.surfaceSoft,
  },
  readonlyInput: {
    color: companyUi.textSoft,
  },
  textarea: {
    minHeight: 104,
    paddingTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: companyUi.borderSoft,
  },
  otherCategoryNote: {
    fontSize: 11,
    fontWeight: '600',
    color: companyUi.textMuted,
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: companyUi.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: companyUi.surfaceSoft,
  },
  stepValue: {
    minWidth: 70,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: companyUi.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  primaryButton: {
    flex: 1,
    minWidth: 150,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: companyUi.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  publishButton: {
    flex: 1,
    minWidth: 150,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: companyUi.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
});
