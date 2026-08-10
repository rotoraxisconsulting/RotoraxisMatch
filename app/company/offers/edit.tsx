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
import { CheckCircle, FileText, MapPin, Minus, Plane, Plus, Save } from 'lucide-react-native';
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
import { TypeRatingRequirementsEditor, ExactHabilitationRow } from '../../../src/components/company/TypeRatingRequirementsEditor';
import { RequiredLicensesSection } from '../../../src/components/company/RequiredLicensesSection';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { TECHNICIAN_TYPES } from '../../../src/constants/technicianTypes';
import { CONTRACT_TYPES } from '../../../src/constants/contractTypes';
import { OFFER_PRODUCT_TYPES, getOfferProductTypeLabel } from '../../../src/constants/offerProductTypes';
import { isLicenseCompatibleWithProductType } from '../../../src/utils/licenseCategoryProductType';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../../src/types/catalog';
import { OfferStatus } from '../../../src/types/enums';
import { OfferProductType, OfferWithRequirements } from '../../../src/types/offer';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { CountryPickerField, CityPickerField } from '../../../src/components/LocationPicker';
import { notify, confirmAction } from '../../../src/utils/platformAlert';

interface FormState {
  title: string;
  description: string;
  contractType: ContractTypeCode;
  productType: OfferProductType;
  locationCityId: string;
  locationCountry: string;
  locationCity: string;
  locationBaseAirport: string;
  minYearsExperience: number;
  technicianType: TechnicianTypeCode;
  requiresCertification: boolean;
  requiredLicenses: LicenseCode[];
  requiredHabilitations: ExactHabilitationRow[];
  status: OfferStatus;
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

  useEffect(() => {
    if (!id) return;
    offerRepository.getWithRequirements(id).then((o) => {
      setOffer(o);
      if (o) {
        setForm({
          title: o.title,
          description: o.description,
          contractType: o.contractType,
          productType: o.productType,
          locationCityId: o.locationCityId,
          locationCountry: o.locationCountry,
          locationCity: o.locationCity,
          locationBaseAirport: o.locationBaseAirport ?? '',
          minYearsExperience: o.minYearsExperience,
          technicianType: o.technicianType,
          requiresCertification: o.requiresCertification,
          requiredLicenses: o.requiredLicenses as LicenseCode[],
          requiredHabilitations: o.requiredHabilitations.map((h) => ({
            licenseCode: h.licenseCode,
            aircraftTypeRatingId: h.aircraftTypeRatingId,
            requirementLevel: h.requirementLevel,
            notes: h.notes,
          })),
          status: o.status,
        });
      }
      setLoading(false);
    });
  }, [id]);

  // Fase 6 tanda C: el eje Part-66 lo abre o lo cierra el INTERRUPTOR de
  // certificación, no el tipo de perfil. offerRepository impone la misma
  // regla al escribir — esconder una sección no es una garantía.
  //
  // `?? true` mientras el formulario carga: es el valor por defecto de la
  // columna y el lado seguro: enseña las secciones un instante de más antes
  // que esconder requisitos que la oferta sí tiene.
  const requiresCertification = form?.requiresCertification ?? true;

  /**
   * Editando una oferta que YA existe, apagar la certificación avisa antes de
   * limpiar: lo que se descarta está guardado en la base, no es un borrador a
   * medias como en la pantalla de creación. Mismo patrón que
   * `onSelectProductType` de aquí abajo (migración 047).
   *
   * Si la empresa cancela, el interruptor NO se mueve — no se toca `form`
   * hasta después del await. Y solo se pregunta cuando hay algo que perder.
   *
   * Encenderla nunca pregunta: no destruye nada.
   */
  async function onToggleCertification(next: boolean) {
    if (!form || next === form.requiresCertification) return;

    if (!next) {
      const dropped: string[] = [];
      if (form.requiredLicenses.length > 0) {
        dropped.push(`the ${form.requiredLicenses.join(', ')} licence requirement${form.requiredLicenses.length !== 1 ? 's' : ''}`);
      }
      if (form.requiredHabilitations.length > 0) {
        dropped.push(`${form.requiredHabilitations.length} type rating requirement${form.requiredHabilitations.length !== 1 ? 's' : ''}`);
      }

      if (dropped.length > 0) {
        const confirmed = await confirmAction({
          title: 'Drop the licence requirements?',
          message:
            `An offer that does not need certified work cannot require a licence or a type rating, so this clears ${dropped.join(' and ')}.\n\n` +
            'The offer stays open to technicians who have done the work without holding the licence.',
          confirmLabel: 'Drop and continue',
          destructive: true,
        });
        if (!confirmed) return;
      }
    }

    setForm((prev) => prev ? {
      ...prev,
      requiresCertification: next,
      ...(next ? {} : { requiredLicenses: [], requiredHabilitations: [] }),
    } : prev);
  }

  /**
   * Editando una oferta que YA existe, cambiar el producto avisa antes de
   * limpiar: lo que se descarta está guardado en la base, no es un borrador a
   * medias como en la pantalla de creación.
   *
   * Si la empresa cancela, el selector NO se mueve — no se toca `form` hasta
   * después del await, así que la pantalla se queda exactamente como estaba.
   *
   * Solo se pregunta cuando hay algo que perder: cambiar el producto de una
   * oferta sin requisitos afectados es un cambio limpio y no merece diálogo.
   */
  async function onSelectProductType(productType: OfferProductType) {
    if (!form || productType === form.productType) return;

    const droppedLicenses = form.requiredLicenses.filter(
      (code) => !isLicenseCompatibleWithProductType(code, productType),
    );
    const droppedRatings = form.requiredHabilitations.length;

    if (droppedRatings > 0 || droppedLicenses.length > 0) {
      const parts: string[] = [];
      if (droppedRatings > 0) {
        parts.push(`${droppedRatings} type rating requirement${droppedRatings !== 1 ? 's' : ''}`);
      }
      if (droppedLicenses.length > 0) parts.push(`the ${droppedLicenses.join(', ')} licence requirement${droppedLicenses.length !== 1 ? 's' : ''}`);

      const confirmed = await confirmAction({
        title: `Switch this offer to ${getOfferProductTypeLabel(productType).toLowerCase()}?`,
        message: `This clears ${parts.join(' and ')}, which cannot apply to ${getOfferProductTypeLabel(productType).toLowerCase()}. You will need to add the new requirements before saving.`,
        confirmLabel: 'Switch and clear',
        destructive: true,
      });
      if (!confirmed) return;
    }

    setForm((prev) => prev ? {
      ...prev,
      productType,
      requiredHabilitations: [],
      requiredLicenses: prev.requiredLicenses.filter((code) => isLicenseCompatibleWithProductType(code, productType)),
    } : prev);
  }

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
        // Va en el update(), no en replaceRequirements(): el repositorio tiene
        // que retirar las filas de requisitos ANTES de mover esta columna
        // (orh_matches_offer lo impone), y hace justo eso cuando ve que
        // cambia.
        productType: form.productType,
        technicianType: form.technicianType,
        // Igual que productType: va en el update() y no en
        // replaceRequirements(), y el repositorio limpia los requisitos
        // Part-66 si ve que se apaga — la invariante lo exige aunque aquí no
        // haya ninguna FK que fuerce el orden.
        requiresCertification: form.requiresCertification,
        locationCityId: form.locationCityId,
        minYearsExperience: form.minYearsExperience,
        status,
        visible: status === 'published',
      });
      await offerRepository.replaceRequirements(id, {
        requiresCertification: form.requiresCertification,
        licenses: form.requiredLicenses,
        habilitations: form.requiredHabilitations,
      });
      router.back();
    } catch (e: any) {
      notify('Error', e?.message ?? 'Could not save offer.');
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

        {/* Mismo orden que la pantalla de creación (Fase 6 tanda C):
            1) tipo de perfil, 2) ¿certificar?, 3) avión o helicóptero,
            4) licencia, 5) aeronaves. */}
        <ChoiceSection
          title="Profile type"
          helper="One per offer. Two types in one advert are two jobs — publish them separately."
        >
          {TECHNICIAN_TYPES.filter((t) => t.isActive).map((t) => (
            <CompanyChip
              key={t.code}
              label={t.label}
              selected={form.technicianType === t.code}
              onPress={() => setField('technicianType', t.code as TechnicianTypeCode)}
            />
          ))}
        </ChoiceSection>

        <ChoiceSection
          title="Does this job need certified work?"
          helper={
            requiresCertification
              ? 'Yes — the technician must hold a valid EASA licence to sign off the work. You can require a licence and type ratings below.'
              : 'No — you are hiring for hands-on work, not for signing it off. No licence or type rating can be required.'
          }
        >
          <CompanyChip label="Yes, licence required" selected={requiresCertification} onPress={() => { void onToggleCertification(true); }} />
          <CompanyChip label="No licence needed" selected={!requiresCertification} onPress={() => { void onToggleCertification(false); }} />
        </ChoiceSection>

        <FormSection
          title="Airplanes or helicopters?"
          subtitle="An offer covers one or the other, never both. This sets which licence categories and type ratings you can require below."
          icon={Plane}
        >
          <View style={styles.chipRow}>
            {OFFER_PRODUCT_TYPES.map((p) => (
              <CompanyChip
                key={p.code}
                label={p.label}
                selected={form.productType === p.code}
                onPress={() => { void onSelectProductType(p.code); }}
              />
            ))}
          </View>
        </FormSection>

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

        {/* 4) licencia y 5) aeronaves, solo si la oferta exige certificar. */}
        {requiresCertification && (
          <RequiredLicensesSection
            requiredLicenses={form.requiredLicenses}
            onChangeLicenses={(next) => setField('requiredLicenses', next)}
            hasExactRequirements={form.requiredHabilitations.length > 0}
            productType={form.productType}
          />
        )}

        {requiresCertification && (
          <TypeRatingRequirementsEditor
            value={form.requiredHabilitations}
            onChange={(next) => setField('requiredHabilitations', next)}
            productType={form.productType}
          />
        )}

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
