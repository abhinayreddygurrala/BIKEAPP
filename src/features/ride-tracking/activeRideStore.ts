import AsyncStorage from '@react-native-async-storage/async-storage';

// The background location task runs independently of any React component
// (it can even be invoked in a fresh JS context after iOS relaunches the app
// to service a location update), so "which ride/segment is currently
// recording" must be read from persistent storage rather than kept in
// memory.
const ACTIVE_RIDE_KEY = 'bikeapp:active-ride-id';
const ACTIVE_SEGMENT_KEY = 'bikeapp:active-ride-segment';

export async function setActiveRideId(rideId: string | null) {
  if (rideId) {
    await AsyncStorage.setItem(ACTIVE_RIDE_KEY, rideId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_RIDE_KEY);
  }
}

export async function getActiveRideId() {
  return AsyncStorage.getItem(ACTIVE_RIDE_KEY);
}

export async function setActiveSegment(segment: number) {
  await AsyncStorage.setItem(ACTIVE_SEGMENT_KEY, String(segment));
}

export async function getActiveSegment() {
  const raw = await AsyncStorage.getItem(ACTIVE_SEGMENT_KEY);
  return raw ? Number(raw) : 0;
}
