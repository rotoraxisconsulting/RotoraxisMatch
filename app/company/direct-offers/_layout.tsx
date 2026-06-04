import { Stack } from 'expo-router';
import { companyUi } from '../../../src/components/company/CompanyUI';

export default function DirectOffersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: companyUi.page },
      }}
    />
  );
}
