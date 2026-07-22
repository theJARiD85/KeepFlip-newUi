import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targetPath = path.join(root, "services", "item-analysis-service.ts");
let source = fs.readFileSync(targetPath, "utf8");

function findBalancedBlock(text, startIndex) {
  const opening = text.indexOf("{", startIndex);
  if (opening < 0) throw new Error("Opening brace was not found.");

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = opening; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }

    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return { start: opening, end: index + 1 };
    }
  }

  throw new Error("Balanced block did not close.");
}

function replaceFunction(text, signature, replacement) {
  const start = text.indexOf(signature);
  if (start < 0) throw new Error(`Could not find ${signature}`);
  const block = findBalancedBlock(text, start);
  return text.slice(0, start) + replacement + text.slice(block.end);
}

if (!source.includes("type ItemIdentityEvidence")) {
  source = source.replace(
    "  type ItemIdentificationGuidance,\n  type KeepFlipIdentification,",
    "  type ItemIdentificationGuidance,\n  type ItemIdentityEvidence,\n  type ItemValuationReadiness,\n  type KeepFlipIdentification,",
  );
}

if (!source.includes("type ItemAnalysisEvidenceSource")) {
  source = source.replace(
    "  type AnalyzeItemPhotosOptions,\n  type ItemAnalysisEvidenceStrength,",
    "  type AnalyzeItemPhotosOptions,\n  type ItemAnalysisEvidenceSource,\n  type ItemAnalysisEvidenceStrength,",
  );
}

const valuationFunction = `function valuationFromOldUiResult(
  result: EbaySoldCompsResult,
  readiness: ItemValuationReadiness,
): ItemValuation {
  const prices = result.comps
    .map((comp) => comp.totalPrice)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (prices.length === 0) {
    return {
      status: "needs_comps",
      currency: null,
      suppliedCount: result.comps.length,
      usedCount: 0,
      rejectedCount: result.comps.length,
      median: null,
      p20: null,
      p80: null,
      methodology: "none",
      source: "ebay_sold",
    };
  }

  return {
    status:
      prices.length >= 3 && readiness === "ready"
        ? "ready"
        : "limited_comps",
    currency: result.summary.currency || result.comps[0]?.currency || "USD",
    suppliedCount: result.comps.length,
    usedCount: prices.length,
    rejectedCount: Math.max(0, result.comps.length - prices.length),
    median: roundMoney(percentile(prices, 0.5)),
    p20: roundMoney(percentile(prices, 0.2)),
    p80: roundMoney(percentile(prices, 0.8)),
    methodology: "median_linear_p20_p80_mad_outlier_filter_v1",
    source: "ebay_sold",
  };
}`;

source = replaceFunction(
  source,
  "function valuationFromOldUiResult(",
  valuationFunction,
);

const evidenceHelpers = `function sourceFromIdentityEvidence(
  source: ItemIdentityEvidence["source"],
): ItemAnalysisEvidenceSource {
  switch (source) {
    case "photo_text":
      return "photo_text";
    case "user_notes":
      return "user_notes";
    case "external_evidence":
      return "google_vision";
    case "visual_design":
    default:
      return "photo_visual";
  }
}

function findVariant(identification: KeepFlipIdentification) {
  return (
    identification.identityEvidence
      .filter((entry) => entry.field === "variant")
      .sort((left, right) => right.confidence - left.confidence)[0]?.value ??
    null
  );
}

function identityEvidenceForAnalysis(
  identification: KeepFlipIdentification,
) {
  return identification.identityEvidence.map((entry) => ({
    claim: entry.field,
    value: entry.value,
    source: sourceFromIdentityEvidence(entry.source),
    imageIndex: null,
    strength: strengthFromConfidence(entry.confidence),
    rationale: entry.explanation,
  }));
}

function visibleTextEvidence(identification: KeepFlipIdentification) {
  const directlyRepresented = new Set(
    identification.identityEvidence
      .filter((entry) => entry.source === "photo_text")
      .map((entry) => entry.value.toLowerCase()),
  );

  return identification.detectedText
    .filter((value) => !directlyRepresented.has(value.toLowerCase()))
    .map((value) => ({
      claim: "visible_text",
      value,
      source: "photo_text" as const,
      imageIndex: null,
      strength: strengthFromConfidence(
        identification.confidenceBreakdown.model ||
          identification.confidenceBreakdown.brand ||
          identification.confidenceBreakdown.itemType,
      ),
      rationale: "Text transcribed from the uploaded item photos.",
    }));
}

function fieldEvidenceForAnalysis(identification: KeepFlipIdentification) {
  return identification.evidenceFields
    .filter((field) => field.value.trim())
    .map((field) => ({
      claim: field.key,
      value: field.value,
      source: "photo_visual" as const,
      imageIndex: null,
      strength: strengthFromConfidence(field.confidence),
      rationale:
        field.reason ||
        "A product-specific detail extracted from the uploaded item photos.",
    }));
}

function ambiguityList(identification: KeepFlipIdentification) {
  const candidates = identification.candidateMatches.map(
    (candidate) =>
      \`Possible match (\${candidate.confidence}%): \${candidate.name}. \${candidate.reason}\`,
  );

  return Array.from(
    new Set(
      [
        ...identification.ambiguityNotes,
        ...identification.valuationSignals.uncertainty,
        ...candidates,
      ].filter(Boolean),
    ),
  ).slice(0, 15);
}

function resultSummary(identification: KeepFlipIdentification) {
  if (identification.identificationBasis === "insufficient_evidence") {
    return (
      identification.conditionNotes ||
      "KeepFlip could not establish a reliable item identity from the current photos."
    );
  }

  const certainty =
    identification.valuationReadiness === "ready"
      ? "The identity is specific enough for narrow sold-comparable research."
      : identification.valuationReadiness === "directional"
        ? "The item is identified directionally; exact variant or condition evidence is still limited."
        : "The item type is recognizable, but more evidence is required before valuation.";

  return [identification.title, identification.conditionNotes, certainty]
    .filter(Boolean)
    .join(" ");
}

`;

if (!source.includes("function sourceFromIdentityEvidence(")) {
  const marker = "function identificationResult(";
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("Could not locate identificationResult.");
  source = source.slice(0, index) + evidenceHelpers + source.slice(index);
}

const identificationFunction = `function identificationResult(
  identification: KeepFlipIdentification,
  imageCount: number,
): ItemAnalysisSuccess {
  const status =
    identification.identificationBasis === "insufficient_evidence"
      ? "insufficient_evidence"
      : "identified";
  const signals = identification.valuationSignals;
  const breakdown = identification.confidenceBreakdown;
  const evidence = [
    ...identityEvidenceForAnalysis(identification),
    ...visibleTextEvidence(identification),
    ...fieldEvidenceForAnalysis(identification),
  ].slice(0, 30);

  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: \`\${ITEM_ANALYSIS_VERSION}-evidence-aligned\`,
    status,
    input: {
      imageCount,
      source: "appwrite_storage",
    },
    analysis: {
      summary: resultSummary(identification),
      identification: {
        itemType:
          signals.objectType ||
          (identification.title.toLowerCase() === "unclear item"
            ? null
            : identification.title),
        category: identification.category,
        brand: identification.brand,
        model: identification.model,
        variant: findVariant(identification),
        color: signals.colors[0] ?? null,
        era: signals.era[0] ?? null,
        serialNumber: null,
      },
      condition: {
        grade: identification.condition,
        confidence:
          identification.condition === "unknown"
            ? 0
            : confidence01(breakdown.condition),
        notes: identification.conditionNotes
          ? [identification.conditionNotes]
          : signals.conditionSignals,
      },
      confidence: {
        overall: confidence01(identification.confidence),
        itemType: confidence01(breakdown.itemType),
        brand: identification.brand ? confidence01(breakdown.brand) : 0,
        model: identification.model ? confidence01(breakdown.model) : 0,
        condition:
          identification.condition === "unknown"
            ? 0
            : confidence01(breakdown.condition),
      },
      evidence,
      ambiguities: ambiguityList(identification),
      suggestedPhotos: identification.suggestedPhotos,
      valuationSignals: {
        searchTerms:
          signals.searchQueries.length > 0
            ? signals.searchQueries
            : [identification.productSearchQuery].filter(Boolean),
        category: signals.subcategory ?? identification.category,
        conditionAdjustment:
          identification.conditionNotes ||
          "Only visibly supported condition evidence should affect comparable selection.",
        positiveFactors: signals.conditionSignals,
        negativeFactors: signals.uncertainty,
      },
    },
    vision: {
      enabled: true,
      succeeded: status === "identified",
      images: [
        {
          imageIndex: 0,
          text: identification.detectedText.join("\\n") || null,
          labels: [],
          objects: [],
        },
      ],
      warnings: [
        ...(identification.needsMorePhotos
          ? ["Additional photos would materially improve this result."]
          : []),
        ...(identification.valuationReadiness === "needs_evidence"
          ? ["Valuation research is paused until stronger identity evidence is available."]
          : []),
      ],
    },
    valuation: {
      status: "needs_comps",
      currency: null,
      suppliedCount: 0,
      usedCount: 0,
      rejectedCount: 0,
      median: null,
      p20: null,
      p80: null,
      methodology: "none",
      source: "none",
    },
  };
}`;

source = replaceFunction(
  source,
  "function identificationResult(",
  identificationFunction,
);

const pausedHelper = `function pausedMarketResearch(
  identification: KeepFlipIdentification,
  identified: ItemAnalysisSuccess,
): ItemAnalysisSuccess {
  return {
    ...identified,
    marketResearch: {
      provider: "ebay",
      status: "unavailable",
      query:
        identification.productSearchQuery ||
        identification.valuationSignals.searchQueries[0] ||
        null,
      searchedAt: null,
      comparableCount: 0,
      comps: [],
      error: {
        code: "VALUATION_NEEDS_EVIDENCE",
        message:
          "KeepFlip paused sold-comparable research because the current identity evidence would produce a noisy or misleading value range.",
      },
    },
  };
}

`;

if (!source.includes("function pausedMarketResearch(")) {
  const marker = "export async function analyzeItemPhotos(";
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("Could not locate analyzeItemPhotos.");
  source = source.slice(0, index) + pausedHelper + source.slice(index);
}

const returnMarker = '    if (identified.status !== "identified") return identified;';
if (!source.includes('identification.valuationReadiness === "needs_evidence"')) {
  if (!source.includes(returnMarker)) {
    throw new Error("Could not locate the identified status gate.");
  }

  source = source.replace(
    returnMarker,
    `${returnMarker}

    if (identification.valuationReadiness === "needs_evidence") {
      return pausedMarketResearch(identification, identified);
    }`,
  );
}

source = source.replace(
  "valuation: valuationFromOldUiResult(sold),",
  `valuation: valuationFromOldUiResult(
          sold,
          identification.valuationReadiness,
        ),`,
);

source = source.replace(
  /version: `\$\{ITEM_ANALYSIS_VERSION\}-old-ui-guidance`/,
  'version: `${ITEM_ANALYSIS_VERSION}-evidence-guidance`',
);

source = source.replace(/old-UI item identifier/g, "item identifier");
source = source.replace(/OLD_UI_IDENTIFICATION_FAILED/g, "ITEM_IDENTIFICATION_FAILED");
source = source.replace(/OLD_UI_VALUATION_FAILED/g, "VALUATION_FAILED");
source = source.replace(/old-UI eBay sold-comps service/g, "eBay sold-comps service");

if (!source.includes("confidenceBreakdown")) {
  throw new Error("The confidence breakdown is not being consumed.");
}

if (!source.includes("pausedMarketResearch")) {
  throw new Error("The valuation evidence gate was not installed.");
}

fs.writeFileSync(targetPath, source, "utf8");
console.log("Aligned item-analysis-service.ts with backend evidence and confidence.");
