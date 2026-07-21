import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { CompanyCard, CompanyChip, companyUi } from './CompanyUI';
import { catalogRepository } from '../../repositories/v2/catalogRepository';
import { AircraftTypeCatalog, LicenseCode } from '../../types/catalog';
import { LICENSE_CATEGORIES } from '../../constants/licenses';

interface Props {
  requiredLicenses: LicenseCode[];
  onChangeLicenses: (next: LicenseCode[]) => void;
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

  const [aircraftTypes, setAircraftTypes] = useState<AircraftTypeCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'airplane' | 'helicopter'>('airplane');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    catalogRepository
      .getAircraftTypes()
      .then((types) => {
        if (cancelled) return;
        setAircraftTypes(types);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message ?? 'Could not load the aircraft types catalog.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabTypes = useMemo(() => aircraftTypes.filter((a) => a.aircraftCategory === tab), [aircraftTypes, tab]);
  const otherTabCount = useMemo(
    () => requiredAircraftTypes.filter((code) => aircraftTypes.find((a) => a.code === code)?.aircraftCategory !== tab).length,
    [requiredAircraftTypes, aircraftTypes, tab],
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
          {loading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={companyUi.textMuted} />
              <Text style={styles.statusText}>Loading aircraft types…</Text>
            </View>
          ) : loadError ? (
            <Text style={styles.errorText}>{loadError}</Text>
          ) : (
            <>
              <View style={styles.tabRow}>
                <CompanyChip label="Airplanes" selected={tab === 'airplane'} onPress={() => setTab('airplane')} />
                <CompanyChip label="Helicopters" selected={tab === 'helicopter'} onPress={() => setTab('helicopter')} />
              </View>
              <View style={styles.chipRow}>
                {tabTypes.map((a) => (
                  <CompanyChip
                    key={a.code}
                    label={a.code}
                    selected={requiredAircraftTypes.includes(a.code)}
                    onPress={() => onChangeAircraftTypes(toggle(requiredAircraftTypes, a.code))}
                  />
                ))}
              </View>
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
  errorText: { fontSize: 12, lineHeight: 17, color: companyUi.red },
  otherTabNote: { fontSize: 11, lineHeight: 15, fontWeight: '500', color: companyUi.textMuted, marginTop: 4 },
});
