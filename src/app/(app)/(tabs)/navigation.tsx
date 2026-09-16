import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askTripPlanner } from '@/services/tripPlannerService';

type Coord = { latitude: number; longitude: number };

export default function NavigationScreen() {
  const theme = useTheme();

  const [destinationQuery, setDestinationQuery] = useState('');
  const [destination, setDestination] = useState<Coord | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [aiQuery, setAiQuery] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const onSearchDestination = async () => {
    if (!destinationQuery.trim()) return;
    setSearchError(null);
    setSearching(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setSearchError('Location access is required to plan a route.');
        return;
      }
      const results = await Location.geocodeAsync(destinationQuery.trim());
      if (!results[0]) {
        setSearchError('Could not find that place.');
        setDestination(null);
        return;
      }
      setDestination({ latitude: results[0].latitude, longitude: results[0].longitude });
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const onOpenInMaps = () => {
    if (!destination) return;
    Linking.openURL(`http://maps.apple.com/?daddr=${destination.latitude},${destination.longitude}&dirflg=d`);
  };

  const onAskAi = async () => {
    if (!aiQuery.trim()) return;
    setAiError(null);
    setAiAnswer(null);
    setAiLoading(true);
    try {
      setAiAnswer(await askTripPlanner(aiQuery.trim()));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to get an answer');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <MapView
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          userInterfaceStyle="dark"
          showsUserLocation
          showsCompass={false}>
          {destination ? <Marker coordinate={destination} title={destinationQuery} pinColor={theme.accent} /> : null}
        </MapView>

        <ScrollView contentContainerStyle={styles.content}>
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
            <PrimaryButton
              label="Go"
              onPress={onSearchDestination}
              loading={searching}
              style={styles.goButton}
            />
          </View>
          {searchError ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {searchError}
            </ThemedText>
          ) : null}
          {destination ? (
            <PrimaryButton label="Open in Maps for Turn-by-Turn" variant="muted" onPress={onOpenInMaps} />
          ) : null}

          <ThemedText type="statLabel" themeColor="textSecondary" style={styles.sectionLabel}>
            Ask About a Place
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Scenic roads and rider-worthy stops, e.g. &ldquo;best roads and places to visit near Seattle&rdquo;
          </ThemedText>
          <View style={styles.row}>
            <TextInput
              value={aiQuery}
              onChangeText={setAiQuery}
              placeholder="Ask about a place"
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.flexInput]}
              onSubmitEditing={onAskAi}
              returnKeyType="search"
            />
            <PrimaryButton label="Ask" onPress={onAskAi} loading={aiLoading} style={styles.goButton} />
          </View>

          {aiLoading ? <ActivityIndicator color="#fff" style={styles.aiLoading} /> : null}
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
});
