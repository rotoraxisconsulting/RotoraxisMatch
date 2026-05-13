import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'blue'
  | 'navy'
  | 'cyan'
  | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  small?: boolean;
}

const VARIANTS: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: '#D1FAE5', text: '#065F46' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  error: { bg: '#FEE2E2', text: '#991B1B' },
  info: { bg: '#DBEAFE', text: '#1E40AF' },
  blue: { bg: '#DBEAFE', text: '#1E40AF' },
  navy: { bg: '#E0E7FF', text: '#1E3A5F' },
  cyan: { bg: '#CFFAFE', text: '#0E7490' },
  muted: { bg: '#F1F5F9', text: '#64748B' },
};

export function Badge({ label, variant = 'muted', small = false }: BadgeProps) {
  const v = VARIANTS[variant];
  return (
    <View style={[styles.base, { backgroundColor: v.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: v.text }, small && styles.textSmall]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  textSmall: {
    fontSize: 11,
    lineHeight: 16,
  },
});
