import { Stack } from 'expo-router';
import { techUi } from '../../../src/components/technician/TechnicianUI';

export default function TechnicianChatsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: techUi.page },
      }}
    />
  );
}
