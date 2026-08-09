import type { ItemAnalysisSuccess } from '@/types/item-analysis';

import type {
  AnalysisEvidence,
  AnalysisMarketReference,
  AnalysisProfitPlan,
  AnalysisRefinementQuestion,
  AnalysisSuggestedPhoto,
  ItemAnalysisResult as ItemAnalysisOverlayResult,
  ItemAnalysisState,
} from './analysis-visual-types';

const EVIDENCE_SOURCE_LABELS: Record<
  ItemAnalysisSuccess['analysis']['evidence'][number]['source'],
  string
> = {
  google_vision: 'Vision OCR',
  photo_text: 'Photo text',
  photo_visual: 'Visual',
  user_notes: 'User note',
  web_market: 'AI Mode',
};

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function compact<T>(values: (T | null | undefined | '')[]) {
  return values.filter((value): value is T => value != null && value !== '');
}

function suggestedPhotos(result: ItemAnalysisSuccess): AnalysisSuggestedPhoto[] {
  const suggestions = result.analysis.suggestedPhotos;
  const resolved =
    suggestions.length > 0
      ? suggestions
      : [
        'A sharp photo of the entire item in even lighting',
        'A close-up of any label, logo, model number, or maker mark',
      ];

  return resolved.map((label, index) => ({
    id: `analysis-photo-${index}`,
    label: displayText(label, 120),
    priority: result.status === 'insufficient_evidence' ? 'required' : 'recommended',
  }));
}

function evidence(result: ItemAnalysisSuccess): AnalysisEvidence[] {
  return result.analysis.evidence.map((item, index) => ({
    id: `analysis-evidence-${index}`,
    label: displayText(item.claim, 72),
    source: EVIDENCE_SOURCE_LABELS[item.source],
    value: displayText(
      item.rationale ? `${item.value} · ${item.rationale}` : item.value,
      320,
    ),
  }));
}

function marketReferences(
  result: ItemAnalysisSuccess,
): AnalysisMarketReference[] {
  const references = result.marketResearch?.references ?? [];
  const seen = new Set<string>();
  const normalized: AnalysisMarketReference[] = [];

  for (const reference of references) {
    const link = reference.link.trim();
    const title = displayText(
      reference.title || reference.source || 'Market reference',
      160,
    );
    const dedupeKey = (link || title).toLowerCase();
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push({
      id: `market-reference-${normalized.length}`,
      link: link || undefined,
      snippet: reference.snippet
        ? displayText(reference.snippet, 360)
        : undefined,
      source: reference.source
        ? displayText(reference.source, 80)
        : undefined,
      title,
    });

    if (normalized.length === 8) break;
  }

  return normalized;
}

function asRefinementQuestion(detail: string) {
  const normalized = displayText(
    detail.replace(/^[\s\-*\d.)]+/, '').replace(/[.!]+$/, ''),
    160,
  );
  if (!normalized) return '';
  if (detail.trim().endsWith('?')) return normalized.endsWith('?') ? normalized : `${normalized}?`;
  if (/^(what|which|who|when|where|why|how|is|are|was|were|do|does|did|can|could|would|will)\b/i.test(normalized)) {
    return `${normalized}?`;
  }
  return `Can you add ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}?`;
}

function refinementQuestions(
  result: ItemAnalysisSuccess,
): AnalysisRefinementQuestion[] {
  const suppliedQuestions = result.marketResearch?.refinementQuestions ?? [];
  const seen = new Set<string>();
  const questions: AnalysisRefinementQuestion[] = [];

  for (const question of suppliedQuestions) {
    const prompt = displayText(question.prompt, 160);
    const dedupeKey = prompt.toLowerCase();
    if (!prompt || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    questions.push({
      id: `market-refinement-${questions.length}`,
      prompt,
      reason: question.reason
        ? displayText(question.reason, 240)
        : undefined,
    });
    if (questions.length >= 6) break;
  }

  if (questions.length === 0) {
    for (const detail of (result.marketResearch?.suggestedDetails ?? []).slice(0, 6)) {
      const prompt = asRefinementQuestion(detail);
      const dedupeKey = prompt.toLowerCase();
      if (!prompt || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      questions.push({
        id: `market-refinement-${questions.length}`,
        prompt,
        reason: 'This detail can tighten the item match and resale valuation.',
      });
    }
  }

  return questions;
}

function resultTitle(result: ItemAnalysisSuccess) {
  const identity = result.analysis.identification;
  if (identity.itemType) return displayText(identity.itemType, 120);
  const preciseTitle = compact<string>([identity.brand, identity.model, identity.variant]).join(' ');
  if (preciseTitle) return displayText(preciseTitle, 120);
  return displayText(
    identity.itemType ?? identity.category ?? 'Item identified from photo evidence',
    120,
  );
}

function profitabilityGuidanceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function profitabilityGuidanceFor(
  result: ItemAnalysisSuccess,
  actionTitle: string,
): AnalysisProfitPlan["actions"][number]["guidance"] {
  const target = profitabilityGuidanceKey(actionTitle);
  const guidance = result.marketResearch?.profitabilityGuidance?.find(
    (entry) => profitabilityGuidanceKey(entry.actionTitle) === target,
  );

  if (!guidance) return undefined;

  return {
    references: guidance.references?.map((reference, index) => ({
      id: `profitability-guidance-reference-${index}`,
      link: reference.link,
      snippet: reference.snippet ?? undefined,
      source: reference.source ?? undefined,
      title: reference.title,
    })),
    safetyWarnings: guidance.safetyWarnings,
    searchedAt: guidance.searchedAt,
    steps: guidance.steps,
    summary: guidance.summary,
    toolsOrParts: guidance.toolsOrParts,
  };
}

function profitPlan(result: ItemAnalysisSuccess): AnalysisProfitPlan {
  const identity = result.analysis.identification;
  const valuation = result.valuation;
  const currency = valuation.currency ?? 'USD';
  const hasRange =
    valuation.p20 != null && valuation.median != null && valuation.p80 != null;
  const listingIdentity = compact<string>([
    identity.brand,
    identity.model,
    identity.variant,
  ]).join(' ');
  const conditionSignal = result.analysis.condition.notes[0];
  const actions: AnalysisProfitPlan['actions'] = [];
  const flipDecision = result.marketResearch?.flipDecision;
  const marketVelocity = result.marketResearch?.marketVelocity;
  const flipComplexity = result.marketResearch?.flipComplexity;

  if (flipDecision && flipDecision.verdict !== 'unknown') {
    const decisionSignals = compact<string>([
      marketVelocity && marketVelocity.demand !== 'unknown'
        ? `Resale velocity: ${titleCase(marketVelocity.demand)}${marketVelocity.typicalDays != null ? ` (${marketVelocity.typicalDays} days typical)` : ''}`
        : null,
      flipComplexity && flipComplexity.level !== 'unknown'
        ? `Flip complexity: ${titleCase(flipComplexity.level)}`
        : null,
      flipDecision.missingInputs.length > 0
        ? `Still needed: ${flipDecision.missingInputs.join(', ')}`
        : null,
    ]);

    actions.push({
      confidence: flipDecision.confidencePercent ?? undefined,
      detail: displayText(
        [flipDecision.summary, ...decisionSignals].filter(Boolean).join(' '),
        360,
      ),
      id: 'profit-flip-verdict',
      kind: 'decision',
      label: `Flip verdict: ${titleCase(flipDecision.verdict)}`,
    });
  }

  const suppliedActions = result.marketResearch?.profitabilityActions ?? [];
  if (suppliedActions.length > 0) {
    const seenActions = new Set<string>();
    for (const action of suppliedActions) {
      const label = displayText(action.title, 72);
      const detail = displayText(action.detail, 260);
      const dedupeKey = `${label}|${detail}`.toLowerCase();
      if ((!label && !detail) || seenActions.has(dedupeKey)) continue;
      seenActions.add(dedupeKey);
      const actionLabel =
        label || `Market value opportunity ${String(actions.length + 1).padStart(2, '0')}`;
      actions.push({
        confidence: action.confidencePercent ?? undefined,
        detail: detail || label,
        guidance: profitabilityGuidanceFor(result, actionLabel),
        id: `profit-market-action-${actions.length}`,
        kind: 'enhancement',
        label: actionLabel,
      });
      if (actions.length === 5) break;
    }
  } else {
    const seenMarketFactors = new Set<string>();
    for (const factor of result.marketResearch?.factors ?? []) {
      const detail = displayText(factor, 260);
      const dedupeKey = detail.toLowerCase();
      if (!detail || seenMarketFactors.has(dedupeKey)) continue;
      seenMarketFactors.add(dedupeKey);
      const actionLabel =
        `Market value opportunity ${String(actions.length + 1).padStart(2, '0')}`;
      actions.push({
        detail,
        guidance: profitabilityGuidanceFor(result, actionLabel),
        id: `profit-market-factor-${actions.length}`,
        kind: 'enhancement',
        label: actionLabel,
      });
      if (actions.length === 5) break;
    }
  }

  if (hasRange) {
    const actionLabel = 'Leave room for offers';
    actions.push({
      detail: `Open near ${new Intl.NumberFormat('en-US', { currency, maximumFractionDigits: 0, style: 'currency' }).format(valuation.p80!)} and use ${new Intl.NumberFormat('en-US', { currency, maximumFractionDigits: 0, style: 'currency' }).format(valuation.median!)} as the evidence-backed offer target.`,
      guidance: profitabilityGuidanceFor(result, actionLabel),
      id: 'profit-price-position',
      kind: 'enhancement',
      label: actionLabel,
    });
  } else {
    const actionLabel = 'Protect the price decision';
    actions.push({
      detail: 'Collect stronger market evidence before setting a firm asking price.',
      guidance: profitabilityGuidanceFor(result, actionLabel),
      id: 'profit-price-evidence',
      kind: 'enhancement',
      label: actionLabel,
    });
  }

  if (listingIdentity) {
    const actionLabel = 'Use the strongest search terms';
    actions.push({
      detail: `Lead the listing title with ${displayText(listingIdentity, 86)} so qualified buyers can find the exact item.`,
      guidance: profitabilityGuidanceFor(result, actionLabel),
      id: 'profit-title-keywords',
      kind: 'enhancement',
      label: actionLabel,
    });
  }

  if (conditionSignal) {
    const actionLabel = 'Turn condition into trust';
    actions.push({
      detail: `Photograph and describe this condition signal clearly: ${displayText(conditionSignal, 120)}`,
      guidance: profitabilityGuidanceFor(result, actionLabel),
      id: 'profit-condition-proof',
      kind: 'enhancement',
      label: actionLabel,
    });
  } else {
    const actionLabel = 'Prove condition visually';
    actions.push({
      detail: 'Add close photos of high-wear areas, included accessories, labels, and working features.',
      guidance: profitabilityGuidanceFor(result, actionLabel),
      id: 'profit-condition-proof',
      kind: 'enhancement',
      label: actionLabel,
    });
  }

  return {
    actions: actions.slice(0, 8),
    currency,
    expectedSale: hasRange ? valuation.median! : undefined,
    listTarget: hasRange ? valuation.p80! : undefined,
    quickSale: hasRange ? valuation.p20! : undefined,
  };
}

function valuationReadiness(result: ItemAnalysisSuccess): ItemAnalysisOverlayResult['valuationReadiness'] {
  const valuation = result.valuation;
  const market = result.marketResearch;
  const quality = market?.quality;
  const valuationSource = String(valuation.source ?? 'none');
  const usesMultiMarketSales = valuationSource === 'multi_market_sold';
  const usesLegacyEbaySales = valuationSource === 'ebay_sold';
  const usesSerpApiAiMode =
    valuationSource === 'keepflip_ai' || market?.provider === 'keepflip_ai';
  const usesSoldMarketData = usesMultiMarketSales || usesLegacyEbaySales;
  const soldEvidenceLabel = usesMultiMarketSales
    ? `confirmed marketplace sale${valuation.usedCount === 1 ? '' : 's'}`
    : `completed marketplace sale${valuation.usedCount === 1 ? '' : 's'}`;
  const qualityDetail = quality
    ? `${titleCase(quality.confidence)} confidence${quality.searchRoute ? ` ${quality.searchRoute.replaceAll('_', ' ')} search` : ''}. ${quality.warnings[0] ?? ''}`.trim()
    : '';

  if (market?.status === 'failed' || market?.status === 'unavailable') {
    return {
      label:
        market.status === 'failed'
          ? usesSerpApiAiMode
            ? 'Visual market research interrupted'
            : 'Sold-market research interrupted'
          : 'Market research not configured',
      reason:
        market.error?.message ??
        'KeepFlip completed the identification but could not retrieve market valuation evidence.',
      status: 'not-ready',
    };
  }

  if (valuation.status === 'ready') {
    if (usesSerpApiAiMode) {
      return {
        label: 'Visual market estimate ready',
        reason: `KeepFlip AI Mode evaluated the item photo and returned a current private-sale range${market?.query ? ` for “${market.query}”` : ''}. This is a directional AI market estimate, not a verified sold transaction. ${qualityDetail}`.trim(),
        status: 'ready',
      };
    }
    if (usesSoldMarketData) {
      return {
        label: 'Sold-market range ready',
        reason: `${valuation.usedCount} ${soldEvidenceLabel} remained after identity, condition, currency, duplicate, and outlier filtering${market?.query ? ` for “${market.query}”` : ''}. ${qualityDetail}`.trim(),
        status: 'ready',
      };
    }
    return {
      label: 'Supplied-price range ready',
      reason: `${valuation.usedCount} caller-supplied prices remained after validation and outlier filtering. Their marketplace provenance has not been independently confirmed.`,
      status: 'ready',
    };
  }

  if (valuation.status === 'limited_comps') {
    if (usesSoldMarketData) {
      return {
        label: 'Limited sold-market signal',
        reason: `Only ${valuation.usedCount} matching ${soldEvidenceLabel} remained after validation. Treat this as an early signal, not a firm list price. ${qualityDetail}`.trim(),
        status: 'limited',
      };
    }
    return {
      label: 'Early market signal',
      reason: `Only ${valuation.usedCount} caller-supplied price${valuation.usedCount === 1 ? '' : 's'} passed validation. Add confirmed sold comps before pricing the item.`,
      status: 'limited',
    };
  }

  if (usesSoldMarketData && market?.status === 'completed') {
    return {
      label: 'No matching sold-market transactions found',
      reason: market.query
        ? `The completed-listing search for “${market.query}” did not return enough usable sold comps to calculate a range.`
        : 'The completed-listing search did not return enough usable sold comps to calculate a range.',
      status: 'not-ready',
    };
  }

  return {
    label: 'Market comps needed',
    reason:
      'KeepFlip identified the item without inventing a price. Add confirmed sold comparables to calculate a defensible range.',
    status: 'not-ready',
  };
}

export function toItemAnalysisResult(result: ItemAnalysisSuccess): ItemAnalysisOverlayResult {
  const identity = result.analysis.identification;
  const confidence = result.analysis.confidence;
  const valuation = result.valuation;
  const valuationSource = String(valuation.source ?? 'none');
  const usesSerpApiAiMode = valuationSource === 'keepflip_ai';
  const canShowValuation =
    valuation.p20 != null && valuation.median != null && valuation.p80 != null;

  return {
    condition: {
      details: result.analysis.condition.notes.map((note) =>
        displayText(note, 220),
      ),
      label: displayText(titleCase(result.analysis.condition.grade), 80),
      score: result.analysis.condition.confidence,
    },
    confidence: {
      brand: confidence.brand,
      condition: confidence.condition,
      identity: confidence.overall,
      itemType: confidence.itemType,
      model: confidence.model,
      overall: confidence.overall,
      valuation: confidence.valuation,
    },
    evidence: evidence(result),
    identity: {
      brand: identity.brand ? displayText(identity.brand, 72) : undefined,
      category: identity.category ? displayText(identity.category, 72) : undefined,
      confidence: confidence.overall,
      model: identity.model ? displayText(identity.model, 72) : undefined,
      title: resultTitle(result),
      variant:
        displayText(
          compact<string>([identity.variant, identity.color, identity.era]).join(' · '),
          120,
        ) || undefined,
    },
    marketReferences: marketReferences(result),
    profitPlan: profitPlan(result),
    refinementQuestions: refinementQuestions(result),
    suggestedPhotos: suggestedPhotos(result),
    summary: displayText(result.analysis.summary, 480),
    valuation: canShowValuation
      ? {
        basis:
          valuation.methodology === 'keepflip_ai_private_sale_range_v1' ||
            valuation.methodology === 'keepflip_ai_private_sale_range_v2'
            ? 'Private-sale range inferred by KeepFlip AI Mode from the item photo and cited web evidence'
            : valuation.methodology === 'none'
              ? undefined
              : 'Median with 20th–80th percentile range and outlier filtering',
        comparableCount: usesSerpApiAiMode ? undefined : valuation.usedCount,
        currency: valuation.currency ?? 'USD',
        high: valuation.p80!,
        low: valuation.p20!,
        median: valuation.median!,
        query: result.marketResearch?.query ?? undefined,
        source:
          usesSerpApiAiMode
            ? 'serpapi_ai'
            : valuationSource === 'multi_market_sold'
              ? 'multi_market'
              : valuationSource === 'ebay_sold'
                ? 'ebay'
                : 'supplied',
      }
      : undefined,
    valuationReadiness: valuationReadiness(result),
  };
}

export function toItemAnalysisState(result: ItemAnalysisSuccess): ItemAnalysisState {
  if (result.status === 'insufficient_evidence') {
    return {
      evidence: result.analysis.evidence.map((item) =>
        displayText(`${item.claim}: ${item.value}`, 280),
      ),
      message: displayText(result.analysis.summary, 480),
      status: 'insufficient-evidence',
      suggestedPhotos: suggestedPhotos(result),
    };
  }

  return { data: toItemAnalysisResult(result), status: 'result' };
}
