import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, apiRequest } from '@/lib/apiClient';
import { decodeRoutePolyline } from '@/features/ride-tracking/rideMath';
import {
  chooseRoutes,
  type CandidateRoute,
  type LatLng,
  type MapsSource,
  type RouteOptions,
} from '@/features/navigation/routeChoice';

import { AppleMaps } from '../../modules/odomap-apple-maps';

export type { LatLng, MapsSource, RouteOptions } from '@/features/navigation/routeChoice';

export type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  /** Apple results come with their location; Google ones are looked up when picked. */
  coordinate?: LatLng;
};

export type Place = LatLng & { title: string };

/**
 * Google can't be used right now (the server's free monthly allowance is
 * spent, or the server can't be reached). The screen switches to Apple.
 */
export class GoogleUnavailableError extends Error {}

const MAPS_CHOICE_KEY = 'odomap:navigation-maps';

/** Which maps the rider picked on the Navigation tab (this phone only). Google unless they chose Apple. */
export async function getMapsChoice(): Promise<MapsSource> {
  const saved = await AsyncStorage.getItem(MAPS_CHOICE_KEY).catch(() => null);
  return saved === 'apple' && AppleMaps ? 'apple' : 'google';
}

export async function setMapsChoice(choice: MapsSource) {
  await AsyncStorage.setItem(MAPS_CHOICE_KEY, choice).catch(() => {});
}

/** Whether this phone has Apple's maps (iPhone only), so there's a choice to offer. */
export function canChooseAppleMaps(): boolean {
  return AppleMaps !== null;
}

/**
 * The maps to actually use for `choice`. Apple is always available on
 * iPhone. Google goes through Odomap's server, which stops offering it once
 * this month's free allowance is spent; then, or when the server can't be
 * reached, this falls back to Apple. Null when neither is available.
 */
export async function resolveMapsSource(choice: MapsSource): Promise<MapsSource | null> {
  if (choice === 'apple' && AppleMaps) return 'apple';
  try {
    const status = await apiRequest<{ google: boolean }>('/maps/status');
    if (status.google) return 'google';
  } catch {
    // Server unreachable or not set up: same as no Google.
  }
  return AppleMaps ? 'apple' : null;
}

/** A Google search "session" groups the typing and the final pick into one cheap lookup. */
export function newSearchSession(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function askServer<T>(path: string, body: unknown): Promise<T> {
  try {
    return await apiRequest<T>(path, { method: 'POST', body });
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === 'maps_unavailable' || error.code === 'network' || error.code === 'not_configured' || error.status >= 500)
    ) {
      throw new GoogleUnavailableError(error.message);
    }
    throw error;
  }
}

function requireAppleMaps() {
  if (!AppleMaps) throw new Error('Maps aren’t available on this phone right now.');
  return AppleMaps;
}

export async function searchPlaces(
  source: MapsSource,
  query: string,
  near: LatLng | null,
  session: string
): Promise<PlaceSuggestion[]> {
  if (source === 'google') {
    const { suggestions } = await askServer<{ suggestions: { placeId: string; title: string; subtitle: string }[] }>(
      '/maps/autocomplete',
      { input: query, sessionToken: session, near }
    );
    return suggestions.map((s) => ({ id: s.placeId, title: s.title, subtitle: s.subtitle }));
  }
  const places = await requireAppleMaps().searchPlaces(query, near);
  return places.map((p) => ({
    id: `${p.latitude},${p.longitude}`,
    title: p.title,
    // For a street address Apple's name is the start of the address itself
    // ("820 Bering Dr" + "820 Bering Dr, Arlington, TX"); show it once.
    subtitle: p.subtitle.startsWith(p.title) ? p.subtitle.slice(p.title.length).replace(/^[,\s]+/, '') : p.subtitle,
    coordinate: { latitude: p.latitude, longitude: p.longitude },
  }));
}

export async function resolvePlace(source: MapsSource, suggestion: PlaceSuggestion, session: string): Promise<Place> {
  if (suggestion.coordinate) return { ...suggestion.coordinate, title: suggestion.title };
  if (source !== 'google') throw new Error('Couldn’t find that place. Try another search.');
  const place = await askServer<LatLng>('/maps/place', { placeId: suggestion.id, sessionToken: session });
  return { latitude: place.latitude, longitude: place.longitude, title: suggestion.title };
}

type ServerRoute = { polyline: string; distanceMeters: number; durationSeconds: number };

export async function planRoute(source: MapsSource, from: LatLng, to: LatLng): Promise<RouteOptions> {
  let normal: CandidateRoute[];
  let noHighways: CandidateRoute[];

  if (source === 'google') {
    const found = await askServer<{ normal: ServerRoute[]; noHighways: ServerRoute[] }>('/maps/routes', { from, to });
    const toRoute = (r: ServerRoute): CandidateRoute => ({
      coordinates: decodeRoutePolyline(r.polyline),
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
    });
    normal = found.normal.map(toRoute);
    noHighways = found.noHighways.map(toRoute);
  } else {
    const apple = requireAppleMaps();
    const toRoute = (r: { coordinates: [number, number][]; distanceMeters: number; durationSeconds: number }) => ({
      coordinates: r.coordinates.map(([latitude, longitude]) => ({ latitude, longitude })),
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
    });
    try {
      const [plain, avoiding] = await Promise.all([apple.planRoutes(from, to, false), apple.planRoutes(from, to, true)]);
      normal = plain.map(toRoute);
      noHighways = avoiding.map(toRoute);
    } catch {
      throw new Error('Couldn’t find a route between those places. Check your connection and try again.');
    }
  }

  const options = chooseRoutes(normal, noHighways);
  if (!options) throw new Error('No route found between those places.');
  return options;
}
