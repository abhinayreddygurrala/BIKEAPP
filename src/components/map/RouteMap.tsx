import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type LatLng } from 'react-native-maps';

import { useTheme } from '@/hooks/use-theme';

export type RouteMapProps = {
  coordinates: LatLng[];
  style?: ViewStyle;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
  /** Re-fit the camera to the full route whenever `coordinates` changes. */
  fitOnChange?: boolean;
  children?: React.ReactNode;
};

export type RouteMapHandle = {
  fitToRoute: (animated?: boolean) => void;
};

export const RouteMap = forwardRef<RouteMapHandle, RouteMapProps>(function RouteMap(
  { coordinates, style, showsUserLocation, followsUserLocation, fitOnChange, children },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const theme = useTheme();

  const fitToRoute = (animated = true) => {
    if (coordinates.length < 2) return;
    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
      animated,
    });
  };

  useImperativeHandle(ref, () => ({ fitToRoute }));

  useEffect(() => {
    if (fitOnChange) fitToRoute(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitOnChange, coordinates.length]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle="dark"
        showsUserLocation={showsUserLocation}
        followsUserLocation={followsUserLocation}
        showsCompass={false}>
        {coordinates.length > 1 ? (
          <Polyline coordinates={coordinates} strokeColor={theme.accent} strokeWidth={4} />
        ) : null}
        {coordinates.length > 0 ? (
          <Marker coordinate={coordinates[0]} title="Start" pinColor={theme.success} />
        ) : null}
        {coordinates.length > 1 ? (
          <Marker coordinate={coordinates[coordinates.length - 1]} title="Now" pinColor={theme.accent} />
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
