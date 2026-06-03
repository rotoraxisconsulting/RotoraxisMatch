import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { colors, spacing } from '../../theme';

export const techUi = {
  page: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceSoft: '#F8FAFC',
  border: '#E5E7EB',
  borderSoft: '#EEF2F7',
  text: '#0F172A',
  textSoft: '#475569',
  textMuted: '#94A3B8',
  accent: '#0E7490',
  accentSoft: '#E0F7FA',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#047857',
  greenSoft: '#ECFDF5',
  amber: '#B45309',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  navy: '#111827',
};

export const panelShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0px 14px 34px rgba(15, 23, 42, 0.07)' } as ViewStyle,
  default: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
});

type Tone = 'success' | 'warning' | 'error' | 'info' | 'muted' | 'navy' | 'cyan';

const TONES: Record<Tone, { bg: string; text: string; border: string }> = {
  success: { bg: techUi.greenSoft, text: techUi.green, border: '#BBF7D0' },
  warning: { bg: techUi.amberSoft, text: techUi.amber, border: '#FDE68A' },
  error: { bg: techUi.redSoft, text: techUi.red, border: '#FECACA' },
  info: { bg: techUi.blueSoft, text: techUi.blue, border: '#BFDBFE' },
  muted: { bg: techUi.surfaceSoft, text: techUi.textSoft, border: techUi.borderSoft },
  navy: { bg: '#EEF2FF', text: '#1E3A5F', border: '#C7D2FE' },
  cyan: { bg: techUi.accentSoft, text: techUi.accent, border: '#BAE6FD' },
};

export function TechnicianScreen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={techStyles.safe}>
      <StatusBar style="dark" />
      {children}
    </SafeAreaView>
  );
}

export function TechnicianCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[techStyles.card, style]}>{children}</View>;
}

export function TechnicianPageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  onBack,
  backLabel = 'Back',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <View style={techStyles.pageHeader}>
      <View style={techStyles.pageHeaderRow}>
        {onBack ? <InlineBackButton label={backLabel} onPress={onBack} /> : null}
        <View style={techStyles.pageTitleBlock}>
          {eyebrow ? <Text style={techStyles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={techStyles.pageTitle}>{title}</Text>
          {subtitle ? <Text style={techStyles.pageSub}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={techStyles.pageRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function InlineBackButton({ label = 'Back', onPress }: { label?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={techStyles.backButton}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ArrowLeft color={techUi.text} size={19} strokeWidth={2.4} />
    </TouchableOpacity>
  );
}

export function TechnicianBadge({
  label,
  tone = 'muted',
  small = false,
}: {
  label: string;
  tone?: Tone;
  small?: boolean;
}) {
  const t = TONES[tone];
  return (
    <View style={[techStyles.badge, { backgroundColor: t.bg, borderColor: t.border }, small && techStyles.badgeSmall]}>
      <Text style={[techStyles.badgeText, { color: t.text }, small && techStyles.badgeTextSmall]}>{label}</Text>
    </View>
  );
}

export function TechnicianChip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View style={[techStyles.chip, selected && techStyles.chipSelected]}>
      <Text style={[techStyles.chipText, selected && techStyles.chipTextSelected]}>{label}</Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {body}
    </TouchableOpacity>
  );
}

export function EmptyPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <TechnicianCard style={techStyles.emptyPanel}>
      <View style={techStyles.emptyMark} />
      <Text style={techStyles.emptyTitle}>{title}</Text>
      <Text style={techStyles.emptySub}>{subtitle}</Text>
    </TechnicianCard>
  );
}

export function ActivityDot() {
  return <View style={techStyles.activityDot} />;
}

export function InitialAvatar({
  label,
  size = 42,
}: {
  label: string;
  size?: number;
}) {
  const initial = label.trim().charAt(0).toUpperCase() || 'R';
  return (
    <View style={[techStyles.avatar, { width: size, height: size, borderRadius: Math.round(size * 0.34) }]}>
      <Text style={techStyles.avatarText}>{initial}</Text>
    </View>
  );
}

export const techStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: techUi.page,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  contentWide: {
    maxWidth: 860,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  pageHeader: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pageTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: techUi.accent,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: techUi.text,
  },
  pageSub: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: techUi.textSoft,
    marginTop: 4,
  },
  pageRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: techUi.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(panelShadow ?? {}),
  },
  card: {
    backgroundColor: techUi.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: techUi.border,
    padding: spacing.md,
    ...(panelShadow ?? {}),
  },
  badge: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  badgeTextSmall: {
    fontSize: 11,
    lineHeight: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: techUi.surface,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: techUi.accent,
    borderColor: techUi.accent,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: techUi.textSoft,
  },
  chipTextSelected: {
    color: colors.white,
  },
  emptyPanel: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyMark: {
    width: 34,
    height: 5,
    borderRadius: 3,
    backgroundColor: techUi.accent,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: techUi.text,
    marginBottom: 5,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: techUi.textSoft,
    textAlign: 'center',
    maxWidth: 320,
  },
  activityDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: techUi.red,
    zIndex: 2,
  },
  avatar: {
    backgroundColor: techUi.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
});
