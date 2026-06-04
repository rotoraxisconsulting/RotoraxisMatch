import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import { colors, spacing } from '../src/theme';
import { resetIntroSeen } from '../src/storage/introStorage';
import { useAuth } from '../src/auth/AuthContext';
import { CompanyPageHeader } from '../src/components/company/CompanyUI';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  async function handleShowIntroAgain() {
    await resetIntroSeen();
    router.replace('/intro' as any);
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/' as any);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <CompanyPageHeader
          eyebrow="App"
          title="Settings"
          subtitle="Manage intro experience and account."
          onBack={() => router.back()}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intro experience</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>First-launch introduction</Text>
            <Text style={styles.cardDescription}>
              Replay the RotoraxisMatch introduction that plays on first launch.
            </Text>
            <TouchableOpacity
              onPress={handleShowIntroAgain}
              style={styles.btn}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Show intro again</Text>
            </TouchableOpacity>
          </View>
        </View>

        {profile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutKey}>Role</Text>
                <Text style={styles.aboutValue}>{profile.role}</Text>
              </View>
              <View style={[styles.aboutRow, styles.aboutRowLast]}>
                <Text style={styles.aboutKey}>Status</Text>
                <Text style={styles.aboutValue}>{profile.status}</Text>
              </View>
              <TouchableOpacity
                onPress={handleSignOut}
                style={[styles.btn, styles.btnDanger]}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, styles.btnTextDanger]}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutKey}>App</Text>
              <Text style={styles.aboutValue}>RotoraxisMatch</Text>
            </View>
            <View style={[styles.aboutRow, styles.aboutRowLast]}>
              <Text style={styles.aboutKey}>Mode</Text>
              <Text style={styles.aboutValue}>Live · Supabase</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  btn: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  btnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  btnTextDanger: {
    color: colors.error,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  aboutRowLast: { borderBottomWidth: 0 },
  aboutKey: { fontSize: 14, color: colors.textSecondary },
  aboutValue: { fontSize: 14, fontWeight: '500', color: colors.text },
});
