import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

interface MatchBadgeProps {
  score: number;
  context?: string;
}

export function MatchBadge({ score, context }: MatchBadgeProps) {
  const color = scoreColor(score);
  return (
    <View style={styles.wrap}>
      <Text style={[styles.number, { color }]}>{score}%</Text>
      {context ? <Text style={styles.context}>{context}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  number: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  context: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right',
    lineHeight: 14,
  },
});
