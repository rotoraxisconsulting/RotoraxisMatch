import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme';
import { SessionProvider } from '../src/state/SessionContext';
import { AuthProvider } from '../src/auth/AuthContext';

export default function RootLayout() {

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SessionProvider>
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
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="technician" options={{ headerShown: false }} />
            <Stack.Screen name="company" options={{ headerShown: false }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
            <Stack.Screen name="map" options={{ headerShown: false }} />
          </Stack>
        </SessionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
