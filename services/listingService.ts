import { APPWRITE, ExecutionMethod, functions } from "../lib/appwrite";
import type { PartsResearch, RepairDiagnosis } from "./repairService";

export type ListingGeneratorResult = {
  ok: true;
  listing: {
    title: string;
    subtitle: string;
    priceRange: { quickSale: number; targetPrice: number; highAsk: number };
    conditionLabel: "new" | "like_new" | "good" | "fair" | "for_parts_or_repair";
    sellingStrategy: "sell_as_is" | "clean_and_list" | "repair_first" | "bundle" | "part_out";
    description: string;
    shortDescription: string;
    keySellingPoints: string[];
    conditionDisclosure: string;
    photoChecklist: string[];
    suggestedTags: string[];
    platformCopy: { facebookMarketplace: string; ebay: string; offerUp: string };
    warnings: string[];
  };
  confidence: number;
  generatedAt: string;
};

type FailurePayload = { ok: false; error?: string };

export type GenerateListingArgs = {
  itemId: string;
  flipDecision?: { asIsValue?: number; repairedValue?: number; repairCost?: number; profitDelta?: number; recommendation?: string };
  diagnosis?: RepairDiagnosis | null;
  partsResearch?: PartsResearch | null;
};

function readExecutionPayload<T extends { ok: true }>(execution: { responseBody?: string; responseStatusCode?: number }, fallbackMessage: string): T {
  let payload: T | FailurePayload;
  try { payload = JSON.parse(execution.responseBody || "{}"); }
  catch { throw new Error("KeepFlip received an unreadable listing response."); }
  if (execution.responseStatusCode && execution.responseStatusCode >= 400) throw new Error("error" in payload && payload.error ? payload.error : fallbackMessage);
  if (!payload.ok) throw new Error("error" in payload && payload.error ? payload.error : fallbackMessage);
  return payload;
}

export async function runListingGenerator({ itemId, flipDecision, diagnosis = null, partsResearch = null }: GenerateListingArgs): Promise<ListingGeneratorResult> {
  const execution = await functions.createExecution({
    functionId: APPWRITE.listingGeneratorFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId, flipDecision, diagnosis, partsResearch }),
  });
  return readExecutionPayload<ListingGeneratorResult>(execution, "KeepFlip could not generate this listing.");
}
