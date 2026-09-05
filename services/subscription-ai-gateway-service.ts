import {
  APPWRITE,
  ExecutionMethod,
  ID,
  functions,
} from "@/lib/appwrite";

export type GatedAiProvider = "identify" | "market";

export function subscriptionsAreEnforced() {
  return process.env.EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED === "true";
}

export function nextAiOperationId() {
  return ID.unique();
}

export async function createGatedAiExecution(
  provider: GatedAiProvider,
  input: Record<string, unknown>,
  operationId = nextAiOperationId(),
) {
  if (!APPWRITE.subscriptionFunctionId) {
    throw new Error(
      "Add EXPO_PUBLIC_APPWRITE_SUBSCRIPTION_FUNCTION_ID before enabling subscription enforcement.",
    );
  }

  return functions.createExecution({
    functionId: APPWRITE.subscriptionFunctionId,
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

