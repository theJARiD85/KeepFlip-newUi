import { APPWRITE, Query, tablesDB } from '@/lib/appwrite';

type UserProfileRow = {
  $id: string;
  onboardingCompletedAt?: string | null;
  [key: string]: unknown;
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

function rowBelongsToUser(row: UserProfileRow, userId: string) {
  if (row.$id === userId) return true;

  return Object.entries(row).some(
    ([key, value]) => !key.startsWith('$') && value === userId,
  );
}

async function findUserProfileRow(userId: string) {
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
  // the account ID by value keeps this compatible without assuming a column name.
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
  if (matches.length === 0 && visibleRows.length === 1) return visibleRows[0];

  throw new Error(
    matches.length > 1
      ? 'KeepFlip found more than one user profile for this account.'
      : 'KeepFlip could not find the signed-in user profile.',
  );
}

export async function hasCompletedScanInventoryWalkthrough(userId: string) {
  assertUserProfilesConfigured();
  const row = await findUserProfileRow(userId);
  return Boolean(
    typeof row.onboardingCompletedAt === 'string'
      ? row.onboardingCompletedAt.trim()
      : row.onboardingCompletedAt,
  );
}

export async function completeScanInventoryWalkthrough(userId: string) {
  assertUserProfilesConfigured();
  const row = await findUserProfileRow(userId);
  if (row.onboardingCompletedAt) return;

  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.userProfilesTableId,
    rowId: row.$id,
    data: {
      onboardingCompletedAt: new Date().toISOString(),
    },
  });
}
