import type {
  ItemAnalysisSuccess,
  ItemMarketAcquisitionGuidance,
} from "@/types/item-analysis";

export const RESELLER_BUY_RULES_VERSION = 2 as const;

export const RESELLER_COST_TYPES = [
  "marketplace_fees",
  "outbound_shipping",
  "packaging",
  "repairs",
  "sourcing_travel",
] as const;

export type ResellerCostType = (typeof RESELLER_COST_TYPES)[number];

export const RESELLER_SALE_SPEEDS = [
  "quick",
  "steady",
  "patient",
] as const;

export type ResellerSaleSpeed = (typeof RESELLER_SALE_SPEEDS)[number];

export const RESELLER_INVENTORY_FOCUSES = [
  "general",
  "fashion",
  "electronics",
  "media_games",
  "collectibles",
] as const;

export const RESELLER_STORAGE_CAPACITIES = [
  "closet_or_bin",
  "dedicated_room",
  "garage_or_warehouse",
] as const;

export const RESELLER_LABOR_TOLERANCES = [
  "quick_listing",
  "standard_prep",
  "hands_on",
] as const;

export type ResellerInventoryFocus =
  (typeof RESELLER_INVENTORY_FOCUSES)[number];
export type ResellerStorageCapacity =
  (typeof RESELLER_STORAGE_CAPACITIES)[number];
export type ResellerLaborTolerance =
  (typeof RESELLER_LABOR_TOLERANCES)[number];

export type ResellerBuyRules = {
  includedCostTypes: ResellerCostType[];
  inventoryFocus: ResellerInventoryFocus;
  laborTolerance: ResellerLaborTolerance;
  maximumItemCostCents: number;
  maximumTypicalDays: number;
  minimumNetProfitCents: number;
  minimumRoiPercent: number;
  saleSpeed: ResellerSaleSpeed;
  storageCapacity: ResellerStorageCapacity;
  version: typeof RESELLER_BUY_RULES_VERSION;
};

export type ResellerBuyRulesInput = Omit<ResellerBuyRules, "version"> & {
  version?: number;
};

export type ResellerBuyRuleOutcome =
  | "within_rules"
  | "capped_by_return"
  | "capped_by_capital"
  | "outside_sale_speed"
  | "outside_labor_tolerance";

export const DEFAULT_RESELLER_BUY_RULES: ResellerBuyRules = {
  includedCostTypes: [
    "marketplace_fees",
    "outbound_shipping",
    "packaging",
    "repairs",
    "sourcing_travel",
  ],
  inventoryFocus: "general",
  laborTolerance: "standard_prep",
  maximumItemCostCents: 7_500,
  maximumTypicalDays: 90,
  minimumNetProfitCents: 1_500,
  minimumRoiPercent: 50,
  saleSpeed: "steady",
  storageCapacity: "dedicated_room",
  version: RESELLER_BUY_RULES_VERSION,
};

const SALE_SPEED_DAY_LIMITS: Record<ResellerSaleSpeed, number> = {
  quick: 30,
  steady: 90,
  patient: 180,
};

const COST_LABELS: Record<ResellerCostType, string> = {
  marketplace_fees: "marketplace fees",
  outbound_shipping: "outbound shipping",
  packaging: "packaging",
  repairs: "repair and prep",
  sourcing_travel: "sourcing travel",
};

const INVENTORY_FOCUS_LABELS: Record<ResellerInventoryFocus, string> = {
  general: "a little of everything",
  fashion: "fashion finds",
  electronics: "electronics",
  media_games: "media and games",
  collectibles: "collectibles",
};

const LABOR_TOLERANCE_LABELS: Record<ResellerLaborTolerance, string> = {
  quick_listing: "quick, low-prep listings",
  standard_prep: "standard prep work",
  hands_on: "hands-on cleaning, testing, or repair",
};

const STORAGE_CAPACITY_LABELS: Record<ResellerStorageCapacity, string> = {
  closet_or_bin: "a closet or bin",
  dedicated_room: "a dedicated room",
  garage_or_warehouse: "a garage or warehouse",
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function wholeNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return null;
  return numeric >= minimum && numeric <= maximum ? numeric : null;
}

function knownSaleSpeed(value: unknown): ResellerSaleSpeed | null {
  return typeof value === "string" &&
    RESELLER_SALE_SPEEDS.includes(value as ResellerSaleSpeed)
    ? (value as ResellerSaleSpeed)
    : null;
}

function knownInventoryFocus(value: unknown): ResellerInventoryFocus | null {
  return typeof value === "string" &&
    RESELLER_INVENTORY_FOCUSES.includes(value as ResellerInventoryFocus)
    ? (value as ResellerInventoryFocus)
    : null;
}

function knownStorageCapacity(value: unknown): ResellerStorageCapacity | null {
  return typeof value === "string" &&
    RESELLER_STORAGE_CAPACITIES.includes(value as ResellerStorageCapacity)
    ? (value as ResellerStorageCapacity)
    : null;
}

function knownLaborTolerance(value: unknown): ResellerLaborTolerance | null {
  return typeof value === "string" &&
    RESELLER_LABOR_TOLERANCES.includes(value as ResellerLaborTolerance)
    ? (value as ResellerLaborTolerance)
    : null;
}

function knownCostTypes(value: unknown): ResellerCostType[] | null {
  if (!Array.isArray(value)) return null;

  const seen = new Set<ResellerCostType>();
  for (const entry of value) {
    if (
      typeof entry !== "string" ||
      !RESELLER_COST_TYPES.includes(entry as ResellerCostType)
    ) {
      return null;
    }
    seen.add(entry as ResellerCostType);
  }

  return RESELLER_COST_TYPES.filter((cost) => seen.has(cost));
}

function displayMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: 0,
      style: "currency",
    }).format(value);
  } catch {
    return "$" + Math.round(value).toLocaleString("en-US");
  }
}

function uniqueLines(values: string[], maximum = 10) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maximum);
}

function positiveFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function validCeiling(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function originalMarketCeiling(guidance: ItemMarketAcquisitionGuidance) {
  const savedBase = validCeiling(guidance.profileRules?.baseMaxBuyPrice);
  return savedBase ?? validCeiling(guidance.maxBuyPrice);
}

function sameRuleSnapshot(
  guidance: ItemMarketAcquisitionGuidance,
  rules: ResellerBuyRules,
) {
  const saved = guidance.profileRules;
  if (!saved) return false;

  return (
    saved.version === rules.version &&
    saved.inventoryFocus === rules.inventoryFocus &&
    saved.laborTolerance === rules.laborTolerance &&
    saved.maximumItemCostCents === rules.maximumItemCostCents &&
    saved.maximumTypicalDays === rules.maximumTypicalDays &&
    saved.minimumNetProfitCents === rules.minimumNetProfitCents &&
    saved.minimumRoiPercent === rules.minimumRoiPercent &&
    saved.saleSpeed === rules.saleSpeed &&
    saved.storageCapacity === rules.storageCapacity &&
    saved.includedCostTypes.length === rules.includedCostTypes.length &&
    saved.includedCostTypes.every(
      (costType, index) => costType === rules.includedCostTypes[index],
    )
  );
}

function userCostScope(rules: ResellerBuyRules) {
  const labels = rules.includedCostTypes.map((cost) => COST_LABELS[cost]);
  return ["inventory cost", ...labels].join(", ");
}

function selectedVariableCostPrompt(rules: ResellerBuyRules) {
  const itemSpecific = rules.includedCostTypes.filter(
    (cost) => cost !== "marketplace_fees",
  );
  const labels = itemSpecific.map((cost) => COST_LABELS[cost]);

  if (labels.length === 0) return null;
  return "Enter actual " + labels.join(", ") +
    " before treating this as a final buy call.";
}

function pacePrompt(
  rules: ResellerBuyRules,
  typicalDays: number | null,
) {
  if (typicalDays != null) return null;
  return "A supported typical-days signal is needed to check your " +
    String(rules.maximumTypicalDays) + "-day selling-speed target.";
}

function complexityPrompt(
  rules: ResellerBuyRules,
  complexity: string | null,
) {
  if (rules.laborTolerance === "hands_on" || complexity != null) return null;
  return "A flip-complexity signal is needed to check your " +
    LABOR_TOLERANCE_LABELS[rules.laborTolerance] + " preference.";
}

function isOutsideLaborTolerance(
  rules: ResellerBuyRules,
  complexity: "easy" | "moderate" | "complex" | "unknown" | null,
) {
  if (!complexity || complexity === "unknown") return false;
  if (rules.laborTolerance === "quick_listing") {
    return complexity === "moderate" || complexity === "complex";
  }
  return rules.laborTolerance === "standard_prep" && complexity === "complex";
}

function compactStoragePrompt(
  analysis: ItemAnalysisSuccess,
  rules: ResellerBuyRules,
) {
  if (rules.storageCapacity !== "closet_or_bin") return null;

  const itemDescription = [
    analysis.analysis.identification.category,
    analysis.analysis.identification.itemType,
    analysis.analysis.valuationSignals.category,
  ].filter((value): value is string => Boolean(value)).join(" ");
  const mayNeedRoom =
    /(?:furniture|sofa|chair|table|television|\btv\b|monitor|speaker|stereo|amplifier|printer|bicycle|exercise|golf|large appliance|lawn)/i
      .test(itemDescription);

  return mayNeedRoom
    ? "Your profile says storage is compact; confirm this item's dimensions before bringing it home."
    : null;
}

function profileRuleSummary({
  baseMaxBuyPrice,
  complexity,
  currency,
  outcome,
  personalizedMaxBuyPrice,
  rules,
  typicalDays,
}: {
  baseMaxBuyPrice: number;
  complexity: "easy" | "moderate" | "complex" | "unknown" | null;
  currency: string;
  outcome: ResellerBuyRuleOutcome;
  personalizedMaxBuyPrice: number;
  rules: ResellerBuyRules;
  typicalDays: number | null;
}) {
  const profitFloor = displayMoney(
    rules.minimumNetProfitCents / 100,
    currency,
  );
  const cashLimit = displayMoney(rules.maximumItemCostCents / 100, currency);

  if (outcome === "outside_sale_speed") {
    return "Your Buy Rules say pass: the typical resale time of about " +
      String(Math.round(typicalDays ?? 0)) + " days is slower than your " +
      String(rules.maximumTypicalDays) +
      "-day target. This does not change the separate market-demand signal.";
  }

  if (outcome === "outside_labor_tolerance") {
    return "Your profile favors " + LABOR_TOLERANCE_LABELS[rules.laborTolerance] +
      ", while this item is flagged as a " + String(complexity ?? "higher-effort") +
      " flip. KeepFlip treats that as a prep-fit pass.";
  }

  if (personalizedMaxBuyPrice <= 0) {
    return "No positive purchase price clears your " +
      String(rules.minimumRoiPercent) + "% ROI, " + profitFloor +
      " net-profit floor, and " + cashLimit + " single-item cash limit.";
  }

  if (outcome === "capped_by_capital") {
    return "Your " + cashLimit + " single-item cash limit reduces the " +
      "evidence-led ceiling from " + displayMoney(baseMaxBuyPrice, currency) +
      " to " + displayMoney(personalizedMaxBuyPrice, currency) + ".";
  }

  if (outcome === "capped_by_return") {
    return "Your Buy Rules reduce the evidence-led ceiling from " +
      displayMoney(baseMaxBuyPrice, currency) + " to " +
      displayMoney(personalizedMaxBuyPrice, currency) +
      " to protect at least " + String(rules.minimumRoiPercent) +
      "% ROI and " + profitFloor + " net profit.";
  }

  return "The evidence-led ceiling of " +
    displayMoney(baseMaxBuyPrice, currency) +
    " already clears your " + String(rules.minimumRoiPercent) +
    "% ROI, " + profitFloor + " net-profit floor, and " + cashLimit +
    " single-item cash limit. KeepFlip will not loosen that market ceiling.";
}

/**
 * Accept only the compact, versioned data that Flip's onboarding writes.
 * Version-one profiles deliberately return null so their owners get the
 * short personalization refresh once rather than silent guessed defaults.
 */
export function normalizeResellerBuyRules(
  value: unknown,
): ResellerBuyRules | null {
  if (!isRecord(value)) return null;

  const version = wholeNumberInRange(value.version, 1, 10);
  const minimumRoiPercent = wholeNumberInRange(
    value.minimumRoiPercent,
    0,
    1_000,
  );
  const minimumNetProfitCents = wholeNumberInRange(
    value.minimumNetProfitCents,
    0,
    100_000_000,
  );
  const maximumItemCostCents = wholeNumberInRange(
    value.maximumItemCostCents,
    0,
    100_000_000,
  );
  const saleSpeed = knownSaleSpeed(value.saleSpeed);
  const maximumTypicalDays = wholeNumberInRange(
    value.maximumTypicalDays,
    1,
    730,
  );
  const includedCostTypes = knownCostTypes(value.includedCostTypes);
  const inventoryFocus = knownInventoryFocus(value.inventoryFocus);
  const storageCapacity = knownStorageCapacity(value.storageCapacity);
  const laborTolerance = knownLaborTolerance(value.laborTolerance);

  if (
    version !== RESELLER_BUY_RULES_VERSION ||
    minimumRoiPercent == null ||
    minimumNetProfitCents == null ||
    maximumItemCostCents == null ||
    !saleSpeed ||
    maximumTypicalDays == null ||
    !includedCostTypes ||
    !inventoryFocus ||
    !storageCapacity ||
    !laborTolerance
  ) {
    return null;
  }

  return {
    includedCostTypes,
    inventoryFocus,
    laborTolerance,
    maximumItemCostCents,
    maximumTypicalDays,
    minimumNetProfitCents,
    minimumRoiPercent,
    saleSpeed,
    storageCapacity,
    version: RESELLER_BUY_RULES_VERSION,
  };
}

export function buyRuleDayLimit(saleSpeed: ResellerSaleSpeed) {
  return SALE_SPEED_DAY_LIMITS[saleSpeed];
}

/**
 * Personalizes only acquisition guidance. The independent market Flip/Skip
 * decision remains evidence-led; private rules can make the purchase ceiling
 * stricter, never more generous.
 */
export function applyResellerBuyRulesToAnalysis(
  analysis: ItemAnalysisSuccess,
  rules: ResellerBuyRules,
): ItemAnalysisSuccess {
  const marketResearch = analysis.marketResearch;
  const guidance = marketResearch?.acquisitionGuidance;
  if (!marketResearch || !guidance || guidance.status === "needs_evidence") {
    return analysis;
  }

  // Fresh v2 Function responses already contain a server-validated snapshot
  // of these exact rules. Keep this client calculation only as a migration
  // fallback for older saved analysis snapshots.
  if (sameRuleSnapshot(guidance, rules)) {
    return analysis;
  }

  const baseMaxBuyPrice = originalMarketCeiling(guidance);
  const resaleBasis = positiveFiniteNumber(guidance.resaleBasis);
  if (
    guidance.status !== "provisional" ||
    baseMaxBuyPrice == null ||
    baseMaxBuyPrice <= 0 ||
    resaleBasis == null
  ) {
    return analysis;
  }

  const currency = guidance.currency || analysis.valuation.currency || "USD";
  const typicalDays = positiveFiniteNumber(
    marketResearch.marketVelocity?.typicalDays,
  );
  const complexity = marketResearch.flipComplexity?.level ?? null;
  const returnRuleCeiling = Math.max(
    0,
    Math.floor(
      (resaleBasis - rules.minimumNetProfitCents / 100) /
        (1 + rules.minimumRoiPercent / 100),
    ),
  );
  const capitalRuleCeiling = rules.maximumItemCostCents / 100;
  const returnAndMarketCeiling = Math.min(baseMaxBuyPrice, returnRuleCeiling);
  const financialCeiling = Math.min(returnAndMarketCeiling, capitalRuleCeiling);
  const paceMismatch =
    typicalDays != null && typicalDays > rules.maximumTypicalDays;
  const laborMismatch = isOutsideLaborTolerance(rules, complexity);
  const maxBuyPrice = paceMismatch || laborMismatch ? 0 : financialCeiling;
  const outcome: ResellerBuyRuleOutcome = paceMismatch
    ? "outside_sale_speed"
    : laborMismatch
      ? "outside_labor_tolerance"
      : capitalRuleCeiling < returnAndMarketCeiling
        ? "capped_by_capital"
        : returnRuleCeiling < baseMaxBuyPrice
          ? "capped_by_return"
          : "within_rules";
  const variableCostPrompt = selectedVariableCostPrompt(rules);
  const marketFeePrompt = rules.includedCostTypes.includes("marketplace_fees")
    ? "Select the actual selling channel in Smart Profit Calculator to replace the market reserve with its fee model."
    : null;
  const missingPacePrompt = pacePrompt(rules, typicalDays);
  const missingComplexityPrompt = complexityPrompt(rules, complexity);
  const storagePrompt = compactStoragePrompt(analysis, rules);
  const updatedGuidance: ItemMarketAcquisitionGuidance = {
    ...guidance,
    assumptions: uniqueLines([
      ...guidance.assumptions,
      "Your Buy Rules require at least " +
        String(rules.minimumRoiPercent) + "% ROI and " +
        displayMoney(rules.minimumNetProfitCents / 100, currency) +
        " net profit.",
      "Single-item cash limit: " +
        displayMoney(rules.maximumItemCostCents / 100, currency) + ".",
      "Selling-speed target: typically within " +
        String(rules.maximumTypicalDays) + " days.",
      "Prep preference: " + LABOR_TOLERANCE_LABELS[rules.laborTolerance] + ".",
      "Storage profile: " + STORAGE_CAPACITY_LABELS[rules.storageCapacity] + ".",
      "Sourcing lane: " + INVENTORY_FOCUS_LABELS[rules.inventoryFocus] + ".",
      "ROI cost scope: " + userCostScope(rules) + ".",
    ]),
    formula:
      "Conservative market ceiling, capped by your cash, ROI, profit, and profile-fit rules",
    maxBuyPrice,
    missingInputs: uniqueLines([
      ...guidance.missingInputs,
      ...(variableCostPrompt ? [variableCostPrompt] : []),
      ...(marketFeePrompt ? [marketFeePrompt] : []),
      ...(missingPacePrompt ? [missingPacePrompt] : []),
      ...(missingComplexityPrompt ? [missingComplexityPrompt] : []),
      ...(storagePrompt ? [storagePrompt] : []),
    ]),
    profileRules: {
      baseMaxBuyPrice,
      includedCostTypes: [...rules.includedCostTypes],
      inventoryFocus: rules.inventoryFocus,
      laborTolerance: rules.laborTolerance,
      maximumItemCostCents: rules.maximumItemCostCents,
      maximumTypicalDays: rules.maximumTypicalDays,
      minimumNetProfitCents: rules.minimumNetProfitCents,
      minimumRoiPercent: rules.minimumRoiPercent,
      outcome,
      saleSpeed: rules.saleSpeed,
      storageCapacity: rules.storageCapacity,
      version: rules.version,
    },
    status:
      maxBuyPrice <= 0 ||
      outcome === "outside_sale_speed" ||
      outcome === "outside_labor_tolerance"
        ? "not_viable"
        : guidance.status,
    summary: profileRuleSummary({
      baseMaxBuyPrice,
      complexity,
      currency,
      outcome,
      personalizedMaxBuyPrice: maxBuyPrice,
      rules,
      typicalDays,
    }),
  };

  return {
    ...analysis,
    marketResearch: {
      ...marketResearch,
      acquisitionGuidance: updatedGuidance,
    },
  };
}
