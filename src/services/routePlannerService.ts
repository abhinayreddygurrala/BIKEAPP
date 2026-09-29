export type LatLng = { latitude: number; longitude: number };

export type PlannedRoute = {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  /** Degrees of direction change per kilometer — see curvinessPerKm below. */
  curvinessScore: number;
};

export type RouteOptions = {
  scenic: PlannedRoute;
  fastest: PlannedRoute;
  /** False when OSRM only found one viable route, so there's nothing to pick between. */
  hasAlternative: boolean;
};

// The free, public OSRM demo server — no API key, no billing, unlike Google/
// Mapbox directions. It's rate-limited and explicitly "fair use" only (see
// https://project-osrm.org/docs/v5.24.0/api/#demo-server), which is fine for
// one person's own app but would need a self-hosted OSRM instance to scale
// beyond that.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const deltaLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * The public OSRM server doesn't expose road-class data, so there's no free
 * way to ask it directly for "avoid highways." Instead, this sums how many
 * degrees a route's heading changes per kilometer — a highway scores near
 * zero (long straight segments), a twisty back road scores high — and is
 * used to pick the curviest of the alternative routes OSRM returns.
 */
function curvinessPerKm(coordinates: LatLng[], distanceMeters: number): number {
  if (coordinates.length < 3 || distanceMeters === 0) return 0;
  let totalTurnDeg = 0;
  let previousBearing = bearing(coordinates[0], coordinates[1]);
  for (let i = 1; i < coordinates.length - 1; i++) {
    const nextBearing = bearing(coordinates[i], coordinates[i + 1]);
    let delta = Math.abs(nextBearing - previousBearing);
    if (delta > 180) delta = 360 - delta;
    totalTurnDeg += delta;
    previousBearing = nextBearing;
  }
  return totalTurnDeg / (distanceMeters / 1000);
}

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
};

async function fetchOsrmRoutes(from: LatLng, to: LatLng): Promise<OsrmRoute[]> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_BASE_URL}/${coords}?alternatives=3&overview=full&geometries=geojson`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Could not reach the routing service. Check your connection.');
  }
  if (!response.ok) throw new Error('Route lookup failed. Try again in a moment.');

  const data = await response.json();
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('No route found between those points.');
  }
  return data.routes;
}

function toPlannedRoute(route: OsrmRoute): PlannedRoute {
  const coordinates = route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  return {
    coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    curvinessScore: curvinessPerKm(coordinates, route.distance),
  };
}

/** Fetches route alternatives from OSRM and splits them into "fastest" and "scenic" (curviest). */
export async function planRoute(from: LatLng, to: LatLng): Promise<RouteOptions> {
  const routes = await fetchOsrmRoutes(from, to);
  const planned = routes.map(toPlannedRoute);

  const fastest = planned.reduce((best, r) => (r.durationSeconds < best.durationSeconds ? r : best));
  const scenic = planned.reduce((best, r) => (r.curvinessScore > best.curvinessScore ? r : best));

  return { scenic, fastest, hasAlternative: scenic !== fastest };
}
