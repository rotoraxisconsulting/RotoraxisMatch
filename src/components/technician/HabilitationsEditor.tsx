import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { TechnicianCard, TechnicianChip, TechnicianBadge, techUi } from './TechnicianUI';
import { AircraftTypeRatingPicker } from '../AircraftTypeRatingPicker';
import { DateField } from '../DateField';
import type { DateFieldPalette } from '../DateField.types';
import { AircraftRatingIndex, getAircraftTypeRatingLabel, getAircraftFamilyKey, resolveLegacyCodeToFamilyKeys } from '../../constants/aircraftTypeRatings';
import { getCompatibleProductType, isUnusualCombination } from '../../utils/licenseCategoryProductType';
import { AircraftTypeRatingCatalog, LicenseCode } from '../../types/catalog';

export interface HabilitationRow {
  id?: string;
  licenseCode: string;
  aircraftTypeRatingId: string;
  experienceYears?: number;
  // Optional vigencia (Fase 3). Absent issuedAt/expiresAt and isCurrent
  // undefined/true are all neutral for matching — only an explicit
  // isCurrent === false or a past expiresAt degrade a match, never exclude
  // it. See offerMatchExplain.ts.
  issuedAt?: string;
  expiresAt?: string;
  isCurrent?: boolean;
}

export interface LegacyHabilitationRow {
  id: string;
  licenseCode: string;
  aircraftTypeCode: string;
  // Set by scripts/backfillLegacyAircraftRatings.ts (migration 027) when
  // aircraftTypeCode resolved to zero or multiple catalog ratings and was
  // left unmigrated on purpose — never guessed to a single winner. A row
  // can also simply not have gone through that script yet, so `false` here
  // means "not flagged", not "confirmed fine".
  needsReview: boolean;
}

interface Props {
  value: HabilitationRow[];
  onChange: (next: HabilitationRow[]) => void;
  legacyValue: LegacyHabilitationRow[];
  // Only license categories currently held — gates "Add habilitation" the
  // same way it always has (a habilitation must be issued under a category
  // the technician actually holds).
  licenseCategories: string[];
  // Resolves labels for every rating referenced by `value`/`legacyValue`,
  // including inactive ones — owned by the parent (profile.tsx also needs
  // it at save time for validation messages and the completeness score),
  // passed down read-only.
  ratingsById: AircraftRatingIndex;
  // Called the moment the picker resolves a NEW rating (before "Add" is
  // even pressed) so the parent's own index stays in sync — mirrors the
  // inline behavior this replaces.
  onRatingResolved: (rating: AircraftTypeRatingCatalog) => void;
  onRequestCatalog: () => void;
  dateFieldPalette: DateFieldPalette;
}

// Fase 5.3 — replaces the deleted constants/aircraftTypes.ts's lookup
// (33-code legacy catalog) now that it's gone. Resolves the raw legacy
// code against the REAL 606-endorsement catalog via
// resolveLegacyCodeToFamilyKeys() (same inclusive, never-guess-a-winner
// rule the broad/approximate filter and T3 matching already use) — shows
// every family it could mean, joined, rather than picking one. Falls back
// to the raw code verbatim when nothing resolves (no catalog rating lists
// it as an alias), same as the old function's `?? code` fallback.
function legacyAircraftTypeLabel(code: string, ratingIndex: AircraftRatingIndex): string {
  const familyKeys = resolveLegacyCodeToFamilyKeys(code, ratingIndex);
  if (familyKeys.size === 0) return code;

  const familyByKey = new Map<string, string>();
  for (const rating of ratingIndex.values()) {
    familyByKey.set(getAircraftFamilyKey(rating), rating.aircraftFamily);
  }
  return [...familyKeys]
    .map((key) => (familyByKey.has(key) ? `${familyByKey.get(key)} family` : key))
    .join(' / ');
}

// Fase 3b screen 2 — the technician-side counterpart to
// TypeRatingRequirementsEditor/ApproximateFilterSection (Fase 3b screen 1):
// same pattern — search-and-add via AircraftTypeRatingPicker, chips only
// for the closed set of license categories, catalog displayName for every
// label, categoryHint pre-filter with a "Show all" escape hatch (never a
// hard block — see AircraftTypeRatingPicker/getCompatibleProductType).
//
// Two distinct, deliberately different behaviors for the same
// license<->productType mismatch (confirmed with the user 2026-07-22):
//   - NEW row: the picker's categoryHint hides incompatible ratings by
//     default, so creating the mismatch takes an explicit "Show all" —
//     prevents the casual/accidental case without ever hard-blocking a
//     real one (e.g. a dual-rated technician).
//   - EXISTING row: never hidden, edited, or auto-removed — just an
//     "Unusual combination for <license>" badge alongside "Declared" /
//     "Inactive catalog entry", using the SAME getCompatibleProductType()
//     mapping (isUnusualCombination(), licenseCategoryProductType.ts) so
//     there is exactly one definition of "compatible", never two that
//     could drift apart.
//
// Vigencia fields (Fase 3: issued/expires DateFields + Current/Not current
// toggle) are unchanged from before this redesign — same fields, same
// onChange shape, just relocated here. The row shape this emits via
// onChange (HabilitationRow) is byte-for-byte what profile.tsx already fed
// into technicianRepositoryV2.replaceHabilitations(), so the save path
// needed no changes.
export function HabilitationsEditor({
  value,
  onChange,
  legacyValue,
  licenseCategories,
  ratingsById,
  onRatingResolved,
  onRequestCatalog,
  dateFieldPalette,
}: Props) {
  const [newHabLicense, setNewHabLicense] = useState<LicenseCode | null>(null);
  const [newHabRating, setNewHabRating] = useState<string | null>(null);
  const [newHabExperienceYears, setNewHabExperienceYears] = useState('');

  const categoryHint = useMemo(() => {
    if (!newHabLicense) return undefined;
    const productType = getCompatibleProductType(newHabLicense);
    return productType ? { productType, licenseCode: newHabLicense } : undefined;
  }, [newHabLicense]);

  function selectCategory(code: LicenseCode) {
    setNewHabLicense(code);
    setNewHabRating(null); // a rating picked for a different category may no longer make sense, especially once the pre-filter kicks in
  }

  function addHabilitation() {
    if (!newHabLicense || !newHabRating) return;
    if (value.some((h) => h.licenseCode === newHabLicense && h.aircraftTypeRatingId === newHabRating)) return;
    const trimmedYears = newHabExperienceYears.trim();
    const experienceYears = trimmedYears ? Number(trimmedYears) : undefined;
    onChange([...value, { licenseCode: newHabLicense, aircraftTypeRatingId: newHabRating, experienceYears }]);
    setNewHabLicense(null);
    setNewHabRating(null);
    setNewHabExperienceYears('');
  }

  function removeHabilitation(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function updateHabilitationField(index: number, patch: Partial<Pick<HabilitationRow, 'issuedAt' | 'expiresAt' | 'isCurrent'>>) {
    onChange(value.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  return (
    <TechnicianCard style={styles.card}>
      <Text style={styles.title}>Habilitations</Text>
      <Text style={styles.subtitle}>Each rating is linked to the Part-66 category it was issued under — never guessed.</Text>

      {value.length === 0 && legacyValue.length === 0 ? <Text style={styles.emptyValue}>Not specified</Text> : null}

      {value.map((h, index) => {
        const rating = ratingsById.get(h.aircraftTypeRatingId);
        const unusual = isUnusualCombination(h.licenseCode as LicenseCode, rating?.productType);
        return (
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
                  {rating?.isActive === false ? <TechnicianBadge label="Inactive catalog entry" tone="warning" small /> : null}
                  {unusual ? <TechnicianBadge label={`Unusual combination for ${h.licenseCode}`} tone="warning" small /> : null}
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
                  palette={dateFieldPalette}
                />
              </View>
              <View style={styles.habVigenciaField}>
                <Text style={styles.fieldLabelXs}>Expires</Text>
                <DateField
                  value={h.expiresAt}
                  onChange={(v) => updateHabilitationField(index, { expiresAt: v })}
                  placeholder="Not set"
                  palette={dateFieldPalette}
                />
              </View>
            </View>
            <View style={styles.chipRow}>
              <TechnicianChip label="Current" selected={h.isCurrent !== false} onPress={() => updateHabilitationField(index, { isCurrent: true })} />
              <TechnicianChip label="Not current" selected={h.isCurrent === false} onPress={() => updateHabilitationField(index, { isCurrent: false })} />
            </View>
          </View>
        );
      })}

      {legacyValue.map((h) => (
        <View key={h.id} style={styles.habRow}>
          <View style={styles.habInfo}>
            <Text style={styles.habLicense}>{h.licenseCode}</Text>
            <Text style={styles.habRating}>{legacyAircraftTypeLabel(h.aircraftTypeCode, ratingsById)} — general, engine not specified</Text>
            <View style={styles.chipRow}>
              <TechnicianBadge label="Legacy" tone="muted" small />
              {h.needsReview ? <TechnicianBadge label="Needs review — code not resolved to a catalog rating" tone="warning" small /> : null}
            </View>
          </View>
        </View>
      ))}

      <View style={styles.fieldGap} />
      <Text style={styles.fieldLabel}>Add habilitation — category</Text>
      {licenseCategories.length === 0 ? (
        <Text style={styles.emptyValue}>Add a license above first.</Text>
      ) : (
        <View style={styles.chipRow}>
          {licenseCategories.map((code) => (
            <TechnicianChip key={code} label={code} selected={newHabLicense === code} onPress={() => selectCategory(code as LicenseCode)} />
          ))}
        </View>
      )}

      <View style={styles.fieldGap} />
      <Text style={styles.fieldLabel}>Add habilitation — aircraft + engine rating</Text>
      <AircraftTypeRatingPicker
        value={newHabRating}
        onSelect={(r) => {
          setNewHabRating(r.id);
          onRatingResolved(r);
        }}
        categoryHint={categoryHint}
      />

      <View style={styles.fieldGap} />
      <Text style={styles.fieldLabel}>Years of experience on this rating (optional)</Text>
      <TextInput
        style={styles.input}
        value={newHabExperienceYears}
        onChangeText={setNewHabExperienceYears}
        placeholder="e.g. 4"
        placeholderTextColor={techUi.textMuted}
        keyboardType="numeric"
      />

      <View style={styles.fieldGap} />
      <TouchableOpacity
        style={[styles.addButton, (!newHabLicense || !newHabRating) && styles.addButtonDisabled]}
        onPress={addHabilitation}
        disabled={!newHabLicense || !newHabRating}
        activeOpacity={0.75}
      >
        <Text style={styles.addButtonText}>Add habilitation</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onRequestCatalog} style={styles.linkRow}>
        <Text style={styles.linkText}>Can&apos;t find your habilitation? Request it.</Text>
      </TouchableOpacity>
    </TechnicianCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginBottom: spacing.md },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: techUi.text },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: techUi.textSoft },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: techUi.textSoft, marginTop: spacing.xs },
  fieldLabelXs: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: techUi.textMuted, marginBottom: 3 },
  fieldGap: { height: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  emptyValue: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: techUi.textMuted },
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
  habTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  habVigenciaRow: { flexDirection: 'row', gap: spacing.sm },
  habVigenciaField: { flex: 1, minWidth: 0 },
  habInfo: { flex: 1, minWidth: 0, gap: 4 },
  habLicense: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: techUi.text },
  habRating: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: techUi.textSoft },
  habRemove: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: techUi.red },
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
  addButton: {
    marginTop: spacing.xs,
    borderRadius: 14,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: techUi.accentSoft,
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { fontSize: 13, fontWeight: '700', color: techUi.accent },
  linkRow: { marginTop: spacing.sm },
  linkText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: techUi.accent },
});
