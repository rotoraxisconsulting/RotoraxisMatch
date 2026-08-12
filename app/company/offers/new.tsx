import React, { useState } from 'react';
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
import { useRouter, Stack } from 'expo-router';
import { FileText, MapPin, Minus, Plane, Plus, Send } from 'lucide-react-native';
import { colors, spacing } from '../../../src/theme';
import {
  CompanyCard,
  CompanyChip,
  CompanyPageHeader,
  CompanyScreen,
  IconBox,
  companyStyles,
  companyUi,
} from '../../../src/components/company/CompanyUI';
import { TypeRatingRequirementsEditor, ExactHabilitationRow } from '../../../src/components/company/TypeRatingRequirementsEditor';
import { RequiredLicensesSection } from '../../../src/components/company/RequiredLicensesSection';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { useCompanySession } from '../../../src/state/SessionContext';
import { TECHNICIAN_TYPES } from '../../../src/constants/technicianTypes';
import { CONTRACT_TYPES } from '../../../src/constants/contractTypes';
import { OFFER_PRODUCT_TYPES } from '../../../src/constants/offerProductTypes';
import { isLicenseCompatibleWithProductType } from '../../../src/utils/licenseCategoryProductType';
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from '../../../src/types/catalog';
import { OfferProductType } from '../../../src/types/offer';
import { OfferStatus } from '../../../src/types/enums';
import { CountryCityPicker } from '../../../src/components/CountryCityPicker';
import { EMPTY_LOCATION, LocationValue } from '../../../src/types/location';
import { notify, confirmAction } from '../../../src/utils/platformAlert';

interface FormState {
  title: string;
  description: string;
  contractType: ContractTypeCode;
  productType: OfferProductType;
  // Fase 7 F2c: un solo campo con pais + ciudad, en vez de cuatro sueltos
  // que habia que mantener coherentes a mano.
  location: LocationValue;
  minYearsExperience: number;
  technicianType: TechnicianTypeCode;
  requiresCertification: boolean;
  licenseCode?: LicenseCode;
  requiresAllAircraft: boolean;
  requiredHabilitations: ExactHabilitationRow[];
}

function computeErrors(form: FormState) {
  return {
    title: !form.title.trim() ? 'Title is required.'
      : form.title.trim().length < 3 ? 'Title must be at least 3 characters.'
      : undefined,
    description: !form.description.trim() ? 'Description is required.' : undefined,
    // Solo el pais es obligatorio; la ciudad es opcional.
    location: !form.location.country ? 'Please select a country.' : undefined,
    // Fase 6 tanda D: exigir certificar sin decir QUÉ licencia es el estado
    // que el CHECK de la 053 rechaza. Se avisa aquí en vez de dejar que
    // Postgres devuelva un error de constraint.
    license: form.requiresCertification && !form.licenseCode ? 'Select the licence this role certifies under.' : undefined,
  };
}
type FormErrors = { title?: string; description?: string; location?: string; license?: string };

export default function NewOfferScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const companySession = useCompanySession();
  const companyId = companySession?.companyId;

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    contractType: 'permanent',
    // Arranca en aviones porque el selector siempre está visible y el campo es
    // NOT NULL: un "sin elegir" sería un tercer estado que la base no admite.
    productType: 'Aeroplane',
    location: EMPTY_LOCATION,
    minYearsExperience: 0,
    // Ambos campos son NOT NULL en la base, así que arrancan con un valor
    // real y no con un "sin elegir" que sería un tercer estado inexpresable.
    // `mechanic` es el primero del catálogo por sortOrder; `true` en el
    // interruptor conserva el comportamiento previo a que existiera.
    technicianType: 'mechanic',
    requiresCertification: true,
    // Sin licencia elegida al arrancar: el guardado la exige (CHECK de la
    // 053) y un valor por defecto haria pasar por elegida una que nadie
    // eligio. `requiresAllAircraft` arranca en false — "basta con una".
    licenseCode: undefined,
    requiresAllAircraft: false,
    requiredHabilitations: [],
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Fase 6 tanda C: el eje Part-66 lo abre o lo cierra el INTERRUPTOR que la
  // empresa marca, no el tipo de perfil buscado. offerRepository impone la
  // misma regla al escribir — esconder una sección no es una garantía.
  const requiresCertification = form.requiresCertification;

  // Creando una oferta, apagar la certificación repinta SOBRE LA MARCHA y sin
  // aviso, igual que el cambio de producto: nada de lo que se descarta está
  // guardado todavía. En la pantalla de edición sí se avisa.
  function onToggleCertification(next: boolean) {
    if (next === form.requiresCertification) return;
    setForm((prev) => ({
      ...prev,
      requiresCertification: next,
      // Fase 6 tanda E: apagar el interruptor se lleva la LICENCIA y nada
      // mas. Las aeronaves se quedan: "ayudante para el A320" sigue siendo
      // una oferta para el A320. Encenderla no devuelve la licencia.
      ...(next ? {} : { licenseCode: undefined }),
    }));
  }

  // Creando una oferta el cambio de producto repinta SOBRE LA MARCHA, sin
  // aviso: nada de lo que se descarta está guardado todavía, y un diálogo por
  // cada toque en un formulario a medio rellenar estorba más de lo que
  // protege. En la pantalla de edición sí se avisa — allí lo que se pierde ya
  // está en la base.
  function onSelectProductType(productType: OfferProductType) {
    if (productType === form.productType) return;
    setForm((prev) => ({
      ...prev,
      productType,
      // Los ratings son del producto anterior, sin excepción posible: las FK
      // compuestas de la 047 los rechazarían al guardar.
      requiredHabilitations: [],
      requiresAllAircraft: false,
      // La licencia solo se cae si deja de encajar: B2/B2L/C/L cubren ambos
      // productos y no hay motivo para quitarlas.
      licenseCode:
        prev.licenseCode && isLicenseCompatibleWithProductType(prev.licenseCode, productType)
          ? prev.licenseCode
          : undefined,
    }));
  }

  // Creando, cambiar la licencia con aeronaves ya metidas repinta SOBRE LA
  // MARCHA, sin aviso — mismo criterio que el producto y el interruptor. Las
  // aeronaves se van porque estaban puestas para OTRA licencia: conservarlas
  // las dejaría cruzadas contra una que la empresa acaba de descartar.
  function onSelectLicense(next: LicenseCode) {
    if (next === form.licenseCode) return;
    setForm((prev) => ({
      ...prev,
      licenseCode: next,
      requiredHabilitations: [],
      requiresAllAircraft: false,
    }));
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'title') setErrors((e) => ({ ...e, title: undefined }));
    if (key === 'description') setErrors((e) => ({ ...e, description: undefined }));
    if (key === 'location') {
      setErrors((e) => ({ ...e, location: undefined }));
    }
  }

  async function handleSave(status: OfferStatus) {
    const errs = computeErrors(form);
    if (Object.values(errs).some(Boolean)) { setErrors(errs); return; }
    if (!companyId) {
      notify('Not ready yet', 'Your session is still loading. Try again in a moment.');
      return;
    }

    setSaving(true);
    try {
      await offerRepository.create({
        companyId,
        title: form.title.trim(),
        description: form.description.trim(),
        contractType: form.contractType,
        productType: form.productType,
        location: form.location,
        minYearsExperience: form.minYearsExperience,
        status,
        technicianType: form.technicianType,
        requiresCertification: form.requiresCertification,
        licenseCode: form.licenseCode,
        requiresAllAircraft: form.requiresAllAircraft,
        requiredHabilitations: form.requiredHabilitations,
      });
      router.back();
    } catch (e: any) {
      notify('Error', e?.message ?? 'Could not save offer.');
    } finally {
      setSaving(false);
    }
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
          eyebrow="Offer builder"
          title="New Offer"
          subtitle="Create a role technicians can match against."
          onBack={() => router.back()}
        />

        {/* Orden acordado en la Fase 6 tanda C: 1) tipo de perfil,
            2) ¿certificar?, 3) avión o helicóptero, 4) licencia,
            5) aeronaves. El interruptor va ANTES del producto porque decide
            si los pasos 4 y 5 existen siquiera. */}
        <ChoiceSection
          title="Profile type"
          helper="One per offer. Two types in one advert are two jobs — publish them separately."
        >
          {TECHNICIAN_TYPES.filter((t) => t.isActive).map((t) => (
            <CompanyChip
              key={t.code}
              label={t.label}
              selected={form.technicianType === t.code}
              onPress={() => set('technicianType', t.code as TechnicianTypeCode)}
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
          <CompanyChip label="Yes, licence required" selected={requiresCertification} onPress={() => onToggleCertification(true)} />
          <CompanyChip label="No licence needed" selected={!requiresCertification} onPress={() => onToggleCertification(false)} />
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
                onPress={() => onSelectProductType(p.code)}
              />
            ))}
          </View>
        </FormSection>

        <FormSection title="Offer details" subtitle="Describe the work clearly enough for match scoring." icon={FileText}>
          <FormField label="Title" error={errors.title}>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              placeholder="e.g. B1.1 Line Maintenance Technician"
              placeholderTextColor={companyUi.textMuted}
              value={form.title}
              onChangeText={(v) => set('title', v)}
            />
          </FormField>

          <FormField label="Description" error={errors.description}>
            <TextInput
              style={[styles.input, styles.textarea, errors.description && styles.inputError]}
              placeholder="Describe the role, responsibilities and context..."
              placeholderTextColor={companyUi.textMuted}
              value={form.description}
              onChangeText={(v) => set('description', v)}
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
                  onPress={() => set('contractType', ct.code as ContractTypeCode)}
                />
              ))}
            </View>
          </FormField>

          <FormField label="Minimum years of experience">
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => set('minYearsExperience', Math.max(0, form.minYearsExperience - 1))}
                activeOpacity={0.75}
              >
                <Minus color={companyUi.textSoft} size={17} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.stepValue}>{form.minYearsExperience} yrs</Text>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => set('minYearsExperience', Math.min(30, form.minYearsExperience + 1))}
                activeOpacity={0.75}
              >
                <Plus color={companyUi.textSoft} size={17} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </FormField>
        </FormSection>

        {/* Fase 7 F2c. El aeropuerto base desaparece del formulario: la
            localización de una oferta es el país (lo único que puntúa) y,
            opcionalmente, la ciudad. El campo de aeropuerto era de sólo
            lectura y se rellenaba solo, así que no se pierde ninguna
            decisión del usuario. */}
        <FormSection title="Location" subtitle="The country is what candidates are matched on. The city only helps them place the role." icon={MapPin}>
          <CountryCityPicker value={form.location} onChange={(value) => set('location', value)} />
          {errors.location ? <Text style={styles.fieldError}>{errors.location}</Text> : null}
        </FormSection>

        {/* 4) licencia y 5) aeronaves. Solo existen si la oferta exige
            certificar: sin licencia de por medio no hay nada que pedir en
            este eje. */}
        {requiresCertification && (
          <RequiredLicensesSection
            licenseCode={form.licenseCode}
            onChangeLicense={onSelectLicense}
            productType={form.productType}
          />
        )}

        {/* Fase 6 tanda E: las AERONAVES se piden siempre, certifique o no —
            "ayudante para el A320" tiene que poder decir A320. Lo que
            desaparece sin certificacion es la LICENCIA, no el avion. */}
        {(
          <TypeRatingRequirementsEditor
            value={form.requiredHabilitations}
            onChange={(next) => set('requiredHabilitations', next)}
            productType={form.productType}
            licenseCode={form.licenseCode}
            requiresAll={form.requiresAllAircraft}
            onChangeRequiresAll={(next) => set('requiresAllAircraft', next)}
          />
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.secondaryButton, saving && styles.disabled]}
            onPress={() => handleSave('draft')}
            disabled={saving}
            activeOpacity={0.75}
          >
            {saving ? <ActivityIndicator color={companyUi.textSoft} size="small" /> : <FileText color={companyUi.textSoft} size={16} strokeWidth={2} />}
            <Text style={styles.secondaryButtonText}>Save draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.disabled]}
            onPress={() => handleSave('published')}
            disabled={saving}
            activeOpacity={0.75}
          >
            {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Send color={colors.white} size={16} strokeWidth={2} />}
            <Text style={styles.primaryButtonText}>Publish</Text>
          </TouchableOpacity>
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
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: companyUi.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
});
