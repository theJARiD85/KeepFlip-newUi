import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';

export const SOURCING_TRIP_STATUSES = ['active', 'closed', 'cancelled'] as const;

export const SOURCING_TRIP_LOCATION_STATUSES = [
  'tracking',
  'complete',
  'unavailable',
] as const;

export type SourcingTripStatus = (typeof SOURCING_TRIP_STATUSES)[number];
export type SourcingTripLocationStatus =
  (typeof SOURCING_TRIP_LOCATION_STATUSES)[number];

export type SourcingTrip = {
  id: string;
  ownerId: string;
  status: SourcingTripStatus;
  sourceName: string;
  label: string | null;
  startedAt: string;
  closedAt: string | null;
  budgetCents: number | null;
  receiptTotalCents: number | null;
  receiptFileId: string | null;
  mileageMeters: number | null;
  locationPointCount: number;
  locationTrackingStatus: SourcingTripLocationStatus;
  locationTrackingStartedAt: string | null;
  locationTrackingEndedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourcingTripFind = {
  id: string;
  ownerId: string;
  sourceTripId: string;
  itemId: string;
  itemTitle: string | null;
  allocatedCostCents: number;
  estimatedResaleCents: number | null;
  quantity: number;
  occurredAt: string;
  createdAt: string;
};

export type SourcingTripSummary = {
  trip: SourcingTrip;
  finds: SourcingTripFind[];
  findCount: number;
  unitCount: number;
  allocatedCostCents: number;
  estimatedResaleCents: number;
  estimatedFindCount: number;
  estimatedGrossSpreadCents: number | null;
  receiptVarianceCents: number | null;
};

export type CreateSourcingTripInput = {
  ownerId: string;
  sourceName: string;
  label?: string | null;
  startedAt: string;
  budgetCents?: number | null;
  notes?: string | null;
  mileageMeters?: number | null;
  locationPointCount?: number | null;
  locationTrackingStartedAt?: string | null;
  locationTrackingStatus?: SourcingTripLocationStatus;
};

export type LinkSourcingTripFindInput = {
  ownerId: string;
  sourceTripId: string;
  itemId: string;
  itemTitle?: string | null;
  allocatedCostCents: number;
  estimatedResaleCents?: number | null;
  quantity?: number;
  occurredAt: string;
};

export type CloseSourcingTripInput = {
  ownerId: string;
  sourceTripId: string;
  receiptFileId?: string | null;
  receiptTotalCents?: number | null;
  mileageMeters?: number | null;
  locationPointCount?: number | null;
  locationTrackingStatus?: SourcingTripLocationStatus;
};

type SourcingTripRow = {
  $id: string;
  $createdAt?: string;
  ownerId: string;
  status?: string | null;
  sourceName?: string | null;
  label?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
  budgetCents?: number | null;
  receiptTotalCents?: number | null;
  receiptFileId?: string | null;
  mileageMeters?: number | null;
  locationPointCount?: number | null;
  locationTrackingStatus?: string | null;
  locationTrackingStartedAt?: string | null;
  locationTrackingEndedAt?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SourcingTripFindRow = {
  $id: string;
  $createdAt?: string;
  ownerId: string;
  sourceTripId: string;
  itemId: string;
  itemTitle?: string | null;
  allocatedCostCents?: number | null;
  estimatedResaleCents?: number | null;
  quantity?: number | null;
  occurredAt?: string | null;
  createdAt?: string | null;
};

const PAGE_SIZE = 100;
const MAX_TRIP_FINDS = 2_000;
const MAX_CENTS = 1_000_000_000;
const MAX_MILEAGE_METERS = 10_000_000;
const MAX_LOCATION_POINTS = 1_000_000;

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function cleanText(value: string | null | undefined, maximumLength: number) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function validDate(value: string | null | undefined) {
  const date = new Date(value ?? '');
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validNonNegativeCents(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_CENTS
    ? Number(value)
    : null;
}

function validPositiveCents(value: unknown) {
  const cents = validNonNegativeCents(value);
  return cents != null && cents > 0 ? cents : null;
}

function validQuantity(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 100_000
    ? Number(value)
    : 1;
}

function validStatus(value: string | null | undefined): value is SourcingTripStatus {
  return (SOURCING_TRIP_STATUSES as readonly string[]).includes(value ?? '');
}

function validLocationTrackingStatus(
  value: string | null | undefined,
): value is SourcingTripLocationStatus {
  return (SOURCING_TRIP_LOCATION_STATUSES as readonly string[]).includes(
    value ?? '',
  );
}

function validNonNegativeMeters(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_MILEAGE_METERS
    ? Number(value)
    : null;
}

function validLocationPointCount(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_LOCATION_POINTS
    ? Number(value)
    : null;
}

function missingConfigurationKeys() {
  return [
    !APPWRITE.databaseId ? 'EXPO_PUBLIC_APPWRITE_DATABASE_ID' : null,
    !APPWRITE.sourcingTripsTableId
      ? 'EXPO_PUBLIC_APPWRITE_SOURCING_TRIPS_TABLE_ID'
      : null,
    !APPWRITE.sourcingTripFindsTableId
      ? 'EXPO_PUBLIC_APPWRITE_SOURCING_TRIP_FINDS_TABLE_ID'
      : null,
  ].filter((value): value is string => Boolean(value));
}

export class SourcingTripSetupError extends Error {
  constructor() {
    super(
      'Sourcing Trips needs its Appwrite trip and trip-find tables before a trip can be started.',
    );
    this.name = 'SourcingTripSetupError';
  }
}

export function isSourcingTripsConfigured() {
  return missingConfigurationKeys().length === 0;
}

function assertSourcingTripsConfigured() {
  if (!isSourcingTripsConfigured()) throw new SourcingTripSetupError();
}

function rowToSourcingTrip(row: SourcingTripRow): SourcingTrip {
  const createdAt = validDate(row.createdAt) ?? row.$createdAt ?? new Date(0).toISOString();
  const updatedAt = validDate(row.updatedAt) ?? createdAt;

  return {
    id: row.$id,
    ownerId: cleanText(row.ownerId, 64) ?? '',
    status: validStatus(row.status) ? row.status : 'closed',
    sourceName: cleanText(row.sourceName, 120) ?? 'Unlabeled source',
    label: cleanText(row.label, 160),
    startedAt: validDate(row.startedAt) ?? createdAt,
    closedAt: validDate(row.closedAt),
    budgetCents: validNonNegativeCents(row.budgetCents),
    receiptTotalCents: validNonNegativeCents(row.receiptTotalCents),
    receiptFileId: cleanText(row.receiptFileId, 64),
    mileageMeters: validNonNegativeMeters(row.mileageMeters),
    locationPointCount: validLocationPointCount(row.locationPointCount) ?? 0,
    locationTrackingStatus: validLocationTrackingStatus(row.locationTrackingStatus)
      ? row.locationTrackingStatus
      : 'unavailable',
    locationTrackingStartedAt: validDate(row.locationTrackingStartedAt),
    locationTrackingEndedAt: validDate(row.locationTrackingEndedAt),
    notes: cleanText(row.notes, 2_000),
    createdAt,
    updatedAt,
  };
}

function rowToSourcingTripFind(row: SourcingTripFindRow): SourcingTripFind {
  const createdAt = validDate(row.createdAt) ?? row.$createdAt ?? new Date(0).toISOString();
  return {
    id: row.$id,
    ownerId: cleanText(row.ownerId, 64) ?? '',
    sourceTripId: cleanText(row.sourceTripId, 64) ?? '',
    itemId: cleanText(row.itemId, 64) ?? '',
    itemTitle: cleanText(row.itemTitle, 240),
    allocatedCostCents: validPositiveCents(row.allocatedCostCents) ?? 0,
    estimatedResaleCents: validPositiveCents(row.estimatedResaleCents),
    quantity: validQuantity(row.quantity),
    occurredAt: validDate(row.occurredAt) ?? createdAt,
    createdAt,
  };
}

function normalizeOwnerId(ownerId: string) {
  const normalized = ownerId.trim();
  if (!normalized) throw new Error('Sign in before starting a sourcing trip.');
  return normalized;
}

function normalizeTripId(sourceTripId: string) {
  const normalized = sourceTripId.trim();
  if (!normalized) throw new Error('The sourcing trip is missing.');
  return normalized;
}

function normalizeItemId(itemId: string) {
  const normalized = itemId.trim();
  if (!normalized) throw new Error('The saved inventory item is missing.');
  return normalized;
}

function summaryFor(trip: SourcingTrip, finds: SourcingTripFind[]): SourcingTripSummary {
  const allocatedCostCents = finds.reduce(
    (total, find) => total + find.allocatedCostCents,
    0,
  );
  const estimatedFinds = finds.filter(
    (find) => find.estimatedResaleCents != null,
  );
  const estimatedResaleCents = estimatedFinds.reduce(
    (total, find) => total + (find.estimatedResaleCents ?? 0),
    0,
  );

  return {
    trip,
    finds,
    findCount: finds.length,
    unitCount: finds.reduce((total, find) => total + find.quantity, 0),
    allocatedCostCents,
    estimatedResaleCents,
    estimatedFindCount: estimatedFinds.length,
    estimatedGrossSpreadCents:
      estimatedFinds.length > 0
        ? estimatedResaleCents - allocatedCostCents
        : null,
    receiptVarianceCents:
      trip.receiptTotalCents == null
        ? null
        : trip.receiptTotalCents - allocatedCostCents,
  };
}

async function listTripRows(ownerId: string) {
  const baseQueries = [
    Query.equal('ownerId', [ownerId]),
    Query.limit(PAGE_SIZE),
  ];

  try {
    const response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.sourcingTripsTableId,
      queries: [Query.orderDesc('startedAt'), ...baseQueries],
    })) as unknown as { rows: SourcingTripRow[] };
    return response.rows.map(rowToSourcingTrip);
  } catch {
    const response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.sourcingTripsTableId,
      queries: baseQueries,
    })) as unknown as { rows: SourcingTripRow[] };
    return response.rows
      .map(rowToSourcingTrip)
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      );
  }
}

export async function listSourcingTrips(ownerId: string) {
  assertSourcingTripsConfigured();
  return listTripRows(normalizeOwnerId(ownerId));
}

export async function getSourcingTrip(ownerId: string, sourceTripId: string) {
  assertSourcingTripsConfigured();
  const cleanOwnerId = normalizeOwnerId(ownerId);
  const cleanTripId = normalizeTripId(sourceTripId);
  const row = (await tablesDB.getRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sourcingTripsTableId,
    rowId: cleanTripId,
  })) as unknown as SourcingTripRow;
  const trip = rowToSourcingTrip(row);

  if (trip.ownerId !== cleanOwnerId) {
    throw new Error('That sourcing trip is not available to this account.');
  }
  return trip;
}

export async function listSourcingTripFinds(ownerId: string, sourceTripId: string) {
  assertSourcingTripsConfigured();
  const cleanOwnerId = normalizeOwnerId(ownerId);
  const cleanTripId = normalizeTripId(sourceTripId);
  const finds: SourcingTripFind[] = [];
  let offset = 0;
  let orderAvailable = true;

  while (finds.length < MAX_TRIP_FINDS) {
    const baseQueries = [
      Query.equal('ownerId', [cleanOwnerId]),
      Query.equal('sourceTripId', [cleanTripId]),
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ];
    const queries = orderAvailable
      ? [Query.orderAsc('occurredAt'), ...baseQueries]
      : baseQueries;

    try {
      const response = (await tablesDB.listRows({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.sourcingTripFindsTableId,
        queries,
      })) as unknown as { rows: SourcingTripFindRow[] };
      const page = response.rows.map(rowToSourcingTripFind);
      finds.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    } catch (error) {
      if (orderAvailable) {
        orderAvailable = false;
        continue;
      }
      throw error;
    }
  }

  return finds.sort(
    (left, right) =>
      new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
  );
}

export async function getSourcingTripSummary(
  ownerId: string,
  sourceTripId: string,
) {
  const [trip, finds] = await Promise.all([
    getSourcingTrip(ownerId, sourceTripId),
    listSourcingTripFinds(ownerId, sourceTripId),
  ]);
  return summaryFor(trip, finds);
}

export async function getActiveSourcingTripSummary(ownerId: string) {
  const trips = await listSourcingTrips(ownerId);
  const activeTrip = trips.find((trip) => trip.status === 'active');
  return activeTrip ? getSourcingTripSummary(ownerId, activeTrip.id) : null;
}

export async function createSourcingTrip({
  ownerId,
  sourceName,
  label,
  startedAt,
  budgetCents,
  notes,
  mileageMeters,
  locationPointCount,
  locationTrackingStartedAt,
  locationTrackingStatus,
}: CreateSourcingTripInput) {
  assertSourcingTripsConfigured();
  const cleanOwnerId = normalizeOwnerId(ownerId);
  const cleanSourceName = cleanText(sourceName, 120);
  const cleanStartedAt = validDate(startedAt);
  const cleanBudget =
    budgetCents == null ? null : validNonNegativeCents(budgetCents);
  const cleanMileageMeters =
    mileageMeters == null ? null : validNonNegativeMeters(mileageMeters);
  const cleanLocationPointCount =
    locationPointCount == null ? 0 : validLocationPointCount(locationPointCount);
  const cleanLocationTrackingStartedAt = validDate(
    locationTrackingStartedAt,
  );
  const cleanLocationTrackingStatus = locationTrackingStatus ?? 'unavailable';

  if (!cleanSourceName) throw new Error('Name where you are sourcing first.');
  if (!cleanStartedAt) throw new Error('Enter a valid sourcing date.');
  if (budgetCents != null && cleanBudget == null) {
    throw new Error('Enter a planned spend from $0.00 to $10,000,000.00.');
  }
  if (mileageMeters != null && cleanMileageMeters == null) {
    throw new Error('The sourcing mileage is outside the supported range.');
  }
  if (
    locationPointCount != null &&
    cleanLocationPointCount === null
  ) {
    throw new Error('The sourcing location sample count is invalid.');
  }
  if (
    locationTrackingStartedAt != null &&
    !cleanLocationTrackingStartedAt
  ) {
    throw new Error('The sourcing location start time is invalid.');
  }
  if (!validLocationTrackingStatus(cleanLocationTrackingStatus)) {
    throw new Error('The sourcing location tracking status is invalid.');
  }

  const now = new Date().toISOString();
  const created = (await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sourcingTripsTableId,
    rowId: ID.unique(),
    data: {
      ownerId: cleanOwnerId,
      status: 'active',
      sourceName: cleanSourceName,
      label: cleanText(label, 160),
      startedAt: cleanStartedAt,
      closedAt: null,
      budgetCents: cleanBudget,
      receiptTotalCents: null,
      receiptFileId: null,
      mileageMeters: cleanMileageMeters,
      locationPointCount: cleanLocationPointCount,
      locationTrackingStatus: cleanLocationTrackingStatus,
      locationTrackingStartedAt: cleanLocationTrackingStartedAt,
      locationTrackingEndedAt: null,
      notes: cleanText(notes, 2_000),
      createdAt: now,
      updatedAt: now,
    },
    permissions: ownerPermissions(cleanOwnerId),
  })) as unknown as SourcingTripRow;

  return rowToSourcingTrip(created);
}

export async function linkSourcingTripFind({
  ownerId,
  sourceTripId,
  itemId,
  itemTitle,
  allocatedCostCents,
  estimatedResaleCents,
  quantity,
  occurredAt,
}: LinkSourcingTripFindInput) {
  assertSourcingTripsConfigured();
  const cleanOwnerId = normalizeOwnerId(ownerId);
  const cleanTripId = normalizeTripId(sourceTripId);
  const cleanItemId = normalizeItemId(itemId);
  const cleanOccurredAt = validDate(occurredAt);
  const cleanAllocatedCostCents = validPositiveCents(allocatedCostCents);
  const cleanEstimatedResaleCents =
    estimatedResaleCents == null
      ? null
      : validPositiveCents(estimatedResaleCents);

  if (!cleanOccurredAt) throw new Error('The sourcing date is invalid.');
  if (cleanAllocatedCostCents == null) {
    throw new Error('A sourcing-trip find needs a real allocated cost.');
  }
  if (estimatedResaleCents != null && cleanEstimatedResaleCents == null) {
    throw new Error('The estimated resale signal is invalid.');
  }

  const trip = await getSourcingTrip(cleanOwnerId, cleanTripId);
  if (trip.status !== 'active') {
    throw new Error('Reopen or start a sourcing trip before adding another find.');
  }

  const existingResponse = (await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sourcingTripFindsTableId,
    queries: [
      Query.equal('ownerId', [cleanOwnerId]),
      Query.equal('sourceTripId', [cleanTripId]),
      Query.equal('itemId', [cleanItemId]),
      Query.limit(1),
    ],
  })) as unknown as { rows: SourcingTripFindRow[] };
  const existing = existingResponse.rows[0];
  if (existing) return rowToSourcingTripFind(existing);

  const now = new Date().toISOString();
  const created = (await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sourcingTripFindsTableId,
    rowId: ID.unique(),
    data: {
      ownerId: cleanOwnerId,
      sourceTripId: cleanTripId,
      itemId: cleanItemId,
      itemTitle: cleanText(itemTitle, 240),
      allocatedCostCents: cleanAllocatedCostCents,
      estimatedResaleCents: cleanEstimatedResaleCents,
      quantity: validQuantity(quantity),
      occurredAt: cleanOccurredAt,
      createdAt: now,
    },
    permissions: ownerPermissions(cleanOwnerId),
  })) as unknown as SourcingTripFindRow;

  return rowToSourcingTripFind(created);
}

export async function closeSourcingTrip({
  ownerId,
  sourceTripId,
  receiptFileId,
  receiptTotalCents,
  mileageMeters,
  locationPointCount,
  locationTrackingStatus,
}: CloseSourcingTripInput) {
  assertSourcingTripsConfigured();
  const cleanOwnerId = normalizeOwnerId(ownerId);
  const cleanTripId = normalizeTripId(sourceTripId);
  const cleanReceiptTotal =
    receiptTotalCents == null
      ? null
      : validNonNegativeCents(receiptTotalCents);
  const cleanMileageMeters =
    mileageMeters == null ? null : validNonNegativeMeters(mileageMeters);
  const cleanLocationPointCount =
    locationPointCount == null ? null : validLocationPointCount(locationPointCount);

  if (receiptTotalCents != null && cleanReceiptTotal == null) {
    throw new Error('Enter a receipt total from $0.00 to $10,000,000.00.');
  }
  if (mileageMeters != null && cleanMileageMeters == null) {
    throw new Error('The sourcing mileage is outside the supported range.');
  }
  if (
    locationPointCount != null &&
    cleanLocationPointCount === null
  ) {
    throw new Error('The sourcing location sample count is invalid.');
  }
  if (
    locationTrackingStatus != null &&
    !validLocationTrackingStatus(locationTrackingStatus)
  ) {
    throw new Error('The sourcing location tracking status is invalid.');
  }

  const trip = await getSourcingTrip(cleanOwnerId, cleanTripId);
  if (trip.status !== 'active') return trip;

  const now = new Date().toISOString();
  const updated = (await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sourcingTripsTableId,
    rowId: cleanTripId,
    data: {
      status: 'closed',
      closedAt: now,
      receiptFileId: cleanText(receiptFileId, 64) ?? trip.receiptFileId,
      receiptTotalCents: cleanReceiptTotal,
      mileageMeters: cleanMileageMeters ?? trip.mileageMeters,
      locationPointCount: cleanLocationPointCount ?? trip.locationPointCount,
      locationTrackingStatus:
        locationTrackingStatus ?? trip.locationTrackingStatus,
      locationTrackingEndedAt: now,
      updatedAt: now,
    },
  })) as unknown as SourcingTripRow;

  return rowToSourcingTrip(updated);
}

export async function cancelSourcingTrip({
  ownerId,
  sourceTripId,
}: {
  ownerId: string;
  sourceTripId: string;
}) {
  assertSourcingTripsConfigured();
  const cleanOwnerId = normalizeOwnerId(ownerId);
  const cleanTripId = normalizeTripId(sourceTripId);
  const trip = await getSourcingTrip(cleanOwnerId, cleanTripId);
  if (trip.status !== 'active') return trip;

  const now = new Date().toISOString();
  const updated = (await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sourcingTripsTableId,
    rowId: cleanTripId,
    data: {
      status: 'cancelled',
      closedAt: now,
      locationTrackingStatus: 'unavailable',
      locationTrackingEndedAt: now,
      updatedAt: now,
    },
  })) as unknown as SourcingTripRow;

  return rowToSourcingTrip(updated);
}
