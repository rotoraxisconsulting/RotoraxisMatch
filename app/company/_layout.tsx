import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { companyUi } from '../../src/components/company/CompanyUI';
import { useAuth } from '../../src/auth/AuthContext';
import { useSession } from '../../src/state/SessionContext';

export default function CompanyLayout() {
  const { profile, loading } = useAuth();
  const { sessionLoading } = useSession();

  if (loading) return <LoadingScreen color={companyUi.accent} role="company" />;
  if (!profile) return <Redirect href="/auth/login" />;
  if (profile.status !== 'active') return <Redirect href="/auth/pending-verification" />;
  if (profile.role !== 'company_user') return <Redirect href="/" />;
  // SessionContext resolves companyId via its own async fetch
  // (company_members), independent of the auth check above — waiting for
  // it here too means no screen under /company/* can ever mount while
  // companyId is still ''. Root fix for a crash that kept recurring
  // screen-by-screen (offers list/detail, the map) before this.
  if (sessionLoading) return <LoadingScreen color={companyUi.accent} role="company" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: companyUi.page },
      }}
    />
  );
}
