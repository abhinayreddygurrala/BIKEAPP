// Google place search and routing for the app's Navigation tab. The API key
// lives only on the server; the phone asks the server, never Google.

export type LatLng = { latitude: number; longitude: number };

export type PlaceSuggestion = { placeId: string; title: string; subtitle: string };

export type Place = LatLng & { address: string };

export type GoogleRoute = {
  /** Google's encoded polyline (precision 5), the same format the app stores rides in. */
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
};

/** The three Google calls the server makes, behind an interface so the smoke test can swap in a fake. */
export type GoogleMaps = {
  autocomplete(input: string, sessionToken: string, near: LatLng | null): Promise<PlaceSuggestion[]>;
  placeDetails(placeId: string, sessionToken: string): Promise<Place | null>;
  computeRoutes(from: LatLng, to: LatLng, avoidHighways: boolean): Promise<GoogleRoute[]>;
};

/** Google refused or couldn't be reached; the app falls back to Apple's maps. */
export class GoogleMapsError extends Error {}

const TIMEOUT_MS = 10_000;

export function createGoogleMaps(apiKey: string, fetchImpl: typeof fetch = fetch): GoogleMaps {
  async function call(url: string, init: { method: 'GET' | 'POST'; fieldMask: string; body?: unknown }) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method,
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': init.fieldMask,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new GoogleMapsError(`Google unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new GoogleMapsError(`Google returned ${response.status}: ${detail.slice(0, 300)}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  return {
    async autocomplete(input, sessionToken, near) {
      const data = await call('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        fieldMask:
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,' +
          'suggestions.placePrediction.structuredFormat',
        body: {
          input,
          sessionToken,
          ...(near
            ? { locationBias: { circle: { center: { latitude: near.latitude, longitude: near.longitude }, radius: 50_000 } } }
            : {}),
        },
      });
      const suggestions = (data?.suggestions ?? []) as {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }[];
      return suggestions.flatMap(({ placePrediction: p }) => {
        if (!p?.placeId) return [];
        const title = p.structuredFormat?.mainText?.text ?? p.text?.text ?? '';
        return title ? [{ placeId: p.placeId, title, subtitle: p.structuredFormat?.secondaryText?.text ?? '' }] : [];
      });
    },

    async placeDetails(placeId, sessionToken) {
      // location + formattedAddress keep this on the cheaper "Essentials" SKU,
      // and the session token closes the autocomplete session it came from.
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
      const data = await call(url, { method: 'GET', fieldMask: 'location,formattedAddress' });
      const location = data?.location as Partial<LatLng> | undefined;
      if (typeof location?.latitude !== 'number' || typeof location.longitude !== 'number') return null;
      return {
        latitude: location.latitude,
        longitude: location.longitude,
        address: typeof data?.formattedAddress === 'string' ? data.formattedAddress : '',
      };
    },

    async computeRoutes(from, to, avoidHighways) {
      // Every option here stays on the "Essentials" SKU: no traffic-aware
      // routing, no waypoints, no two-wheeler mode.
      const data = await call('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        fieldMask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        body: {
          origin: { location: { latLng: { latitude: from.latitude, longitude: from.longitude } } },
          destination: { location: { latLng: { latitude: to.latitude, longitude: to.longitude } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
          computeAlternativeRoutes: true,
          routeModifiers: { avoidHighways },
          polylineQuality: 'HIGH_QUALITY',
          polylineEncoding: 'ENCODED_POLYLINE',
        },
      });
      const routes = (data?.routes ?? []) as {
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }[];
      return routes.flatMap((r) =>
        r.polyline?.encodedPolyline
          ? [
              {
                polyline: r.polyline.encodedPolyline,
                distanceMeters: r.distanceMeters ?? 0,
                durationSeconds: Number.parseFloat(r.duration ?? '0') || 0,
              },
            ]
          : []
      );
    },
  };
}

export function googleMapsFromEnv(): GoogleMaps | null {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  return key ? createGoogleMaps(key) : null;
}

/** "2026-10": the month in Pacific time, which is the calendar Google bills by. */
export function billingMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}`;
}
