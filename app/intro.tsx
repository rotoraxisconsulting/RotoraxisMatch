import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { IntroExperience } from '../src/components/intro/IntroExperience';
import { markIntroAsSeen } from '../src/storage/introStorage';

export default function IntroScreen() {
  const router = useRouter();

  const handleComplete = useCallback(async () => {
    await markIntroAsSeen();
    router.replace('/');
  }, [router]);

  return <IntroExperience onComplete={handleComplete} />;
}
