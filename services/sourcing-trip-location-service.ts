import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type {
  LocationObject,
  LocationSubscription,
} from 'expo-location';

export const SOURCING_TRIP_LOCATION_TASK = 'keepflip-sourcing-trip-location';

const TRACKING_STATE_FILE = 'keepflip-active-sourcing-trip-location.json';
const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1_609.344;
const MAX_ACCEPTED_ACCURACY_METERS = 150;
const MAX_REASONABLE_SPEED_METERS_PER_SECOND = 75;
const MIN_DISTANCE_INCREMENT_METERS = 5;

export type SourcingTripLocationTrackingMode = 'background' | 'foreground';

export type SourcingTripLocationSnapshot = {
  sourceTripId: string;
  trackingMode: SourcingTripLocationTrackingMode;
  startedAt: string;
  lastUpdatedAt: string;
  distanceMeters: number;
  locationPointCount: number;
};

export type SourcingTripLocationPreparation = {
  startedAt: string;
  trackingMode: SourcingTripLocationTrackingMode;
  initialLocation: LocationObject;
};

type StoredLocationState = SourcingTripLocationSnapshot & {
  lastLatitude: number;
  lastLongitude: number;
  lastTimestamp: number;
  lastAccuracyMeters: number | null;
};

type LocationTaskData = {
  locations?: LocationObject[];
};

const stateFile = new File(Paths.document, TRACKING_STATE_FILE);
let foregroundSubscription: LocationSubscription | null = null;
let locationUpdateQueue = Promise.resolve();

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveTimestamp(value: unknown) {
  return finiteNumber(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function validTrackingMode(value: unknown): value is SourcingTripLocationTrackingMode {
  return value === 'background' || value === 'foreground';
}

function readStoredState() {
  if (!stateFile.exists) return null;

  try {
    const raw = JSON.parse(stateFile.textSync()) as Partial<StoredLocationState>;
    const sourceTripId = typeof raw.sourceTripId === 'string'
      ? raw.sourceTripId.trim()
      : '';
    const startedAt = typeof raw.startedAt === 'string' ? raw.startedAt : '';
    const lastUpdatedAt =
      typeof raw.lastUpdatedAt === 'string' ? raw.lastUpdatedAt : '';
    const trackingMode = raw.trackingMode;
    const distanceMeters = nonNegativeInteger(raw.distanceMeters);
    const locationPointCount = nonNegativeInteger(raw.locationPointCount);
    const lastLatitude = raw.lastLatitude;
    const lastLongitude = raw.lastLongitude;
    const lastTimestamp = positiveTimestamp(raw.lastTimestamp);
    const lastAccuracyMeters = raw.lastAccuracyMeters == null
      ? null
      : finiteNumber(raw.lastAccuracyMeters) && raw.lastAccuracyMeters >= 0
        ? raw.lastAccuracyMeters
        : null;

    if (
      !sourceTripId ||
      !startedAt ||
      !lastUpdatedAt ||
      !validTrackingMode(trackingMode) ||
      distanceMeters == null ||
      locationPointCount == null ||
      !finiteNumber(lastLatitude) ||
      !finiteNumber(lastLongitude) ||
      lastTimestamp == null
    ) {
      return null;
    }

    return {
      sourceTripId,
      trackingMode,
      startedAt,
      lastUpdatedAt,
      distanceMeters,
      locationPointCount,
      lastLatitude,
      lastLongitude,
      lastTimestamp,
      lastAccuracyMeters,
    } satisfies StoredLocationState;
  } catch {
    return null;
  }
}

function writeStoredState(state: StoredLocationState) {
  if (!stateFile.exists) {
    stateFile.create({ intermediates: true });
  }
  stateFile.write(JSON.stringify(state));
}

function clearStoredState() {
  if (stateFile.exists) stateFile.delete();
}

function toSnapshot(state: StoredLocationState): SourcingTripLocationSnapshot {
  return {
    sourceTripId: state.sourceTripId,
    trackingMode: state.trackingMode,
    startedAt: state.startedAt,
    lastUpdatedAt: state.lastUpdatedAt,
    distanceMeters: state.distanceMeters,
    locationPointCount: state.locationPointCount,
  };
}

function coordinateDistanceMeters(
  leftLatitude: number,
  leftLongitude: number,
  rightLatitude: number,
  rightLongitude: number,
) {
  const latitudeDelta = ((rightLatitude - leftLatitude) * Math.PI) / 180;
  const longitudeDelta = ((rightLongitude - leftLongitude) * Math.PI) / 180;
  const leftLatitudeRadians = (leftLatitude * Math.PI) / 180;
  const rightLatitudeRadians = (rightLatitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitudeRadians) *
      Math.cos(rightLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function validLocation(location: LocationObject) {
  const { coords } = location;
  return (
    !location.mocked &&
    finiteNumber(coords.latitude) &&
    finiteNumber(coords.longitude) &&
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180 &&
    positiveTimestamp(location.timestamp) != null &&
    (coords.accuracy == null ||
      (finiteNumber(coords.accuracy) && coords.accuracy >= 0 && coords.accuracy <= MAX_ACCEPTED_ACCURACY_METERS))
  );
}

function applyLocation(state: StoredLocationState, location: LocationObject) {
  if (!validLocation(location)) return false;

  const timestamp = location.timestamp;
  if (timestamp <= state.lastTimestamp) return false;

  const distanceMeters = coordinateDistanceMeters(
    state.lastLatitude,
    state.lastLongitude,
    location.coords.latitude,
    location.coords.longitude,
  );
  const elapsedSeconds = (timestamp - state.lastTimestamp) / 1_000;

  // Ignore obvious GPS jumps while advancing the anchor so one bad fix does
  // not inflate a tax-mileage record or poison every later segment.
  if (
    elapsedSeconds > 0 &&
    distanceMeters / elapsedSeconds > MAX_REASONABLE_SPEED_METERS_PER_SECOND
  ) {
    state.lastLatitude = location.coords.latitude;
    state.lastLongitude = location.coords.longitude;
    state.lastTimestamp = timestamp;
    state.lastAccuracyMeters = location.coords.accuracy ?? null;
    state.lastUpdatedAt = new Date(timestamp).toISOString();
    return true;
  }

  if (distanceMeters >= MIN_DISTANCE_INCREMENT_METERS) {
    state.distanceMeters += Math.round(distanceMeters);
  }
  state.locationPointCount += 1;
  state.lastLatitude = location.coords.latitude;
  state.lastLongitude = location.coords.longitude;
  state.lastTimestamp = timestamp;
  state.lastAccuracyMeters = location.coords.accuracy ?? null;
  state.lastUpdatedAt = new Date(timestamp).toISOString();
  return true;
}

function queueLocationUpdates(locations: LocationObject[]) {
  locationUpdateQueue = locationUpdateQueue.then(() => {
    const state = readStoredState();
    if (!state) return;

    const orderedLocations = locations
      .filter(validLocation)
      .sort((left, right) => left.timestamp - right.timestamp);
    const changed = orderedLocations.reduce(
      (didChange, location) => applyLocation(state, location) || didChange,
      false,
    );
    if (changed) writeStoredState(state);
  });

  return locationUpdateQueue;
}

if (!TaskManager.isTaskDefined(SOURCING_TRIP_LOCATION_TASK)) {
  TaskManager.defineTask<LocationTaskData>(
    SOURCING_TRIP_LOCATION_TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      await queueLocationUpdates(data.locations);
    },
  );
}

export function sourcingTripMilesFromMeters(meters: number | null | undefined) {
  return Math.max(0, meters ?? 0) / METERS_PER_MILE;
}

export function formatSourcingTripMiles(meters: number | null | undefined) {
  const miles = sourcingTripMilesFromMeters(meters);
  return `${miles.toFixed(1)} mi`;
}

export async function prepareSourcingTripLocationTracking(): Promise<SourcingTripLocationPreparation> {
  if (Platform.OS === 'web') {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();
    if (!foregroundPermission.granted) {
      throw new Error('Location access is required to record sourcing-trip mileage.');
    }
  } else {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();
    if (!foregroundPermission.granted) {
      throw new Error('Allow foreground location access to record sourcing-trip mileage.');
    }
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on device location services before starting a sourcing trip.');
  }

  const backgroundAvailable =
    Platform.OS !== 'web' && (await TaskManager.isAvailableAsync().catch(() => false));
  let trackingMode: SourcingTripLocationTrackingMode = 'foreground';

  if (backgroundAvailable) {
    const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
    if (!backgroundPermission.granted) {
      throw new Error(
        'Allow background location access so KeepFlip can measure the drive while the app is in your pocket.',
      );
    }
    trackingMode = 'background';
  }

  const initialLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: true,
  });

  return {
    startedAt: new Date().toISOString(),
    trackingMode,
    initialLocation,
  };
}

export async function startSourcingTripLocationTracking(
  sourceTripId: string,
  preparation: SourcingTripLocationPreparation,
) {
  const cleanTripId = sourceTripId.trim();
  if (!cleanTripId) throw new Error('The sourcing trip is missing.');

  await stopSourcingTripLocationTracking();
  clearStoredState();

  const initialLocation = preparation.initialLocation;
  const initialTimestamp = positiveTimestamp(initialLocation.timestamp);
  if (!initialTimestamp || !validLocation(initialLocation)) {
    throw new Error('KeepFlip could not establish a reliable starting location.');
  }

  const state: StoredLocationState = {
    sourceTripId: cleanTripId,
    trackingMode: preparation.trackingMode,
    startedAt: preparation.startedAt,
    lastUpdatedAt: new Date(initialTimestamp).toISOString(),
    distanceMeters: 0,
    locationPointCount: 1,
    lastLatitude: initialLocation.coords.latitude,
    lastLongitude: initialLocation.coords.longitude,
    lastTimestamp: initialTimestamp,
    lastAccuracyMeters: initialLocation.coords.accuracy ?? null,
  };
  writeStoredState(state);

  try {
    if (preparation.trackingMode === 'background') {
      if (await Location.hasStartedLocationUpdatesAsync(SOURCING_TRIP_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(SOURCING_TRIP_LOCATION_TASK);
      }
      await Location.startLocationUpdatesAsync(SOURCING_TRIP_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        activityType: Location.ActivityType.AutomotiveNavigation,
        deferredUpdatesDistance: 50,
        deferredUpdatesInterval: 30_000,
        distanceInterval: 20,
        foregroundService: {
          notificationBody: 'KeepFlip is recording mileage for this sourcing trip.',
          notificationColor: '#00AAB5',
          notificationTitle: 'Sourcing trip mileage active',
          killServiceOnDestroy: false,
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        timeInterval: 10_000,
      });
    } else {
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 20,
          timeInterval: 10_000,
        },
        (location) => {
          void queueLocationUpdates([location]);
        },
        () => undefined,
      );
    }
  } catch (error) {
    clearStoredState();
    throw error;
  }

  return toSnapshot(state);
}

export async function getSourcingTripLocationSnapshot(sourceTripId: string) {
  const state = readStoredState();
  return state?.sourceTripId === sourceTripId.trim() ? toSnapshot(state) : null;
}

export async function stopSourcingTripLocationTracking() {
  foregroundSubscription?.remove();
  foregroundSubscription = null;

  if (
    Platform.OS !== 'web' &&
    (await TaskManager.isAvailableAsync().catch(() => false)) &&
    (await Location.hasStartedLocationUpdatesAsync(SOURCING_TRIP_LOCATION_TASK).catch(() => false))
  ) {
    await Location.stopLocationUpdatesAsync(SOURCING_TRIP_LOCATION_TASK);
  }

  await locationUpdateQueue;
  const state = readStoredState();
  return state ? toSnapshot(state) : null;
}

export function clearSourcingTripLocationState() {
  clearStoredState();
}
