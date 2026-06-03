import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { BadgeCheck, Building2, Check, Pencil, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import {
  CompanyBadge,
  CompanyCard,
  CompanyPageHeader,
  CompanyScreen,
  IconBox,
  InfoRow,
  InitialAvatar,
  companyStyles,
  companyUi,
} from '../../src/components/company/CompanyUI';
import { CompanyTeamManagement } from '../../src/components/company/CompanyTeamManagement';
import { useCompanyDashboard } from '../../src/state/useCompanyDashboard';
import { useCompanySession } from '../../src/state/SessionContext';
import { companyRepositoryV2 } from '../../src/repositories/v2/companyRepositoryV2';
import { canManageCompanySettings } from '../../src/utils/companyPermissionsV2';
import { COMPANY_TYPES } from '../../src/constants/companyTypes';
import { CountryPickerField, CityPickerField } from '../../src/components/LocationPicker';
import type { CompanyProfileView } from '../../src/types/company';
import type { CompanyTypeCode } from '../../src/types/catalog';
import { spacing } from '../../src/theme';

type CompanyForm = {
  name: string;
  companyType: CompanyTypeCode;
  locationCityId: string;
  country: string;
  city: string;
  email: string;
  phone: string;
};

function labelize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function verificationTone(status: string) {
  return status === 'verified' ? 'success' : 'warning';
}

function profileToForm(profile: CompanyProfileView): CompanyForm {
  return {
    name: profile.name,
    companyType: profile.companyType,
    locationCityId: profile.locationCityId,
    country: profile.country,
    city: profile.city,
    email: profile.email,
    phone: profile.phone ?? '',
  };
}

export default function CompanyProfileScreen() {
  const router = useRouter();
  const { companyId, companyMemberRole } = useCompanySession();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const { company, requests, loading, refresh } = useCompanyDashboard();
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileView | null>(null);
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const canEditCompany = canManageCompanySettings(companyMemberRole);

  useEffect(() => {
    let active = true;
    companyRepositoryV2.getById(companyId).then((profile) => {
      if (!active) return;
      setCompanyProfile(profile);
      if (profile) setForm(profileToForm(profile));
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  function updateForm(patch: Partial<CompanyForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function handleCancelEdit() {
    if (companyProfile) setForm(profileToForm(companyProfile));
    setEditing(false);
  }

  async function handleSaveCompany() {
    if (!form) return;

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!name || !form.locationCityId || !email) {
      Alert.alert('Missing information', 'Company name, country, city and email are required.');
      return;
    }

    setSaving(true);
    try {
      const updated = await companyRepositoryV2.update(companyId, {
        name,
        companyType: form.companyType,
        locationCityId: form.locationCityId,
        email,
        phone: phone || undefined,
      });
      if (updated) {
        setCompanyProfile(updated);
        setForm(profileToForm(updated));
      }
      await refresh();
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update company information.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !company) {
    return <LoadingScreen color={companyUi.accent} role="company" />;
  }

  const displayName = companyProfile?.name ?? company.companyName;
  const displayType = companyProfile?.companyType ?? company.companyType;
  const displayCountry = companyProfile?.country ?? company.country;
  const displayCity = companyProfile?.city ?? company.city;
  const displayEmail = companyProfile?.email ?? company.contactEmail;
  const displayPhone = companyProfile?.phone;
  const acceptedCount = requests.filter((r) => r.status === 'accepted').length;
  const sentCount = requests.filter((r) => r.status === 'sent').length;

  return (
    <CompanyScreen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[companyStyles.content, isWide && companyStyles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <CompanyPageHeader
          eyebrow="Profile"
          title="Company profile"
          subtitle="Operator identity, contact details and marketplace status."
          onBack={() => router.back()}
        />

        <View style={[styles.grid, isWide && styles.gridWide]}>
          <View style={styles.mainColumn}>
            <CompanyCard style={styles.heroCard}>
              <View style={styles.heroTop}>
                <InitialAvatar label={displayName} size={56} color={companyUi.navy} />
                <View style={styles.heroInfo}>
                  <Text style={styles.companyName}>{displayName}</Text>
                  <Text style={styles.companyLocation}>
                    {displayCity}, {displayCountry}
                  </Text>
                  <View style={styles.badgeRow}>
                    <CompanyBadge label={labelize(displayType)} tone="navy" />
                    <CompanyBadge
                      label={labelize(company.verificationStatus)}
                      tone={verificationTone(company.verificationStatus)}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.heroMetaGrid}>
                <MetaTile icon={Building2} label="Operator type" value={labelize(displayType)} />
                <MetaTile icon={BadgeCheck} label="Verification" value={labelize(company.verificationStatus)} />
              </View>
            </CompanyCard>

            <CompanyCard style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <IconBox icon={Building2} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Company details</Text>
                  <Text style={styles.sectionSub}>
                    {canEditCompany ? 'Admin-editable operator profile data.' : 'Public operator profile data.'}
                  </Text>
                </View>
                {canEditCompany ? (
                  editing ? (
                    <View style={styles.editActions}>
                      <TouchableOpacity
                        style={[styles.iconAction, styles.cancelAction]}
                        onPress={handleCancelEdit}
                        disabled={saving}
                        activeOpacity={0.75}
                      >
                        <X color={companyUi.textSoft} size={16} strokeWidth={2.2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconAction, styles.saveAction, saving && styles.disabled]}
                        onPress={handleSaveCompany}
                        disabled={saving}
                        activeOpacity={0.75}
                      >
                        {saving ? (
                          <ActivityIndicator size="small" color={companyUi.surface} />
                        ) : (
                          <Check color={companyUi.surface} size={16} strokeWidth={2.2} />
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => setEditing(true)}
                      activeOpacity={0.75}
                    >
                      <Pencil color={companyUi.accent} size={15} strokeWidth={2.2} />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
              {editing && form ? (
                <CompanyEditForm form={form} onChange={updateForm} />
              ) : (
                <View style={styles.infoStack}>
                  <InfoRow label="Company name" value={displayName} />
                  <InfoRow label="Type" value={labelize(displayType)} />
                  <InfoRow label="Country" value={displayCountry} />
                  <InfoRow label="City" value={displayCity} />
                  <InfoRow label="Contact email" value={displayEmail || 'Not provided'} />
                  <InfoRow label="Phone" value={displayPhone || 'Not provided'} />
                </View>
              )}
            </CompanyCard>

            <CompanyTeamManagement companyName={displayName} />
          </View>

          <View style={[styles.sideColumn, isWide && styles.sideColumnWide]}>
            <CompanyCard style={styles.activityCard}>
              <Text style={styles.sectionTitle}>Marketplace activity</Text>
              <View style={styles.metricStack}>
                <Metric value={requests.length} label="Requests sent" tone="info" />
                <Metric value={acceptedCount} label="Accepted" tone="success" />
                <Metric value={sentCount} label="Awaiting reply" tone="warning" />
              </View>
            </CompanyCard>

            <CompanyCard style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Demo profile</Text>
              <Text style={styles.noticeText}>
                Admin users can edit company profile data in demo mode. Changes are stored locally.
              </Text>
            </CompanyCard>
          </View>
        </View>
      </ScrollView>
    </CompanyScreen>
  );
}

function CompanyEditForm({
  form,
  onChange,
}: {
  form: CompanyForm;
  onChange: (patch: Partial<CompanyForm>) => void;
}) {
  return (
    <View style={styles.formStack}>
      <EditableField
        label="Company name"
        value={form.name}
        onChangeText={(name) => onChange({ name })}
      />
      <View style={styles.typeField}>
        <Text style={styles.inputLabel}>Company type</Text>
        <View style={styles.typeChips}>
          {COMPANY_TYPES.map((type) => (
            <TouchableOpacity
              key={type.code}
              style={[
                styles.typeChip,
                form.companyType === type.code && styles.typeChipActive,
              ]}
              onPress={() => onChange({ companyType: type.code })}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.typeChipText,
                  form.companyType === type.code && styles.typeChipTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.formRow}>
        <View style={styles.formHalf}>
          <CountryPickerField
            label="Country"
            value={form.country}
            onChange={(country) => onChange({
              country,
              city: '',
              locationCityId: '',
            })}
          />
        </View>
        <View style={styles.formHalf}>
          <CityPickerField
            label="City"
            country={form.country}
            value={form.city}
            onChange={(city, _icao, entry) => onChange({
              city,
              locationCityId: entry.id,
            })}
          />
        </View>
      </View>
      <EditableField
        label="Contact email"
        value={form.email}
        onChangeText={(email) => onChange({ email })}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <EditableField
        label="Phone"
        value={form.phone}
        onChangeText={(phone) => onChange({ phone })}
        keyboardType="phone-pad"
      />
    </View>
  );
}

function EditableField({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  style?: object;
}) {
  return (
    <View style={[styles.inputGroup, style]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={companyUi.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

function MetaTile({
  icon,
  label,
  value,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaTile}>
      <IconBox icon={icon} size={17} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone: 'info' | 'success' | 'warning' }) {
  const color = tone === 'success' ? companyUi.green : tone === 'warning' ? companyUi.amber : companyUi.blue;
  const backgroundColor = tone === 'success' ? companyUi.greenSoft : tone === 'warning' ? companyUi.amberSoft : companyUi.blueSoft;

  return (
    <View style={[styles.metric, { backgroundColor }]}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  grid: { gap: 14 },
  gridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mainColumn: { flex: 1, gap: 14 },
  sideColumn: { width: '100%', gap: 14 },
  sideColumnWide: { width: 300 },
  heroCard: { gap: 18 },
  heroTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  heroInfo: { flex: 1, minWidth: 0 },
  companyName: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: companyUi.text,
  },
  companyLocation: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  badgeRow: {
    marginTop: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  heroMetaGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metaTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 18,
    padding: 12,
    minWidth: 0,
  },
  metaLabel: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: companyUi.textMuted,
  },
  metaValue: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: companyUi.text,
  },
  sectionCard: { gap: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: companyUi.text,
  },
  sectionSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  infoStack: {
    borderTopWidth: 1,
    borderTopColor: companyUi.borderSoft,
    paddingTop: 8,
  },
  editButton: {
    minHeight: 36,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: companyUi.accentSoft,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  editButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.accent,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelAction: {
    backgroundColor: companyUi.surfaceSoft,
    borderColor: companyUi.border,
  },
  saveAction: {
    backgroundColor: companyUi.accent,
    borderColor: companyUi.accent,
  },
  disabled: {
    opacity: 0.55,
  },
  formStack: {
    borderTopWidth: 1,
    borderTopColor: companyUi.borderSoft,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  formHalf: {
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  input: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surfaceSoft,
    paddingHorizontal: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: companyUi.text,
  },
  typeField: {
    gap: spacing.sm,
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  typeChip: {
    minHeight: 34,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surfaceSoft,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipActive: {
    borderColor: companyUi.accent,
    backgroundColor: companyUi.accent,
  },
  typeChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  typeChipTextActive: {
    color: companyUi.surface,
  },
  activityCard: { gap: 13 },
  metricStack: { gap: 9 },
  metric: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
  },
  metricValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  noticeCard: {
    backgroundColor: companyUi.surfaceSoft,
  },
  noticeTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.text,
  },
  noticeText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
});
