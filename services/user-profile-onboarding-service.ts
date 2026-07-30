import {
  APPWRITE,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';

type UserProfileRow = {
  $id: string;
  createdAt?: string;
  defaultCurrency?: string;
  displayName?: string | null;
  onboardingCompletedAt?: string | null;
  updatedAt?: string;
  userId?: string;
  [key: string]: unknown;
};

type EnsureUserProfileInput = {
  displayName?: string | null;
  userId: string;
};

function assertUserProfilesConfigured() {
  const missing = [
    !APPWRITE.databaseId ? 'EXPO_PUBLIC_APPWRITE_DATABASE_ID' : null,
    !APPWRITE.userProfilesTableId
      ? 'EXPO_PUBLIC_APPWRITE_USER_PROFILES_COLLECTION_ID'
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length) {
    throw new Error(
      `KeepFlip onboarding needs Appwrite configuration: ${missing.join(', ')}`,
    );
  }
}

function isNotFoundError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return Number((error as { code?: unknown }).code) === 404;
}

function isConflictError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return Number((error as { code?: unknown }).code) === 409;
}

function profilePermissions(userId: string) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

function rowBelongsToUser(row: UserProfileRow, userId: string) {
  if (row.$id === userId) return true;

  return row.userId === userId;
}

async function maybeFindUserProfileRow(userId: string) {
  const cleanUserId = userId.trim();
  if (!cleanUserId) throw new Error('Sign in before opening onboarding.');

  try {
    return (await tablesDB.getRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.userProfilesTableId,
      rowId: cleanUserId,
    })) as unknown as UserProfileRow;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  // Some existing KeepFlip profiles predate the user-id-as-row-id convention.
  // Row permissions normally expose only the signed-in user's profile. Matching
  // the stored userId keeps those rows compatible with the current convention.
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.userProfilesTableId,
    queries: [Query.limit(100)],
    total: false,
  });
  const visibleRows = response.rows as unknown as UserProfileRow[];
  const matches = visibleRows.filter((row) =>
    rowBelongsToUser(row, cleanUserId),
  );

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    throw new Error(
      'KeepFlip found more than one user profile for this account.',
    );
  }

  return null;
}

async function findUserProfileRow(userId: string) {
  const row = await maybeFindUserProfileRow(userId);
  if (row) return row;

  throw new Error('KeepFlip could not find the signed-in user profile.');
}

export async function ensureUserProfile({
  displayName,
  userId,
}: EnsureUserProfileInput) {
  assertUserProfilesConfigured();
  const cleanUserId = userId.trim();
  if (!cleanUserId) throw new Error('Sign in before creating a user profile.');

  const existing = await maybeFindUserProfileRow(cleanUserId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const cleanDisplayName = displayName?.replace(/\s+/g, ' ').trim().slice(0, 100);

  try {
    return (await tablesDB.createRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.userProfilesTableId,
      rowId: cleanUserId,
      data: {
        userId: cleanUserId,
        ...(cleanDisplayName ? { displayName: cleanDisplayName } : {}),
        defaultCurrency: 'USD',
        createdAt: now,
        updatedAt: now,
      },
      permissions: profilePermissions(cleanUserId),
    })) as unknown as UserProfileRow;
  } catch (error) {
    // Account bootstrap and the route-level guard can race on the first render.
    // Treat a row created by the other request as success.
    if (isConflictError(error)) {
      return findUserProfileRow(cleanUserId);
    }
    throw error;
  }
}

export async function hasCompletedScanInventoryWalkthrough(
  userId: string,
  displayName?: string | null,
) {
  const row = await ensureUserProfile({ displayName, userId });
  return Boolean(
    typeof row.onboardingCompletedAt === 'string'
      ? row.onboardingCompletedAt.trim()
      : row.onboardingCompletedAt,
  );
}

export async function completeScanInventoryWalkthrough(
  userId: string,
  displayName?: string | null,
) {
  const row = await ensureUserProfile({ displayName, userId });
  if (row.onboardingCompletedAt) return;
  const completedAt = new Date().toISOString();

  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.userProfilesTableId,
    rowId: row.$id,
    data: {
      onboardingCompletedAt: completedAt,
      updatedAt: completedAt,
    },
  });
}
