import { Stack } from 'expo-router';
import { companyUi } from '../../../src/components/company/CompanyUI';

export default function CompanyTechnicianProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: companyUi.page },
      }}
    />
  );
}
