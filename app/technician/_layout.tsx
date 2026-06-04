import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { techUi } from '../../src/components/technician/TechnicianUI';
import { useAuth } from '../../src/auth/AuthContext';

export default function TechnicianLayout() {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingScreen color={techUi.accent} role="technician" />;
  if (!profile) return <Redirect href="/auth/login" />;
  if (profile.status !== 'active') return <Redirect href="/auth/pending-verification" />;
  if (profile.role !== 'technician') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: techUi.page },
      }}
    />
  );
}
