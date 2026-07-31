import type { ItemAnalysisState } from "@/components/scanner/item-analysis-overlay";
import type { InventoryItem } from "@/services/inventory-service";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

function normalizedConfidence(value: number | null) {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value / 100));
}

function displayText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function inventoryItemToAnalysisState(
  item: InventoryItem,
): ResultState {
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
