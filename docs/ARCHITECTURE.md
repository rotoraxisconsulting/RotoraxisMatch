# Architecture — RotoraxisMatch

Target stack:
- Expo
- React Native
- TypeScript
- Expo Router
- AsyncStorage
- JSON seed data

## Architecture style

Use clean architecture:

app/screens/components
→ hooks/stores/usecases
→ repositories
→ storage adapter

## Main folders

app/
  Expo Router routes

src/
  components/
  core/
  data/
  repositories/
  storage/
  state/
  theme/
  utils/

## Data flow

JSON seed data
→ initialize local database
→ save to AsyncStorage
→ app reads/writes from repositories
→ future Supabase repository replaces AsyncStorage repository

## Important rules

- Do not call AsyncStorage directly from screens.
- Screens must use hooks/stores/repositories.
- Keep business logic outside UI components.
- Keep privacy logic centralized.
- Keep matching logic reusable.
- Prepare code so Supabase can replace local storage later.