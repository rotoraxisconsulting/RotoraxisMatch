import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { useAircraftTypeRatingsCatalog } from '../state/useAircraftTypeRatingsCatalog';
import { getFamilies, getByProductType, searchRatings, AircraftFamilyGroup } from '../constants/aircraftTypeRatingViews';

const MAX_RESULTS = 20;

interface Props {
  // Family keys ("<manufacturer>::<aircraftFamily>", see getAircraftFamilyKey)
  // from the 606-row aircraft_type_ratings catalog.
  selectedKeys: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

// Shared aircraft-FAMILY multi-select — the broad/approximate counterpart to
// AircraftTypeRatingPicker (which picks a single EXACT rating). Sources its
// options from getFamilies() over the shared aircraft_type_ratings catalog
// (useAircraftTypeRatingsCatalog, the same cache every rating-aware screen
// in this app reads from) — never a hardcoded aircraft list. The catalog
// groups into 500+ families, far too many for a flat chip grid, so this is
// search-and-add (tabs + search box + results list), same shape as
// AircraftTypeRatingPicker, with selected families shown as removable chips
// above. Used by ApproximateFilterSection (Fase 3b screen 1, offer form)
// and the technician search filter (Fase 3b screen 3) — same options, same
// labels, same behavior in both places by construction, not by convention.
export function AircraftFamilyPicker({ selectedKeys, onChange, placeholder }: Props) {
  const { ratings, state, error, retry } = useAircraftTypeRatingsCatalog();
  const [tab, setTab] = useState<'airplane' | 'helicopter'>('airplane');
  const [query, setQuery] = useState('');

  // Every family, regardless of tab/search — resolves labels for
  // already-selected keys (which may fall outside the current tab/query)
  // and drives otherTabCount.
  const allFamilies = useMemo(() => getFamilies(ratings), [ratings]);
  const familyByKey = useMemo(() => new Map(allFamilies.map((f) => [f.key, f])), [allFamilies]);

  const productType = tab === 'airplane' ? 'Aeroplane' : 'Helicopter';
  const tabResults = useMemo(() => {
    const pool = getByProductType(ratings, productType);
    return getFamilies(searchRatings(pool, query)).slice(0, MAX_RESULTS);
  }, [ratings, productType, query]);

  const selectedFamilies = useMemo(
    () => selectedKeys.map((key) => familyByKey.get(key)).filter((f): f is AircraftFamilyGroup => Boolean(f)),
    [selectedKeys, familyByKey],
  );
  const otherTabCount = useMemo(
    () => selectedFamilies.filter((f) => f.ratings[0]?.productType !== productType).length,
    [selectedFamilies, productType],
  );

  if (state === 'loading') {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.statusText}>Loading aircraft families…</Text>
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={styles.statusRow}>
        <Text style={styles.errorText}>{error?.message ?? 'Could not load the aircraft ratings catalog.'}</Text>
        <TouchableOpacity onPress={retry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {selectedFamilies.length > 0 ? (
        <View style={styles.chipRow}>
          {selectedFamilies.map((f) => (
            <TouchableOpacity key={f.key} onPress={() => onChange(toggle(selectedKeys, f.key))} activeOpacity={0.75}>
              <View style={[styles.chip, styles.chipSelected]}>
                <Text style={[styles.chipText, styles.chipTextSelected]}>{f.displayName}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab('airplane')} activeOpacity={0.75}>
          <View style={[styles.chip, tab === 'airplane' && styles.chipSelected]}>
            <Text style={[styles.chipText, tab === 'airplane' && styles.chipTextSelected]}>Airplanes</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('helicopter')} activeOpacity={0.75}>
          <View style={[styles.chip, tab === 'helicopter' && styles.chipSelected]}>
            <Text style={[styles.chipText, tab === 'helicopter' && styles.chipTextSelected]}>Helicopters</Text>
          </View>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder ?? 'Search: A320, 737, H145, Dash 8…'}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ScrollView style={styles.results} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {tabResults.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.resultRow, selectedKeys.includes(f.key) && styles.resultRowSelected]}
            onPress={() => onChange(toggle(selectedKeys, f.key))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tabRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.cyan, backgroundColor: colors.cyan + '14' },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.cyan },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusText: { fontSize: 12, lineHeight: 17, color: colors.textMuted },
  errorText: { fontSize: 12, lineHeight: 17, color: colors.error, flexShrink: 1 },
  retryText: { fontSize: 12, fontWeight: '700', color: colors.cyan },
  otherTabNote: { fontSize: 11, lineHeight: 15, fontWeight: '500', color: colors.textMuted, marginTop: 4 },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  results: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
  },
  resultRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  resultRowSelected: {
    backgroundColor: colors.cyan + '14',
  },
  resultTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptyText: {
    padding: spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
});
