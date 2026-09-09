import {
  APPWRITE,
  ExecutionMethod,
  ID,
  functions,
} from "@/lib/appwrite";

export type GatedAiProvider = "identify" | "market";

export function nextAiOperationId() {
  return ID.unique();
}

export async function createGatedAiExecution(
  provider: GatedAiProvider,
  input: Record<string, unknown>,
  operationId = nextAiOperationId(),
) {
  const subscriptionFunctionId = APPWRITE.subscriptionFunctionId;
  const directMarketFunctionId =
    APPWRITE.marketResearchFunctionId || APPWRITE.ebaySoldCompsFunctionId;

  if (!subscriptionFunctionId && !directMarketFunctionId) {
    throw new Error(
      "Add EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID before using KeepFlip AI.",
    );
  }

  // Subscription-enabled builds reserve provider execution through the
  // subscription police Function. Older builds predate subscriptions and
  // call the authenticated market Function directly; keep that path working
  // until those clients migrate.
  if (!subscriptionFunctionId) {
    return functions.createExecution({
      functionId: directMarketFunctionId!,
      body: JSON.stringify(input),
      async: false,
      method: ExecutionMethod.POST,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  return functions.createExecution({
    functionId: subscriptionFunctionId,
    xpath: "/ai/execute",
    body: JSON.stringify({
      provider,
      operationId,
      input,
    }),
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  });
}

