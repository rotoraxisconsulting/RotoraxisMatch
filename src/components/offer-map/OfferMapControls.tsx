import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';
import { CONTRACT_TYPES } from '../../constants/contractTypes';
import { OFFER_PRODUCT_TYPES } from '../../constants/offerProductTypes';
import {
  activeOfferMapFilterCount,
  getOfferMapMatchBand,
  OfferMapFilters,
  OfferMapItem,
  OfferMapMatchBand,
} from '../../types/offerMap';
import { ContractTypeCode } from '../../types/catalog';
import { OfferProductType } from '../../types/offer';
import { techUi } from '../technician/TechnicianUI';

export const OFFER_MAP_MATCH_OPTIONS: readonly {
  value: OfferMapMatchBand;
  label: string;
  shortLabel: string;
  color: string;
}[] = [
  { value: 'excellent', label: 'Excellent · 80–100%', shortLabel: '80–100%', color: colors.success },
  { value: 'strong', label: 'Strong · 60–79%', shortLabel: '60–79%', color: colors.blue },
  { value: 'partial', label: 'Partial · 40–59%', shortLabel: '40–59%', color: colors.warning },
  { value: 'weak', label: 'Weak · under 40%', shortLabel: '< 40%', color: colors.textMuted },
];

export function offerMapMarkerColor(offer: Pick<OfferMapItem, 'score' | 'blockers'>): string {
  if (offer.blockers.length > 0) return techUi.red;
  const band = getOfferMapMatchBand(offer.score);
  return OFFER_MAP_MATCH_OPTIONS.find((option) => option.value === band)?.color ?? colors.textMuted;
}

export function offerMapLabelColor(offer: Pick<OfferMapItem, 'score' | 'blockers'>): string {
  if (offer.blockers.length > 0) return techUi.red;
  const band = getOfferMapMatchBand(offer.score);
  if (band === 'excellent') return techUi.green;
  if (band === 'strong') return techUi.blue;
  if (band === 'partial') return techUi.amber;
  return techUi.textSoft;
}

export function offerMapContractLabel(value: string): string {
  return CONTRACT_TYPES.find((option) => option.code === value)?.label ?? value;
}

export function offerMapProductLabel(value: OfferProductType): string {
  return OFFER_PRODUCT_TYPES.find((option) => option.code === value)?.label ?? value;
}

export function offerMapApplicationLabel(value?: string): string | null {
  if (value === 'pending') return 'Application pending';
  if (value === 'accepted') return 'Application accepted';
  if (value === 'rejected') return 'Not selected';
  if (value === 'withdrawn') return 'Application withdrawn';
  if (value === 'expired') return 'Application expired';
  return null;
}

export interface OfferMapMarkerGroup {
  key: string;
  latitude: number;
  longitude: number;
  locationPrecision: OfferMapItem['locationPrecision'];
  offers: OfferMapItem[];
}

export function groupOfferMapItems(offers: OfferMapItem[]): OfferMapMarkerGroup[] {
  const groups = new Map<string, OfferMapMarkerGroup>();

  offers.forEach((offer) => {
    const key = `${offer.latitude.toFixed(5)}:${offer.longitude.toFixed(5)}:${offer.locationPrecision}`;
    const existing = groups.get(key);
    if (existing) {
      existing.offers.push(offer);
      return;
    }
    groups.set(key, {
      key,
      latitude: offer.latitude,
      longitude: offer.longitude,
      locationPrecision: offer.locationPrecision,
      offers: [offer],
    });
  });

  return [...groups.values()].map((group) => ({
    ...group,
    offers: group.offers.sort((a, b) => {
      const eligibilityDifference = Number(a.blockers.length > 0) - Number(b.blockers.length > 0);
      return eligibilityDifference || b.score - a.score;
    }),
  }));
}

export function OfferMapHeader({
  visibleCount,
  totalCount,
  unmappedCount,
  filters,
  onBack,
  onOpenFilters,
}: {
  visibleCount: number;
  totalCount: number;
  unmappedCount: number;
  filters: OfferMapFilters;
  onBack?: () => void;
  onOpenFilters: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const filterCount = activeOfferMapFilterCount(filters);
  const subtitle = filterCount > 0
    ? `${visibleCount} of ${totalCount} published offers`
    : `${visibleCount} published offer${visibleCount === 1 ? '' : 's'}`;

  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          activeOpacity={0.75}
          onPress={onBack}
          style={styles.headerIconButton}
        >
          <ArrowLeft color={techUi.text} size={20} strokeWidth={2.4} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>Offer marketplace</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>Offer Map</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {subtitle}{unmappedCount > 0 ? ` · ${unmappedCount} without a map point` : ''}
        </Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'}
        activeOpacity={0.75}
        onPress={onOpenFilters}
        style={styles.filterButton}
      >
        <SlidersHorizontal color={techUi.accent} size={18} strokeWidth={2.2} />
        {!compact ? <Text style={styles.filterButtonText}>Filters</Text> : null}
        {filterCount > 0 ? (
          <View style={styles.filterCount}>
            <Text style={styles.filterCountText}>{filterCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export function OfferMapLegend() {
  return (
    <View style={styles.legend} pointerEvents="none">
      <Text style={styles.legendTitle}>Match score</Text>
      <View style={styles.legendGrid}>
        {OFFER_MAP_MATCH_OPTIONS.map((option) => (
          <View key={option.value} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: option.color }]} />
            <Text style={styles.legendText}>{option.shortLabel}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendBlocked]} />
          <Text style={styles.legendText}>Not eligible</Text>
        </View>
      </View>
      <View style={styles.precisionRow}>
        <View style={styles.precisionDot} />
        <Text style={styles.precisionText}>Dashed marker = country-level location</Text>
      </View>
    </View>
  );
}

type ArrayFilterKey = 'contractTypes' | 'productTypes' | 'matchBands';

export function OfferMapFilterSheet({
  visible,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: OfferMapFilters;
  onChange: (filters: OfferMapFilters) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const filterCount = activeOfferMapFilterCount(filters);

  function toggle<T extends string>(key: ArrayFilterKey, value: T) {
    const current = (filters[key] ?? []) as T[];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next.length > 0 ? next : undefined });
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <TouchableOpacity
        accessibilityLabel="Close filters"
        activeOpacity={1}
        onPress={onClose}
        style={styles.sheetOverlay}
      />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleBlock}>
            <Text style={styles.sheetTitle}>Filter offers</Text>
            <Text style={styles.sheetSubtitle}>Match any option within a section and every active section.</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            activeOpacity={0.75}
            onPress={onClose}
            style={styles.sheetClose}
          >
            <X color={techUi.text} size={20} strokeWidth={2.3} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <FilterSection title="Contract type">
            {CONTRACT_TYPES.map((option) => (
              <FilterOption
                key={option.code}
                label={option.label}
                selected={Boolean(filters.contractTypes?.includes(option.code))}
                onPress={() => toggle<ContractTypeCode>('contractTypes', option.code)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Aircraft">
            {OFFER_PRODUCT_TYPES.map((option) => (
              <FilterOption
                key={option.code}
                label={option.label}
                selected={Boolean(filters.productTypes?.includes(option.code))}
                onPress={() => toggle<OfferProductType>('productTypes', option.code)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Match score">
            {OFFER_MAP_MATCH_OPTIONS.map((option) => (
              <FilterOption
                key={option.value}
                label={option.label}
                selected={Boolean(filters.matchBands?.includes(option.value))}
                onPress={() => toggle<OfferMapMatchBand>('matchBands', option.value)}
                dotColor={option.color}
              />
            ))}
          </FilterSection>

          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(filters.eligibleOnly) }}
            activeOpacity={0.75}
            onPress={() => onChange({ ...filters, eligibleOnly: !filters.eligibleOnly || undefined })}
            style={[styles.eligibilityOption, filters.eligibleOnly && styles.filterOptionSelected]}
          >
            <View style={styles.eligibilityCopy}>
              <Text style={styles.filterOptionText}>Eligible offers only</Text>
              <Text style={styles.filterOptionHelper}>
                Hide roles blocked by the minimum experience requirement.
              </Text>
            </View>
            <SelectionBox selected={Boolean(filters.eligibleOnly)} />
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.75}
            disabled={filterCount === 0}
            onPress={() => onChange({})}
            style={[styles.resetButton, filterCount === 0 && styles.buttonDisabled]}
          >
            <RotateCcw color={techUi.textSoft} size={17} strokeWidth={2.2} />
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.75}
            onPress={onClose}
            style={styles.doneButton}
          >
            <Text style={styles.doneButtonText}>Show offers</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      <View style={styles.filterOptions}>{children}</View>
    </View>
  );
}

function FilterOption({
  label,
  selected,
  onPress,
  dotColor,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  dotColor?: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.filterOption, selected && styles.filterOptionSelected]}
    >
      <View style={styles.optionLabelRow}>
        {dotColor ? <View style={[styles.optionDot, { backgroundColor: dotColor }]} /> : null}
        <Text style={styles.filterOptionText}>{label}</Text>
      </View>
      <SelectionBox selected={selected} />
    </TouchableOpacity>
  );
}

function SelectionBox({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.selectionBox, selected && styles.selectionBoxSelected]}>
      {selected ? <Check color={colors.white} size={15} strokeWidth={3} /> : null}
    </View>
  );
}

export function OfferMapStatusOverlay({
  kind,
  title,
  message,
  actionLabel,
  onAction,
}: {
  kind: 'empty' | 'error';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const Icon = kind === 'error' ? AlertTriangle : MapPin;
  return (
    <View style={styles.statusOverlay}>
      <View style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <Icon color={kind === 'error' ? techUi.red : techUi.accent} size={23} strokeWidth={2.1} />
        </View>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusMessage}>{message}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.75}
            onPress={onAction}
            style={styles.statusButton}
          >
            <Text style={styles.statusButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 1002,
    minHeight: 76,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: techUi.borderSoft,
    backgroundColor: techUi.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: techUi.accent },
  headerTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: techUi.text },
  headerSubtitle: { marginTop: 2, fontSize: 11, lineHeight: 14, fontWeight: '600', color: techUi.textMuted },
  filterButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: techUi.accent,
    backgroundColor: techUi.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    flexShrink: 0,
  },
  filterButtonText: { fontSize: 12, fontWeight: '800', color: techUi.accent },
  filterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: techUi.accent,
  },
  filterCountText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  legend: {
    position: 'absolute',
    left: 12,
    bottom: 18,
    zIndex: 1001,
    width: 194,
    padding: 11,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
  },
  legendTitle: { marginBottom: 7, fontSize: 11, fontWeight: '800', color: techUi.text },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  legendItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendBlocked: { backgroundColor: techUi.red },
  legendText: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: techUi.textSoft },
  precisionRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: techUi.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  precisionDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: techUi.textMuted,
  },
  precisionText: { flex: 1, fontSize: 9, lineHeight: 12, fontWeight: '600', color: techUi.textMuted },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,21,32,0.46)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '86%',
    maxWidth: 620,
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: techUi.surface,
    paddingTop: 8,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: techUi.border,
    marginBottom: 6,
  },
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetTitleBlock: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: techUi.text },
  sheetSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '500', color: techUi.textMuted },
  sheetClose: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: techUi.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.lg },
  filterSection: { gap: spacing.sm },
  filterSectionTitle: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: techUi.textSoft },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterOption: {
    minHeight: 44,
    minWidth: 132,
    flexGrow: 1,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: techUi.borderSoft,
    backgroundColor: techUi.surfaceSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  filterOptionSelected: { borderColor: techUi.accent, backgroundColor: techUi.accentSoft },
  optionLabelRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  optionDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  filterOptionText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', color: techUi.text },
  selectionBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: techUi.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectionBoxSelected: { borderColor: techUi.accent, backgroundColor: techUi.accent },
  eligibilityOption: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: techUi.borderSoft,
    backgroundColor: techUi.surfaceSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  eligibilityCopy: { flex: 1, minWidth: 0 },
  filterOptionHelper: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '500', color: techUi.textMuted },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: techUi.borderSoft,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: techUi.surface,
  },
  resetButton: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: techUi.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  resetButtonText: { fontSize: 13, fontWeight: '800', color: techUi.textSoft },
  buttonDisabled: { opacity: 0.42 },
  doneButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: techUi.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    pointerEvents: 'box-none',
  },
  statusCard: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: techUi.surfaceSoft,
    marginBottom: spacing.sm,
  },
  statusTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: techUi.text, textAlign: 'center' },
  statusMessage: { marginTop: 5, fontSize: 12, lineHeight: 17, fontWeight: '500', color: techUi.textMuted, textAlign: 'center' },
  statusButton: {
    minHeight: 48,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 14,
    backgroundColor: techUi.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
});
