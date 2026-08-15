import type { ItemAnalysisState } from "@/components/scanner/analysis-visual-types";
import { toItemAnalysisState } from "@/components/scanner/item-analysis-view-model";
import type { InventoryItem } from "@/services/inventory-service";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

function normalizedConfidence(value: number | null) {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value / 100));
}

function displayText(value: string, maxLength: number) {
  const normalized = neutralizeMarketplaceBrand(value)
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function displaySignal(value: string | null) {
  return value
    ? neutralizeMarketplaceBrand(value).replace(/_/g, " ").trim() || null
    : null;
}

export function inventoryItemToAnalysisState(
  item: InventoryItem,
): ResultState {
  if (item.analysisSnapshot?.status === "identified") {
    try {
      const restored = toItemAnalysisState(item.analysisSnapshot);
      if (restored.status === "result") return restored;
    } catch {
      // Older or malformed snapshots fall through to the durable item fields.
    }
  }

  const confidence = normalizedConfidence(item.aiConfidence);
  const identityValue = [item.brand, item.model, item.category]
    .filter(Boolean)
    .join(" / ");
  const evidence = [
    identityValue
      ? {
        id: "saved-identity",
        label: "SAVED IDENTITY",
        source: "Inventory record",
        value: displayText(identityValue, 220),
      }
      : null,
    item.condition
      ? {
        id: "saved-condition",
        label: "OBSERVED CONDITION",
        source: "Original KeepFlip analysis",
        value: displayText(item.condition, 120),
      }
      : null,
    item.estimatedValue != null
      ? {
        id: "saved-value-basis",
        label: "VALUE SNAPSHOT",
        source: "Saved analysis median",
        value:
          "This is the stored estimate from the original scan. Refresh market research before pricing for sale.",
      }
      : null,
    item.flipDecision && item.flipDecision !== "unknown"
      ? {
        id: "saved-flip-decision",
        label: "SAVED FLIP DECISION",
        source: "Original KeepFlip analysis",
        value: [
          displaySignal(item.flipDecision),
          item.resaleVelocity
            ? `${displaySignal(item.resaleVelocity)} resale velocity`
            : null,
          item.resaleTypicalDays != null
            ? `${item.resaleTypicalDays} typical resale days`
            : null,
        ]
          .filter(Boolean)
          .join(" / "),
      }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return {
    status: "result",
    data: {
      condition: {
        details: item.conditionNotes
          ? [displayText(item.conditionNotes, 320)]
          : undefined,
        label: displayText(item.condition || "Unknown", 80),
      },
      confidence:
        confidence == null
          ? undefined
          : {
            identity: confidence,
            overall: confidence,
          },
      evidence,
      identity: {
        brand: item.brand ? displayText(item.brand, 72) : undefined,
        category: item.category ? displayText(item.category, 72) : undefined,
        confidence,
        model: item.model ? displayText(item.model, 72) : undefined,
        title: displayText(item.title, 120),
      },
      profitPlan: {
        actions: [
          item.flipDecision && item.flipDecision !== "unknown"
            ? {
              detail: [
                `Stored decision: ${displaySignal(item.flipDecision)}.`,
                item.flipComplexity
                  ? `Complexity: ${displaySignal(item.flipComplexity)}.`
                  : null,
                item.flipDecisionConfidence != null
                  ? `Decision confidence: ${item.flipDecisionConfidence}%.`
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
              id: "saved-profit-flip-decision",
              kind: "decision" as const,
              label: "Use the stored flip decision",
            }
            : null,
          {
            detail:
              "Refresh market research before listing so the price reflects current demand.",
            id: "saved-profit-refresh",
            kind: "enhancement" as const,
            label: "Refresh the market range",
          },
          {
            detail:
              "Record the item cost and selling channel before accepting an offer so margin decisions stay grounded.",
            id: "saved-profit-inputs",
            kind: "enhancement" as const,
            label: "Complete the profit inputs",
          },
        ].filter((action): action is NonNullable<typeof action> => action != null),
        currency: item.currency,
        expectedSale: item.estimatedValue ?? undefined,
        listTarget: item.estimatedValue ?? undefined,
        quickSale: item.estimatedValue ?? undefined,
      },
      summary:
        (item.conditionNotes && displayText(item.conditionNotes, 480)) ||
        "Saved KeepFlip analysis. The captured evidence and durable inventory facts are shown here.",
      valuation:
        item.estimatedValue == null
          ? undefined
          : {
            currency: item.currency,
            high: item.estimatedValue,
            low: item.estimatedValue,
            median: item.estimatedValue,
            snapshot: true,
          },
      valuationReadiness: {
        label:
          item.estimatedValue == null
            ? "Market data pending"
            : "Saved value snapshot",
        reason:
          item.estimatedValue == null
            ? "This inventory record does not contain a saved market estimate."
            : "The inventory record stores the original median estimate, not a live low-to-high market range.",
        status: item.estimatedValue == null ? "not-ready" : "limited",
      },
    },
  };
}
