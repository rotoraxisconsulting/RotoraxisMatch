import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { colors, spacing, typography } from '../theme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, subtitle, icon = '🔍', action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={[typography.h4, styles.title]}>{title}</Text>
      {subtitle ? (
        <Text style={[typography.bodySmall, styles.subtitle]}>{subtitle}</Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="outline"
          size="sm"
          style={styles.actionBtn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textMuted,
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: spacing.md,
  },
});
