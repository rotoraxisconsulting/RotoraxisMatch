import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { DemoModeBanner } from '../src/components/DemoModeBanner';
import { useDemoSession } from '../src/state/useDemoSession';
import { colors, spacing } from '../src/theme';
import { UserRole } from '../src/repositories/demoSessionRepository';
import { hasSeenIntro } from '../src/storage/introStorage';
import { localDatabase } from '../src/storage/localDatabase';

const ROLE_LABELS: Record<UserRole, string> = {
  technician: 'Technician',
  company: 'Company',
  admin: 'Admin',
};

const STATS = [
  { value: '18+', label: 'Verified Techs' },
  { value: '5+', label: 'Operators' },
  { value: '100%', label: 'Privacy First' },
];

const VALUE_PROPS = [
  {
    icon: '🔒',
    title: 'Privacy by default',
    description: 'Your identity stays anonymous until you choose to connect.',
  },
  {
    icon: '✅',
    title: 'Verified professionals',
    description: 'Licenses and qualifications independently verified.',
  },
  {
    icon: '🎯',
    title: 'Precision matching',
    description: 'Find talent by license, type rating, specialty and location.',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { session, loading } = useDemoSession();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [introChecked, setIntroChecked] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    hasSeenIntro().then(seen => {
      if (!seen) {
        router.replace('/intro' as any);
      } else {
        setIntroChecked(true);
      }
    });
  }, []);

  if (!introChecked) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.cyan} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  async function handleResetDemoData() {
    setResetting(true);
    setResetDone(false);
    try {
      await localDatabase.resetV2Data();
      setResetDone(true);
      setTimeout(() => setResetDone(false), 4000);
    } finally {
      setResetting(false);
    }
  }

  function goToOnboarding() {
    router.push('/onboarding');
  }

  function continueSession() {
    if (!session) return;
    router.replace(`/${session.role}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      {session && <DemoModeBanner role={session.role} />}
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoIcon}>✈</Text>
          </View>
          <Text style={styles.appName}>RotoraxisMatch</Text>
          <Text style={styles.tagline}>
            The professional network for{'\n'}aviation technicians and operators
          </Text>
        </View>

        {/* Stats strip */}
        <View style={styles.statsRow}>
          {STATS.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={styles.statDivider} />}
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Value props */}
        <View style={styles.propsCard}>
          {VALUE_PROPS.map((vp, i) => (
            <ValueProp
              key={vp.title}
              icon={vp.icon}
              title={vp.title}
              description={vp.description}
              last={i === VALUE_PROPS.length - 1}
            />
          ))}
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          {session ? (
            <>
              <Button
                label={`Continue as ${ROLE_LABELS[session.role]}`}
                onPress={continueSession}
                fullWidth
                size="lg"
              />
              <Button
                label="Switch role"
                onPress={goToOnboarding}
                variant="outline"
                fullWidth
                size="md"
                style={styles.secondaryBtn}
              />
            </>
          ) : (
            <Button
              label="Get started"
              onPress={goToOnboarding}
              fullWidth
              size="lg"
              loading={loading}
            />
          )}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/settings' as any)}
          style={styles.settingsLink}
        >
          <Text style={styles.settingsLinkText}>⚙ Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResetDemoData}
          style={styles.resetBtn}
          disabled={resetting}
          activeOpacity={0.7}
        >
          {resetting ? (
            <ActivityIndicator size="small" color={colors.warning} />
          ) : (
            <Text style={[styles.resetBtnText, resetDone && styles.resetBtnTextDone]}>
              {resetDone ? '✓ Demo data reset — navigate to your role to see fresh data' : '⟳ Reset demo data'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Demo mode · No real data is stored or transmitted
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ValueProp({
  icon,
  title,
  description,
  last = false,
}: {
  icon: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <View style={[vpStyles.row, !last && vpStyles.border]}>
      <View style={vpStyles.iconWrap}>
        <Text style={vpStyles.icon}>{icon}</Text>
      </View>
      <View style={vpStyles.text}>
        <Text style={vpStyles.title}>{title}</Text>
        <Text style={vpStyles.description}>{description}</Text>
      </View>
    </View>
  );
}

const vpStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: 'rgba(0,180,216,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  icon: {
    fontSize: 20,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 3,
  },
  description: {
    fontSize: 13,
    color: colors.cyanLight,
    lineHeight: 19,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scrollWide: {
    paddingHorizontal: spacing.xxxl,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  logoIcon: {
    fontSize: 38,
  },
  appName: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    color: colors.cyanLight,
    textAlign: 'center',
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 28,
  },
  statLabel: {
    fontSize: 11,
    color: colors.cyanLight,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  propsCard: {
    backgroundColor: colors.navyLight,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cta: {
    marginBottom: spacing.lg,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  settingsLink: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  settingsLinkText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  resetBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,165,0,0.3)',
    borderRadius: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '500',
    opacity: 0.75,
  },
  resetBtnTextDone: {
    opacity: 1,
    color: colors.success,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
});
