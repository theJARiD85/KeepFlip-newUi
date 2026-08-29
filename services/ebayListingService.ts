import { ExecutionMethod, functions, APPWRITE } from "@/lib/appwrite";
import type { EbayOAuthEnvironment } from "@/services/ebayConnectionService";

export type PublishEbayListingInput = {
  environment: EbayOAuthEnvironment;
  itemId: string;
  title: string;
  description: string;
  price: number;
  quantity?: number;
  categoryId: string;
  merchantLocationKey: string;
  paymentPolicyId: string;
  fulfillmentPolicyId: string;
  returnPolicyId: string;
  marketplaceId?: string;
  currency?: string;
  condition?: string;
  conditionDescription?: string;
  listingDuration?: string;
  sku?: string;
};

export type PublishEbayListingResult = {
  ok: true;
  status: "published" | "already_published";
  environment: EbayOAuthEnvironment;
  itemId: string;
  sku: string;
  offerId: string | null;
  listingId: string | null;
  listingUrl: string | null;
};

type FailurePayload = {
  ok?: false;
  error?: string;
};

function parsePayload(responseBody: string | undefined) {
  try {
    const value: unknown = JSON.parse(responseBody || "{}");
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function publishEbayListing(
  input: PublishEbayListingInput,
): Promise<PublishEbayListingResult> {
  const functionId = APPWRITE.ebayOauthFunctionId;
  if (!functionId) {
    throw new Error(
      "eBay listing is not configured. Add EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID to the build.",
    );
  }

  const execution = await functions.createExecution({
    functionId,
    async: false,
    method: ExecutionMethod.POST,
    xpath: "/listing",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = parsePayload(execution.responseBody);
  if (
    execution.responseStatusCode &&
    execution.responseStatusCode >= 400
  ) {
    throw new Error(
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : "KeepFlip could not publish this item on eBay.",
    );
  }

  if (payload.ok !== true) {
    const failure = payload as FailurePayload;
    throw new Error(
      typeof failure.error === "string" && failure.error.trim()
        ? failure.error
        : "KeepFlip could not publish this item on eBay.",
    );
  }

  const environment =
    payload.environment === "sandbox" || payload.environment === "production"
      ? payload.environment
      : input.environment;
  const status =
    payload.status === "already_published"
      ? "already_published"
      : payload.status === "published"
        ? "published"
        : null;
  const sku = typeof payload.sku === "string" ? payload.sku : "";
  if (!status || !sku) {
    throw new Error("KeepFlip received an incomplete eBay listing response.");
  }

  return {
    ok: true,
    status,
    environment,
    itemId:
      typeof payload.itemId === "string" ? payload.itemId : input.itemId,
    sku,
    offerId: typeof payload.offerId === "string" ? payload.offerId : null,
    listingId:
      typeof payload.listingId === "string" ? payload.listingId : null,
    listingUrl:
      typeof payload.listingUrl === "string" ? payload.listingUrl : null,
  };
}
