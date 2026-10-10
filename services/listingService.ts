import { APPWRITE, ExecutionMethod, functions, ID } from "../lib/appwrite";

export type ListingPlatform =
  | "facebookMarketplace"
  | "ebay"
  | "offerUp"
  | "depop"
  | "poshmark"
  | "mercari";

export type ListingPlatformCopy = Record<ListingPlatform, string>;

export type MarketplaceListingTree<TFields> = {
  title: string;
  description: string;
  price: number;
  fields: TFields;
};

export type ListingMarketplaceJson = {
  facebookMarketplace: MarketplaceListingTree<{
    category: string | null;
    condition: string | null;
    location: string | null;
  }>;
  ebay: MarketplaceListingTree<{
    category: string | null;
    categoryId: string | null;
    merchantLocationKey: string | null;
    fulfillmentPolicyId: string | null;
    paymentPolicyId: string | null;
    returnPolicyId: string | null;
    condition: string | null;
    brand: string | null;
    model: string | null;
    color: string | null;
    size: string | null;
    material: string | null;
  }> & { subtitle: string };
  offerUp: MarketplaceListingTree<{
    category: string | null;
    condition: string | null;
    location: string | null;
  }>;
  depop: MarketplaceListingTree<{
    category: string | null;
    condition: string | null;
    shipping: string | null;
    brand: string | null;
    size: string | null;
    color: string | null;
    hashtags: string[];
  }>;
  poshmark: MarketplaceListingTree<{
    category: string | null;
    brand: string | null;
    size: string | null;
    color: string | null;
    originalPrice: number | null;
  }>;
  mercari: MarketplaceListingTree<{
    category: string | null;
    condition: string | null;
    brand: string | null;
    color: string | null;
  }>;
};

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
    category?: string | null;
    subtitle: string;
    priceRange: { quickSale: number; targetPrice: number; highAsk: number };
    conditionLabel: "new" | "like_new" | "good" | "fair" | "poor" | "for_parts_or_repair";
    sellingStrategy: "sell_as_is" | "clean_and_list" | "repair_first" | "bundle" | "part_out";
    description: string;
    shortDescription: string;
    keySellingPoints: string[];
    conditionDisclosure: string;
    photoChecklist: string[];
    suggestedTags: string[];
    marketplaceListings: ListingMarketplaceJson;
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

type FailurePayload = {
  ok: false;
  error?: string;
  code?: string;
  details?: { quota?: string; limit?: number; usage?: number };
};

export type GenerateListingArgs = {
  itemId: string;
  preflightToken?: string;
  answers?: Record<string, string>;
};

function readExecutionPayload<T extends { ok: true }>(execution: { responseBody?: string; responseStatusCode?: number }, fallbackMessage: string): T {
  let payload: T | FailurePayload;
  try { payload = JSON.parse(execution.responseBody || "{}") as T | FailurePayload; }
  catch { throw new Error("KeepFlip received an unreadable listing response."); }
  if (execution.responseStatusCode && execution.responseStatusCode >= 400) {
    const failure = payload as FailurePayload;
    throw new Error(failure.error || fallbackMessage);
  }
  if (!payload.ok) throw new Error((payload as FailurePayload).error || fallbackMessage);
  return payload as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeMarketplaceListings(
  source: unknown,
  platformCopy: ListingPlatformCopy,
  title: string,
  ebaySubtitle: string,
  price: number,
): ListingMarketplaceJson {
  const listings = asRecord(source);
  const entry = (platform: ListingPlatform) => asRecord(listings[platform]);
  const fields = (platform: ListingPlatform) => asRecord(entry(platform).fields);
  const draft = (platform: ListingPlatform) => entry(platform);
  const base = (platform: ListingPlatform) => ({
    title: readText(draft(platform).title, title),
    description: readText(draft(platform).description, platformCopy[platform]),
    price,
  });

  return {
    facebookMarketplace: {
      ...base("facebookMarketplace"),
      fields: {
        category: readNullableText(fields("facebookMarketplace").category),
        condition: readNullableText(fields("facebookMarketplace").condition),
        location: readNullableText(fields("facebookMarketplace").location),
      },
    },
    ebay: {
      ...base("ebay"),
      subtitle: readText(draft("ebay").subtitle, ebaySubtitle),
      fields: {
        category: readNullableText(fields("ebay").category),
        categoryId: readNullableText(fields("ebay").categoryId),
        merchantLocationKey: readNullableText(fields("ebay").merchantLocationKey),
        fulfillmentPolicyId: readNullableText(fields("ebay").fulfillmentPolicyId),
        paymentPolicyId: readNullableText(fields("ebay").paymentPolicyId),
        returnPolicyId: readNullableText(fields("ebay").returnPolicyId),
        condition: readNullableText(fields("ebay").condition),
        brand: readNullableText(fields("ebay").brand),
        model: readNullableText(fields("ebay").model),
        color: readNullableText(fields("ebay").color),
        size: readNullableText(fields("ebay").size),
        material: readNullableText(fields("ebay").material),
      },
    },
    offerUp: {
      ...base("offerUp"),
      fields: {
        category: readNullableText(fields("offerUp").category),
        condition: readNullableText(fields("offerUp").condition),
        location: readNullableText(fields("offerUp").location),
      },
    },
    depop: {
      ...base("depop"),
      fields: {
        category: readNullableText(fields("depop").category),
        condition: readNullableText(fields("depop").condition),
        shipping: readNullableText(fields("depop").shipping),
        brand: readNullableText(fields("depop").brand),
        size: readNullableText(fields("depop").size),
        color: readNullableText(fields("depop").color),
        hashtags: readStringList(fields("depop").hashtags),
      },
    },
    poshmark: {
      ...base("poshmark"),
      fields: {
        category: readNullableText(fields("poshmark").category),
        brand: readNullableText(fields("poshmark").brand),
        size: readNullableText(fields("poshmark").size),
        color: readNullableText(fields("poshmark").color),
        originalPrice: readPositiveNumber(fields("poshmark").originalPrice),
      },
    },
    mercari: {
      ...base("mercari"),
      fields: {
        category: readNullableText(fields("mercari").category),
        condition: readNullableText(fields("mercari").condition),
        brand: readNullableText(fields("mercari").brand),
        color: readNullableText(fields("mercari").color),
      },
    },
  };
}

export async function runListingGenerator({
  itemId,
  preflightToken,
  answers = {},
}: GenerateListingArgs): Promise<ListingGeneratorResponse> {
  const action = preflightToken ? "continue" : "generate";
  const operationId = action === "generate" ? ID.unique() : undefined;
  const execution = await functions.createExecution({
    functionId: APPWRITE.listingGeneratorFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, itemId, operationId, preflightToken, answers }),
  });
  const result = readExecutionPayload<ListingGeneratorResponse>(execution, "KeepFlip could not generate this listing.");
  if (result.status === "needs_seller_input") return result;
  const serverListing = result.listing;
  const serverCopy = asRecord(serverListing.platformCopy) as Partial<Record<ListingPlatform, string>>;
  const rawMarketplaces = asRecord(serverListing.marketplaceListings);
  const generalCopy = [
    serverCopy.facebookMarketplace,
    serverCopy.offerUp,
    serverCopy.ebay,
    readText(asRecord(rawMarketplaces.facebookMarketplace).description, ""),
    result.listing.description,
  ]
    .find((value) => typeof value === "string" && value.trim()) || "";
  const resolveCopy = (platform: ListingPlatform, fallback = generalCopy) => {
    const value = serverCopy[platform];
    return typeof value === "string" && value.trim() ? value : fallback;
  };

  // Older deployed Function versions only return eBay, Facebook, and OfferUp
  // copy. Keep them usable while the expanded generator schema is deployed.
  const resolvedPlatformCopy: ListingPlatformCopy = {
    facebookMarketplace: resolveCopy("facebookMarketplace"),
    ebay: resolveCopy("ebay"),
    offerUp: resolveCopy("offerUp"),
    depop: resolveCopy("depop", resolveCopy("facebookMarketplace")),
    poshmark: resolveCopy("poshmark", resolveCopy("offerUp")),
    mercari: resolveCopy("mercari", resolveCopy("offerUp")),
  };
  const marketplaceListings = normalizeMarketplaceListings(
    serverListing.marketplaceListings,
    resolvedPlatformCopy,
    result.listing.title,
    result.listing.subtitle,
    result.listing.priceRange.targetPrice,
  );
  const platformCopy: ListingPlatformCopy = {
    facebookMarketplace: marketplaceListings.facebookMarketplace.description,
    ebay: marketplaceListings.ebay.description,
    offerUp: marketplaceListings.offerUp.description,
    depop: marketplaceListings.depop.description,
    poshmark: marketplaceListings.poshmark.description,
    mercari: marketplaceListings.mercari.description,
  };

  return {
    ...result,
    listing: {
      ...result.listing,
      marketplaceListings,
      platformCopy,
    },
  };
}
