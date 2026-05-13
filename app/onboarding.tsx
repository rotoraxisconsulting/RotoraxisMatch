import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDemoSession } from '../src/state/useDemoSession';
import { UserRole } from '../src/repositories/demoSessionRepository';
import { colors, spacing } from '../src/theme';
import { Button } from '../src/components/Button';

interface RoleOption {
  role: UserRole;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  bullets: string[];
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'technician',
    title: 'Aviation Technician',
    subtitle: 'Mechanic, engineer or inspector seeking opportunities',
    icon: '🔧',
    accent: colors.technician,
    bullets: ['Create a verified profile', 'Receive contact requests', 'Control your privacy'],
  },
  {
    role: 'company',
    title: 'Company / Operator',
    subtitle: 'MRO, airline, operator or recruiter searching for talent',
    icon: '🏢',
    accent: colors.company,
    bullets: ['Search by license & specialty', 'Send contact requests', 'Map-based search'],
  },
  {
    role: 'admin',
    title: 'Administrator',
    subtitle: 'Verify profiles, manage data and oversee the platform',
    icon: '⚙️',
    accent: colors.admin,
    bullets: ['Verify technicians & companies', 'Review documents', 'Monitor platform activity'],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { selectRole } = useDemoSession();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  async function handleContinue() {
    if (!selected) return;
    setLoading(true);
    await selectRole(selected);
    setLoading(false);
    router.replace(`/${selected}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>How will you use{'\n'}RotoraxisMatch?</Text>
          <Text style={styles.subtitle}>
            Select your role to explore the demo. You can switch at any time.
          </Text>
        </View>

        <View style={styles.roles}>
          {ROLE_OPTIONS.map((option) => (
            <RoleCard
              key={option.role}
              option={option}
              selected={selected === option.role}
              onSelect={() => setSelected(option.role)}
            />
          ))}
        </View>

        <Button
          label="Continue"
          onPress={handleContinue}
          disabled={!selected}
          loading={loading}
          fullWidth
          size="lg"
        />

        <Text style={styles.privacyNote}>
          By continuing you acknowledge this is a demo environment.{'\n'}No personal data is stored externally.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function RoleCard({
  option,
  selected,
  onSelect,
}: {
  option: RoleOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.82}
      style={[
        cardStyles.card,
        selected && { borderColor: option.accent, borderWidth: 2, backgroundColor: option.accent + '06' },
      ]}
    >
      <View style={cardStyles.topRow}>
        <View style={[cardStyles.iconWrap, { backgroundColor: option.accent + '18' }]}>
          <Text style={cardStyles.icon}>{option.icon}</Text>
        </View>

        <View style={cardStyles.content}>
          <Text style={cardStyles.title}>{option.title}</Text>
          <Text style={cardStyles.subtitle}>{option.subtitle}</Text>
        </View>

        <View style={[cardStyles.radio, selected && { borderColor: option.accent, backgroundColor: option.accent }]}>
          {selected && <Text style={cardStyles.checkmark}>✓</Text>}
        </View>
      </View>

      {selected && (
        <View style={[cardStyles.bullets, { borderTopColor: option.accent + '25' }]}>
          {option.bullets.map((b) => (
            <View key={b} style={cardStyles.bulletRow}>
              <View style={[cardStyles.bulletDot, { backgroundColor: option.accent }]} />
              <Text style={cardStyles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '700',
    lineHeight: 16,
  },
  bullets: {
    borderTopWidth: 1,
    marginHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  bulletText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  scrollWide: {
    paddingHorizontal: spacing.xxxl,
    maxWidth: 580,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 34,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  roles: {
    marginBottom: spacing.xl,
  },
  privacyNote: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
