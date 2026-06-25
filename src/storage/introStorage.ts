import { storageAdapter } from './asyncStorageAdapter';

const INTRO_SEEN_KEY = 'aviationjobtalent_has_seen_intro';

export async function hasSeenIntro(): Promise<boolean> {
  const value = await storageAdapter.get<boolean>(INTRO_SEEN_KEY);
  return value === true;
}

export async function markIntroAsSeen(): Promise<void> {
  await storageAdapter.set(INTRO_SEEN_KEY, true);
}

export async function resetIntroSeen(): Promise<void> {
  await storageAdapter.remove(INTRO_SEEN_KEY);
}
