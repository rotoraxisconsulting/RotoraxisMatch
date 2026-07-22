import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { CompanyCard, CompanyChip, companyUi } from './CompanyUI';
import { useAircraftTypeRatingsCatalog } from '../../state/useAircraftTypeRatingsCatalog';
import { getFamilies, getByProductType, searchRatings, AircraftFamilyGroup } from '../../constants/aircraftTypeRatingViews';
import { LicenseCode } from '../../types/catalog';
import { LICENSE_CATEGORIES } from '../../constants/licenses';

const MAX_RESULTS = 20;

interface Props {
  requiredLicenses: LicenseCode[];
  onChangeLicenses: (next: LicenseCode[]) => void;
  // Family keys ("<manufacturer>::<aircraftFamily>", see getAircraftFamilyKey)
  // from the 606-row aircraft_type_ratings catalog — never a legacy
  // aircraft_types(code) value (migration 022, 2026-07-22). The same shape
  // offerMatchExplain.ts's evaluateLegacyBroadMatch expects.
  requiredAircraftTypes: string[];
  onChangeAircraftTypes: (next: string[]) => void;
  // Both requiredLicenses and requiredAircraftTypes are the broad/legacy
  // scoring path — offerMatchExplain.ts fully disables both the moment
  // requiredHabilitations is non-empty (confirmed earlier this mission:
  // "el exacto ANULA al amplio"). Drives the default collapse.
  hasExactRequirements: boolean;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

// Fase 3b screen 1 — the SECONDARY, approximate filter block. Combines
// "Required licenses" and "Required aircraft types" — both broad, both
// non-scoring once exact type rating requirements exist, so they're
// grouped and demoted together rather than only relabeling the aircraft
// half (confirmed with the user; symmetric treatment).
//
// Collapses to a one-line summary whenever hasExactRequirements is true —
// consistent with the collapsed-secondary-filter pattern this same phase
// already establishes for the map/search screens, rather than a one-off
// persistent hint. Never hides the data or blocks editing: tap to expand.
// When there are no exact requirements, this IS the active scoring
// mechanism, so it always stays expanded.
//
// "Required aircraft types" sources its options from getFamilies() over
// the shared aircraft_type_ratings catalog (useAircraftTypeRatingsCatalog —
// the same cache TypeRatingRequirementsEditor/AircraftTypeRatingPicker
// use), never the legacy 33-row aircraft_types table or its TS mirror
// (both are on the Fase 5 deletion list — see docs/MISSION_PART66.md).
// The catalog groups into 500+ families, far too many for a flat chip
// grid (the old 33-code design), so this follows the same
// search-and-add pattern as the primary picker instead of a raw list —
// per the Fase 3b plan's own "never render the whole catalog as chips"
// rule.
export function ApproximateFilterSection({
  requiredLicenses,
  onChangeLicenses,
  requiredAircraftTypes,
  onChangeAircraftTypes,
  hasExactRequirements,
}: Props) {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  useEffect(() => {
    if (!hasExactRequirements) setManuallyExpanded(false);
  }, [hasExactRequirements]);
  const expanded = !hasExactRequirements || manuallyExpanded;

  const { ratings, state, error, retry } = useAircraftTypeRatingsCatalog();
  const [tab, setTab] = useState<'airplane' | 'helicopter'>('airplane');
  const [query, setQuery] = useState('');

  // Every family, regardless of tab/search — used to resolve labels for
  // already-selected keys (which may fall outside the current tab/query)
  // and to compute otherTabCount.
  const allFamilies = useMemo(() => getFamilies(ratings), [ratings]);
  const familyByKey = useMemo(() => new Map(allFamilies.map((f) => [f.key, f])), [allFamilies]);

  const productType = tab === 'airplane' ? 'Aeroplane' : 'Helicopter';
  const tabResults = useMemo(() => {
    const pool = getByProductType(ratings, productType);
    return getFamilies(searchRatings(pool, query)).slice(0, MAX_RESULTS);
  }, [ratings, productType, query]);

  const selectedFamilies = useMemo(
    () => requiredAircraftTypes.map((key) => familyByKey.get(key)).filter((f): f is AircraftFamilyGroup => Boolean(f)),
    [requiredAircraftTypes, familyByKey],
  );
  const otherTabCount = useMemo(
    () => selectedFamilies.filter((f) => f.ratings[0]?.productType !== productType).length,
    [selectedFamilies, productType],
  );

  const selectedCount = requiredLicenses.length + requiredAircraftTypes.length;

  return (
    <CompanyCard style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => hasExactRequirements && setManuallyExpanded((v) => !v)}
        activeOpacity={hasExactRequirements ? 0.7 : 1}
        accessibilityRole={hasExactRequirements ? 'button' : undefined}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>Approximate filter</Text>
          <Text style={styles.subtitle}>
            {hasExactRequirements
              ? `${selectedCount} selected — not used for scoring while exact requirements are set`
              : 'Broad license/aircraft matching. Add exact requirements above for precise scoring.'}
          </Text>
        </View>
        {hasExactRequirements ? <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text> : null}
      </TouchableOpacity>

      {expanded && (
        <>
          {hasExactRequirements ? (
            <Text style={styles.inlineHint}>Not used for scoring while exact requirements are set.</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Required licenses</Text>
          <View style={styles.chipRow}>
            {LICENSE_CATEGORIES.map((l) => (
              <CompanyChip
                key={l.code}
                label={l.code}
                selected={requiredLicenses.includes(l.code as LicenseCode)}
                onPress={() => onChangeLicenses(toggle(requiredLicenses, l.code as LicenseCode))}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Required aircraft types</Text>
          {state === 'loading' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={companyUi.textMuted} />
              <Text style={styles.statusText}>Loading aircraft families…</Text>
            </View>
          ) : state === 'error' ? (
            <View style={styles.statusRow}>
              <Text style={styles.errorText}>{error?.message ?? 'Could not load the aircraft ratings catalog.'}</Text>
              <TouchableOpacity onPress={retry} accessibilityRole="button">
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {selectedFamilies.length > 0 ? (
                <View style={styles.chipRow}>
                  {selectedFamilies.map((f) => (
                    <CompanyChip
                      key={f.key}
                      label={f.displayName}
                      selected
                      onPress={() => onChangeAircraftTypes(toggle(requiredAircraftTypes, f.key))}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.tabRow}>
                <CompanyChip label="Airplanes" selected={tab === 'airplane'} onPress={() => setTab('airplane')} />
                <CompanyChip label="Helicopters" selected={tab === 'helicopter'} onPress={() => setTab('helicopter')} />
              </View>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search: A320, 737, H145, Dash 8…"
                placeholderTextColor={companyUi.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ScrollView style={styles.results} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {tabResults.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.resultRow, requiredAircraftTypes.includes(f.key) && styles.resultRowSelected]}
                    onPress={() => onChangeAircraftTypes(toggle(requiredAircraftTypes, f.key))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resultTitle} numberOfLines={1}>{f.displayName}</Text>
                  </TouchableOpacity>
                ))}
                {tabResults.length === 0 ? (
                  <Text style={styles.emptyText}>No matches — try a different manufacturer or model.</Text>
                ) : null}
              </ScrollView>
              {otherTabCount > 0 ? <Text style={styles.otherTabNote}>+{otherTabCount} selected in other category</Text> : null}
            </>
          )}
        </>
      )}
    </CompanyCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: companyUi.text },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: companyUi.textSoft },
  chevron: { fontSize: 14, fontWeight: '700', color: companyUi.textMuted },
  inlineHint: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    fontStyle: 'italic',
    color: companyUi.amber,
  },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: companyUi.textSoft, marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tabRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: companyUi.borderSoft },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusText: { fontSize: 12, lineHeight: 17, color: companyUi.textMuted },
  errorText: { fontSize: 12, lineHeight: 17, color: companyUi.red, flexShrink: 1 },
  retryText: { fontSize: 12, fontWeight: '700', color: companyUi.accent },
  otherTabNote: { fontSize: 11, lineHeight: 15, fontWeight: '500', color: companyUi.textMuted, marginTop: 4 },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: companyUi.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    color: companyUi.text,
    backgroundColor: companyUi.surfaceSoft,
  },
  results: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    borderRadius: 12,
  },
  resultRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: companyUi.borderSoft,
  },
  resultRowSelected: {
    backgroundColor: companyUi.accentSoft,
  },
  resultTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: companyUi.text,
  },
  emptyText: {
    padding: spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    color: companyUi.textMuted,
  },
});
