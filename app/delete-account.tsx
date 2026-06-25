import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { colors, spacing } from '../src/theme';

export default function PublicDeleteAccountScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.h1}>How to delete your account</Text>
        <Text style={styles.subtitle}>
          You have the right to permanently delete your account and all associated personal data at any time.
        </Text>

        {/* If the user is logged in, offer direct action */}
        {profile ? (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              You are signed in. You can delete your account directly:
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => router.push('/account/delete' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Go to Delete Account →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              Sign in first, then go to <Text style={styles.bold}>Settings → Delete account</Text>.
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => router.push('/auth/login' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Sign in →</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Step-by-step guide</Text>
          <Step n={1} text='Open the app and sign in to your account.' />
          <Step n={2} text='Tap the Settings icon (⚙) on the home screen.' />
          <Step n={3} text='Scroll down to the Account section and tap "Delete account…"' />
          <Step n={4} text='Read the information about what will be deleted.' />
          <Step n={5} text='Type DELETE in the confirmation field and tap "Permanently delete my account".' />
          <Step n={6} text='Your account and personal data will be removed immediately.' />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What is deleted</Text>
          <Text style={styles.p}>
            <Text style={styles.bold}>Technicians: </Text>
            All personal information (name, email, phone, date of birth), all uploaded documents (removed from storage), cover notes on applications, and chat messages you sent. Your authentication credentials are permanently removed.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.bold}>Company users: </Text>
            Your company membership and personal account information, chat messages you sent. The company account and its job offers remain if other members exist.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Can't access the app?</Text>
          <Text style={styles.p}>
            If you cannot sign in or access the app, email our support team and we will process the deletion manually within 30 days:
          </Text>
          <Text style={styles.email}>support@aviationjobtalent.com</Text>
          <Text style={styles.p}>
            Subject: <Text style={styles.bold}>Account deletion request</Text>{'\n'}
            Include the email address associated with your account.
          </Text>
        </View>

        <Text style={styles.legal}>
          This page fulfils the GDPR "right to erasure" (Art. 17) and Apple/Google App Store data deletion requirements.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  scrollWide: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  back: { paddingVertical: spacing.sm, alignSelf: 'flex-start', marginBottom: spacing.sm },
  backText: { color: colors.blue, fontSize: 14, fontWeight: '500' },
  h1: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  callout: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  calloutText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  bold: { fontWeight: '700', color: colors.text },
  btn: {
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 16,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  p: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  email: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.blue,
    marginVertical: 4,
  },
  legal: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.md,
  },
});
