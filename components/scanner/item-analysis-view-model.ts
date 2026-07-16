import type { ItemAnalysisSuccess } from '@/types/item-analysis';

import type {
  AnalysisEvidence,
  AnalysisSuggestedPhoto,
  ItemAnalysisResult as ItemAnalysisOverlayResult,
  ItemAnalysisState,
} from './item-analysis-overlay';

const EVIDENCE_SOURCE_LABELS: Record<
  ItemAnalysisSuccess['analysis']['evidence'][number]['source'],
  string
> = {
  google_vision: 'Vision OCR',
  photo_text: 'Photo text',
  photo_visual: 'Visual',
  user_notes: 'User note',
};

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compact<T>(values: (T | null | undefined | '')[]) {
  return values.filter((value): value is T => value != null && value !== '');
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    label,
    priority: result.status === 'insufficient_evidence' ? 'required' : 'recommended',
  }));
}

function evidence(result: ItemAnalysisSuccess): AnalysisEvidence[] {
  return result.analysis.evidence.map((item, index) => ({
    id: `analysis-evidence-${index}`,
    label: item.claim,
    source: EVIDENCE_SOURCE_LABELS[item.source],
    value: item.rationale ? `${item.value} · ${item.rationale}` : item.value,
  }));
}

function resultTitle(result: ItemAnalysisSuccess) {
  const identity = result.analysis.identification;
  const preciseTitle = compact<string>([identity.brand, identity.model, identity.variant]).join(' ');
  if (preciseTitle) return preciseTitle;
  return identity.itemType ?? identity.category ?? 'Item identified from photo evidence';
}

function valuationReadiness(result: ItemAnalysisSuccess): ItemAnalysisOverlayResult['valuationReadiness'] {
  const valuation = result.valuation;
  const market = result.marketResearch;
  const quality = market?.quality;
  const qualityDetail = quality
    ? `${titleCase(quality.confidence)} confidence${quality.searchRoute ? ` ${quality.searchRoute.replaceAll('_', ' ')} search` : ''}. ${quality.warnings[0] ?? ''}`.trim()
    : '';

  if (market?.status === 'failed' || market?.status === 'unavailable') {
    return {
      label: market.status === 'failed' ? 'eBay research interrupted' : 'eBay research not configured',
      reason:
        market.error?.message ??
        'KeepFlip completed the identification but could not retrieve sold comps.',
      status: 'not-ready',
    };
  }

  if (valuation.status === 'ready') {
    if (valuation.source === 'ebay_sold') {
      return {
        label: 'eBay sold range ready',
        reason: `${valuation.usedCount} completed eBay sale${valuation.usedCount === 1 ? '' : 's'} remained after identity, condition, currency, duplicate, and outlier filtering${market?.query ? ` for “${market.query}”` : ''}. ${qualityDetail}`.trim(),
        status: 'ready',
      };
    }
    return {
      label: 'Supplied-price range ready',
      reason: `${valuation.usedCount} caller-supplied prices remained after validation and outlier filtering. Their marketplace provenance has not been independently verified.`,
      status: 'ready',
    };
  }

  if (valuation.status === 'limited_comps') {
    if (valuation.source === 'ebay_sold') {
      return {
        label: 'Limited eBay market signal',
        reason: `Only ${valuation.usedCount} matching completed sale${valuation.usedCount === 1 ? '' : 's'} remained after validation. Treat this as an early signal, not a firm list price. ${qualityDetail}`.trim(),
        status: 'limited',
      };
    }
    return {
      label: 'Early market signal',
      reason: `Only ${valuation.usedCount} caller-supplied price${valuation.usedCount === 1 ? '' : 's'} passed validation. Add verified sold comps before pricing the item.`,
      status: 'limited',
    };
  }

  if (valuation.source === 'ebay_sold' && market?.status === 'completed') {
    return {
      label: 'No matching eBay sales found',
      reason: market.query
        ? `The completed-listing search for “${market.query}” did not return enough usable sold comps to calculate a range.`
        : 'The completed-listing search did not return enough usable sold comps to calculate a range.',
      status: 'not-ready',
    };
  }

  return {
    label: 'Market comps needed',
    reason:
      'KeepFlip identified the item without inventing a price. Add verified sold comparables to calculate a defensible range.',
    status: 'not-ready',
  };
}

export function toItemAnalysisResult(result: ItemAnalysisSuccess): ItemAnalysisOverlayResult {
  const identity = result.analysis.identification;
  const confidence = result.analysis.confidence;
  const valuation = result.valuation;
  const canShowValuation =
    valuation.p20 != null && valuation.median != null && valuation.p80 != null;

  return {
    condition: {
      details: result.analysis.condition.notes,
      label: titleCase(result.analysis.condition.grade),
      score: result.analysis.condition.confidence,
    },
    confidence: {
      condition: confidence.condition,
      identity: average([confidence.itemType, confidence.brand, confidence.model]),
      overall: confidence.overall,
    },
    evidence: evidence(result),
    identity: {
      brand: identity.brand ?? undefined,
      category: identity.category ?? undefined,
      confidence: confidence.overall,
      model: identity.model ?? undefined,
      title: resultTitle(result),
      variant: compact<string>([identity.variant, identity.color, identity.era]).join(' · ') || undefined,
    },
    suggestedPhotos: suggestedPhotos(result),
    summary: result.analysis.summary,
    valuation: canShowValuation
      ? {
          basis:
            valuation.methodology === 'none'
              ? undefined
              : 'Median with 20th–80th percentile range and outlier filtering',
          comparableCount: valuation.usedCount,
          currency: valuation.currency ?? 'USD',
          high: valuation.p80!,
          low: valuation.p20!,
          median: valuation.median!,
          query: result.marketResearch?.query ?? undefined,
          source: valuation.source === 'ebay_sold' ? 'ebay' : 'supplied',
        }
      : undefined,
    valuationReadiness: valuationReadiness(result),
  };
}

export function toItemAnalysisState(result: ItemAnalysisSuccess): ItemAnalysisState {
  if (result.status === 'insufficient_evidence') {
    return {
      evidence: result.analysis.evidence.map((item) => `${item.claim}: ${item.value}`),
      message: result.analysis.summary,
      status: 'insufficient-evidence',
      suggestedPhotos: suggestedPhotos(result),
    };
  }

  return { data: toItemAnalysisResult(result), status: 'result' };
}
