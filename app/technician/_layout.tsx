import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { techUi } from '../../src/components/technician/TechnicianUI';
import { useAuth } from '../../src/auth/AuthContext';
import { useSession } from '../../src/state/SessionContext';

export default function TechnicianLayout() {
  const { profile, loading } = useAuth();
  const { sessionLoading } = useSession();

  if (loading) return <LoadingScreen color={techUi.accent} role="technician" />;
  if (!profile) return <Redirect href="/auth/login" />;
  if (profile.status !== 'active') return <Redirect href="/auth/pending-verification" />;
  if (profile.role !== 'technician') return <Redirect href="/" />;
  // SessionContext resolves technicianId via its own async fetch
  // (technician_profiles), independent of the auth check above — waiting
  // for it here too means no screen under /technician/* can ever mount
  // while technicianId is still ''. Same root fix as CompanyLayout.
  if (sessionLoading) return <LoadingScreen color={techUi.accent} role="technician" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: techUi.page },
      }}
    />
  );
}
