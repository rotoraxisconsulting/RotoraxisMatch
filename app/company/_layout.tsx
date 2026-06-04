import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { companyUi } from '../../src/components/company/CompanyUI';
import { useAuth } from '../../src/auth/AuthContext';

export default function CompanyLayout() {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingScreen color={companyUi.accent} role="company" />;
  if (!profile) return <Redirect href="/auth/login" />;
  if (profile.status !== 'active') return <Redirect href="/auth/pending-verification" />;
  if (profile.role !== 'company_user') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: companyUi.page },
      }}
    />
  );
}
