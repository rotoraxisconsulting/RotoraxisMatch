import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

interface MetricCardProps {
  value: number | string;
  label: string;
  color?: string;
  icon?: string;
}

export function MetricCard({ value, label, color = colors.blue, icon }: MetricCardProps) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  icon: {
    fontSize: 16,
    marginBottom: 2,
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
});
