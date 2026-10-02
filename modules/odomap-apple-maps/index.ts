import { requireOptionalNativeModule } from 'expo';

export type AppleCoordinate = { latitude: number; longitude: number };

export type ApplePlace = AppleCoordinate & { title: string; subtitle: string };

export type AppleRoute = {
  /** [latitude, longitude] pairs. */
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

type OdomapAppleMapsModule = {
  searchPlaces(query: string, near: AppleCoordinate | null): Promise<ApplePlace[]>;
  planRoutes(from: AppleCoordinate, to: AppleCoordinate, avoidHighways: boolean): Promise<AppleRoute[]>;
};

/**
 * Apple's place search and routing (iOS only). Null when the native module
 * isn't in this build, so a missing module turns the fallback off instead of
 * crashing the app at startup.
 */
export const AppleMaps = requireOptionalNativeModule<OdomapAppleMapsModule>('OdomapAppleMaps');
