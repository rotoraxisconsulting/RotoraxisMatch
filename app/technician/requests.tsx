// Legacy route kept for backward navigation only.
// TODO: Remove this screen once all deep links to /technician/requests are gone.
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Button } from '../../src/components/Button';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { colors, spacing, typography } from '../../src/theme';

export default function TechnicianRequestsLegacy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Requests' }} />
      <DemoModeBanner role="technician" />
      <View style={styles.content}>
        <Text style={styles.icon}>📦</Text>
        <Text style={[typography.h3, styles.title]}>Moved to new screen</Text>
        <Text style={styles.body}>
          Direct offers from companies are now managed under Direct Offers.
        </Text>
        <Button
          label="View Direct Offers"
          onPress={() => router.replace('/technician/direct-offers' as any)}
          variant="primary"
          fullWidth
          style={styles.btn}
        />
        <Button
          label="Browse Job Offers"
          onPress={() => router.replace('/technician/offers' as any)}
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
