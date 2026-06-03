import { Stack } from 'expo-router';
import { adminUi } from '../../src/components/admin/AdminUI';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: adminUi.page },
      }}
    />
  );
}
