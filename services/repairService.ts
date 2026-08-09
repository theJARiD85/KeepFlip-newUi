import {
    APPWRITE,
    ExecutionMethod,
    functions,
  } from "../lib/appwrite";
  
  export type RepairProvider = {
    name: string;
    address?: string | null;
    rating?: number | null;
    ratingCount?: number | null;
    openNow?: boolean | null;
    phone?: string | null;
    mapsUrl?: string | null;
    websiteUrl?: string | null;
  };
  
  export type RepairProvidersResult = {
    status: "ok" | "location_required" | "not_configured";
    providers: RepairProvider[];
  };

  export type RepairDiagnosis = {
    issueTitle: string;
    diagnosisSummary: string;
    likelyCause: string;
    repairability:
      | "diy_possible"
      | "professional_recommended"
      | "replacement_preferred"
      | "unknown";
    needsProfessional: boolean;
    urgency: "low" | "medium" | "high" | "stop_using";
    safetyWarnings: string[];
    safeNextSteps: string[];
    partSearchQuery: string;
    manualSearchQuery: string;
    repairShopSearchQuery: string;
    followUpQuestions: string[];
  };
  
  export type PartsResearch = {
    researchSummary: string;
    parts: {
      name: string;
      partNumber: string | null;
      matchLevel:
        | "exact_candidate"
        | "likely_component"
        | "generic_supply";
      confidence: number;
      searchQuery: string;
      caution: string;
    }[];
    warnings: string[];
    sources: {
      title: string;
      url: string;
    }[];
  };
  
  export type RepairAssistResult = {
    ok: true;
    repairCase: {
      id: string;
      itemId: string;
      createdAt: string;
    };
    item: {
      id: string;
      title: string;
      brand: string | null;
      model: string | null;
      category: string | null;
      condition: string | null;
    };
    diagnosis: RepairDiagnosis;
    partsResearch: PartsResearch;
    repairProviders?: RepairProvidersResult;
    researchedAt: string;
  };
  

  
  type RunRepairAssistArgs = {
    itemId: string;
    issueDescription: string;
    symptoms: string[];
    latitude?: number | null;
    longitude?: number | null;
  };
  
  type FailurePayload = {
    ok: false;
    error?: string;
  };
  
  function readExecutionPayload<T extends { ok: true }>(
    execution: {
      responseBody?: string;
      responseStatusCode?: number;
    },
    fallbackMessage: string
  ): T {
    let payload: T | FailurePayload;
  
    try {
      payload = JSON.parse(execution.responseBody || "{}");
    } catch {
      throw new Error("KeepFlip received an unreadable response.");
    }
  
    if (
      execution.responseStatusCode &&
      execution.responseStatusCode >= 400
    ) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : fallbackMessage
      );
    }
  
    if (!payload.ok) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : fallbackMessage
      );
    }
  
    return payload;
  }

  function repairAssistFunctionId() {
    const functionId = APPWRITE.repairAssistFunctionId.trim();

    if (!functionId) {
      throw new Error(
        "Repair intelligence is not configured. Add EXPO_PUBLIC_APPWRITE_REPAIR_ASSIST_FUNCTION_ID and restart the app.",
      );
    }

    return functionId;
  }
  
  export async function runRepairAssist({
    itemId,
    issueDescription,
    symptoms,
    latitude = null,
    longitude = null,
  }: RunRepairAssistArgs): Promise<RepairAssistResult> {
    const functionId = repairAssistFunctionId();
    const execution = await functions.createExecution({
      functionId,
      async: false,
      method: ExecutionMethod.POST,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemId,
        issueDescription,
        symptoms,
        latitude,
        longitude,
        repairPhotoFileIds: [],
      }),
    });
  
    return readExecutionPayload<RepairAssistResult>(
      execution,
      "KeepFlip could not research this repair."
    );
  }

  export type PartsResearchResult = {
    ok: boolean;
    item: {
      id: string;
      title: string;
      brand: string | null;
      model: string | null;
    };
    partsResearch: PartsResearch;
    researchedAt: string;
  };

  type RunPartsResearchArgs = {
    itemId: string;
    diagnosis: RepairDiagnosis;
  };  
  
  export async function runPartsResearch({
    itemId,
    diagnosis,
  }: RunPartsResearchArgs): Promise<PartsResearchResult> {
    const execution = await functions.createExecution({
      functionId: APPWRITE.partsResearchFunctionId,
      async: false,
      method: ExecutionMethod.POST,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemId,
        diagnosis,
      }),
    });
  
    const rawResponse = execution.responseBody?.trim() || "";
  
    console.log("PARTS RESEARCH EXECUTION:", {
      statusCode: execution.responseStatusCode,
      responseBody: rawResponse,
    });
  
    if (!rawResponse) {
      throw new Error(
        `Parts-research Function returned no response. Appwrite status: ${execution.responseStatusCode || "unknown"}. Check the Function execution logs.`
      );
    }
  
    let payload: PartsResearchResult | { ok: false; error?: string };
  
    try {
      payload = JSON.parse(rawResponse);
    } catch {
      throw new Error(
        `Parts-research Function returned invalid JSON: ${rawResponse.slice(0, 300)}`
      );
    }
  
    if (execution.responseStatusCode >= 400 || !payload.ok) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : `Parts research failed with status ${execution.responseStatusCode}.`
      );
    }
  
    return payload;
  }
