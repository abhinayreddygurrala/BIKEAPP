import * as Location from 'expo-location';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { GOOGLE_DARK_MAP_STYLE } from '@/constants/googleMapStyles';
import { useTheme } from '@/hooks/use-theme';

export type RouteMapProps = {
  coordinates: LatLng[];
  style?: ViewStyle;
  showsUserLocation?: boolean;
  /**
   * Keep the camera on the rider's live position. Done here by hand because
   * react-native-maps' own `followsUserLocation` is Apple-Maps-only and does
   * nothing on Google Maps. Dragging the map pauses it; recenterOnUser resumes.
   */
  followUser?: boolean;
  /** Pin at the route's last point — for finished rides, not a ride in progress. */
  showEndMarker?: boolean;
  /** Re-fit the camera to the full route whenever `coordinates` changes. */
  fitOnChange?: boolean;
  children?: React.ReactNode;
};

export type RouteMapHandle = {
  fitToRoute: (animated?: boolean) => void;
  /** Re-center the camera on the device's current location (the blue dot). */
  recenterOnUser: (animated?: boolean) => void;
};

// Roughly a street-level zoom — tight enough to read a route, wide enough to
// not feel jumpy while moving.
const RECENTER_DELTA = 0.006;

export const RouteMap = forwardRef<RouteMapHandle, RouteMapProps>(function RouteMap(
  { coordinates, style, showsUserLocation, followUser, showEndMarker = true, fitOnChange, children },
  ref
) {
  const mapRef = useRef<MapView>(null);
  // False while the rider has dragged the map away to look around.
  const followingRef = useRef(true);
  // Fallback only — react-native-maps' own "blue dot" location listener runs
  // on its own, lower-accuracy cadence, separate from the expo-location
  // BestForNavigation task actually recording the ride. Recentering on it
  // (as this used to) could land you noticeably off from where the route
  // line itself says you are.
  const lastUserLocationRef = useRef<LatLng | null>(null);
  const lastRouteCoordinateRef = useRef<LatLng | null>(null);
  const theme = useTheme();
  const scheme = useColorScheme();

  useEffect(() => {
    if (coordinates.length > 0) lastRouteCoordinateRef.current = coordinates[coordinates.length - 1];
  }, [coordinates]);

  const fitToRoute = (animated = true) => {
    if (coordinates.length < 2) return;
    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
      animated,
    });
  };

  const animateTo = (coordinate: LatLng, animated: boolean) => {
    mapRef.current?.animateToRegion(
      { ...coordinate, latitudeDelta: RECENTER_DELTA, longitudeDelta: RECENTER_DELTA },
      animated ? 400 : 0
    );
  };

  const recenterOnUser = async (animated = true) => {
    followingRef.current = true;
    // A cached fix (the ride's last recorded point, polled every couple of
    // seconds, or react-native-maps' own slower-cadence location dot) can be
    // stale enough that one tap lands short of where you actually are —
    // fetching a fresh fix on every press is what makes a single tap land
    // exactly, instead of needing repeated taps to "catch up".
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      lastUserLocationRef.current = coordinate;
      animateTo(coordinate, animated);
    } catch {
      const coordinate = lastRouteCoordinateRef.current ?? lastUserLocationRef.current;
      if (coordinate) animateTo(coordinate, animated);
    }
  };

  useImperativeHandle(ref, () => ({ fitToRoute, recenterOnUser }));

  // Open on the rider, not the map's default world view: the last known fix
  // lands instantly, then a fresh one corrects it.
  useEffect(() => {
    if (!showsUserLocation || coordinates.length > 0) return;
    let cancelled = false;
    (async () => {
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) animateTo({ latitude: last.coords.latitude, longitude: last.coords.longitude }, false);
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (fresh && !cancelled) {
        const coordinate = { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
        lastUserLocationRef.current = coordinate;
        animateTo(coordinate, true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only on first show of a live map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsUserLocation]);

  // Live follow: high-accuracy GPS, every few meters, camera glides to it.
  useEffect(() => {
    if (!followUser) return;
    followingRef.current = true;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3 },
      (position) => {
        const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        lastUserLocationRef.current = coordinate;
        if (followingRef.current) mapRef.current?.animateCamera({ center: coordinate }, { duration: 500 });
      }
    )
      .then((sub) => {
        subscription = sub;
      })
      .catch((e) => console.error('[RouteMap] live follow unavailable', e));
    return () => subscription?.remove();
  }, [followUser]);

  useEffect(() => {
    if (fitOnChange) fitToRoute(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitOnChange, coordinates.length]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={scheme === 'dark' ? GOOGLE_DARK_MAP_STYLE : []}
        showsUserLocation={showsUserLocation}
        showsCompass={false}
        onPanDrag={() => {
          followingRef.current = false;
        }}
        onUserLocationChange={(event) => {
          const coordinate = event.nativeEvent.coordinate;
          if (coordinate) lastUserLocationRef.current = coordinate;
        }}>
        {coordinates.length > 1 ? (
          <Polyline coordinates={coordinates} strokeColor={theme.accent} strokeWidth={4} />
        ) : null}
        {coordinates.length > 0 ? (
          <Marker coordinate={coordinates[0]} title="Start" pinColor={theme.success} />
        ) : null}
        {showEndMarker && coordinates.length > 1 ? (
          <Marker coordinate={coordinates[coordinates.length - 1]} title="End" pinColor={theme.accent} />
        ) : null}
      </MapView>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
