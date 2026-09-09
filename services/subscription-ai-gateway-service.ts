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

  // The market Function owns its own server-side subscription and quota gate.
  // Calling it directly avoids forwarding credentials through a second
  // Function. The app only initiates the request; it cannot grant access.
  if (provider === "market" && directMarketFunctionId) {
    return functions.createExecution({
      functionId: directMarketFunctionId!,
      body: JSON.stringify({ ...input, operationId }),
      async: false,
      method: ExecutionMethod.POST,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  if (!subscriptionFunctionId) {
    throw new Error(
      "KeepFlip AI identification is not configured in this build.",
    );
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

