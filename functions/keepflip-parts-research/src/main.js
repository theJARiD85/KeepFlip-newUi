import {
  createHttpError,
  getHeader,
  getOwnedItem,
} from "./appwrite.js";
import { researchPartsAndManuals } from "./repairAi.js";

function getRequestBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") {
    return req.bodyJson;
  }

  if (typeof req.bodyText === "string" && req.bodyText.trim()) {
    try {
      return JSON.parse(req.bodyText);
    } catch {
      throw createHttpError("Request body must be valid JSON.");
    }
  }

  return {};
}

function cleanString(value, maxLength = 50000) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function stringList(value, maxItems = 12) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeDiagnosis(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    issueTitle: cleanString(value.issueTitle),
    diagnosisSummary: cleanString(value.diagnosisSummary),
    likelyCause: cleanString(value.likelyCause),
    repairability: value.repairability || "unknown",
    needsProfessional: Boolean(value.needsProfessional),
    urgency: value.urgency || "low",
    safetyWarnings: stringList(value.safetyWarnings),
    safeNextSteps: stringList(value.safeNextSteps),
    partSearchQuery: cleanString(value.partSearchQuery),
    manualSearchQuery: cleanString(value.manualSearchQuery),
    repairShopSearchQuery: cleanString(value.repairShopSearchQuery),
    followUpQuestions: stringList(value.followUpQuestions),
  };
}

export default async ({ req, res, log, error }) => {
  const startedAt = Date.now();

  log(
    `PARTS 0: handler started | method=${req.method} | hasBody=${Boolean(
      req.bodyText || req.bodyJson
    )}`
  );

  try {
    if (req.method === "GET") {
      log("PARTS GET: health check received.");

      return res.json({
        ok: true,
        service: "keepflip-parts-research",
        message: "KeepFlip Parts Research is online.",
      });
    }

    if (req.method !== "POST") {
      log(`PARTS STOP: unsupported method ${req.method}.`);

      return res.json(
        {
          ok: false,
          error: "Use POST for parts research.",
        },
        405
      );
    }

    const userId = getHeader(req, "x-appwrite-user-id");

    log(
      `PARTS 1: request accepted | hasUserId=${Boolean(userId)}`
    );

    if (!userId) {
      return res.json(
        {
          ok: false,
          error: "You must be signed in to research parts.",
        },
        401
      );
    }

    const body = getRequestBody(req);

    log(
      `PARTS 2: body parsed | keys=${Object.keys(body).join(
        ","
      )} | hasDiagnosis=${Boolean(
        body.diagnosis || body.repairDiagnosis
      )}`
    );

    const itemId = cleanString(body.itemId, 36);

    const diagnosis = normalizeDiagnosis(
      body.repairDiagnosis ?? body.diagnosis
    );

    log(
      `PARTS 3: request normalized | hasItemId=${Boolean(
        itemId
      )} | hasDiagnosis=${Boolean(
        diagnosis
      )} | hasPartSearchQuery=${Boolean(
        diagnosis?.partSearchQuery
      )}`
    );

    if (!itemId) {
      throw createHttpError("itemId is required.");
    }

    if (!diagnosis || !diagnosis.partSearchQuery) {
      throw createHttpError(
        "A valid repair diagnosis with a partSearchQuery is required before researching parts."
      );
    }

    log(`PARTS 4: loading item | itemId=${itemId}`);

    const item = await getOwnedItem(req, userId, itemId);

    log(
      `PARTS 5: item loaded | title=${item.title || "untitled"} | brand=${
        item.brand || "none"
      } | model=${item.model || "none"}`
    );

    log("PARTS 6: starting OpenAI parts research.");

    const partsResearch = await researchPartsAndManuals({
      item,
      diagnosis,
      log,
    });

    log(
      `PARTS 7: OpenAI research completed | parts=${
        partsResearch.parts?.length ?? 0
      } | sources=${partsResearch.sources?.length ?? 0}`
    );

    const responsePayload = {
      ok: true,
      item: {
        id: item.$id,
        title: item.title,
        brand: item.brand || null,
        model: item.model || null,
      },
      partsResearch,
      researchedAt: new Date().toISOString(),
    };

    log(
      `PARTS 8: sending success response | elapsedMs=${
        Date.now() - startedAt
      }`
    );

    return res.json(responsePayload);
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : String(caughtError);

    const statusCode =
      Number.isInteger(caughtError?.statusCode)
        ? caughtError.statusCode
        : 500;

    error(
      `PARTS FAILED | status=${statusCode} | elapsedMs=${
        Date.now() - startedAt
      } | message=${message}`
    );

    return res.json(
      {
        ok: false,
        error: message,
      },
      statusCode
    );
  }
};
