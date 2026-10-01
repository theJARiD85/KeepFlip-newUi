import {
  APPWRITE,
  getAppwriteCoreServices,
  ID,
  Permission,
  Role,
  tablesDB,
} from '@/lib/appwrite';
import type { CrosslistingMarketplace } from '@/services/crosslisting-service';

export type MarketplaceCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  version?: string;
  expires?: string;
  secure?: boolean;
  httpOnly?: boolean;
};

export type MarketplaceCookieJar = Record<string, MarketplaceCookie>;

export type MarketplaceSession = {
  cookiesJson: string;
  updatedAt: string;
};

type MarketplaceSessionRow = {
  $id: string;
  userId: string;
  marketplace: CrosslistingMarketplace;
  cookiesJson: string;
  isActive: boolean;
  updatedAt: string;
};

const SESSION_ROW_IDS_PREFERENCE_KEY = 'keepflip_marketplace_session_row_ids_v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = error.code;
  return typeof code === 'number' ? code : null;
}

function assertSessionStorageConfigured() {
  if (!APPWRITE.databaseId || !APPWRITE.marketplaceSessionsTableId) {
    throw new Error('Marketplace session storage is not configured in Appwrite.');
  }
}

async function getSessionRowId(
  userId: string,
  marketplace: CrosslistingMarketplace,
  createIfMissing: boolean,
) {
  const { account } = getAppwriteCoreServices();
  const currentUser = await account.get();
  if (currentUser.$id !== userId) {
    throw new Error('Marketplace sessions can only be saved for the signed-in user.');
  }

  const preferences: Record<string, unknown> = isRecord(currentUser.prefs)
    ? currentUser.prefs
    : {};
  const savedIds: Record<string, unknown> = isRecord(
    preferences[SESSION_ROW_IDS_PREFERENCE_KEY],
  )
    ? (preferences[SESSION_ROW_IDS_PREFERENCE_KEY] as Record<string, unknown>)
    : {};
  const savedRowId = savedIds[marketplace];
  if (
    typeof savedRowId === 'string' &&
    /^[a-zA-Z0-9._-]{1,36}$/.test(savedRowId)
  ) {
    return savedRowId;
  }
  if (!createIfMissing) return null;

  const rowId = ID.unique();
  await account.updatePrefs({
    prefs: {
      ...preferences,
      [SESSION_ROW_IDS_PREFERENCE_KEY]: {
        ...savedIds,
        [marketplace]: rowId,
      },
    },
  });
  return rowId;
}

function userRowPermissions(userId: string) {
  return [
    Permission.read(Role.user(userId)),
    Permission.write(Role.user(userId)),
  ];
}

function isMarketplaceCookieJar(value: unknown): value is MarketplaceCookieJar {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (cookie) =>
      cookie !== null &&
      typeof cookie === 'object' &&
      'name' in cookie &&
      typeof cookie.name === 'string' &&
      'value' in cookie &&
      typeof cookie.value === 'string',
  );
}

function parseMarketplaceCookieJar(cookiesJson: string) {
  try {
    const parsed: unknown = JSON.parse(cookiesJson);
    return isMarketplaceCookieJar(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseMarketplaceCookies(cookiesJson: string) {
  return parseMarketplaceCookieJar(cookiesJson);
}

export async function getMarketplaceSession(
  userId: string,
  marketplace: CrosslistingMarketplace,
): Promise<MarketplaceSession | null> {
  assertSessionStorageConfigured();
  if (!userId.trim()) throw new Error('A signed-in KeepFlip user is required.');

  const rowId = await getSessionRowId(userId, marketplace, false);
  if (!rowId) return null;
  try {
    const row = (await tablesDB.getRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.marketplaceSessionsTableId,
      rowId,
    })) as unknown as MarketplaceSessionRow;

    if (
      row.userId !== userId ||
      row.marketplace !== marketplace ||
      !row.isActive ||
      !parseMarketplaceCookieJar(row.cookiesJson)
    ) {
      return null;
    }

    return { cookiesJson: row.cookiesJson, updatedAt: row.updatedAt };
  } catch (error) {
    if (getErrorCode(error) === 404) return null;
    throw error;
  }
}

export async function saveMarketplaceSession({
  userId,
  marketplace,
  cookies,
}: {
  userId: string;
  marketplace: CrosslistingMarketplace;
  cookies: MarketplaceCookieJar;
}) {
  assertSessionStorageConfigured();
  if (!userId.trim()) throw new Error('A signed-in KeepFlip user is required.');
  if (!isMarketplaceCookieJar(cookies) || Object.keys(cookies).length === 0) {
    throw new Error('No marketplace cookies were found for this account.');
  }

  const cookiesJson = JSON.stringify(cookies);
  if (cookiesJson.length > 1_000_000) {
    throw new Error('The marketplace session is larger than KeepFlip can store.');
  }

  const rowId = await getSessionRowId(userId, marketplace, true);
  if (!rowId) throw new Error('KeepFlip could not allocate a marketplace session row.');
  const permissions = userRowPermissions(userId);
  const data = {
    userId,
    marketplace,
    cookiesJson,
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.marketplaceSessionsTableId,
      rowId,
      data,
      permissions,
    });
  } catch (error) {
    if (getErrorCode(error) !== 404) throw error;
    await tablesDB.createRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.marketplaceSessionsTableId,
      rowId,
      data,
      permissions,
    });
  }

  return { updatedAt: data.updatedAt };
}

export async function deleteMarketplaceSession(
  userId: string,
  marketplace: CrosslistingMarketplace,
) {
  assertSessionStorageConfigured();
  if (!userId.trim()) throw new Error('A signed-in KeepFlip user is required.');

  const { account } = getAppwriteCoreServices();
  const currentUser = await account.get();
  if (currentUser.$id !== userId) {
    throw new Error('Marketplace sessions can only be removed by the signed-in user.');
  }

  const preferences: Record<string, unknown> = isRecord(currentUser.prefs)
    ? currentUser.prefs
    : {};
  const savedIds: Record<string, unknown> = isRecord(
    preferences[SESSION_ROW_IDS_PREFERENCE_KEY],
  )
    ? (preferences[SESSION_ROW_IDS_PREFERENCE_KEY] as Record<string, unknown>)
    : {};
  const rowId = savedIds[marketplace];
  if (typeof rowId === 'string' && /^[a-zA-Z0-9._-]{1,36}$/.test(rowId)) {
    try {
      await tablesDB.deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.marketplaceSessionsTableId,
        rowId,
      });
    } catch (error) {
      if (getErrorCode(error) !== 404) throw error;
    }
  }

  const nextSavedIds = { ...savedIds };
  delete nextSavedIds[marketplace];
  await account.updatePrefs({
    prefs: {
      ...preferences,
      [SESSION_ROW_IDS_PREFERENCE_KEY]: nextSavedIds,
    },
  });
}
