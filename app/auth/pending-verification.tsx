import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/theme';
import { useAuth } from '../../src/auth/AuthContext';

const STEPS = [
  {
    icon: '📋',
    title: 'Profile submitted',
    description: 'Your account has been registered.',
  },
  {
    icon: '🔍',
    title: 'Under review',
    description: 'Our team will verify your credentials and profile.',
  },
  {
    icon: '✉',
    title: 'Email notification',
    description: 'You will be notified at your registered email once approved.',
  },
];

export default function PendingVerificationScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const email = session?.user?.email ?? null;

  async function handleSignOut() {
    await signOut();
    router.replace('/' as any);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, isWide && styles.containerWide]}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>⏳</Text>
        </View>

        <Text style={styles.title}>Account pending verification</Text>

        {email ? (
          <Text style={styles.emailNote}>
            Registered as{' '}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>
        ) : null}

        <Text style={styles.body}>
          Your account has been submitted and is awaiting review by our team.
          This process typically takes 1–2 business days.
        </Text>

        {/* Steps */}
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepIcon, i === 1 && styles.stepIconActive]}>
                <Text style={styles.stepIconText}>{s.icon}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, i === 1 && styles.stepTitleActive]}>
                  {s.title}
                </Text>
                <Text style={styles.stepDesc}>{s.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="Back to home"
            onPress={() => router.replace('/' as any)}
            fullWidth
            size="lg"
          />
          {session ? (
            <Button
              label="Sign out"
              onPress={handleSignOut}
              variant="outline"
              fullWidth
              size="md"
              style={styles.signOutBtn}
            />
          ) : null}
        </View>

        <Text style={styles.footer}>
          Need help? Contact support at{' '}
          <Text style={styles.footerLink}>support@aviationjobtalent.com</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  container: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerWide: {
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emailNote: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  emailHighlight: { color: colors.cyanLight, fontWeight: '600' },
  body: {
    fontSize: 14,
    color: colors.cyanLight,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  steps: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.navyLight,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepIconActive: {
    backgroundColor: 'rgba(245,158,11,0.18)',
  },
  stepIconText: { fontSize: 18 },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 2,
  },
  stepTitleActive: { color: colors.warning },
  stepDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  actions: { width: '100%', gap: spacing.sm, marginBottom: spacing.lg },
  signOutBtn: { borderColor: 'rgba(255,255,255,0.2)' },
  footer: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: { color: colors.cyan },
});
