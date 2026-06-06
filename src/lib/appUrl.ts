// Public base URL of the deployed web app, used for Supabase auth redirect links.
// PRODUCTION: set EXPO_PUBLIC_APP_URL to the real deployed URL before going live
//   e.g. EXPO_PUBLIC_APP_URL=https://app.rotoraxismatch.com
export const APP_PUBLIC_URL =
  process.env.EXPO_PUBLIC_APP_URL ?? 'http://localhost:8081';
