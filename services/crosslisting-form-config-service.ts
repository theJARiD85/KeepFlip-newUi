import { APPWRITE, Query, tablesDB } from '@/lib/appwrite';
import type {
  CrosslistingFormSelectors,
  CrosslistingMarketplace,
} from '@/services/crosslisting-service';

const CONFIG_CACHE_MS = 60_000;
const MAX_SELECTORS_PER_FIELD = 12;
const MAX_SELECTOR_LENGTH = 240;
type FormConfigRow = {
  enabled?: unknown;
  selectorsJson?: unknown;
};

export type CrosslistingFormConfig = {
  enabled: boolean;
  selectors: CrosslistingFormSelectors;
};

type CachedConfig = {
  expiresAt: number;
  config: CrosslistingFormConfig;
};

const configCache = new Map<CrosslistingMarketplace, CachedConfig>();

function validateSelectors(value: unknown): CrosslistingFormSelectors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  const selectors: CrosslistingFormSelectors = {};
  for (const [field, candidate] of Object.entries(source)) {
    if (
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(field) ||
      field === 'constructor' ||
      field === 'prototype'
    ) continue;
    if (!Array.isArray(candidate)) continue;
    const valid = candidate
      .filter(
        (selector): selector is string =>
          typeof selector === 'string' &&
          selector.trim().length > 0 &&
          selector.length <= MAX_SELECTOR_LENGTH,
      )
      .slice(0, MAX_SELECTORS_PER_FIELD);
    if (valid.length) selectors[field] = valid;
  }
  return selectors;
}

/**
 * Reads non-secret marketplace DOM selectors. The app ships working defaults,
 * so a missing table, empty row, or network failure never blocks listing prep.
 */
export async function getCrosslistingFormConfig(
  marketplace: CrosslistingMarketplace,
): Promise<CrosslistingFormConfig> {
  const cached = configCache.get(marketplace);
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  if (!APPWRITE.databaseId || !APPWRITE.marketplaceFormConfigsTableId) {
    return cached?.config ?? { enabled: true, selectors: {} };
  }

  try {
    const response = await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.marketplaceFormConfigsTableId,
      queries: [
        Query.equal('marketplace', [marketplace]),
        Query.limit(1),
      ],
    });
    const row = response.rows[0] as unknown as FormConfigRow | undefined;
    if (!row) {
      const fallback = { enabled: true, selectors: {} } satisfies CrosslistingFormConfig;
      configCache.set(marketplace, {
        expiresAt: Date.now() + CONFIG_CACHE_MS,
        config: fallback,
      });
      return fallback;
    }

    const enabled = row.enabled !== false;
    const selectors = enabled && typeof row.selectorsJson === 'string'
      ? validateSelectors(JSON.parse(row.selectorsJson))
      : {};
    const config = { enabled, selectors } satisfies CrosslistingFormConfig;
    configCache.set(marketplace, {
      expiresAt: Date.now() + CONFIG_CACHE_MS,
      config,
    });
    return config;
  } catch {
    return cached?.config ?? { enabled: true, selectors: {} };
  }
}
