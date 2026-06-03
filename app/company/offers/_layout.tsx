import { Stack } from 'expo-router';
import { companyUi } from '../../../src/components/company/CompanyUI';

export default function OffersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: companyUi.page },
      }}
    />
  );
}
