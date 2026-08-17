import type { ItemAnalysisSuccess } from '@/types/item-analysis';
import { neutralizeMarketplaceBrand } from '@/services/market-copy';

import type {
  AnalysisDecisionCard,
  AnalysisEvidence,
  AnalysisMarketReference,
  AnalysisProfitPlan,
  AnalysisRefinementQuestion,
  AnalysisSuggestedPhoto,
  AnalysisValuationLadder,
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

const EVIDENCE_CLAIM_LABELS: Record<string, string> = {
  multi_photo_brand: 'Brand identification',
  multi_photo_item_type: 'Item category',
  multi_photo_model: 'Model identification',
  online_curated_estimate: 'Patient online resale estimate',
  private_sale_estimate: 'Private-sale market estimate',
  quick_sale_estimate: 'Quick-sale market estimate',
  visual_market_condition: 'Observed condition',
  visual_market_identification: 'Market-supported identification',
};

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizedEvidenceClaim(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function displayText(value: string, maxLength: number) {
  const normalized = neutralizeMarketplaceBrand(value)
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function isUnresolvedValue(value: string) {
  const normalized = value
    .replace(/[.!:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return (
    /^(?:unknown|undetermined|unidentified|unavailable|not available|not determined|unable to determine|n\/a|null|none)$/.test(
      normalized,
    ) ||
    /\b(?:unknown|undetermined|unidentified|unavailable)\b/.test(normalized) ||
    /\b(?:could not|cannot|can't|unable to|not able to)\s+(?:be\s+)?(?:determine|identify|verify)/.test(
      normalized,
    )
  );
}

function displayKnownText(
  value: string | null | undefined,
  maxLength: number,
) {
  if (!value) return undefined;
  const text = displayText(value, maxLength);
  return text && !isUnresolvedValue(text) ? text : undefined;
}

function evidenceLabel(
  item: ItemAnalysisSuccess['analysis']['evidence'][number],
) {
  const claim = normalizedEvidenceClaim(item.claim);

  if (claim === 'market_value_factor' || claim === 'market_value_factors') {
    return displayKnownText(item.value, 96) ?? 'Market value factor';
  }

  return EVIDENCE_CLAIM_LABELS[claim] ?? titleCase(claim);
}

function compact<T>(values: (T | null | undefined | '')[]) {
  return values.filter((value): value is T => value != null && value !== '');
}

function suggestedPhotos(result: ItemAnalysisSuccess): AnalysisSuggestedPhoto[] {
  const suggestions = result.analysis.suggestedPhotos.filter(
    (value) => Boolean(displayKnownText(value, 120)),
  );
  const resolved =
    suggestions.length > 0
      ? suggestions
      : [
        'A sharp photo of the entire item in even lighting',
        'A close-up of any label, logo, model number, or maker mark',
      ];

  return resolved.reduce<AnalysisSuggestedPhoto[]>((photos, label, index) => {
      const text = displayKnownText(label, 120);
      if (text) {
        photos.push({
          id: `analysis-photo-${index}`,
          label: text,
          priority:
            result.status === 'insufficient_evidence' ? 'required' : 'recommended',
        });
      }
      return photos;
    }, []);
}

function evidence(result: ItemAnalysisSuccess): AnalysisEvidence[] {
  return result.analysis.evidence
    .filter((item) => {
      const detail = [item.value, item.rationale]
        .filter((value): value is string => Boolean(value))
        .join(' ');
      return Boolean(displayKnownText(detail, 320));
    })
    .map((item, index) => ({
    id: `analysis-evidence-${index}`,
    label: evidenceLabel(item),
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
      reason: displayKnownText(question.reason, 240),
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
  const itemType = displayKnownText(identity.itemType, 120);
  if (itemType) return itemType;
  const preciseTitle = compact<string>([
    displayKnownText(identity.brand, 72),
    displayKnownText(identity.model, 72),
    displayKnownText(identity.variant, 72),
  ]).join(' ');
  if (preciseTitle) return displayText(preciseTitle, 120);
  return displayKnownText(identity.category, 120) ?? 'Item Scan';
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
      snippet: reference.snippet
        ? displayText(reference.snippet, 360)
        : undefined,
      source: reference.source
        ? displayText(reference.source, 80)
        : undefined,
      title: displayText(reference.title, 160),
    })),
    safetyWarnings: guidance.safetyWarnings.map((warning) =>
      displayText(warning, 240),
    ),
    searchedAt: guidance.searchedAt,
    steps: guidance.steps.map((step) => displayText(step, 280)),
    summary: guidance.summary ? displayText(guidance.summary, 520) : null,
    toolsOrParts: guidance.toolsOrParts.map((item) =>
      displayText(item, 120),
    ),
  };
}

function marketDecisionCard(result: ItemAnalysisSuccess): AnalysisDecisionCard {
  const supplied = result.marketResearch?.decisionCard;
  if (supplied) {
    const kind =
      supplied.type === 'flip'
        ? 'flip'
        : supplied.type === 'skip'
          ? 'skip'
          : 'undetermined';
    const reasons =
      kind === 'skip'
        ? supplied.reasons
          .map((reason) => {
            const factor = displayKnownText(reason.factor, 84);
            const evidence = displayKnownText(reason.evidence, 320);
            const impact = displayKnownText(reason.impact, 220);
            return factor && evidence && impact
              ? { factor, evidence, impact }
              : null;
          })
          .filter((reason): reason is AnalysisDecisionCard['reasons'][number] => Boolean(reason))
          .slice(0, 4)
        : [];
    const missingInputs =
      kind === 'undetermined'
        ? supplied.missingInputs
          .map((value) => displayKnownText(value, 120))
          .filter((value): value is string => Boolean(value))
          .slice(0, 6)
        : [];

    return {
      confidence: supplied.confidencePercent ?? undefined,
      kind,
      label: kind === 'flip' ? 'FLIP' : kind === 'skip' ? 'SKIP' : 'UNDETERMINED',
      missingInputs,
      reasons,
      status: supplied.status,
      summary:
        displayKnownText(supplied.summary, 460) ??
        (kind === 'flip'
          ? 'Market evidence supports a flip.'
          : kind === 'skip'
            ? 'Market evidence supports passing on this item.'
            : 'The available evidence cannot support a flip or skip decision yet.'),
    };
  }

  const legacy = result.marketResearch?.flipDecision;
  const kind =
    legacy?.verdict === 'flip'
      ? 'flip'
      : legacy?.verdict === 'skip'
        ? 'skip'
        : 'undetermined';
  const summary =
    displayKnownText(legacy?.summary, 460) ??
    (kind === 'flip'
      ? 'Market evidence supports a flip.'
      : kind === 'skip'
        ? 'Market evidence supports passing on this item.'
        : 'The available evidence cannot support a flip or skip decision yet.');
  const fallbackReasons: AnalysisDecisionCard['reasons'] = [];
  const velocity = result.marketResearch?.marketVelocity;
  const complexity = result.marketResearch?.flipComplexity;

  if (kind === 'skip' && velocity?.demand === 'slow') {
    fallbackReasons.push({
      factor: 'Resale velocity',
      evidence:
        displayKnownText(velocity.evidence, 320) ??
        `Market demand is slow${velocity.typicalDays != null ? ` with about ${velocity.typicalDays} days to sell` : ''}.`,
      impact: 'Slow turnover increases holding time and sale friction.',
    });
  }
  if (kind === 'skip' && complexity?.level === 'complex') {
    fallbackReasons.push({
      factor: 'Sale complexity',
      evidence:
        displayKnownText(complexity.summary, 320) ??
        'The item needs complex preparation before a confident resale.',
      impact: 'The required work raises the effort and risk of completing the resale.',
    });
  }
  if (kind === 'skip' && fallbackReasons.length === 0) {
    fallbackReasons.push({
      factor: 'Market assessment',
      evidence: summary,
      impact: 'This is the available evidence-bound basis for passing on the item.',
    });
  }

  return {
    confidence: legacy?.confidencePercent ?? undefined,
    kind,
    label: kind === 'flip' ? 'FLIP' : kind === 'skip' ? 'SKIP' : 'UNDETERMINED',
    missingInputs:
      kind === 'undetermined'
        ? (legacy?.missingInputs ?? [])
          .map((value) => displayKnownText(value, 120))
          .filter((value): value is string => Boolean(value))
          .slice(0, 6)
        : [],
    reasons: fallbackReasons,
    status:
      kind === 'undetermined'
        ? result.valuation.status === 'ready'
          ? 'provisional'
          : 'needs_more_evidence'
        : 'decided',
    summary,
  };
}

function profitPlan(result: ItemAnalysisSuccess): AnalysisProfitPlan {
  const identity = result.analysis.identification;
  const valuation = result.valuation;
  const currency = valuation.currency ?? 'USD';
  const decision = marketDecisionCard(result);
  if (decision.kind !== 'flip') {
    return { actions: [], currency };
  }
  const hasRange =
    valuation.p20 != null && valuation.median != null && valuation.p80 != null;
  const listingIdentity = compact<string>([
    identity.brand,
    identity.model,
    identity.variant,
  ]).join(' ');
  const conditionSignal = result.analysis.condition.notes[0];
  const actions: AnalysisProfitPlan['actions'] = [];

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
    ? `${titleCase(quality.confidence)} confidence${quality.searchRoute ? ` ${quality.searchRoute.replaceAll('_', ' ')} search` : ''}. ${quality.warnings[0] ? displayText(quality.warnings[0], 220) : ''}`.trim()
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
        (market.error?.message
          ? displayText(market.error.message, 280)
          : null) ??
        'KeepFlip completed the identification but could not retrieve market valuation evidence.',
      status: 'not-ready',
    };
  }

  if (valuation.status === 'ready') {
    if (usesSerpApiAiMode) {
      return {
        label: 'Visual market estimate ready',
        reason: `KeepFlip AI Mode evaluated the item photo and returned a current private-sale range. This is a directional AI market estimate, not a verified sold transaction. ${qualityDetail}`.trim(),
        status: 'ready',
      };
    }
    if (usesSoldMarketData) {
      return {
        label: 'Sold-market range ready',
        reason: `${valuation.usedCount} ${soldEvidenceLabel} remained after identity, condition, currency, duplicate, and outlier filtering. ${qualityDetail}`.trim(),
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
      reason: 'The completed-listing search did not return enough usable sold comps to calculate a range.',
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

function valuationLadder(
  result: ItemAnalysisSuccess,
): AnalysisValuationLadder | undefined {
  const ladder = result.marketResearch?.valuationLadder;
  if (!ladder) return undefined;

  return {
    level: ladder.level,
    reason: displayKnownText(ladder.reason, 360),
    confidence: Number.isFinite(ladder.confidence)
      ? Math.max(0, Math.min(100, ladder.confidence))
      : undefined,
  };
}

function acquisitionGuidance(
  result: ItemAnalysisSuccess,
): ItemAnalysisOverlayResult['acquisitionGuidance'] {
  const guidance = result.marketResearch?.acquisitionGuidance;
  if (!guidance || guidance.status === 'needs_evidence') return undefined;
  if (
    guidance.maxBuyPrice == null ||
    !Number.isFinite(guidance.maxBuyPrice) ||
    guidance.maxBuyPrice < 0
  ) {
    return undefined;
  }

  return {
    status: guidance.status,
    label: displayKnownText(guidance.label, 80) ?? 'Top Dollar to Pay',
    maxBuyPrice: guidance.maxBuyPrice,
    resaleBasis:
      guidance.resaleBasis != null &&
      Number.isFinite(guidance.resaleBasis) &&
      guidance.resaleBasis > 0
        ? guidance.resaleBasis
        : undefined,
    currency: displayKnownText(guidance.currency, 12) ?? undefined,
    formula: displayKnownText(guidance.formula, 280),
    assumptions: guidance.assumptions
      .map((value) => displayKnownText(value, 280))
      .filter((value): value is string => Boolean(value))
      .slice(0, 5),
    missingInputs: guidance.missingInputs
      .map((value) => displayKnownText(value, 280))
      .filter((value): value is string => Boolean(value))
      .slice(0, 5),
    summary: displayKnownText(guidance.summary, 420),
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
  const observedCondition =
    result.analysis.condition.grade === 'unknown'
      ? undefined
      : {
        details: result.analysis.condition.notes
          .map((note) => displayKnownText(note, 220))
          .filter((note): note is string => Boolean(note)),
        label: displayText(titleCase(result.analysis.condition.grade), 80),
        titleLabel: result.analysis.displayTitles?.observedCondition,
        score: result.analysis.condition.confidence,
      };

  return {
    acquisitionGuidance: acquisitionGuidance(result),
    condition: observedCondition,
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
    decisionCard: marketDecisionCard(result),
    identity: {
      brand: displayKnownText(identity.brand, 72),
      category: displayKnownText(identity.category, 72),
      confidence: confidence.overall,
      model: displayKnownText(identity.model, 72),
      title: resultTitle(result),
      titleLabel: result.analysis.displayTitles?.exactItemName,
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
    summary: displayKnownText(result.analysis.summary, 480),
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
        source:
          usesSerpApiAiMode
            ? 'serpapi_ai'
            : valuationSource === 'multi_market_sold'
              ? 'multi_market'
              : valuationSource === 'ebay_sold'
                ? 'ebay'
                : 'supplied',
        titleLabel: result.analysis.displayTitles?.currentResaleMarketValue,
      }
      : undefined,
    valuationLadder: valuationLadder(result),
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
