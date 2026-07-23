import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { AircraftFamilyPicker } from './AircraftFamilyPicker';

interface Props {
  selectedKeys: string[];
  onChange: (next: string[]) => void;
  label?: string;
}

// Fase 3b screens 3-4 (search, map) — collapsed by default, showing only a
// one-line summary of the active selection (the pattern the mission plan
// sets for map/search filters); tap to expand into the shared
// AircraftFamilyPicker. Extracted once search.tsx and both map
// implementations (native + web) needed the identical wrapper — same
// options/labels/behavior everywhere by construction, not by convention.
export function CollapsibleAircraftFilter({ selectedKeys, onChange, label = 'Aircraft type' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const summary = selectedKeys.length === 0 ? 'Any aircraft' : `${selectedKeys.length} famil${selectedKeys.length === 1 ? 'y' : 'ies'} selected`;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summary}>{summary}</Text>
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </View>
      </TouchableOpacity>
      {expanded ? <AircraftFamilyPicker selectedKeys={selectedKeys} onChange={onChange} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { fontSize: 12, lineHeight: 15, fontWeight: '700', color: colors.textMuted },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summary: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textMuted },
  chevron: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
});
