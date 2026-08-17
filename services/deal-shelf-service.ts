import { toItemAnalysisState } from "@/components/scanner/item-analysis-view-model";
import type { ItemAnalysisState } from "@/components/scanner/analysis-visual-types";
import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from "@/lib/appwrite";
import { getSavedScannerPhotoSummary } from "@/services/scan-photo-service";
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  type ItemAnalysisSuccess,
} from "@/types/item-analysis";

const DEAL_SHELF_TTL_MS = 72 * 60 * 60 * 1000;
const DEAL_SHELF_ANALYSIS_SCHEMA_VERSION = 1 as const;
const MAX_ANALYSIS_SNAPSHOT_CHARACTERS = 500_000;

const DEAL_SHELF_SCHEMA_COLUMNS = [
  "ownerId",
  "shelfStatus",
  "title",
  "scanId",
  "analysisSnapshotJson",
  "coverPhotoId",
  "modelFile",
  "photoCount",
  "quickSaleValueCents",
  "targetSaleValueCents",
  "maxBuyPriceCents",
  "currency",
  "decision",
  "valuationLadderLevel",
  "valuationLadderConfidence",
  "expiresAt",
  "createdAt",
  "updatedAt",
  "promotedItemId",
  "promotedAt",
] as const;

const DEAL_SHELF_LIST_COLUMNS = [
  "ownerId",
  "shelfStatus",
  "title",
  "scanId",
  "analysisSnapshotJson",
  "coverPhotoId",
  "modelFile",
  "photoCount",
  "quickSaleValueCents",
  "targetSaleValueCents",
  "maxBuyPriceCents",
  "currency",
  "decision",
  "valuationLadderLevel",
  "valuationLadderConfidence",
  "expiresAt",
  "createdAt",
  "updatedAt",
] as const;

export type DealShelfDecision =
  | "flip"
  | "conditional_flip"
  | "skip"
  | "uncertain"
  | "needs_clarification"
  | "reupload_request"
  | "undetermined";

export type DealShelfStatus =
  | "active"
  | "promoted"
  | "passed"
  | "expired"
  | "archived";

type DealShelfResultState = Extract<
  ItemAnalysisState,
  { status: "result" }
>;

export type DealShelfItem = {
  analysis: ItemAnalysisSuccess;
  coverPhotoId: string | null;
  createdAt: string;
  currency: string;
  decision: DealShelfDecision;
  expiresAt: string;
  id: string;
  ladderConfidence: number | null;
  ladderLevel: string | null;
  modelFile: string | null;
  maxBuyPrice: number | null;
  ownerId: string;
  photoCount: number;
  quickSale: number | null;
  scanId: string;
  shelfStatus: DealShelfStatus;
  state: DealShelfResultState;
  targetSale: number | null;
  title: string;
  updatedAt: string;
};

export type SaveDealShelfItemInput = {
  analysis: ItemAnalysisSuccess;
  modelFile?: string | null;
  ownerId: string;
  scanId: string;
};

type PersistedShelfAnalysisSnapshot = {
  schemaVersion: typeof DEAL_SHELF_ANALYSIS_SCHEMA_VERSION;
  savedAt: string;
  result: ItemAnalysisSuccess;
};

type DealShelfRow = {
  $createdAt?: string;
  $id: string;
  analysisSnapshotJson?: string | null;
  coverPhotoId?: string | null;
  createdAt?: string | null;
  currency?: string | null;
  decision?: string | null;
  expiresAt?: string | null;
  modelFile?: string | null;
  maxBuyPriceCents?: number | null;
  ownerId?: string | null;
  photoCount?: number | null;
  quickSaleValueCents?: number | null;
  scanId?: string | null;
  shelfStatus?: string | null;
  targetSaleValueCents?: number | null;
  title?: string | null;
  updatedAt?: string | null;
  valuationLadderConfidence?: number | null;
  valuationLadderLevel?: string | null;
};

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function cleanText(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function boundedText(
  value: string | null | undefined,
  maximumLength: number,
) {
  return cleanText(value)?.slice(0, maximumLength) || null;
}

function normalizedCurrency(value: string | null | undefined) {
  const currency = cleanText(value)?.toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function normalizedModelFile(value: string | null | undefined) {
  const modelFile = boundedText(value, 16_000);
  if (!modelFile) return null;

  try {
    const parsed = new URL(modelFile);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? modelFile
      : null;
  } catch {
    return null;
  }
}

function normalizedDecision(
  value: string | null | undefined,
): DealShelfDecision {
  if (
    value === "flip" ||
    value === "conditional_flip" ||
    value === "skip" ||
    value === "uncertain" ||
    value === "needs_clarification" ||
    value === "reupload_request"
  ) {
    return value;
  }

  return "undetermined";
}

function normalizedShelfStatus(
  value: string | null | undefined,
): DealShelfStatus {
  return value === "active" ||
    value === "promoted" ||
    value === "passed" ||
    value === "expired" ||
    value === "archived"
    ? value
    : "archived";
}

function normalizedLadderLevel(value: string | null | undefined) {
  return value === "Level 1" ||
    value === "Level 2" ||
    value === "Level 3" ||
    value === "Level 4" ||
    value === "Level 5"
    ? value
    : null;
}

function normalizedConfidence(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, percent)));
}

function centsFromAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return cents <= 2_147_483_647 ? cents : null;
}

function amountFromCents(value: number | null | undefined) {
  const cents = Number(value);
  return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) / 100 : null;
}

function normalizedPhotoCount(value: number | null | undefined) {
  const count = Number(value);
  return Number.isInteger(count) ? Math.max(0, Math.min(21, count)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isItemAnalysisSuccess(value: unknown): value is ItemAnalysisSuccess {
  if (!isRecord(value)) return false;

  return (
    value.ok === true &&
    value.contractVersion === ITEM_ANALYSIS_CONTRACT_VERSION &&
    typeof value.version === "string" &&
    (value.status === "identified" || value.status === "insufficient_evidence") &&
    isRecord(value.input) &&
    isRecord(value.analysis) &&
    isRecord(value.vision) &&
    isRecord(value.valuation)
  );
}

function restoreResultState(analysis: ItemAnalysisSuccess) {
  try {
    const state = toItemAnalysisState(analysis);
    return state.status === "result" ? state : null;
  } catch {
    return null;
  }
}

function serializeAnalysisSnapshot(
  analysis: ItemAnalysisSuccess,
  savedAt: string,
) {
  const snapshot: PersistedShelfAnalysisSnapshot = {
    schemaVersion: DEAL_SHELF_ANALYSIS_SCHEMA_VERSION,
    savedAt,
    result: analysis,
  };
  const serialized = JSON.stringify(snapshot);

  if (serialized.length > MAX_ANALYSIS_SNAPSHOT_CHARACTERS) {
    throw new Error(
      `KeepFlip's normalized deal analysis is too large to save (${serialized.length.toLocaleString()} characters).`,
    );
  }

  return serialized;
}

function parseAnalysisSnapshot(value: string | null | undefined) {
  const serialized = value?.trim();
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== DEAL_SHELF_ANALYSIS_SCHEMA_VERSION) return null;
    return isItemAnalysisSuccess(parsed.result) ? parsed.result : null;
  } catch {
    return null;
  }
}

function titleFromAnalysis(
  analysis: ItemAnalysisSuccess,
  state: DealShelfResultState,
) {
  const identity = analysis.analysis.identification;
  const title = cleanText(state.data.identity.title);
  if (title) return title.slice(0, 180);

  const fallback = [
    identity.brand,
    identity.model,
    identity.itemType,
    identity.category,
  ]
    .map((value) => boundedText(value, 180))
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .slice(0, 180);

  return fallback || "Scanned deal";
}

function assertShelfConfigured() {
  const missing = [
    !APPWRITE.databaseId ? "EXPO_PUBLIC_APPWRITE_DATABASE_ID" : null,
    !APPWRITE.shelfTableId
      ? "EXPO_PUBLIC_APPWRITE_SHELF_TABLE_ID"
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length) {
    throw new Error(
      `KeepFlip Deal Shelf needs Appwrite configuration: ${missing.join(", ")}`,
    );
  }

  return {
    databaseId: APPWRITE.databaseId,
    shelfTableId: APPWRITE.shelfTableId,
  };
}

function isShelfSchemaError(error: unknown) {
  const source = isRecord(error) ? error : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof source?.message === "string"
        ? source.message
        : "";
  const type = typeof source?.type === "string" ? source.type : "";
  const details = `${message} ${type}`.toLowerCase();

  return (
    DEAL_SHELF_SCHEMA_COLUMNS.some((column) =>
      details.includes(column.toLowerCase()),
    ) || /(?:row|document)_invalid_structure|unknown_(?:attribute|column)/i.test(type)
  );
}

function shelfSchemaMigrationError(cause: unknown) {
  const error = new Error(
    `KeepFlip's Appwrite Shelf table needs these columns before a deal can be saved: ${DEAL_SHELF_SCHEMA_COLUMNS.join(", ")}. Run scripts/setup-appwrite-deal-shelf.ps1 after signing in to Appwrite, then retry once the columns are available.`,
  );
  error.name = "DealShelfSchemaMigrationError";
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function isMissingShelfIndexError(cause: unknown) {
  const source = cause as { message?: unknown; type?: unknown } | null;
  const details = [
    cause instanceof Error ? cause.message : null,
    typeof source?.message === "string" ? source.message : null,
    typeof source?.type === "string" ? source.type : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(?:index|indexed|query_invalid)/.test(details);
}

function rowToDealShelfItem(row: DealShelfRow): DealShelfItem | null {
  const ownerId = cleanText(row.ownerId);
  const scanId = cleanText(row.scanId);
  const analysis = parseAnalysisSnapshot(row.analysisSnapshotJson);
  const state = analysis ? restoreResultState(analysis) : null;
  const expiresAt = cleanText(row.expiresAt);
  const createdAt = cleanText(row.createdAt) ?? cleanText(row.$createdAt);

  if (!ownerId || !scanId || !analysis || !state || !expiresAt || !createdAt) {
    return null;
  }

  return {
    analysis,
    coverPhotoId: cleanText(row.coverPhotoId),
    createdAt,
    currency: normalizedCurrency(row.currency),
    decision: normalizedDecision(row.decision),
    expiresAt,
    id: row.$id,
    ladderConfidence: normalizedConfidence(row.valuationLadderConfidence),
    ladderLevel: normalizedLadderLevel(row.valuationLadderLevel),
    modelFile: normalizedModelFile(row.modelFile),
    maxBuyPrice: amountFromCents(row.maxBuyPriceCents),
    ownerId,
    photoCount: normalizedPhotoCount(row.photoCount),
    quickSale: amountFromCents(row.quickSaleValueCents),
    scanId,
    shelfStatus: normalizedShelfStatus(row.shelfStatus),
    state,
    targetSale: amountFromCents(row.targetSaleValueCents),
    title: boundedText(row.title, 180) ?? titleFromAnalysis(analysis, state),
    updatedAt: cleanText(row.updatedAt) ?? createdAt,
  };
}

function shelfData({
  analysis,
  coverPhotoId,
  createdAt,
  modelFile,
  ownerId,
  photoCount,
  scanId,
  state,
  updatedAt,
}: {
  analysis: ItemAnalysisSuccess;
  coverPhotoId: string | null;
  createdAt: string;
  modelFile: string | null;
  ownerId: string;
  photoCount: number;
  scanId: string;
  state: DealShelfResultState;
  updatedAt: string;
}) {
  const valuation = state.data.valuation;
  const market = analysis.marketResearch;
  const decision = normalizedDecision(
    state.data.decisionCard?.kind ??
      market?.decisionCard?.type ??
      market?.flipDecision?.verdict,
  );
  const ladderLevel =
    state.data.valuationLadder?.level ?? market?.valuationLadder?.level ?? null;
  const ladderConfidence = normalizedConfidence(
    state.data.valuationLadder?.confidence ??
      market?.valuationLadder?.confidence,
  );

  return {
    analysisSnapshotJson: serializeAnalysisSnapshot(analysis, updatedAt),
    coverPhotoId,
    createdAt,
    currency: normalizedCurrency(valuation?.currency ?? analysis.valuation.currency),
    decision,
    expiresAt: new Date(
      new Date(updatedAt).getTime() + DEAL_SHELF_TTL_MS,
    ).toISOString(),
    modelFile,
    maxBuyPriceCents: centsFromAmount(market?.acquisitionGuidance?.maxBuyPrice),
    ownerId,
    photoCount,
    quickSaleValueCents: centsFromAmount(
      valuation?.low ?? analysis.valuation.p20,
    ),
    scanId,
    shelfStatus: "active" as const,
    targetSaleValueCents: centsFromAmount(
      valuation?.median ?? analysis.valuation.median,
    ),
    title: titleFromAnalysis(analysis, state),
    updatedAt,
    valuationLadderConfidence: ladderConfidence,
    valuationLadderLevel: normalizedLadderLevel(ladderLevel),
  };
}

async function findShelfRowForScan(
  ownerId: string,
  scanId: string,
): Promise<DealShelfRow | null> {
  const { databaseId, shelfTableId } = assertShelfConfigured();
  const queries = [
    Query.equal("ownerId", [ownerId]),
    Query.equal("scanId", [scanId]),
    Query.limit(1),
  ];

  try {
    const response = await tablesDB.listRows({
      databaseId,
      tableId: shelfTableId,
      queries,
    });
    return (response.rows[0] as unknown as DealShelfRow | undefined) ?? null;
  } catch (cause) {
    if (!isMissingShelfIndexError(cause)) throw cause;

    const response = await tablesDB.listRows({
      databaseId,
      tableId: shelfTableId,
      queries: [Query.equal("ownerId", [ownerId]), Query.limit(100)],
    });
    return (
      (response.rows as unknown as DealShelfRow[]).find(
        (row) => cleanText(row.scanId) === scanId,
      ) ?? null
    );
  }
}

export async function listDealShelfItems(ownerId: string) {
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return [];

  const { databaseId, shelfTableId } = assertShelfConfigured();
  const activeQueries = [
    Query.equal("ownerId", [cleanOwnerId]),
    Query.equal("shelfStatus", ["active"]),
    Query.orderDesc("createdAt"),
    Query.limit(100),
    Query.select([...DEAL_SHELF_LIST_COLUMNS]),
  ];

  let rows: DealShelfRow[];
  try {
    const response = await tablesDB.listRows({
      databaseId,
      tableId: shelfTableId,
      queries: activeQueries,
    });
    rows = response.rows as unknown as DealShelfRow[];
  } catch (cause) {
    if (!isMissingShelfIndexError(cause)) throw cause;

    const response = await tablesDB.listRows({
      databaseId,
      tableId: shelfTableId,
      queries: [
        Query.equal("ownerId", [cleanOwnerId]),
        Query.orderDesc("createdAt"),
        Query.limit(100),
        Query.select([...DEAL_SHELF_LIST_COLUMNS]),
      ],
    });
    rows = response.rows as unknown as DealShelfRow[];
  }

  const now = Date.now();
  return rows
    .map(rowToDealShelfItem)
    .filter((deal): deal is DealShelfItem => {
      if (!deal || deal.shelfStatus !== "active") return false;
      const expiresAt = Date.parse(deal.expiresAt);
      return Number.isFinite(expiresAt) && expiresAt > now;
    })
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
}

export async function saveDealShelfItem(
  input: SaveDealShelfItemInput,
): Promise<DealShelfItem> {
  const { databaseId, shelfTableId } = assertShelfConfigured();
  const ownerId = input.ownerId.trim();
  const scanId = input.scanId.trim();
  if (!ownerId) throw new Error("Sign in before saving a deal.");
  if (!scanId) throw new Error("The completed scan ID is missing.");

  const state = restoreResultState(input.analysis);
  if (!state) {
    throw new Error(
      "KeepFlip needs a completed valuation result before parking this deal.",
    );
  }

  const now = new Date().toISOString();
  let coverPhotoId: string | null = null;
  let photoCount = 0;

  try {
    const photoSummary = await getSavedScannerPhotoSummary(ownerId, scanId);
    coverPhotoId = photoSummary.coverPhotoId;
    photoCount = photoSummary.photoCount;
  } catch {
    // The analysis remains useful even when a legacy or interrupted scanner
    // session has no durable photo row to attach to this shelf record.
  }

  const data = shelfData({
    analysis: input.analysis,
    coverPhotoId,
    createdAt: now,
    modelFile: normalizedModelFile(input.modelFile),
    ownerId,
    photoCount,
    scanId,
    state,
    updatedAt: now,
  });

  let saved: DealShelfRow;
  try {
    const existing = await findShelfRowForScan(ownerId, scanId);
    if (existing) {
      const createdAt = cleanText(existing.createdAt) ?? now;
      saved = (await tablesDB.updateRow({
        databaseId,
        tableId: shelfTableId,
        rowId: existing.$id,
        data: { ...data, createdAt },
        permissions: ownerPermissions(ownerId),
      })) as unknown as DealShelfRow;
    } else {
      saved = (await tablesDB.createRow({
        databaseId,
        tableId: shelfTableId,
        rowId: ID.unique(),
        data,
        permissions: ownerPermissions(ownerId),
      })) as unknown as DealShelfRow;
    }
  } catch (cause) {
    if (isShelfSchemaError(cause)) throw shelfSchemaMigrationError(cause);
    throw cause;
  }

  const deal = rowToDealShelfItem({ ...saved, ...data });
  if (!deal) {
    throw new Error("KeepFlip could not read back the saved deal shelf record.");
  }
  return deal;
}

export async function markDealShelfPromoted({
  dealId,
  itemId,
  ownerId,
}: {
  dealId: string;
  itemId: string;
  ownerId: string;
}) {
  const { databaseId, shelfTableId } = assertShelfConfigured();
  const cleanDealId = dealId.trim();
  const cleanItemId = itemId.trim();
  const cleanOwnerId = ownerId.trim();
  if (!cleanDealId || !cleanItemId || !cleanOwnerId) {
    throw new Error("KeepFlip needs the shelf deal and saved inventory item.");
  }

  await tablesDB.updateRow({
    databaseId,
    tableId: shelfTableId,
    rowId: cleanDealId,
    data: {
      promotedAt: new Date().toISOString(),
      promotedItemId: cleanItemId,
      shelfStatus: "promoted",
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function removeDealShelfItem(ownerId: string, dealId: string) {
  const { databaseId, shelfTableId } = assertShelfConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanDealId = dealId.trim();
  if (!cleanOwnerId || !cleanDealId) return;

  await tablesDB.updateRow({
    databaseId,
    tableId: shelfTableId,
    rowId: cleanDealId,
    data: {
      shelfStatus: "archived",
      updatedAt: new Date().toISOString(),
    },
  });
}
