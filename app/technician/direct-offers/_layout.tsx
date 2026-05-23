import { Stack } from 'expo-router';
import { colors } from '../../../src/theme';

export default function DirectOffersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  );
}
