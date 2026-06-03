import React, { ReactNode, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { TechnicianFilters as FiltersType } from '../types/filters';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { AIRCRAFT_TYPES } from '../constants/aircraftTypes';
import { SPECIALTIES } from '../constants/specialties';
import { colors, spacing } from '../theme';

interface Props {
  filters: FiltersType;
  onChange: <K extends keyof FiltersType>(key: K, value: FiltersType[K]) => void;
  onClear: () => void;
}

// ─── local helpers ────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {children}
      </ScrollView>
    </View>
  );
}

// ─── constants ────────────────────────────────────────────────────────────────

const VERIFICATION_OPTIONS = ['verified', 'pending', 'rejected'] as const;
const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'open_to_offers', label: 'Open to offers' },
  { value: 'unavailable', label: 'Unavailable' },
] as const;
const EXPERIENCE_OPTIONS = [3, 5, 8, 10, 15] as const;
const LICENSE_CODES = LICENSE_CATEGORIES.map((l) => l.code);

// ─── component ────────────────────────────────────────────────────────────────

export function TechnicianFilters({ filters, onChange, onClear }: Props) {
  const [expanded, setExpanded] = useState(true);

  const activeCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== '',
  ).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.85}
      >
        <Text style={styles.headerTitle}>
          Filters{activeCount > 0 ? ` · ${activeCount} active` : ''}
        </Text>
        <View style={styles.headerRight}>
          {activeCount > 0 && (
            <TouchableOpacity
              onPress={onClear}
              style={styles.clearBtn}
            >
              <Text style={styles.clearText}>Clear all</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* License */}
          <FilterRow label="License Category">
            {LICENSE_CODES.map((code) => (
              <Chip
                key={code}
                label={code}
                selected={filters.licenseCategory === code}
                onPress={() =>
                  onChange('licenseCategory', filters.licenseCategory === code ? undefined : code)
                }
              />
            ))}
          </FilterRow>

          {/* Aircraft type */}
          <FilterRow label="Aircraft Type">
            {AIRCRAFT_TYPES.map((a) => (
              <Chip
                key={a}
                label={a}
                selected={filters.aircraftType === a}
                onPress={() =>
                  onChange('aircraftType', filters.aircraftType === a ? undefined : a)
                }
              />
            ))}
          </FilterRow>

          {/* Specialty */}
          <FilterRow label="Specialty">
            {SPECIALTIES.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={filters.specialty === s}
                onPress={() =>
                  onChange('specialty', filters.specialty === s ? undefined : s)
                }
              />
            ))}
          </FilterRow>

          {/* Verification */}
          <FilterRow label="Verification Status">
            {VERIFICATION_OPTIONS.map((v) => (
              <Chip
                key={v}
                label={v.charAt(0).toUpperCase() + v.slice(1)}
                selected={filters.verificationStatus === v}
                onPress={() =>
                  onChange('verificationStatus', filters.verificationStatus === v ? undefined : v)
                }
              />
            ))}
          </FilterRow>

          {/* Availability */}
          <FilterRow label="Availability">
            {AVAILABILITY_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={filters.availabilityStatus === opt.value}
                onPress={() =>
                  onChange(
                    'availabilityStatus',
                    filters.availabilityStatus === opt.value ? undefined : opt.value,
                  )
                }
              />
            ))}
          </FilterRow>

          {/* Min experience */}
          <FilterRow label="Min. Years Experience">
            {EXPERIENCE_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={`${n}+`}
                selected={filters.minYearsExperience === n}
                onPress={() =>
                  onChange(
                    'minYearsExperience',
                    filters.minYearsExperience === n ? undefined : n,
                  )
                }
              />
            ))}
          </FilterRow>

          {/* Text inputs */}
          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.filterLabel}>Country</Text>
              <TextInput
                style={styles.textInput}
                value={filters.country ?? ''}
                onChangeText={(v) => onChange('country', v || undefined)}
                placeholder="e.g. USA"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.inputHalf, styles.inputHalfRight]}>
              <Text style={styles.filterLabel}>City</Text>
              <TextInput
                style={styles.textInput}
                value={filters.city ?? ''}
                onChangeText={(v) => onChange('city', v || undefined)}
                placeholder="e.g. Atlanta"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.filterLabel}>Base Airport (ICAO)</Text>
              <TextInput
                style={styles.textInput}
                value={filters.baseAirport ?? ''}
                onChangeText={(v) => onChange('baseAirport', v.toUpperCase() || undefined)}
                placeholder="e.g. KATL"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={4}
              />
            </View>
            <View style={[styles.inputHalf, styles.inputHalfRight]}>
              <Text style={styles.filterLabel}>Available From</Text>
              <TextInput
                style={styles.textInput}
                value={filters.availableFrom ?? ''}
                onChangeText={(v) => onChange('availableFrom', v || undefined)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.navy,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clearBtn: {
    backgroundColor: colors.white + '20',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  clearText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 10,
    color: colors.white,
    opacity: 0.7,
  },
  body: {
    padding: spacing.md,
  },
  filterSection: {
    marginBottom: spacing.md,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  chipScroll: {
    gap: 6,
    paddingRight: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  inputHalf: {
    flex: 1,
  },
  inputHalfRight: {
    marginLeft: spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.background,
  },
});
