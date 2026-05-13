import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { UserRole } from '../repositories/demoSessionRepository';

const ROLE_CONFIG: Record<UserRole, { label: string; textColor: string; bgColor: string }> = {
  technician: { label: 'Technician', textColor: colors.navy, bgColor: colors.cyan },
  company: { label: 'Company', textColor: colors.white, bgColor: colors.navyLight },
  admin: { label: 'Admin', textColor: colors.white, bgColor: colors.admin },
};

interface DemoModeBannerProps {
  role?: UserRole;
}

export function DemoModeBanner({ role }: DemoModeBannerProps) {
  const config = role
    ? ROLE_CONFIG[role]
    : { label: '', textColor: colors.navy, bgColor: colors.cyan };

  return (
    <View style={[styles.banner, { backgroundColor: config.bgColor }]}>
      <View style={[styles.dot, { backgroundColor: config.textColor + '50' }]} />
      <Text style={[styles.text, { color: config.textColor }]}>
        DEMO{role ? ` · ${config.label.toUpperCase()}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
