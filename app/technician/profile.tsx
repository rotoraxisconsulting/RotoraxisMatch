import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { Technician, AvailabilityStatus, ContractType } from '../../src/types';
import { CONTRACT_TYPES } from '../../src/constants/contractTypes';
import { colors, spacing, typography } from '../../src/theme';

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'open_to_offers', label: 'Open to offers' },
  { value: 'unavailable', label: 'Unavailable' },
];

// ─── local chip ──────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected && { backgroundColor: accent ?? colors.technician, borderColor: accent ?? colors.technician },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── section helpers ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TechnicianProfileScreen() {
  const { technician, loading, updateProfile, refresh } = useTechnicianDashboard();
  const [form, setForm] = useState<Technician | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Refresh data when screen is focused
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Sync form when technician loads/reloads (e.g. after save)
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

  function updateAvailability(patch: Partial<Technician['availability']>) {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, availability: { ...prev.availability, ...patch } };
    });
    setIsDirty(true);
  }

  function toggleContractType(type: ContractType) {
    if (!form) return;
    const current = form.availability.contractTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    updateAvailability({ contractTypes: next });
  }

  async function handleSave() {
    if (!form || !isDirty) return;
    setSaving(true);
    await updateProfile(form);
    setSaving(false);
  }

  if (loading || !form) {
    return (
      <>
        <Stack.Screen options={{ title: 'My Profile' }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  const completeness = form.profileCompleteness ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'My Profile' }} />
      <DemoModeBanner role="technician" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header: anonymous code + completeness */}
          <Card style={styles.headerCard} elevated>
            <View style={styles.headerRow}>
              <View style={styles.headerInfo}>
                <Text style={styles.anonymousCode}>{form.anonymousCode}</Text>
                <Text style={styles.headerSub}>Your anonymous identifier</Text>
              </View>
              <Badge
                label={form.verificationStatus}
                variant={form.verificationStatus === 'verified' ? 'success' : 'warning'}
              />
            </View>
            <Text style={styles.completenessLabel}>
              Profile completeness · {completeness}%
            </Text>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${completeness}%` as any },
                ]}
              />
            </View>
          </Card>

          {/* Unsaved changes notice */}
          {isDirty && (
            <View style={styles.dirtyBanner}>
              <Text style={styles.dirtyText}>You have unsaved changes</Text>
            </View>
          )}

          {/* ── IDENTITY (read-only) ── */}
          <SectionLabel>Identity</SectionLabel>
          <Card style={styles.sectionCard}>
            <ReadOnlyRow label="Full name" value={form.fullName} />
            <Divider />
            <ReadOnlyRow label="Email" value={form.email} />
            <Divider />
            <ReadOnlyRow label="Phone" value={form.phone} />
          </Card>
          <Text style={styles.privacyNote}>
            Your identity is private by default. It is only shared with a company when you accept their contact request.
          </Text>

          {/* ── LOCATION (editable) ── */}
          <SectionLabel>Location</SectionLabel>
          <Card style={styles.sectionCard}>
            <FieldLabel>Country</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.country}
              onChangeText={(v) => updateField('country', v)}
              placeholder="Country"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>City</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.city}
              onChangeText={(v) => updateField('city', v)}
              placeholder="City"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Base Airport (ICAO)</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.baseAirport}
              onChangeText={(v) => updateField('baseAirport', v.toUpperCase())}
              placeholder="e.g. KATL"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              maxLength={4}
            />
          </Card>

          {/* ── EXPERIENCE (editable) ── */}
          <SectionLabel>Experience</SectionLabel>
          <Card style={styles.sectionCard}>
            <FieldLabel>Years of Experience</FieldLabel>
            <TextInput
              style={styles.input}
              value={String(form.yearsExperience)}
              onChangeText={(v) => {
                const n = parseInt(v, 10);
                if (!isNaN(n) && n >= 0) updateField('yearsExperience', n);
                else if (v === '') updateField('yearsExperience', 0);
              }}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
            />
          </Card>

          {/* ── AVAILABILITY (editable) ── */}
          <SectionLabel>Availability</SectionLabel>
          <Card style={styles.sectionCard}>
            <FieldLabel>Status</FieldLabel>
            <View style={styles.chipRow}>
              {AVAILABILITY_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={form.availability.status === opt.value}
                  onPress={() => updateAvailability({ status: opt.value })}
                />
              ))}
            </View>

            <View style={styles.fieldGap} />
            <FieldLabel>Contract Types (select all that apply)</FieldLabel>
            <View style={styles.chipRow}>
              {CONTRACT_TYPES.map((ct) => (
                <Chip
                  key={ct.code}
                  label={ct.label}
                  selected={form.availability.contractTypes.includes(ct.code as ContractType)}
                  onPress={() => toggleContractType(ct.code as ContractType)}
                />
              ))}
            </View>

            <View style={styles.fieldGap} />
            <FieldLabel>Available From (YYYY-MM-DD)</FieldLabel>
            <TextInput
              style={styles.input}
              value={form.availability.availableFrom ?? ''}
              onChangeText={(v) => updateAvailability({ availableFrom: v || undefined })}
              placeholder="e.g. 2026-07-01"
              placeholderTextColor={colors.textMuted}
            />
          </Card>

          {/* ── LICENSES / AIRCRAFT / SPECIALTIES (read-only) ── */}
          <SectionLabel>Licenses</SectionLabel>
          <Card style={styles.sectionCard}>
            <View style={styles.tagRow}>
              {form.licenseCategories.map((l) => (
                <Badge key={l} label={l} variant="navy" />
              ))}
            </View>
          </Card>

          <SectionLabel>Aircraft Types</SectionLabel>
          <Card style={styles.sectionCard}>
            <View style={styles.tagRow}>
              {form.aircraftTypes.map((a) => (
                <Badge key={a} label={a} variant="info" />
              ))}
            </View>
          </Card>

          <SectionLabel>Specialties</SectionLabel>
          <Card style={styles.sectionCard}>
            <View style={styles.tagRow}>
              {form.specialties.map((s) => (
                <Badge key={s} label={s} variant="cyan" />
              ))}
            </View>
          </Card>
          <Text style={styles.privacyNote}>
            Licenses, aircraft types, and specialties are managed through the verification process and cannot be edited here.
          </Text>

          {/* Save button */}
          <Button
            label={saving ? 'Saving…' : 'Save Changes'}
            variant="primary"
            onPress={handleSave}
            loading={saving}
            disabled={!isDirty}
            fullWidth
            style={styles.saveBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Header card
  headerCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerInfo: { flex: 1, marginRight: spacing.sm },
  anonymousCode: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  completenessLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  progressBg: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.technician,
    borderRadius: 3,
  },

  // Dirty banner
  dirtyBanner: {
    backgroundColor: colors.warning + '20',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  dirtyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },

  // Section cards
  sectionCard: {
    marginBottom: spacing.xs,
    padding: spacing.md,
  },

  // Read-only rows
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  readOnlyLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  readOnlyValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: -spacing.md,
  },

  // Privacy note
  privacyNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },

  // Field label
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  fieldGap: { height: spacing.md },

  // Text input
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },

  // Tag row (read-only badges)
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  // Save button
  saveBtn: {
    marginTop: spacing.lg,
  },
});
