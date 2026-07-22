import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    if (source.includes(replacement)) return source;
    throw new Error(`Could not locate ${label}.`);
  }
  return source.replace(search, replacement);
}

const itemAiPath = new URL("../services/itemAiOptimizedService.ts", import.meta.url);
let itemAi = fs.readFileSync(itemAiPath, "utf8");

const executionHelpers = `
const FUNCTION_EXECUTION_POLL_INTERVAL_MS = 2500;
const TERMINAL_FUNCTION_STATUSES = new Set(["completed", "failed"]);

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForItemAiExecution(initialExecution: any) {
  let execution = initialExecution;

  while (true) {
    const status = String(execution?.status || "").toLowerCase();

    if (TERMINAL_FUNCTION_STATUSES.has(status)) {
      return execution;
    }

    await sleep(FUNCTION_EXECUTION_POLL_INTERVAL_MS);
    execution = await functions.getExecution({
      functionId: APPWRITE.itemAiFunctionId,
      executionId: execution.$id,
    });
  }
}
`;

if (!itemAi.includes("waitForItemAiExecution")) {
  const marker = `const DEFAULT_IDENTIFICATION_TIPS = [
  "Retake the complete item in bright, even light with all edges visible.",
  "Add a sharp close-up of the brand, model, serial, maker, or settings label.",
  "Add close-ups of damage, wear, included accessories, ports, and the underside or back.",
];`;
  if (!itemAi.includes(marker)) {
    throw new Error("Could not locate the item-AI constants block.");
  }
  itemAi = itemAi.replace(marker, `${marker}\n${executionHelpers}`);
}

itemAi = replaceOnce(
  itemAi,
  `  const execution = await functions.createExecution({
    functionId: APPWRITE.itemAiFunctionId,
    body: JSON.stringify({
      fileIds,
      notes: notes.trim(),
    }),
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  });

  let payload: IdentifyItemResponse;`,
  `  const startedExecution = await functions.createExecution({
    functionId: APPWRITE.itemAiFunctionId,
    body: JSON.stringify({
      fileIds,
      notes: notes.trim(),
    }),
    async: true,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  });

  const execution = await waitForItemAiExecution(startedExecution);
  let payload: IdentifyItemResponse;`,
  "the synchronous item-AI execution",
);

itemAi = replaceOnce(
  itemAi,
  `  const fallbackMessage =
    payload.error ||
    "KeepFlip could not get enough visual evidence from this photo.";`,
  `  const fallbackMessage =
    payload.error ||
    (typeof execution.errors === "string" ? execution.errors.trim() : "") ||
    "KeepFlip could not get enough visual evidence from this photo.";`,
  "the item-AI fallback message",
);

itemAi = replaceOnce(
  itemAi,
  `  if (
    execution.responseStatusCode >= 400 &&
    (!isPhotoReadFailure || isOperationalFailure)
  ) {`,
  `  if (
    String(execution.status || "").toLowerCase() === "failed" ||
    (execution.responseStatusCode >= 400 &&
      (!isPhotoReadFailure || isOperationalFailure))
  ) {`,
  "the item-AI execution failure check",
);

fs.writeFileSync(itemAiPath, itemAi, "utf8");

const ebayPath = new URL("../services/ebaySoldCompsService.ts", import.meta.url);
let ebay = fs.readFileSync(ebayPath, "utf8");

ebay = ebay.replace("const MAX_WAIT_MS = 180000;\n", "");

ebay = replaceOnce(
  ebay,
  `  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const progress = await callEbayFunction({
      action: "status",
      purpose,
      runId,
      query,
      barcode,
    });`,
  `  let jobToken = asString(startedPayload.jobToken);

  while (true) {
    await sleep(POLL_INTERVAL_MS);

    const progress = await callEbayFunction({
      action: "status",
      purpose,
      runId,
      jobToken,
      query,
      barcode,
    });

    jobToken = asString(progress.jobToken) || jobToken;`,
  "the eBay polling deadline",
);

ebay = ebay.replace(
  /\n  throw new Error\(\n    "The eBay search is taking longer than expected\. Please try again\."\n  \);\n}\n\nfunction toSoldCompsResult/,
  "\n}\n\nfunction toSoldCompsResult",
);

if (ebay.includes("MAX_WAIT_MS") || ebay.includes("Date.now() < deadline")) {
  throw new Error("The eBay client deadline was not fully removed.");
}
if (!ebay.includes("jobToken = asString(progress.jobToken) || jobToken")) {
  throw new Error("The signed eBay job token is not being refreshed.");
}

ebay = ebay.replace(
  `export async function runStrictEbaySoldComps(
  profile: StrictMarketValueProfile,
  limit = 30`,
  `export async function runStrictEbaySoldComps(
  profile: StrictMarketValueProfile,
  limit = 100`,
);

ebay = replaceOnce(
  ebay,
  `  const raw = await runEbaySoldComps(
    query,
    Math.max(25, Math.min(limit, 50))
  );`,
  `  const raw = await runEbaySoldComps(
    query,
    Math.max(1, Math.floor(limit) || 100)
  );`,
  "the strict eBay result-limit clamp",
);

ebay = replaceOnce(
  ebay,
  `  const individualSales = raw.comps.filter((comp) =>
    isUsableIndividualSale(comp, targetCondition)
  );`,
  `  const positiveSales = raw.comps.filter(
    (comp) => Number.isFinite(comp.totalPrice) && comp.totalPrice > 0
  );
  const individualSales = positiveSales.filter((comp) =>
    isUsableIndividualSale(comp, targetCondition)
  );`,
  "the individual-sales filtering block",
);

ebay = replaceOnce(
  ebay,
  `  const selected = removePriceOutliers(
    dedupeComps(exact.length >= 3 ? exact : [...exact, ...compatible])
  );

  if (!selected.length) {
    throw new Error(
      "KeepFlip could not find usable individual sold listings for this item. Try a more specific model number or title."
    );
  }`,
  `  const preferred = exact.length >= 3
    ? exact
    : compatible.length > 0
      ? [...exact, ...compatible]
      : individualSales.length > 0
        ? individualSales
        : positiveSales;
  const selected = dedupeComps(preferred);

  if (!selected.length) {
    return {
      ...raw,
      query,
      comps: raw.comps,
      summary: raw.summary,
      valuation: buildQuality(profile, model, plan, 0, raw.comps.length),
    };
  }`,
  "the strict comparable rejection block",
);

fs.writeFileSync(ebayPath, ebay, "utf8");

const analysisPath = new URL("../services/item-analysis-service.ts", import.meta.url);
let analysis = fs.readFileSync(analysisPath, "utf8");

analysis = analysis.replace(
  "    if (identified.status !== \"identified\") return identified;\n\n",
  "",
);
analysis = analysis.replace(
  `    if (identification.valuationReadiness === "needs_evidence") {
      return pausedMarketResearch(identification, identified);
    }

`,
  "",
);
analysis = analysis.replace(
  "        serialNumber: null,",
  "        serialNumber: identification.serialNumber,",
);
analysis = analysis.replace(
  "      imageIndex: null,\n      strength: strengthFromConfidence(entry.confidence),",
  "      imageIndex: entry.imageIndex,\n      strength: strengthFromConfidence(entry.confidence),",
);

if (analysis.includes("return pausedMarketResearch(identification, identified);")) {
  throw new Error("The item-analysis valuation gate was not removed.");
}

fs.writeFileSync(analysisPath, analysis, "utf8");

console.log("Removed client execution deadlines and valuation gates.");
console.log("Item AI now uses asynchronous Appwrite execution polling.");
console.log("eBay research now carries its signed job token and polls without a deadline.");
