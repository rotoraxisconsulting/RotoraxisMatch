import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/theme';
import { localDatabase } from '../src/storage/localDatabase';

export default function RootLayout() {
  useEffect(() => {
    localDatabase.initializeFromSeeds();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="intro" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen
          name="onboarding"
          options={{ title: 'Select Your Role', headerBackTitle: 'Home' }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: 'Settings', headerBackTitle: 'Home' }}
        />
        <Stack.Screen name="technician" options={{ headerShown: false }} />
        <Stack.Screen name="company" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ title: 'Technician Map' }} />
      </Stack>
    </>
  );
}
