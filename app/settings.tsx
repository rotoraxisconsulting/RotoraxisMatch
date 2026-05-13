import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '../src/theme';
import { resetIntroSeen } from '../src/storage/introStorage';
import { localDatabase } from '../src/storage/localDatabase';
import { useDemoSession } from '../src/state/useDemoSession';

export default function SettingsScreen() {
  const router = useRouter();
  const { session, clearSession } = useDemoSession();
  const [resetting, setResetting] = useState(false);

  async function handleShowIntroAgain() {
    await resetIntroSeen();
    router.replace('/intro' as any);
  }

  async function handleResetDemoData() {
    setResetting(true);
    try {
      await localDatabase.resetToSeeds();
    } finally {
      setResetting(false);
    }
  }

  async function handleClearSession() {
    await clearSession();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro experience */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intro experience</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>First-launch introduction</Text>
            <Text style={styles.cardDescription}>
              Replay the animated RotoraxisMatch introduction that plays on first launch.
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

        {/* Demo session */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Demo session</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Current role</Text>
            <Text style={styles.cardDescription}>
              {session
                ? `Active demo session as ${session.role.charAt(0).toUpperCase() + session.role.slice(1)}.`
                : 'No active session. Select a role from the home screen.'}
            </Text>
            {session && (
              <TouchableOpacity
                onPress={handleClearSession}
                style={[styles.btn, styles.btnSecondary]}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, styles.btnTextSecondary]}>
                  Clear session
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Demo data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Demo data</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Reset to seed data</Text>
            <Text style={styles.cardDescription}>
              Restore all technicians, companies, requests and documents to their original demo state.
            </Text>
            <TouchableOpacity
              onPress={handleResetDemoData}
              style={[styles.btn, styles.btnDanger]}
              activeOpacity={0.8}
              disabled={resetting}
            >
              <Text style={[styles.btnText, styles.btnTextDanger]}>
                {resetting ? 'Resetting…' : 'Reset demo data'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutKey}>App</Text>
              <Text style={styles.aboutValue}>RotoraxisMatch</Text>
            </View>
            <View style={[styles.aboutRow, styles.aboutRowLast]}>
              <Text style={styles.aboutKey}>Mode</Text>
              <Text style={styles.aboutValue}>Demo · No real data</Text>
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
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
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
  btnTextSecondary: {
    color: colors.textSecondary,
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
