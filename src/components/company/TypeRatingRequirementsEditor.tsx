import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { CompanyCard, CompanyChip, companyUi } from './CompanyUI';
import { AircraftTypeRatingPicker } from '../AircraftTypeRatingPicker';
import { useAircraftTypeRatingsCatalog } from '../../state/useAircraftTypeRatingsCatalog';
import { catalogRepository } from '../../repositories/v2/catalogRepository';
import { AircraftRatingIndex, buildAircraftRatingIndex, getAircraftTypeRatingLabel } from '../../constants/aircraftTypeRatings';
import { isLicenseCompatibleWithProductType } from '../../utils/licenseCategoryProductType';
import { LICENSE_CATEGORIES } from '../../constants/licenses';
import { getOfferProductTypeLabel } from '../../constants/offerProductTypes';
import { LicenseCode, RequirementLevel } from '../../types/catalog';
import { OfferProductType } from '../../types/offer';

export interface ExactHabilitationRow {
  licenseCode: LicenseCode;
  aircraftTypeRatingId: string;
  requirementLevel: RequirementLevel;
  notes?: string;
}

interface Props {
  value: ExactHabilitationRow[];
  onChange: (next: ExactHabilitationRow[]) => void;
  // El producto declarado por la OFERTA. Acota a la vez las categorías
  // ofrecidas y el catálogo de ratings — ver el comentario del componente.
  productType: OfferProductType;
}

// Fase 3b screen 1 — the PRIMARY requirements block on the offer form
// (shared by new.tsx and edit.tsx so the two screens can no longer drift,
// which they had — see commit message). Search-and-add via
// AircraftTypeRatingPicker (product-type pre-filtered once a category is
// picked) + rows with a per-row Mandatory/Preferred badge, editable in
// place — no separate "Level" step and no remove+re-add just to change a
// level, unlike the previous design.
//
// Resolves rating labels for every referenced id itself (including
// inactive ones an existing offer might reference) — new.tsx/edit.tsx no
// longer need to manage a ratingIndex/ratingsById for this purpose at all.
//
// Migración 047 — el filtro se toma del producto de la OFERTA, no de la
// licencia de cada fila como hasta ahora. La versión anterior derivaba el
// facet de `getCompatibleProductType(newLicense)`, y B2/B2L/C/L cubren ambos
// productos: con B2 seleccionada no se filtraba NADA. Por ese agujero
// entraron ofertas tituladas "Helicópteros" con requisitos B1.1/B1.2. Ahora
// el producto lo declara la empresa una sola vez y acota las dos listas.
export function TypeRatingRequirementsEditor({ value, onChange, productType }: Props) {
  const { ratingIndex: activeRatingIndex } = useAircraftTypeRatingsCatalog();
  const [resolvedIndex, setResolvedIndex] = useState<AircraftRatingIndex>(new Map());

  useEffect(() => {
    const ids = value.map((h) => h.aircraftTypeRatingId);
    if (ids.length === 0) {
      setResolvedIndex(new Map());
      return;
    }
    let cancelled = false;
    catalogRepository.getAircraftTypeRatingsByIds(ids).then((ratings) => {
      if (!cancelled) setResolvedIndex(buildAircraftRatingIndex(ratings));
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const labelIndex = useMemo(() => new Map([...activeRatingIndex, ...resolvedIndex]), [activeRatingIndex, resolvedIndex]);

  const [newLicense, setNewLicense] = useState<LicenseCode | null>(null);
  const [newRatingId, setNewRatingId] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState('');

  const categories = useMemo(
    () => LICENSE_CATEGORIES.filter((l) => isLicenseCompatibleWithProductType(l.code as LicenseCode, productType)),
    [productType],
  );

  // Cambiar el producto deja en la fila en construcción una categoría o un
  // rating del producto anterior, que ya no aparecen en ninguna de las dos
  // listas: seleccionados pero invisibles, y rechazados por Postgres al
  // guardar. Se limpian. `value` lo limpia el formulario, que es quien pide
  // confirmación cuando hay algo que perder.
  useEffect(() => {
    setNewLicense(null);
    setNewRatingId(null);
  }, [productType]);

  function selectCategory(code: LicenseCode) {
    setNewLicense(code);
    setNewRatingId(null); // a rating picked for a different category may no longer make sense, especially once the pre-filter kicks in
  }

  function addRow() {
    if (!newLicense || !newRatingId) return;
    if (value.some((h) => h.licenseCode === newLicense && h.aircraftTypeRatingId === newRatingId)) return;
    onChange([
      ...value,
      { licenseCode: newLicense, aircraftTypeRatingId: newRatingId, requirementLevel: 'preferred', notes: newNotes.trim() || undefined },
    ]);
    setNewLicense(null);
    setNewRatingId(null);
    setNewNotes('');
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function setRowLevel(index: number, level: RequirementLevel) {
    onChange(value.map((h, i) => (i === index ? { ...h, requirementLevel: level } : h)));
  }

  return (
    <CompanyCard style={styles.card}>
      <Text style={styles.title}>Type rating requirements</Text>
      <Text style={styles.subtitle}>
        Search and add the exact ratings this role requires. Each one is marked Mandatory or Preferred — tap a
        badge to change it. Limited to {getOfferProductTypeLabel(productType).toLowerCase()}, as set above.
      </Text>

      {value.map((h, index) => (
        <View key={`${h.licenseCode}-${h.aircraftTypeRatingId}`} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowText}>{h.licenseCode} + {getAircraftTypeRatingLabel(h.aircraftTypeRatingId, labelIndex)}</Text>
            {h.notes ? <Text style={styles.rowNotes}>{h.notes}</Text> : null}
          </View>
          <View style={styles.levelToggle}>
            <TouchableOpacity
              onPress={() => setRowLevel(index, 'mandatory')}
              style={[styles.levelPill, h.requirementLevel === 'mandatory' ? styles.levelPillMandatoryOn : styles.levelPillOff]}
              accessibilityRole="button"
            >
              <Text style={[styles.levelPillText, h.requirementLevel === 'mandatory' ? styles.levelPillTextMandatoryOn : styles.levelPillTextOff]}>
                Mandatory
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRowLevel(index, 'preferred')}
              style={[styles.levelPill, h.requirementLevel === 'preferred' ? styles.levelPillPreferredOn : styles.levelPillOff]}
              accessibilityRole="button"
            >
              <Text style={[styles.levelPillText, h.requirementLevel === 'preferred' ? styles.levelPillTextPreferredOn : styles.levelPillTextOff]}>
                Preferred
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => removeRow(index)} accessibilityRole="button">
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      {value.length === 0 ? <Text style={styles.emptyText}>No exact requirements yet.</Text> : null}

      <View style={styles.addBlock}>
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipRow}>
          {categories.map((l) => (
            <CompanyChip key={l.code} label={l.code} selected={newLicense === l.code} onPress={() => selectCategory(l.code as LicenseCode)} />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Aircraft + engine rating</Text>
        <AircraftTypeRatingPicker
          value={newRatingId}
          onSelect={(r) => setNewRatingId(r.id)}
          lockedProductType={{ productType, reason: 'this offer is for ' + getOfferProductTypeLabel(productType).toLowerCase() }}
        />

        <Text style={styles.fieldLabel}>Note (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Also considering V2500 or recent A320 experience"
          placeholderTextColor={companyUi.textMuted}
          value={newNotes}
          onChangeText={setNewNotes}
        />

        <TouchableOpacity
          style={[styles.addButton, (!newLicense || !newRatingId) && styles.addButtonDisabled]}
          onPress={addRow}
          disabled={!newLicense || !newRatingId}
          activeOpacity={0.75}
        >
          <Text style={styles.addButtonText}>Add requirement</Text>
        </TouchableOpacity>
      </View>
    </CompanyCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginBottom: spacing.md },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: companyUi.text },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: companyUi.textSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: companyUi.borderSoft,
  },
  rowInfo: { flex: 1, minWidth: 0, gap: 2 },
  rowText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: companyUi.text },
  rowNotes: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: companyUi.textSoft },
  levelToggle: { flexDirection: 'row', gap: 6 },
  levelPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  levelPillOff: { borderColor: companyUi.border, backgroundColor: companyUi.surfaceSoft },
  levelPillMandatoryOn: { borderColor: companyUi.red, backgroundColor: companyUi.redSoft },
  levelPillPreferredOn: { borderColor: companyUi.blue, backgroundColor: companyUi.blueSoft },
  levelPillText: { fontSize: 11, fontWeight: '700' },
  levelPillTextOff: { color: companyUi.textMuted },
  levelPillTextMandatoryOn: { color: companyUi.red },
  levelPillTextPreferredOn: { color: companyUi.blue },
  removeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: companyUi.red },
  emptyText: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: companyUi.textMuted },
  addBlock: { gap: spacing.xs, marginTop: spacing.xs },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: companyUi.textSoft, marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: companyUi.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: companyUi.text,
    backgroundColor: companyUi.surfaceSoft,
  },
  addButton: {
    marginTop: spacing.xs,
    borderRadius: 14,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: companyUi.accentSoft,
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { fontSize: 13, fontWeight: '700', color: companyUi.accent },
});
