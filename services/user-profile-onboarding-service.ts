import {
  APPWRITE,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';
import {
  normalizeResellerBuyRules,
  type ResellerBuyRules,
  type ResellerBuyRulesInput,
} from '@/services/reseller-buy-rules-service';

export const USER_PROFILE_BUY_RULES_COLUMN = 'resellerBuyRulesJson';
export const USER_PROFILE_TRIALING_COLUMN = 'isTrialing';
export const USER_PROFILE_TRIAL_END_DATE_COLUMN = 'trialEndDate';

const PROFILE_TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type UserProfileRow = {
  $id: string;
  createdAt?: string;
  defaultCurrency?: string;
  displayName?: string | null;
  ebaySellerProfileId?: string | null;
  isTrialing?: boolean;
  onboardingCompletedAt?: string | null;
  resellerBuyRulesJson?: string | null;
  trialDeviceIdHash?: string | null;
  trialEndDate?: string | null;
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

function isProfileSchemaError(error: unknown) {
  const source =
    typeof error === 'object' && error !== null
      ? (error as { message?: unknown; type?: unknown })
      : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof source?.message === 'string'
        ? source.message
        : '';
  const type = typeof source?.type === 'string' ? source.type : '';
  const details = (message + ' ' + type).toLowerCase();

  return (
    details.includes(USER_PROFILE_BUY_RULES_COLUMN.toLowerCase()) ||
    details.includes(USER_PROFILE_TRIALING_COLUMN.toLowerCase()) ||
    details.includes(USER_PROFILE_TRIAL_END_DATE_COLUMN.toLowerCase()) ||
    /(?:row|document)_invalid_structure|unknown_(?:attribute|column)/i.test(
      type,
    )
  );
}

function userProfileSchemaMigrationError(cause: unknown) {
  const error = new Error(
    "KeepFlip's user_profiles table is missing a required profile column. " +
      'It needs resellerBuyRulesJson, isTrialing, and trialEndDate to be Available before the app can save this profile. ' +
      'Follow docs/USER_PROFILE_TRIAL_APPWRITE_SCHEMA.md, then retry.',
  );
  error.name = 'UserProfileSchemaMigrationError';
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
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

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const trialEndDate = new Date(
    nowDate.getTime() + PROFILE_TRIAL_DURATION_MS,
  ).toISOString();
  const cleanDisplayName = displayName?.replace(/\s+/g, ' ').trim().slice(0, 100);

  try {
    return (await tablesDB.createRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.userProfilesTableId,
      rowId: cleanUserId,
      data: {
        userId: cleanUserId,
        // Appwrite requires this field, while new auth accounts can have no
        // display name yet. The user can still personalize it later.
        displayName: cleanDisplayName || 'KeepFlip Reseller',
        defaultCurrency: 'USD',
        createdAt: now,
        // Let a first-run profile honestly reflect its seven-day trial right
        // away. The Subscription Police Function recomputes and locks the
        // authoritative cutoff from Appwrite's server-created $createdAt.
        isTrialing: true,
        trialEndDate,
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
    if (isProfileSchemaError(error)) {
      throw userProfileSchemaMigrationError(error);
    }
    throw error;
  }
}

function parseResellerBuyRules(value: unknown): ResellerBuyRules | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    return normalizeResellerBuyRules(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

export async function getResellerBuyRules(
  userId: string,
  displayName?: string | null,
) {
  const row = await ensureUserProfile({ displayName, userId });
  return parseResellerBuyRules(row.resellerBuyRulesJson);
}

export async function hasCompletedScanInventoryWalkthrough(
  userId: string,
  displayName?: string | null,
) {
  const row = await ensureUserProfile({ displayName, userId });
  const hasCompletedWalkthrough = Boolean(
    typeof row.onboardingCompletedAt === 'string'
      ? row.onboardingCompletedAt.trim()
      : row.onboardingCompletedAt,
  );

  return hasCompletedWalkthrough && Boolean(
    parseResellerBuyRules(row.resellerBuyRulesJson),
  );
}

export async function completeScanInventoryWalkthrough(
  userId: string,
  displayName?: string | null,
  buyRules?: ResellerBuyRulesInput,
) {
  const row = await ensureUserProfile({ displayName, userId });
  const normalizedBuyRules = normalizeResellerBuyRules(buyRules);
  if (!normalizedBuyRules) {
    throw new Error('Choose valid Buy Rules before finishing onboarding.');
  }

  const completedAt = new Date().toISOString();
  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.userProfilesTableId,
      rowId: row.$id,
      data: {
        onboardingCompletedAt:
          typeof row.onboardingCompletedAt === 'string' &&
          row.onboardingCompletedAt.trim()
            ? row.onboardingCompletedAt
            : completedAt,
        [USER_PROFILE_BUY_RULES_COLUMN]: JSON.stringify(normalizedBuyRules),
        updatedAt: completedAt,
      },
    });
  } catch (error) {
    if (isProfileSchemaError(error)) {
      throw userProfileSchemaMigrationError(error);
    }
    throw error;
  }
}
