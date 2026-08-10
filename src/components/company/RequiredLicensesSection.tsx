import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { CompanyCard, CompanyChip, companyUi } from './CompanyUI';
import { LicenseCode } from '../../types/catalog';
import { OfferProductType } from '../../types/offer';
import { LICENSE_CATEGORIES } from '../../constants/licenses';
import { isLicenseCompatibleWithProductType } from '../../utils/licenseCategoryProductType';

interface Props {
  requiredLicenses: LicenseCode[];
  onChangeLicenses: (next: LicenseCode[]) => void;
  // Migración 047 — el requisito amplio se acota por el mismo producto que el
  // exacto. Una oferta de helicópteros no puede ofrecer B1.1 por ninguna de
  // las dos vías: aquí no lo impide una FK (esta tabla no la tiene), pero
  // presentar la opción sería incoherente con el resto del formulario y
  // volvería a producir el mismo tipo de oferta imposible.
  productType: OfferProductType;
  // requiredLicenses is the broad/approximate scoring path —
  // offerMatchExplain.ts disables it entirely the moment requiredHabilitations
  // is non-empty ("el exacto ANULA al amplio"). Drives the default collapse.
  hasExactRequirements: boolean;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

// Fase 5 (2026-08-04) — this replaces ApproximateFilterSection, which paired
// "Required licenses" with a "Required aircraft types" family picker. The
// aircraft half was the approximate-by-family filter and is gone with
// offer_required_aircraft_types (see docs/MISSION_PART66.md Fase 5); the
// license half is a LIVE requirement, shown in the offer detail and still
// scored by offerMatchExplain.ts's license-category branch, so it keeps its
// editor here rather than disappearing with the section that hosted it.
//
// The collapse behaviour is retained and still accurate: an offer with exact
// type-rating requirements does not score licenses at all, so the block
// demotes itself to a one-line summary instead of competing for attention
// with the primary picker. Never hides the data or blocks editing: tap to
// expand.
export function RequiredLicensesSection({
  requiredLicenses,
  onChangeLicenses,
  hasExactRequirements,
  productType,
}: Props) {
  const categories = useMemo(
    () => LICENSE_CATEGORIES.filter((l) => isLicenseCompatibleWithProductType(l.code as LicenseCode, productType)),
    [productType],
  );
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  useEffect(() => {
    if (!hasExactRequirements) setManuallyExpanded(false);
  }, [hasExactRequirements]);
  const expanded = !hasExactRequirements || manuallyExpanded;

  return (
    <CompanyCard style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => hasExactRequirements && setManuallyExpanded((v) => !v)}
        activeOpacity={hasExactRequirements ? 0.7 : 1}
        accessibilityRole={hasExactRequirements ? 'button' : undefined}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>Required licenses</Text>
          <Text style={styles.subtitle}>
            {hasExactRequirements
              ? `${requiredLicenses.length} selected — not used for scoring while exact requirements are set`
              : 'Broad license-category matching. Add exact requirements above for precise scoring.'}
          </Text>
        </View>
        {hasExactRequirements ? <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text> : null}
      </TouchableOpacity>

      {expanded && (
        <>
          {hasExactRequirements ? (
            <Text style={styles.inlineHint}>Not used for scoring while exact requirements are set.</Text>
          ) : null}

          <View style={styles.chipRow}>
            {categories.map((l) => (
              <CompanyChip
                key={l.code}
                label={l.code}
                selected={requiredLicenses.includes(l.code as LicenseCode)}
                onPress={() => onChangeLicenses(toggle(requiredLicenses, l.code as LicenseCode))}
              />
            ))}
          </View>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
