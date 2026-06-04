import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { adminUi } from '../../src/components/admin/AdminUI';
import { useAuth } from '../../src/auth/AuthContext';

export default function AdminLayout() {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingScreen color={adminUi.accent} role="admin" />;
  if (!profile) return <Redirect href="/auth/login" />;
  if (profile.status !== 'active') return <Redirect href="/auth/pending-verification" />;
  if (profile.role !== 'admin') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: adminUi.page },
      }}
    />
  );
}
