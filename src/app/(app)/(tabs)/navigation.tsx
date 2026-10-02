import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceField } from '@/components/navigation/PlaceField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GOOGLE_DARK_MAP_STYLE } from '@/constants/googleMapStyles';
import { Spacing } from '@/constants/theme';
import { otherAppUrl, turnByTurnUrl } from '@/features/navigation/routeChoice';
import { usePlaceSearch } from '@/features/navigation/usePlaceSearch';
import { getAllLocalRides } from '@/features/ride-tracking/rideLocalDb';
import { decodeRoutePolyline, distanceUnitLabel, formatDistance } from '@/features/ride-tracking/rideMath';
import { useSettings } from '@/features/settings/SettingsContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  canChooseAppleMaps,
  getMapsChoice,
  GoogleUnavailableError,
  planRoute,
  resolveMapsSource,
  setMapsChoice,
  type LatLng,
  type MapsSource,
  type Place,
  type PlaceSuggestion,
  type RouteOptions,
} from '@/services/routePlannerService';

type ScreenMode = 'plan' | 'roads';
type RouteChoice = 'scenic' | 'fastest';
type Field = 'from' | 'to';

const MODE_OPTIONS: { value: ScreenMode; label: string }[] = [
  { value: 'plan', label: 'Plan a Route' },
  { value: 'roads', label: 'My Roads' },
];

const MAPS_OPTIONS: { value: MapsSource; label: string }[] = [
  { value: 'google', label: 'Google Maps' },
  { value: 'apple', label: 'Apple Maps' },
];

const ROUTE_CHOICE_OPTIONS: { value: RouteChoice; label: string }[] = [
  { value: 'scenic', label: 'Scenic' },
  { value: 'fastest', label: 'Fastest' },
];

const MAP_EDGE_PADDING = { top: 60, right: 50, bottom: 60, left: 50 };
const LOCATION_TIMEOUT_MS = 10_000;
// Room for the floating tab bar above the home indicator.
const TAB_BAR_CLEARANCE = 96;

/** "45 min" or "1 h 4 min": a trip estimate, not a stopwatch. */
function formatTravelTime(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/** Where the rider is now: a fresh fix if one comes quickly, else the last known one. */
async function currentPosition(): Promise<LatLng> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Allow location access to start from where you are, or type a starting place.');
  }
  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
  ]);
  const fix = fresh ?? (await Location.getLastKnownPositionAsync().catch(() => null));
  if (!fix) throw new Error('Couldn’t get your location. Try again, or type a starting place.');
  return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
}

export default function NavigationScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { units } = useSettings();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<ScreenMode>('plan');

  // The rider picks Google or Apple; Google falls back to Apple when it's
  // unavailable (see resolveMapsSource). Each one's results may only be
  // shown on its own map, so the map itself switches along with them.
  const [choice, setChoice] = useState<MapsSource>('google');
  const [source, setSource] = useState<MapsSource | null | 'checking'>('checking');
  const mapsSource = source === 'checking' ? null : source;
  const [here, setHere] = useState<LatLng | null>(null);

  const [activeField, setActiveField] = useState<Field | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOptions | null>(null);
  const [routeChoice, setRouteChoice] = useState<RouteChoice>('scenic');
  const [planning, setPlanning] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const planRequest = useRef(0);

  const [myRides, setMyRides] = useState<{ id: string; coordinates: LatLng[] }[] | null>(null);
  const [ridesDistanceMeters, setRidesDistanceMeters] = useState(0);

  const clearRoute = () => {
    planRequest.current += 1;
    setRouteOptions(null);
    setRouteError(null);
    setPlanning(false);
  };

  const from = usePlaceSearch(mapsSource, here, () => switchMaps(canChooseAppleMaps() ? 'apple' : null));
  const to = usePlaceSearch(mapsSource, here, () => switchMaps(canChooseAppleMaps() ? 'apple' : null));

  function switchMaps(next: MapsSource | null) {
    setSource(next);
    clearRoute();
    setOrigin(null);
    // One company's places can't go on the other's map: keep the text and
    // find them again with the new maps.
    from.researchWith(next);
    to.researchWith(next);
    setActiveField(to.query.trim() ? 'to' : from.query.trim() ? 'from' : null);
  }

  const onChooseMaps = async (next: MapsSource) => {
    setChoice(next);
    void setMapsChoice(next);
    setSource('checking');
    switchMaps(await resolveMapsSource(next));
  };

  useEffect(() => {
    getMapsChoice().then(async (saved) => {
      setChoice(saved);
      setSource(await resolveMapsSource(saved));
    });
  }, []);

  // Center on the rider, but only if location is already allowed; this tab
  // doesn't prompt until a route needs it.
  useEffect(() => {
    (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last) setHere({ latitude: last.coords.latitude, longitude: last.coords.longitude });
    })();
  }, []);

  // Local SQLite only, so it's cheap to load up front.
  useEffect(() => {
    getAllLocalRides().then((rides) => {
      const withRoutes = rides
        .filter((r) => r.route_polyline)
        .map((r) => ({ id: r.id, coordinates: decodeRoutePolyline(r.route_polyline!) }))
        .filter((r) => r.coordinates.length > 1);
      setMyRides(withRoutes);
      setRidesDistanceMeters(rides.reduce((sum, r) => sum + (r.distance_meters ?? 0), 0));
    });
  }, []);

  const plan = async (start: Place | null, end: Place) => {
    if (!mapsSource) return;
    const request = ++planRequest.current;
    setPlanning(true);
    setRouteError(null);
    setRouteOptions(null);
    try {
      const startAt = start ?? (await currentPosition());
      if (request !== planRequest.current) return;
      setOrigin(startAt);
      const options = await planRoute(mapsSource, startAt, end);
      if (request !== planRequest.current) return;
      setRouteOptions(options);
      setRouteChoice(options.hasAlternative ? 'scenic' : 'fastest');
    } catch (e) {
      if (request !== planRequest.current) return;
      if (e instanceof GoogleUnavailableError) switchMaps(canChooseAppleMaps() ? 'apple' : null);
      else setRouteError(e instanceof Error ? e.message : 'Couldn’t plan that route. Try again.');
    } finally {
      if (request === planRequest.current) setPlanning(false);
    }
  };

  const selectedRoute = useMemo(() => {
    if (!routeOptions) return null;
    return routeChoice === 'scenic' ? routeOptions.scenic : routeOptions.fastest;
  }, [routeOptions, routeChoice]);
  const otherRoute = routeOptions?.hasAlternative
    ? routeChoice === 'scenic'
      ? routeOptions.fastest
      : routeOptions.scenic
    : null;

  const provider = mapsSource === 'apple' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;

  // Re-run on a provider change too: switching maps builds a fresh map view.
  useEffect(() => {
    if (mode === 'plan' && selectedRoute) {
      mapRef.current?.fitToCoordinates(selectedRoute.coordinates, { edgePadding: MAP_EDGE_PADDING, animated: true });
    } else if (mode === 'roads' && myRides && myRides.length > 0) {
      mapRef.current?.fitToCoordinates(
        myRides.flatMap((r) => r.coordinates),
        { edgePadding: MAP_EDGE_PADDING, animated: true }
      );
    } else if (here) {
      mapRef.current?.animateToRegion({ ...here, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 0);
    }
  }, [mode, selectedRoute, myRides, here, provider]);

  // Plans as soon as there's a destination, and again whenever either end is picked.
  const onPick = async (field: Field, suggestion: PlaceSuggestion) => {
    Keyboard.dismiss();
    setActiveField(null);
    const picked = await (field === 'from' ? from : to).pick(suggestion);
    if (!picked) return;
    const start = field === 'from' ? picked : from.place;
    const end = field === 'to' ? picked : to.place;
    if (end) void plan(start, end);
  };

  const onChangeFrom = (text: string) => {
    from.setQuery(text);
    // An empty From means "from where I am", so the route can be planned again right away.
    if (!text.trim() && to.place) void plan(null, to.place);
    else clearRoute();
  };

  const onChangeTo = (text: string) => {
    to.setQuery(text);
    clearRoute();
  };

  const onRide = () => {
    if (!selectedRoute || !to.place || !mapsSource) return;
    Linking.openURL(turnByTurnUrl(mapsSource, from.place, to.place, selectedRoute));
  };

  // The other maps app only gets the place names you typed, not this route:
  // Google's and Apple's results may each only be used with their own maps.
  const onOpenInOtherApp = () => {
    if (!selectedRoute || !to.place || !mapsSource) return;
    const otherApp = mapsSource === 'apple' ? 'google' : 'apple';
    const start = from.place ? from.query : null;
    Linking.openURL(otherAppUrl(otherApp, start, to.query, selectedRoute.avoidsHighways));
  };

  const mapsAppName = mapsSource === 'apple' ? 'Apple Maps' : 'Google Maps';
  const otherAppName = mapsSource === 'apple' ? 'Google Maps' : 'Apple Maps';
  const extraMinutes =
    routeOptions && routeChoice === 'scenic'
      ? Math.round((routeOptions.scenic.durationSeconds - routeOptions.fastest.durationSeconds) / 60)
      : 0;

  return (
    <ThemedView style={styles.flex}>
      {/* Top inset only. iOS can't pad this list for the floating tab bar
          (the map above it comes first), so the bottom padding does. */}
      <SafeAreaView style={styles.flex} edges={['top']}>
        <MapView
          key={mapsSource === 'apple' ? 'apple' : 'google'}
          ref={mapRef}
          provider={provider}
          style={{ height: Math.max(280, Math.round(windowHeight * 0.4)) }}
          customMapStyle={provider === PROVIDER_GOOGLE && scheme === 'dark' ? GOOGLE_DARK_MAP_STYLE : []}
          userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
          showsUserLocation
          showsCompass={false}>
          {mode === 'plan' && otherRoute ? (
            <Polyline
              coordinates={otherRoute.coordinates}
              strokeColor={theme.textSecondary}
              strokeWidth={4}
              tappable
              onPress={() => setRouteChoice(routeChoice === 'scenic' ? 'fastest' : 'scenic')}
            />
          ) : null}
          {mode === 'plan' && selectedRoute ? (
            <Polyline coordinates={selectedRoute.coordinates} strokeColor={theme.accent} strokeWidth={6} />
          ) : null}
          {mode === 'plan' && to.place ? (
            <Marker coordinate={to.place} title={to.place.title} pinColor={theme.accent} />
          ) : null}
          {mode === 'plan' && from.place && origin ? (
            <Marker coordinate={origin} title={from.place.title} pinColor={theme.success} />
          ) : null}
          {mode === 'roads'
            ? myRides?.map((ride) => (
                <Polyline key={ride.id} coordinates={ride.coordinates} strokeColor={theme.accent} strokeWidth={2} />
              ))
            : null}
        </MapView>

        <View style={styles.modeSwitcher}>
          <SegmentedControl value={mode} options={MODE_OPTIONS} onChange={setMode} />
        </View>

        {/* The fields sit under a fixed map, so the keyboard would otherwise
            cover the lower ones. This pads the list by the keyboard's height
            and scrolls the focused field into view; "handled" lets taps on
            suggestions and buttons work while the keyboard is up. */}
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled">
          {mode === 'plan' ? (
            <>
              <ThemedText type="statLabel" themeColor="textSecondary">
                Get Directions
              </ThemedText>
              {canChooseAppleMaps() ? (
                <SegmentedControl value={choice} options={MAPS_OPTIONS} onChange={onChooseMaps} />
              ) : null}
              {source === 'checking' ? (
                <ActivityIndicator color={theme.text} style={styles.spinner} />
              ) : !mapsSource ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Route planning needs a connection to Odomap. Check your connection and reopen this tab.
                </ThemedText>
              ) : (
                <>
                  {choice === 'google' && mapsSource === 'apple' ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Google Maps isn’t available right now, so this is using Apple Maps.
                    </ThemedText>
                  ) : null}
                  <PlaceField
                    value={from.query}
                    onChangeText={onChangeFrom}
                    placeholder="From: Current location"
                    dotColor={theme.success}
                    suggestions={from.suggestions}
                    showSuggestions={activeField === 'from'}
                    searching={from.searching}
                    error={from.error}
                    onPick={(suggestion) => onPick('from', suggestion)}
                    onFocus={() => setActiveField('from')}
                  />
                  <PlaceField
                    value={to.query}
                    onChangeText={onChangeTo}
                    placeholder="Where to?"
                    dotColor={theme.accent}
                    suggestions={to.suggestions}
                    showSuggestions={activeField === 'to'}
                    searching={to.searching}
                    error={to.error}
                    onPick={(suggestion) => onPick('to', suggestion)}
                    onFocus={() => setActiveField('to')}
                  />

                  {planning ? <ActivityIndicator color={theme.text} style={styles.spinner} /> : null}
                  {routeError ? (
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      {routeError}
                    </ThemedText>
                  ) : null}

                  {routeOptions && selectedRoute && to.place ? (
                    <>
                      {routeOptions.hasAlternative ? (
                        <SegmentedControl value={routeChoice} options={ROUTE_CHOICE_OPTIONS} onChange={setRouteChoice} />
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary">
                          Only one sensible road between these places, so there’s no scenic or fastest choice this time.
                        </ThemedText>
                      )}
                      <ThemedView type="backgroundElement" style={styles.routeSummary}>
                        <ThemedText type="default">
                          {formatDistance(selectedRoute.distanceMeters, units)} {distanceUnitLabel(units)} ·{' '}
                          {formatTravelTime(selectedRoute.durationSeconds)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {routeChoice === 'scenic' && routeOptions.hasAlternative
                            ? [
                                extraMinutes > 0 ? `${extraMinutes} min longer than fastest` : null,
                                selectedRoute.avoidsHighways ? 'no highways' : null,
                                'the twistiest roads on offer',
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : 'The quickest way there.'}
                        </ThemedText>
                      </ThemedView>
                      <PrimaryButton label={`Ride It in ${mapsAppName}`} onPress={onRide} />
                      <ThemedText type="small" themeColor="textSecondary">
                        {selectedRoute.pins.length > 0
                          ? `Opens ${mapsAppName} with voice directions. It shows ${
                              selectedRoute.pins.length === 1 ? 'a stop' : `${selectedRoute.pins.length} stops`
                            } along the way; ${selectedRoute.pins.length === 1 ? 'it keeps' : 'they keep'} you on this road.`
                          : `Opens ${mapsAppName} with voice directions for this road.`}
                      </ThemedText>
                      <PrimaryButton label={`Open in ${otherAppName} Instead`} variant="muted" onPress={onOpenInOtherApp} />
                      <ThemedText type="small" themeColor="textSecondary">
                        {otherAppName} plans its own roads to {to.place.title}
                        {selectedRoute.avoidsHighways ? ' (avoiding highways)' : ''}, so they may differ from the line
                        on this map.
                      </ThemedText>
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <ThemedText type="statLabel" themeColor="textSecondary">
                My Roads
              </ThemedText>
              {myRides === null ? (
                <ActivityIndicator color={theme.text} style={styles.spinner} />
              ) : myRides.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Record a ride and it&rsquo;ll show up here as a line on the map.
                </ThemedText>
              ) : (
                <ThemedView type="backgroundElement" style={styles.routeSummary}>
                  <ThemedText type="default">
                    {myRides.length} {myRides.length === 1 ? 'ride' : 'rides'} mapped
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDistance(ridesDistanceMeters, units)} {distanceUnitLabel(units)} logged total — every road
                    you&rsquo;ve recorded, all in one place.
                  </ThemedText>
                </ThemedView>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modeSwitcher: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  spinner: {
    marginVertical: Spacing.two,
  },
  routeSummary: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
