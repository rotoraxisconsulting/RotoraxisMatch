import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, spacing } from '../../src/theme';
import { APP_PUBLIC_URL } from '../../src/lib/appUrl';

const CONFIRM_WORD = 'DELETE';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isTechnician = profile?.role === 'technician';
  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  async function handleDelete() {
    if (!confirmed) return;
    setError(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Your session has expired. Please sign in again.');
        setLoading(false);
        return;
      }

      const functionUrl = `${APP_PUBLIC_URL.replace('http://localhost:8081', process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')}/functions/v1/delete-account`.replace(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/delete-account`,
        `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/delete-account`,
      );

      // Call via supabase.functions.invoke for clean URL resolution
      const { error: fnError } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        const msg = typeof fnError === 'object' && 'message' in fnError
          ? (fnError as any).message
          : 'Account deletion failed. Please try again.';
        setError(msg);
        setLoading(false);
        return;
      }

      setDone(true);
      await signOut();
      setTimeout(() => router.replace('/' as any), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'An unexpected error occurred.');
      setLoading(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.doneWrap}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.doneTitle}>Account deleted</Text>
          <Text style={styles.doneSub}>Your data has been removed. Redirecting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>⚠</Text>
          </View>
          <Text style={styles.title}>Delete account</Text>
          <Text style={styles.subtitle}>
            This action is permanent and cannot be undone.
          </Text>
        </View>

        {/* What will be deleted */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What will be deleted</Text>
          {isTechnician ? (
            <>
              <BulletItem text="Your profile and all personal information" />
              <BulletItem text="All uploaded documents (licenses, medicals, IDs) — files removed from storage" />
              <BulletItem text="Cover notes on applications" />
              <BulletItem text="Chat messages you sent (replaced with [Message deleted])" />
              <BulletItem text="Your authentication credentials" />
            </>
          ) : (
            <>
              <BulletItem text="Your company membership and profile information" />
              <BulletItem text="Chat messages you sent (replaced with [Message deleted])" />
              <BulletItem text="Your authentication credentials" />
              <BulletItem text="Note: the company account and its data remain if other members exist" />
            </>
          )}
        </View>

        {/* Last-admin warning for company */}
        {!isTechnician && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              If you are the only administrator of your company, you must assign another administrator before deleting your account.
            </Text>
          </View>
        )}

        {/* Confirmation */}
        <View style={styles.card}>
          <Text style={styles.confirmLabel}>
            Type <Text style={styles.confirmWord}>{CONFIRM_WORD}</Text> to confirm
          </Text>
          <TextInput
            style={[
              styles.input,
              confirmed && styles.inputConfirmed,
            ]}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="Type DELETE"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.deleteBtn,
            (!confirmed || loading) && styles.deleteBtnDisabled,
          ]}
          onPress={handleDelete}
          disabled={!confirmed || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.deleteBtnText}>Permanently delete my account</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Need help instead?{' '}
          <Text
            style={styles.footerLink}
            onPress={() => router.push('/support' as any)}
          >
            Contact support
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  scrollWide: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  back: { paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  backText: { color: colors.cyanLight, fontSize: 14, fontWeight: '500' },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  icon: { fontSize: 30 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.navyLight,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.cyanLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  bulletDot: { color: colors.error, fontSize: 14, marginTop: 1, width: 14 },
  bulletText: { flex: 1, fontSize: 13, color: colors.cyanLight, lineHeight: 19 },
  warningCard: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    marginBottom: spacing.md,
  },
  warningText: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 19,
    fontWeight: '500',
  },
  confirmLabel: {
    fontSize: 13,
    color: colors.cyanLight,
    marginBottom: spacing.xs,
  },
  confirmWord: {
    fontWeight: '700',
    color: colors.error,
    fontFamily: 'monospace' as any,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    letterSpacing: 2,
  },
  inputConfirmed: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 19,
  },
  deleteBtn: {
    backgroundColor: colors.error,
    borderRadius: 14,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginBottom: spacing.md,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  footerLink: { color: colors.cyan, fontWeight: '600' },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  doneIcon: { fontSize: 48, color: colors.success, marginBottom: spacing.md },
  doneTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  doneSub: { fontSize: 14, color: colors.cyanLight, textAlign: 'center' },
});
