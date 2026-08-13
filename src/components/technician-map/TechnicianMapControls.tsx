import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import { techUi } from '../technician/TechnicianUI';

export const TECHNICIAN_MAP_AVAILABILITY = [
  { value: 'open_to_offers' as const, label: 'Open to offers', color: colors.success },
  { value: 'unavailable' as const, label: 'Unavailable', color: colors.textMuted },
] as const;

export function TechnicianMapHeader({
  visibleCount,
  filterCount,
  loading,
  onBack,
  onOpenFilters,
}: {
  visibleCount: number;
  filterCount: number;
  loading: boolean;
  onBack?: () => void;
  onOpenFilters: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const subtitle = filterCount > 0
    ? `${visibleCount} matching technician${visibleCount === 1 ? '' : 's'} · ${filterCount} active filter${filterCount === 1 ? '' : 's'}`
    : `${visibleCount} technician${visibleCount === 1 ? '' : 's'} on the map`;

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
        <Text style={styles.headerEyebrow}>Talent directory</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>Technician Map</Text>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={techUi.accent} size="small" />
            <Text style={styles.headerSubtitle} numberOfLines={1}>Loading technicians...</Text>
          </View>
        ) : (
          <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        )}
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

export function TechnicianMapLegend() {
  return (
    <View style={styles.legend} pointerEvents="none">
      <Text style={styles.legendTitle}>Availability</Text>
      <View style={styles.legendGrid}>
        {TECHNICIAN_MAP_AVAILABILITY.map((item) => (
          <View key={item.value} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.legendDetails}>
        <View style={styles.detailRow}>
          <View style={styles.precisionDot} />
          <Text style={styles.detailText}>Dashed marker = country-level location</Text>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.groupDot}>
            <Text style={styles.groupDotText}>2</Text>
          </View>
          <Text style={styles.detailText}>Numbered marker = multiple technicians</Text>
        </View>
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
  loadingRow: { minHeight: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    width: 224,
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
  legendGrid: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: techUi.textSoft },
  legendDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: techUi.borderSoft,
    gap: 6,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  precisionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: techUi.textMuted,
  },
  groupDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: techUi.navy,
  },
  groupDotText: { color: colors.white, fontSize: 8, lineHeight: 10, fontWeight: '800' },
  detailText: { flex: 1, fontSize: 9, lineHeight: 12, fontWeight: '600', color: techUi.textMuted },
});
