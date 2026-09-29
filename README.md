# Odomap

An iOS motorcycle riding companion app — GPS ride tracking with lean-angle and G-force telemetry, a maintenance and fuel log, expense tracking, and an on-device AI trip planner. Fully local: no accounts, no sign-in, no backend server.

Stack: Expo (TypeScript, Expo Router) + local SQLite (`expo-sqlite`) + Apple's on-device Foundation Models for AI trip planning. No Supabase, no cloud sync — everything lives only on your phone unless you export it yourself.

## Features

- **Ride tracking** — route, distance, speed, elevation, lean angle, peak lateral G, curve count, and acceleration/drag-strip stats (0-60, 0-100, 1/8 and 1/4 mile), all computed from phone GPS + motion sensors. Recording survives the screen locking or the app being backgrounded.
- **Garage** — one or more bikes, each with a make/model picker, photo, and running odometer.
- **Maintenance** — service history with photo/PDF attachments, a fuel log with economy tracking, an expense log (insurance, registration, accessories, loan payments), generic "suggested" service intervals for anything never logged, and local due-date/mileage notifications for anything due soon or overdue.
- **Navigation** — search a destination and hand off to Apple Maps for turn-by-turn; an on-device AI trip planner (Apple Intelligence, when available on the phone) for scenic-route and points-of-interest questions; a scenic-vs-fastest route comparison using the public OSRM routing API (the one network call this app makes that isn't a Maps deep link — no API key, no billing, rate-limited "fair use" only).
- **Backup** — export everything to a single JSON file (Settings → Export My Data) and restore it on a new phone (Settings → Import My Data). Photos aren't included in the backup file.

## Setup

```bash
npm install
```

No environment variables or backend account needed — the app has no server to configure.

## Running on a device

Several features (background location, motion sensors, camera/photo library, local notifications, on-device AI) require native code that isn't available in Expo Go — you need a custom dev client on a physical iPhone:

```bash
npx expo prebuild -p ios
npx expo run:ios --device
```

That's a **Debug** build: it loads its JavaScript live from the Metro dev server on your Mac, so the phone needs to stay reachable (USB or same network) while testing. To use the app fully standalone, off the Mac entirely, build in Release configuration instead:

```bash
npx expo run:ios --device --configuration Release
```

Notes for a free (non-paid) Apple ID:
- A free/personal signing team's provisioning certificate expires after 7 days and needs reinstalling.
- A free/personal team **cannot** provision the Push Notifications entitlement. `expo-notifications` adds that entitlement automatically during prebuild even though this app only ever schedules *local* notifications, which don't need it — `plugins/withIosSceneDelegate.js`'s sibling fix in `app.config.ts` (the `withEntitlementsPlist` call) strips it back out. If notifications ever need real remote push in the future, that entitlement — and a paid Apple Developer Program membership — comes back into play.

The iOS Simulator has no real GPS hardware and no Apple Intelligence — it's fine for a UI smoke test but can't validate background location tracking or the AI trip planner. Test both on a real device.

### iOS 27: the SceneDelegate gotcha

iOS 27's SDK made UIScene-based app lifecycle mandatory — without it, the app builds and installs fine but **crashes instantly on every real launch** (SIGTRAP, no crash caught by "Build Succeeded"). This isn't an Expo SDK 57 fix yet (tracked upstream at `expo/expo#50179`). It's handled here as a real config plugin (`plugins/withIosSceneDelegate.js`, wired in from `app.config.ts`) so it regenerates automatically on every `expo prebuild` — including `--clean` — instead of living only in the generated (gitignored) `ios/` files where a previous hand-patched version of this fix twice silently vanished.

If Odomap ever crashes immediately on a fresh install again: don't trust "Build Succeeded" or even a single `devicectl device info processes` check (a stale, already-running process from a previous build looks identical to a working one). Verify with terminate → fresh launch → poll the process list for several seconds — a real crash shows zero matching processes within ~5s.

## Ride tracking walk-test protocol

1. Grant "While Using" then "Always Allow" location access when prompted.
2. Start a ride and walk/ride a short outdoor route (5–10 min).
3. Lock the screen partway through and keep moving for 1–2 minutes — this is the critical test. The recorded route should have no straight-line gap across the locked period.
4. Background the app (press Home) for another minute — tracking should continue.
5. Pause, stand still ~30s, Resume — the paused interval should add no distance or duration.
6. Stop, and confirm the stats look plausible and the ride appears in history.

## Project structure

- `src/app/` — Expo Router routes: `(app)/(tabs)` (Rides/Maintenance/Navigate/Settings), plus ride, bike, and maintenance detail/edit screens. No `(auth)` group — the app opens straight in.
- `src/features/ride-tracking/` — background location task, lean-angle/motion sensing, local ride storage, distance/speed/elevation/acceleration math.
- `src/features/maintenance/` — service, fuel, and expense local-DB layers, plus `maintenanceMath.ts` (stats, due-item, and suggested-interval calculations).
- `src/services/` — the app-facing API each screen calls (`ridesService`, `bikesService`, `maintenanceService`, `fuelService`, `expenseService`, `tripPlannerService`, `routePlannerService`, `notificationService`, `exportService`/`importService`).
- `src/lib/localDb.ts` — the single shared SQLite database (schema + backup/restore).
- `src/lib/localPhotoStorage.ts` / `localAttachmentStorage.ts` — on-device file storage for bike/profile photos and maintenance attachments.
- `plugins/withIosSceneDelegate.js` — the iOS 27 crash-on-launch fix, as a real Expo config plugin (see above).
