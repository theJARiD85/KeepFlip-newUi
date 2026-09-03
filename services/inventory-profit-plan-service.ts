import { APPWRITE, tablesDB } from '@/lib/appwrite';
import {
  PROFIT_MARKETPLACE_IDS,
  type ProfitCalculatorInput,
  type ProfitMarketplaceId,
} from '@/lib/reseller-profit-calculator';
import {
  createManualLedgerEntry,
  isResellerBooksConfigured,
  type ResellerLedgerEntryType,
} from '@/services/reseller-ledger-service';
import {
  isResellerBookkeepingConfigured,
  recordBookkeepingEvent,
  type BookkeepingEventType,
} from '@/services/reseller-bookkeeping-service';

const PROFIT_PLAN_SCHEMA_VERSION = 1 as const;
const PROFIT_PLAN_COLUMN = 'profitPlanJson';
const MAX_MONEY_CENTS = 1_000_000_000;
const MAX_PACKAGE_WEIGHT_OZ = 1_000_000;

export type InventoryProfitPlanRecord = {
  schemaVersion: typeof PROFIT_PLAN_SCHEMA_VERSION;
  marketplaceId: ProfitMarketplaceId;
  inputs: ProfitCalculatorInput;
  savedAt: string;
  bookedExpenseCents: {
    costOfGoods: number;
    outboundShipping: number;
    prepAndRepair: number;
  };
  cogsManagedByProfitPlan: boolean;
};

export type LoadInventoryProfitPlanResult = {
  acquisitionCost: number | null;
  plan: InventoryProfitPlanRecord | null;
};

export type SaveInventoryProfitPlanInput = {
  inputs: ProfitCalculatorInput;
  itemId: string;
  marketplaceId: ProfitMarketplaceId;
  ownerId: string;
};

export type SaveInventoryProfitPlanResult = {
  plan: InventoryProfitPlanRecord;
  recordedExpenseCount: number;
  warnings: string[];
};

type ProfitPlanRow = {
  $id: string;
  ownerId: string;
  acquisitionCostCents?: number | null;
  inventoryCostCentsOnHand?: number | null;
  profitPlanJson?: string | null;
};

type ExpenseField = keyof InventoryProfitPlanRecord['bookedExpenseCents'];

type ExpenseDefinition = {
  advancedType: BookkeepingEventType;
  field: ExpenseField;
  label: string;
  legacyType: ResellerLedgerEntryType;
};

const EXPENSE_DEFINITIONS: readonly ExpenseDefinition[] = [
  {
    advancedType: 'inventory_purchase',
    field: 'costOfGoods',
    label: 'COGS / inventory purchase',
    legacyType: 'inventory_purchase',
  },
  {
    advancedType: 'shipping_label',
    field: 'outboundShipping',
    label: 'Shipping label',
    legacyType: 'shipping_label',
  },
  {
    advancedType: 'repair_parts',
    field: 'prepAndRepair',
    label: 'Prep / repair',
    legacyType: 'repair_parts',
  },
] as const;

function assertConfigured() {
  if (!APPWRITE.databaseId || !APPWRITE.itemsTableId) {
    throw new Error(
      'KeepFlip inventory is not configured in this build. Add the Appwrite database and items table IDs before saving Max Profit numbers.',
    );
  }
}

function cleanId(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(label);
  return cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMarketplaceId(value: unknown): value is ProfitMarketplaceId {
  return (
    typeof value === 'string' &&
    (PROFIT_MARKETPLACE_IDS as readonly string[]).includes(value)
  );
}

function boundedNumber(value: unknown, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(number, maximum);
}

function normalizedMoney(value: unknown) {
  return Math.round(boundedNumber(value, MAX_MONEY_CENTS / 100) * 100) / 100;
}

function normalizedInput(input: ProfitCalculatorInput): ProfitCalculatorInput {
  return {
    targetSalePrice: normalizedMoney(input.targetSalePrice),
    buyerPaidShipping: normalizedMoney(input.buyerPaidShipping),
    costOfGoods: normalizedMoney(input.costOfGoods),
    outboundShipping: normalizedMoney(input.outboundShipping),
    prepAndRepair: normalizedMoney(input.prepAndRepair),
    returnReserve: normalizedMoney(input.returnReserve),
    packageWeightOz:
      Math.round(boundedNumber(input.packageWeightOz, MAX_PACKAGE_WEIGHT_OZ) * 100) /
      100,
    customFeePercent:
      Math.round(boundedNumber(input.customFeePercent, 100) * 10_000) / 10_000,
    customFixedFee: normalizedMoney(input.customFixedFee),
  };
}

function moneyCents(value: number) {
  return Math.max(0, Math.min(MAX_MONEY_CENTS, Math.round(value * 100)));
}

function storedCents(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, MAX_MONEY_CENTS)
    : 0;
}

function amountFromCents(value: unknown) {
  const cents = storedCents(value);
  return cents > 0 ? cents / 100 : null;
}

function expenseCentsFromInputs(inputs: ProfitCalculatorInput) {
  return {
    costOfGoods: moneyCents(inputs.costOfGoods),
    outboundShipping: moneyCents(inputs.outboundShipping),
    prepAndRepair: moneyCents(inputs.prepAndRepair),
  };
}

function emptyBookedExpenseCents() {
  return {
    costOfGoods: 0,
    outboundShipping: 0,
    prepAndRepair: 0,
  };
}

function parseProfitPlan(value: unknown): InventoryProfitPlanRecord | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schemaVersion !== PROFIT_PLAN_SCHEMA_VERSION) {
      return null;
    }
    if (!isMarketplaceId(parsed.marketplaceId) || !isRecord(parsed.inputs)) {
      return null;
    }

    const rawInputs = parsed.inputs as unknown as ProfitCalculatorInput;
    const rawBooked = isRecord(parsed.bookedExpenseCents)
      ? parsed.bookedExpenseCents
      : {};

    return {
      schemaVersion: PROFIT_PLAN_SCHEMA_VERSION,
      marketplaceId: parsed.marketplaceId,
      inputs: normalizedInput(rawInputs),
      savedAt:
        typeof parsed.savedAt === 'string' && parsed.savedAt.trim()
          ? parsed.savedAt
          : new Date(0).toISOString(),
      bookedExpenseCents: {
        costOfGoods: storedCents(rawBooked.costOfGoods),
        outboundShipping: storedCents(rawBooked.outboundShipping),
        prepAndRepair: storedCents(rawBooked.prepAndRepair),
      },
      cogsManagedByProfitPlan: parsed.cogsManagedByProfitPlan === true,
    };
  } catch {
    return null;
  }
}

function serializedPlan(plan: InventoryProfitPlanRecord) {
  return JSON.stringify(plan);
}

function schemaMigrationError(cause: unknown) {
  const source = cause as { message?: unknown; type?: unknown } | null;
  const detail = [
    cause instanceof Error ? cause.message : null,
    typeof source?.message === 'string' ? source.message : null,
    typeof source?.type === 'string' ? source.type : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (
    detail.toLowerCase().includes(PROFIT_PLAN_COLUMN.toLowerCase()) ||
    /(?:row|document)_invalid_structure|unknown_(?:attribute|column)/i.test(detail)
  ) {
    const error = new Error(
      'Add an optional Appwrite string column named profitPlanJson to the items table (12,000 characters or more), wait for the column to become available, then tap Punch in numbers again.',
    );
    error.name = 'InventoryProfitPlanSchemaMigrationError';
    (error as Error & { cause?: unknown }).cause = cause;
    return error;
  }

  return cause;
}

async function getOwnedRow(ownerId: string, itemId: string) {
  const row = (await tablesDB.getRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
  })) as unknown as ProfitPlanRow;

  if (row.ownerId !== ownerId) {
    throw new Error('This inventory item is not available to the signed-in account.');
  }

  return row;
}

function expenseValue(
  field: ExpenseField,
  desired: ReturnType<typeof expenseCentsFromInputs>,
) {
  return desired[field];
}

async function recordExpenseIncrease({
  definition,
  desiredCents,
  itemId,
  ownerId,
  previousCents,
  occurredAt,
}: {
  definition: ExpenseDefinition;
  desiredCents: number;
  itemId: string;
  ownerId: string;
  previousCents: number;
  occurredAt: string;
}) {
  const deltaCents = desiredCents - previousCents;
  if (deltaCents <= 0) return false;

  const notes =
    `Recorded from Max Profit / Punch in numbers. ` +
    `This entry brings the item-specific ${definition.label.toLowerCase()} total to $${(
      desiredCents / 100
    ).toFixed(2)}.`;

  if (isResellerBookkeepingConfigured()) {
    await recordBookkeepingEvent({
      amountCents: deltaCents,
      eventType: definition.advancedType,
      idempotencyKey: `max-profit:${itemId}:${definition.field}:to:${desiredCents}`,
      itemId,
      notes,
      occurredAt,
      summary: `Max Profit · ${definition.label}`,
    });
    return true;
  }

  if (isResellerBooksConfigured()) {
    await createManualLedgerEntry({
      amountCents: deltaCents,
      channel: 'Max Profit',
      entryType: definition.legacyType,
      itemId,
      notes,
      occurredAt,
      ownerId,
    });
    return true;
  }

  return false;
}

export async function loadInventoryProfitPlan({
  itemId,
  ownerId,
}: {
  itemId: string;
  ownerId: string;
}): Promise<LoadInventoryProfitPlanResult> {
  assertConfigured();
  const cleanOwnerId = cleanId(ownerId, 'Sign in before loading saved Max Profit numbers.');
  const cleanItemId = cleanId(itemId, 'The inventory item ID is missing.');
  const row = await getOwnedRow(cleanOwnerId, cleanItemId);

  return {
    acquisitionCost: amountFromCents(row.acquisitionCostCents),
    plan: parseProfitPlan(row.profitPlanJson),
  };
}

export async function saveInventoryProfitPlan({
  inputs: rawInputs,
  itemId,
  marketplaceId,
  ownerId,
}: SaveInventoryProfitPlanInput): Promise<SaveInventoryProfitPlanResult> {
  assertConfigured();
  const cleanOwnerId = cleanId(ownerId, 'Sign in before saving Max Profit numbers.');
  const cleanItemId = cleanId(itemId, 'The inventory item ID is missing.');
  if (!isMarketplaceId(marketplaceId)) {
    throw new Error('Choose a valid selling channel before saving Max Profit numbers.');
  }

  const row = await getOwnedRow(cleanOwnerId, cleanItemId);
  const previousPlan = parseProfitPlan(row.profitPlanJson);
  const existingAcquisitionCents = storedCents(row.acquisitionCostCents);
  const inputs = normalizedInput(rawInputs);
  const desiredExpenses = expenseCentsFromInputs(inputs);
  const previousBooked = previousPlan?.bookedExpenseCents ?? emptyBookedExpenseCents();
  const cogsManagedByProfitPlan =
    previousPlan?.cogsManagedByProfitPlan ?? existingAcquisitionCents === 0;
  const savedAt = new Date().toISOString();
  const warnings: string[] = [];

  let plan: InventoryProfitPlanRecord = {
    schemaVersion: PROFIT_PLAN_SCHEMA_VERSION,
    marketplaceId,
    inputs,
    savedAt,
    bookedExpenseCents: { ...previousBooked },
    cogsManagedByProfitPlan,
  };

  // Preflight the item schema before creating any accounting side effects. It
  // also means the user's planning numbers survive even if Books is offline.
  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      rowId: cleanItemId,
      data: {
        profitPlanJson: serializedPlan(plan),
        updatedAt: savedAt,
      },
    });
  } catch (cause) {
    throw schemaMigrationError(cause);
  }

  const booksConfigured =
    isResellerBookkeepingConfigured() || isResellerBooksConfigured();
  let recordedExpenseCount = 0;

  for (const definition of EXPENSE_DEFINITIONS) {
    if (definition.field === 'costOfGoods' && !cogsManagedByProfitPlan) {
      if (
        desiredExpenses.costOfGoods > 0 &&
        existingAcquisitionCents > 0 &&
        desiredExpenses.costOfGoods !== existingAcquisitionCents
      ) {
        warnings.push(
          `COGS is already tied to this item's saved purchase record at $${(
            existingAcquisitionCents / 100
          ).toFixed(2)}. The new Max Profit COGS was saved as planning data, but KeepFlip did not rewrite the original purchase transaction.`,
        );
      }
      continue;
    }

    const desiredCents = expenseValue(definition.field, desiredExpenses);
    const previouslyBookedCents = previousBooked[definition.field];

    if (desiredCents < previouslyBookedCents) {
      warnings.push(
        `${definition.label} is now $${(desiredCents / 100).toFixed(2)}, but Books already contains $${(
          previouslyBookedCents / 100
        ).toFixed(2)} recorded from earlier Punch in numbers saves. KeepFlip saved the new item value without automatically reversing posted accounting entries.`,
      );
      continue;
    }

    if (desiredCents === previouslyBookedCents || desiredCents === 0) continue;

    if (!booksConfigured) {
      warnings.push(
        `${definition.label} was saved on the item, but Books is not configured, so its $${(
          desiredCents / 100
        ).toFixed(2)} transaction was not created yet.`,
      );
      continue;
    }

    try {
      const recorded = await recordExpenseIncrease({
        definition,
        desiredCents,
        itemId: cleanItemId,
        ownerId: cleanOwnerId,
        previousCents: previouslyBookedCents,
        occurredAt: savedAt,
      });
      if (recorded) {
        plan = {
          ...plan,
          bookedExpenseCents: {
            ...plan.bookedExpenseCents,
            [definition.field]: desiredCents,
          },
        };
        recordedExpenseCount += 1;
      }
    } catch (cause) {
      warnings.push(
        `${definition.label} stayed saved on the item, but its Books transaction could not be confirmed${
          cause instanceof Error && cause.message ? `: ${cause.message}` : '.'
        }`,
      );
    }
  }

  const finalItemData: Record<string, unknown> = {
    profitPlanJson: serializedPlan(plan),
    updatedAt: savedAt,
  };

  if (cogsManagedByProfitPlan) {
    const desiredCogs = desiredExpenses.costOfGoods;
    const bookedCogs = plan.bookedExpenseCents.costOfGoods;
    const mayUpdateCanonicalCost =
      desiredCogs > 0 &&
      (bookedCogs === 0 || desiredCogs >= previousBooked.costOfGoods);

    if (mayUpdateCanonicalCost) {
      finalItemData.acquisitionCostCents = desiredCogs;
      finalItemData.inventoryCostCentsOnHand = desiredCogs;
    } else if (desiredCogs === 0 && existingAcquisitionCents > 0) {
      warnings.push(
        'COGS was cleared from the Max Profit plan, but KeepFlip kept the existing inventory purchase basis because posted purchase accounting cannot be silently removed.',
      );
    }
  }

  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      rowId: cleanItemId,
      data: finalItemData,
    });
  } catch (cause) {
    throw schemaMigrationError(cause);
  }

  return {
    plan,
    recordedExpenseCount,
    warnings: [...new Set(warnings)],
  };
}
