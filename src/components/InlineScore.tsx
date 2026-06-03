import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

interface InlineScoreProps {
  score: number;
  quality: string;
  context: string;
}

export function InlineScore({ score, quality, context }: InlineScoreProps) {
  const color = scoreColor(score);
  return (
    <View style={[styles.wrap, { borderLeftColor: color }]}>
      <View style={styles.row}>
        <Text style={[styles.number, { color }]}>{score}%</Text>
        <Text style={[styles.quality, { color }]}>{quality}</Text>
      </View>
      <Text style={styles.context}>{context}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: 2,
  },
  number: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  quality: {
    fontSize: 13,
    fontWeight: '600',
  },
  context: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
