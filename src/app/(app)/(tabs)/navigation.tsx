import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/features/settings/SettingsContext';
import { getAllLocalRides } from '@/features/ride-tracking/rideLocalDb';
import { decodeRoutePolyline, distanceUnitLabel, formatDistance, formatDuration } from '@/features/ride-tracking/rideMath';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { planRoute, type LatLng, type RouteOptions } from '@/services/routePlannerService';
import { askTripPlanner, isTripPlannerAvailable } from '@/services/tripPlannerService';

type ScreenMode = 'plan' | 'roads';
type RouteChoice = 'scenic' | 'fastest';

const MODE_OPTIONS: { value: ScreenMode; label: string }[] = [
  { value: 'plan', label: 'Plan a Route' },
  { value: 'roads', label: 'My Roads' },
];

const ROUTE_CHOICE_OPTIONS: { value: RouteChoice; label: string }[] = [
  { value: 'scenic', label: 'Scenic' },
  { value: 'fastest', label: 'Fastest' },
];

const MAP_EDGE_PADDING = { top: 60, right: 50, bottom: 60, left: 50 };

export default function NavigationScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { units } = useSettings();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<ScreenMode>('plan');

  const [destinationQuery, setDestinationQuery] = useState('');
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [routeOptions, setRouteOptions] = useState<RouteOptions | null>(null);
  const [routeChoice, setRouteChoice] = useState<RouteChoice>('scenic');

  const [myRides, setMyRides] = useState<{ id: string; coordinates: LatLng[] }[] | null>(null);
  const [ridesDistanceMeters, setRidesDistanceMeters] = useState(0);

  const [aiQuery, setAiQuery] = useState('');
  const [tripFrom, setTripFrom] = useState('');
  const [tripTo, setTripTo] = useState('');
  const [tripDates, setTripDates] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  useEffect(() => {
    isTripPlannerAvailable().then(setAiAvailable);
  }, []);

  // Cheap (local SQLite only) so it's fine to load once up front rather than
  // waiting for the user to switch to "My Roads".
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

  const selectedRoute = useMemo(() => {
    if (!routeOptions) return null;
    return routeChoice === 'scenic' ? routeOptions.scenic : routeOptions.fastest;
  }, [routeOptions, routeChoice]);

  useEffect(() => {
    if (mode === 'plan' && selectedRoute) {
      mapRef.current?.fitToCoordinates(selectedRoute.coordinates, { edgePadding: MAP_EDGE_PADDING, animated: true });
    }
  }, [mode, selectedRoute]);

  useEffect(() => {
    if (mode === 'roads' && myRides && myRides.length > 0) {
      const all = myRides.flatMap((r) => r.coordinates);
      mapRef.current?.fitToCoordinates(all, { edgePadding: MAP_EDGE_PADDING, animated: true });
    }
  }, [mode, myRides]);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSearchDestination = async () => {
    if (!destinationQuery.trim()) return;
    setSearchError(null);
    setSearching(true);
    setRouteOptions(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setSearchError('Location access is required to plan a route.');
        return;
      }
      const [here, results] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        Location.geocodeAsync(destinationQuery.trim()),
      ]);
      if (!results[0]) {
        setSearchError('Could not find that place.');
        setDestination(null);
        return;
      }
      const from = { latitude: here.coords.latitude, longitude: here.coords.longitude };
      const to = { latitude: results[0].latitude, longitude: results[0].longitude };
      setOrigin(from);
      setDestination(to);

      const options = await planRoute(from, to);
      setRouteOptions(options);
      setRouteChoice('scenic');
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const onOpenInMaps = () => {
    if (!destination) return;
    Linking.openURL(`https://maps.apple.com/?daddr=${destination.latitude},${destination.longitude}&dirflg=d`);
  };

  const onOpenAppleIntelligenceSettings = async () => {
    // Public, App-Store-safe API only — this app is headed for submission,
    // so no private "App-Prefs:root=" scheme. It lands on Settings' app
    // page rather than the exact Apple Intelligence & Siri pane; Apple
    // doesn't expose a public deep link to that specific pane.
    await Linking.openSettings();
  };

  const runAiQuery = async (query: string) => {
    if (!query.trim()) return;
    setAiError(null);
    setAiAnswer(null);
    setAiLoading(true);
    try {
      setAiAnswer(await askTripPlanner(query.trim()));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to get an answer');
    } finally {
      setAiLoading(false);
    }
  };

  const onAskAi = () => runAiQuery(aiQuery);

  const onPlanTrip = () => {
    if (!tripTo.trim()) return;
    const from = tripFrom.trim();
    const dates = tripDates.trim();
    const query = `Plan a scenic motorcycle route ${from ? `from ${from} ` : ''}to ${tripTo.trim()}${
      dates ? ` for a trip on ${dates}` : ''
    }. Prioritize the curviest, most scenic roads over the fastest highway, and call out the best viewpoints or stops for a rider to visit along the way.`;
    runAiQuery(query);
  };

  return (
    <ThemedView style={styles.flex}>
      {/* Top inset only: the content scrolls under the tab bar, and iOS adds
          just enough end padding for the last field to clear it. */}
      <SafeAreaView style={styles.flex} edges={['top']}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
          showsUserLocation
          showsCompass={false}>
          {mode === 'plan' && destination ? (
            <Marker coordinate={destination} title={destinationQuery} pinColor={theme.accent} />
          ) : null}
          {mode === 'plan' && origin ? <Marker coordinate={origin} title="Start" pinColor={theme.success} /> : null}
          {mode === 'plan' && selectedRoute ? (
            <Polyline
              coordinates={selectedRoute.coordinates}
              strokeColor={routeChoice === 'scenic' ? theme.accent : theme.textSecondary}
              strokeWidth={5}
            />
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

        {/* The inputs sit under a fixed map, so the keyboard would otherwise
            cover the lower ones (Ask About a Place). This makes iOS pad the
            list by the keyboard's height and scroll the focused field into
            view; "handled" lets Go/Ask buttons work on the first tap while
            the keyboard is up. */}
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled">

          {mode === 'plan' ? (
            <>
              <ThemedText type="statLabel" themeColor="textSecondary">
                Get Directions
              </ThemedText>
              <View style={styles.row}>
                <TextInput
                  value={destinationQuery}
                  onChangeText={setDestinationQuery}
                  placeholder="Search a destination"
                  placeholderTextColor={theme.textSecondary}
                  style={[inputStyle, styles.flexInput]}
                  onSubmitEditing={onSearchDestination}
                  returnKeyType="search"
                />
                <PrimaryButton label="Go" onPress={onSearchDestination} loading={searching} style={styles.goButton} />
              </View>
              {searchError ? (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {searchError}
                </ThemedText>
              ) : null}

              {routeOptions ? (
                <>
                  {routeOptions.hasAlternative ? (
                    <SegmentedControl value={routeChoice} options={ROUTE_CHOICE_OPTIONS} onChange={setRouteChoice} />
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      Only one viable route between those points — no scenic/fastest choice this time.
                    </ThemedText>
                  )}
                  <ThemedView type="backgroundElement" style={styles.routeSummary}>
                    <ThemedText type="default">
                      {formatDistance(selectedRoute!.distanceMeters, units)} {distanceUnitLabel(units)} ·{' '}
                      {formatDuration(selectedRoute!.durationSeconds)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {routeChoice === 'scenic'
                        ? 'Picked for the most turns per kilometer among the routes found.'
                        : 'The quickest route OSRM found between those points.'}
                    </ThemedText>
                  </ThemedView>
                  <PrimaryButton label="Open in Maps for Voice-Guided Turn-by-Turn" variant="muted" onPress={onOpenInMaps} />
                </>
              ) : null}

              <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
                Plan a Scenic Ride
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {aiAvailable
                  ? 'For a multi-day trip — fill in what you have, the rest is optional.'
                  : 'Needs Apple Intelligence turned on for this phone.'}
              </ThemedText>
              {!aiAvailable ? (
                <PrimaryButton label="Turn On Apple Intelligence" variant="muted" onPress={onOpenAppleIntelligenceSettings} />
              ) : null}
              <TextInput
                value={tripFrom}
                onChangeText={setTripFrom}
                placeholder="From (optional, e.g. current location)"
                placeholderTextColor={theme.textSecondary}
                editable={aiAvailable}
                style={inputStyle}
              />
              <TextInput
                value={tripTo}
                onChangeText={setTripTo}
                placeholder="To, e.g. Ozark, AR"
                placeholderTextColor={theme.textSecondary}
                editable={aiAvailable}
                style={inputStyle}
              />
              <TextInput
                value={tripDates}
                onChangeText={setTripDates}
                placeholder="Dates (optional, e.g. Oct 16-18)"
                placeholderTextColor={theme.textSecondary}
                editable={aiAvailable}
                style={inputStyle}
              />
              <PrimaryButton
                label="Plan Route"
                onPress={onPlanTrip}
                loading={aiLoading}
                disabled={!aiAvailable || !tripTo.trim()}
              />

              <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
                Ask About a Place
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {aiAvailable
                  ? 'Scenic roads and rider-worthy stops, e.g. “best roads and places to visit near Seattle”'
                  : 'Needs Apple Intelligence turned on for this phone.'}
              </ThemedText>
              {!aiAvailable ? (
                <PrimaryButton label="Turn On Apple Intelligence" variant="muted" onPress={onOpenAppleIntelligenceSettings} />
              ) : null}
              <View style={styles.row}>
                <TextInput
                  value={aiQuery}
                  onChangeText={setAiQuery}
                  placeholder="Ask about a place"
                  placeholderTextColor={theme.textSecondary}
                  editable={aiAvailable}
                  style={[inputStyle, styles.flexInput]}
                  onSubmitEditing={onAskAi}
                  returnKeyType="search"
                />
                <PrimaryButton label="Ask" onPress={onAskAi} loading={aiLoading} disabled={!aiAvailable} style={styles.goButton} />
              </View>

              {aiLoading ? <ActivityIndicator color={theme.text} style={styles.aiLoading} /> : null}
              {aiError ? (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {aiError}
                </ThemedText>
              ) : null}
              {aiAnswer ? (
                <ThemedView type="backgroundElement" style={styles.answerCard}>
                  <ThemedText type="default">{aiAnswer}</ThemedText>
                </ThemedView>
              ) : null}
            </>
          ) : (
            <>
              <ThemedText type="statLabel" themeColor="textSecondary">
                My Roads
              </ThemedText>
              {myRides === null ? (
                <ActivityIndicator color={theme.text} style={styles.aiLoading} />
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
  map: {
    height: 280,
  },
  modeSwitcher: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  flexInput: {
    flex: 1,
  },
  goButton: {
    paddingHorizontal: Spacing.four,
  },
  sectionLabel: {
    marginTop: Spacing.four,
  },
  aiLoading: {
    marginVertical: Spacing.two,
  },
  answerCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  routeSummary: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
