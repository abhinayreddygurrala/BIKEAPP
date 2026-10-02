// Picks "Fastest" and "Scenic" from the routes Google or Apple offer, and
// builds the link that hands the chosen route to Google Maps or Apple Maps
// for voice directions. No React Native imports, so it runs anywhere.

export type LatLng = { latitude: number; longitude: number };

export type MapsSource = 'google' | 'apple';

export type CandidateRoute = { coordinates: LatLng[]; distanceMeters: number; durationSeconds: number };

export type PlannedRoute = CandidateRoute & {
  /** True when this road has no highways, so the hand-off asks the maps app to avoid them too. */
  avoidsHighways: boolean;
  /**
   * Points the maps app must pass through to follow this exact road instead
   * of its own pick. Empty when its own pick is already this road.
   */
  pins: LatLng[];
};

export type RouteOptions = { fastest: PlannedRoute; scenic: PlannedRoute; hasAlternative: boolean };

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const deltaLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Points every `step` meters along the line, plus its last point. */
export function resample(points: LatLng[], step: number): LatLng[] {
  if (points.length === 0) return [];
  const out = [points[0]];
  let sinceLast = 0;
  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1];
    const to = points[i];
    let segment = metersBetween(from, to);
    while (segment > 0 && sinceLast + segment >= step) {
      const t = (step - sinceLast) / segment;
      from = {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      };
      out.push(from);
      segment = metersBetween(from, to);
      sinceLast = 0;
    }
    sinceLast += segment;
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Degrees of heading change per kilometer: a highway scores near zero, a
 * twisty back road scores high. Measured every 100 m, because maps draw
 * roads with a point every few meters and the rounding in those points
 * makes even a straight road look slightly wiggly.
 */
export function curvinessPerKm(route: CandidateRoute): number {
  const samples = resample(route.coordinates, 100);
  if (samples.length < 3 || route.distanceMeters <= 0) return 0;
  let totalTurn = 0;
  let previous = bearing(samples[0], samples[1]);
  for (let i = 1; i < samples.length - 1; i++) {
    const current = bearing(samples[i], samples[i + 1]);
    let delta = Math.abs(current - previous);
    if (delta > 180) delta = 360 - delta;
    totalTurn += delta;
    previous = current;
  }
  return totalTurn / (route.distanceMeters / 1000);
}

// Two results are the same road when they match on length, time and shape.
const routeKey = (r: CandidateRoute) =>
  `${Math.round(r.distanceMeters)}:${Math.round(r.durationSeconds)}:${r.coordinates.length}`;

// How far off the maps app's own pick a road must stray before it needs a
// pin, and the most pins to add (each one is announced as a stop).
const PIN_MIN_DEVIATION_METERS = 500;
const MAX_PINS = 3;

/**
 * Where `route` strays furthest from `reference`: one point per stretch that
 * leaves it, the stretches that stray furthest first, returned in riding order.
 */
export function deviationPins(route: CandidateRoute, reference: CandidateRoute): LatLng[] {
  const along = resample(route.coordinates, 500);
  const other = resample(reference.coordinates, 250);
  if (other.length === 0) return [];

  // Flat-earth distance is plenty accurate at this scale and much cheaper.
  const cosLat = Math.cos(toRad(along[0]?.latitude ?? 0));
  const approxMeters = (a: LatLng, b: LatLng) =>
    111_320 * Math.hypot(a.latitude - b.latitude, (a.longitude - b.longitude) * cosLat);

  const stretches: { point: LatLng; index: number; distance: number }[] = [];
  let current: (typeof stretches)[number] | null = null;
  along.forEach((point, index) => {
    let nearest = Infinity;
    for (const p of other) nearest = Math.min(nearest, approxMeters(point, p));
    if (nearest < PIN_MIN_DEVIATION_METERS) {
      current = null;
      return;
    }
    if (!current) {
      current = { point, index, distance: nearest };
      stretches.push(current);
    } else if (nearest > current.distance) {
      current.point = point;
      current.index = index;
      current.distance = nearest;
    }
  });

  return stretches
    .sort((a, b) => b.distance - a.distance)
    .slice(0, MAX_PINS)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.point);
}

/**
 * Fastest is the quickest normal route. Scenic is the curviest highway-free
 * route other than that, or failing one, the curviest other route.
 * Null when there are no routes at all.
 */
export function chooseRoutes(normal: CandidateRoute[], noHighways: CandidateRoute[]): RouteOptions | null {
  const highwayFree = new Set(noHighways.map(routeKey));
  const normalKeys = new Set(normal.map(routeKey));
  const seen = new Set<string>();
  const candidates = [...normal, ...noHighways].filter((r) => {
    const key = routeKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (candidates.length === 0) return null;

  const pool = normal.length > 0 ? candidates.filter((r) => normalKeys.has(routeKey(r))) : candidates;
  const fastestRoute = pool.reduce((best, r) => (r.durationSeconds < best.durationSeconds ? r : best));
  const fastest: PlannedRoute = { ...fastestRoute, avoidsHighways: highwayFree.has(routeKey(fastestRoute)), pins: [] };

  const others = candidates.filter((r) => routeKey(r) !== routeKey(fastestRoute));
  if (others.length === 0) return { fastest, scenic: fastest, hasAlternative: false };

  // A rider's "scenic" means off the highway first, twisty second: pick the
  // curviest highway-free road when there is one, else the curviest other road.
  const offHighway = others.filter((r) => highwayFree.has(routeKey(r)));
  const scored = (offHighway.length > 0 ? offHighway : others).map((route) => ({ route, score: curvinessPerKm(route) }));
  const scenicRoute = scored.reduce((best, s) => (s.score > best.score ? s : best)).route;
  const avoidsHighways = highwayFree.has(routeKey(scenicRoute));

  // What the maps app would ride on its own with the same settings: its
  // first highway-free route when avoiding highways, else its first route.
  const appsOwnPick = avoidsHighways ? noHighways[0] : (normal[0] ?? noHighways[0]);
  const pins = routeKey(appsOwnPick) === routeKey(scenicRoute) ? [] : deviationPins(scenicRoute, appsOwnPick);

  return { fastest, scenic: { ...scenicRoute, avoidsHighways, pins }, hasAlternative: true };
}

const coordinate = (p: LatLng) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/**
 * A link that opens the route in Google Maps (Google routes) or Apple Maps
 * (Apple routes) and starts voice directions. `from` null means "from where
 * I am now", which lets the maps app start navigating straight away.
 */
export function turnByTurnUrl(source: MapsSource, from: LatLng | null, to: LatLng, route: PlannedRoute): string {
  const params: [string, string][] = [];
  if (source === 'google') {
    params.push(['api', '1']);
    if (from) params.push(['origin', coordinate(from)]);
    params.push(['destination', coordinate(to)], ['travelmode', 'driving'], ['dir_action', 'navigate']);
    if (route.pins.length > 0) params.push(['waypoints', route.pins.map(coordinate).join('|')]);
    if (route.avoidsHighways) params.push(['avoid', 'highways']);
    return `https://www.google.com/maps/dir/?${encode(params)}`;
  }
  if (from) params.push(['source', coordinate(from)]);
  params.push(['destination', coordinate(to)], ['mode', 'driving']);
  for (const pin of route.pins) params.push(['waypoint', coordinate(pin)]);
  if (route.avoidsHighways) params.push(['avoid', 'highways']);
  return `https://maps.apple.com/directions?${encode(params)}`;
}

/**
 * Directions in the other maps app, from the place names the rider typed
 * (null start = where they are now). It plans its own roads: each company's
 * place and route results may only be used with its own maps, so the
 * route drawn in Odomap isn't passed along.
 */
export function otherAppUrl(app: MapsSource, from: string | null, to: string, avoidHighways: boolean): string {
  const params: [string, string][] = [];
  if (app === 'google') {
    params.push(['api', '1']);
    if (from) params.push(['origin', from]);
    params.push(['destination', to], ['travelmode', 'driving'], ['dir_action', 'navigate']);
    if (avoidHighways) params.push(['avoid', 'highways']);
    return `https://www.google.com/maps/dir/?${encode(params)}`;
  }
  if (from) params.push(['source', from]);
  params.push(['destination', to], ['mode', 'driving']);
  if (avoidHighways) params.push(['avoid', 'highways']);
  return `https://maps.apple.com/directions?${encode(params)}`;
}

const encode = (params: [string, string][]) =>
  params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
