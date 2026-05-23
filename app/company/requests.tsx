// Legacy route kept for backward navigation only.
// TODO: Remove this screen once all deep links to /company/requests are gone.
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Button } from '../../src/components/Button';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { colors, spacing, typography } from '../../src/theme';

export default function CompanyRequestsLegacy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Requests' }} />
      <DemoModeBanner role="company" />
      <View style={styles.content}>
        <Text style={styles.icon}>📦</Text>
        <Text style={[typography.h3, styles.title]}>Moved to new screens</Text>
        <Text style={styles.body}>
          Incoming applications and direct offer responses are now managed in separate dedicated screens.
        </Text>
        <Button
          label="View Applications"
          onPress={() => router.replace('/company/applications' as any)}
          variant="primary"
          fullWidth
          style={styles.btn}
        />
        <Button
          label="View Job Offers"
          onPress={() => router.replace('/company/offers' as any)}
          variant="outline"
          fullWidth
          style={styles.btn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  icon: { fontSize: 48, marginBottom: spacing.sm },
  title: { textAlign: 'center' },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  btn: { marginTop: spacing.xs },
});
