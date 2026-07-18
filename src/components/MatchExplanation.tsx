import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { MatchScore } from '../types/matching';

const LEVEL_LABEL: Record<MatchScore['level'], string> = {
  exact: 'Exact match',
  related: 'Related — needs confirmation',
  legacy: 'Match found',
  not_met: 'No clear match',
};

const LEVEL_COLOR: Record<MatchScore['level'], string> = {
  exact: colors.success,
  related: colors.warning,
  legacy: colors.blue,
  not_met: colors.textMuted,
};

// Renders the explainable part of a MatchScore — what matches, what needs
// clarification, and which mandatory requirements are unmet. Never used to
// hide or exclude the technician/offer; purely explanatory.
export function MatchExplanation({ score }: { score: MatchScore }) {
  if (score.matches.length === 0 && score.clarifications.length === 0 && score.mandatoryMissing.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.levelRow}>
        <View style={[styles.levelDot, { backgroundColor: LEVEL_COLOR[score.level] }]} />
        <Text style={[styles.levelText, { color: LEVEL_COLOR[score.level] }]}>{LEVEL_LABEL[score.level]}</Text>
      </View>

      {score.matches.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Matches</Text>
          {score.matches.map((m, i) => (
            <Text key={i} style={styles.matchLine}>• {m}</Text>
          ))}
        </View>
      )}

      {score.clarifications.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>To confirm</Text>
          {score.clarifications.map((c, i) => (
            <Text key={i} style={styles.clarificationLine}>• {c}</Text>
          ))}
        </View>
      )}

      {score.mandatoryMissing.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Mandatory requirements not met exactly</Text>
          {score.mandatoryMissing.map((m, i) => (
            <Text key={i} style={styles.missingLine}>• {m}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  block: {
    gap: 2,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  matchLine: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.success,
  },
  clarificationLine: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning,
  },
  missingLine: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },
});
