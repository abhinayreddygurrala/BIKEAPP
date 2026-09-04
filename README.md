# BikeApp

An iOS motorcycle riding companion app: GPS ride tracking today, with maintenance/fuel logging, turn-by-turn navigation, and group rides planned for later sessions.

Stack: Expo (TypeScript, Expo Router) + Supabase (Postgres, Auth, Realtime).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a [Supabase](https://supabase.com) project, then apply the migrations in `supabase/migrations/` (via the SQL editor, or `supabase db push` with the Supabase CLI).

3. Copy `.env.example` to `.env` and fill in your project's URL and anon key (Project Settings → API).

4. Regenerate `src/lib/database.types.ts` from your real schema (it's currently hand-authored to match the migrations):

   ```bash
   npx supabase gen types typescript --project-id <id> --schema public > src/lib/database.types.ts
   ```

## Running on a device

Background location tracking and the map view both require native code that isn't in Expo Go — you need a custom dev client. Two ways to get one on a physical iPhone:

- **Local build** (free, needs Xcode + CocoaPods installed): `npx expo prebuild -p ios` then `npx expo run:ios --device`. With a free Apple ID the signing certificate expires after 7 days and needs reinstalling.
- **EAS Build** (needs an Expo account, and a paid Apple Developer Program membership for device provisioning): `eas build --profile development --platform ios`.

The iOS Simulator has no real GPS hardware — it's fine for a UI smoke test but cannot validate whether background tracking survives the phone being locked, which is the part that actually matters for this feature. Test on a real device before trusting ride tracking.

## Ride tracking walk-test protocol

1. Grant "While Using" then "Always Allow" location access when prompted.
2. Start a ride and walk/ride a short outdoor route (5–10 min).
3. Lock the screen partway through and keep moving for 1–2 minutes — this is the critical test. The recorded route should have no straight-line gap across the locked period.
4. Background the app (press Home) for another minute — tracking should continue.
5. Pause, stand still ~30s, Resume — the paused interval should add no distance or duration.
6. Stop, and confirm the stats look plausible and the ride appears in history (syncs to Supabase once online).

## Project structure

- `src/app/` — Expo Router routes: `(auth)` (sign-in/sign-up), `(app)/(tabs)` (Rides/Maintenance/Navigate/Group/Settings), plus ride and bike detail screens.
- `src/features/ride-tracking/` — background location task, local SQLite storage, distance/speed/elevation math.
- `src/services/` — Supabase read/write helpers (`ridesService`, `bikesService`).
- `src/lib/supabase.ts` — Supabase client with encrypted session storage.
- `supabase/migrations/` — full schema, including stub tables for maintenance, fuel logs, and group/social features not yet built.
