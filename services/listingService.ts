import { APPWRITE, ExecutionMethod, functions } from "../lib/appwrite";

export type ListingPlatform =
  | "facebookMarketplace"
  | "ebay"
  | "offerUp"
  | "depop"
  | "poshmark"
  | "mercari";

export type ListingPlatformCopy = Record<ListingPlatform, string>;

export type ListingReadinessQuestion = {
  id: string;
  field: string;
  question: string;
  whyItMatters: string | null;
  requestedPhoto: string | null;
  required: boolean;
};

export type ListingReadiness = {
  facts: {
    field: string;
    label: string;
    value: string | null;
    source: "photo" | "inventory" | "uncertain" | "unknown";
    confidence: number | null;
    evidence: string | null;
  }[];
  conditionByArea: { area: string; status: string; details: string[] }[];
  completeness: { includedItems: string[]; uncertainItems: string[] };
  authenticity: {
    status: string;
    evidence: string[];
    limitations: string[];
  };
  blockingQuestions: ListingReadinessQuestion[];
  recommendedQuestions: ListingReadinessQuestion[];
};

type ListingGeneratorReadyResult = {
  ok: true;
  status: "ready";
  readiness: ListingReadiness;
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
    platformCopy: ListingPlatformCopy;
    warnings: string[];
  };
  confidence: number;
  generatedAt: string;
};

type ListingGeneratorPendingResult = {
  ok: true;
  status: "needs_seller_input";
  readiness: ListingReadiness;
  preflightToken: string;
  answers: Record<string, string>;
  round: number;
  generatedAt: string;
};

export type ListingGeneratorResult = ListingGeneratorReadyResult;
export type ListingGeneratorResponse =
  | ListingGeneratorReadyResult
  | ListingGeneratorPendingResult;

type FailurePayload = { ok: false; error?: string };

export type GenerateListingArgs = {
  itemId: string;
  preflightToken?: string;
  answers?: Record<string, string>;
};

function readExecutionPayload<T extends { ok: true }>(execution: { responseBody?: string; responseStatusCode?: number }, fallbackMessage: string): T {
  let payload: T | FailurePayload;
  try { payload = JSON.parse(execution.responseBody || "{}"); }
  catch { throw new Error("KeepFlip received an unreadable listing response."); }
  if (execution.responseStatusCode && execution.responseStatusCode >= 400) throw new Error("error" in payload && payload.error ? payload.error : fallbackMessage);
  if (!payload.ok) throw new Error("error" in payload && payload.error ? payload.error : fallbackMessage);
  return payload;
}

export async function runListingGenerator({
  itemId,
  preflightToken,
  answers = {},
}: GenerateListingArgs): Promise<ListingGeneratorResponse> {
  const action = preflightToken ? "continue" : "generate";
  const execution = await functions.createExecution({
    functionId: APPWRITE.listingGeneratorFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, itemId, preflightToken, answers }),
  });
  const result = readExecutionPayload<ListingGeneratorResponse>(execution, "KeepFlip could not generate this listing.");
  if (result.status === "needs_seller_input") return result;
  const serverCopy = result.listing.platformCopy as unknown as Partial<Record<ListingPlatform, string>>;
  const generalCopy = [serverCopy.facebookMarketplace, serverCopy.offerUp, serverCopy.ebay, result.listing.description]
    .find((value) => typeof value === "string" && value.trim()) || "";
  const resolveCopy = (platform: ListingPlatform, fallback = generalCopy) => {
    const value = serverCopy[platform];
    return typeof value === "string" && value.trim() ? value : fallback;
  };

  // Older deployed Function versions only return eBay, Facebook, and OfferUp
  // copy. Keep them usable while the expanded generator schema is deployed.
  return {
    ...result,
    listing: {
      ...result.listing,
      platformCopy: {
        facebookMarketplace: resolveCopy("facebookMarketplace"),
        ebay: resolveCopy("ebay"),
        offerUp: resolveCopy("offerUp"),
        depop: resolveCopy("depop", resolveCopy("facebookMarketplace")),
        poshmark: resolveCopy("poshmark", resolveCopy("offerUp")),
        mercari: resolveCopy("mercari", resolveCopy("offerUp")),
      },
    },
  };
}
