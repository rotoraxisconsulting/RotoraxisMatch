import React from 'react';
import { View, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { DemoModeBanner } from './DemoModeBanner';
import { UserRole } from '../repositories/demoSessionRepository';
import { colors } from '../theme';

interface LoadingScreenProps {
  color?: string;
  role?: UserRole;
}

export function LoadingScreen({ color = colors.blue, role }: LoadingScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      {role && <DemoModeBanner role={role} />}
      <View style={styles.container}>
        <ActivityIndicator color={color} size="large" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
