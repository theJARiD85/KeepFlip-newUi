import type {
  LocalVisionBarcode,
  LocalVisionLabel,
  LocalVisionSignals,
} from '@/services/local-vision-service.types';

export type RawLocalVisionPhoto = {
  barcodes?: Array<{
    displayValue?: string;
    rawValue?: string;
  }>;
  labels?: Array<{
    confidence?: number;
    text?: string;
  }>;
  lines?: string[];
  processingMs?: number;
  text?: string;
  warnings?: string[];
};

const BRAND_RULES: Array<[RegExp, string]> = [
  [/\b(?:hp|hewlett[ -]?packard)\b/i, 'HP'],
  [/\bapple\b/i, 'Apple'],
  [/\bsamsung\b/i, 'Samsung'],
  [/\bsony\b/i, 'Sony'],
  [/\bmicrosoft\b/i, 'Microsoft'],
  [/\blenovo\b/i, 'Lenovo'],
  [/\bdell\b/i, 'Dell'],
  [/\bacer\b/i, 'Acer'],
  [/\basus\b/i, 'ASUS'],
  [/\bcanon\b/i, 'Canon'],
  [/\bnikon\b/i, 'Nikon'],
  [/\bnintendo\b/i, 'Nintendo'],
  [/\bplaystation\b|\bps[2345]\b/i, 'Sony'],
  [/\bxbox\b/i, 'Microsoft'],
  [/\bbose\b/i, 'Bose'],
  [/\bjbl\b/i, 'JBL'],
  [/\bmilwaukee\b/i, 'Milwaukee'],
  [/\bdewalt\b/i, 'DeWalt'],
  [/\bmakita\b/i, 'Makita'],
  [/\bryobi\b/i, 'Ryobi'],
  [/\bcraftsman\b/i, 'Craftsman'],
  [/\bsnap[ -]?on\b/i, 'Snap-on'],
  [/\bnike\b/i, 'Nike'],
  [/\badidas\b/i, 'Adidas'],
  [/\bjordan\b/i, 'Jordan'],
  [/\bgucci\b/i, 'Gucci'],
  [/\bcoach\b/i, 'Coach'],
  [/\bkitchenaid\b/i, 'KitchenAid'],
  [/\bdyson\b/i, 'Dyson'],
  [/\bwhirlpool\b/i, 'Whirlpool'],
  [/\blg\b/i, 'LG'],
  [/\bpanasonic\b/i, 'Panasonic'],
  [/\broland\b/i, 'Roland'],
  [/\byamaha\b/i, 'Yamaha'],
  [/\bfender\b/i, 'Fender'],
  [/\bgibson\b/i, 'Gibson'],
];

const CATEGORY_RULES: Array<{
  category: string;
  itemType: string;
  pattern: RegExp;
}> = [
  {
    category: 'Computers',
    itemType: 'Laptop computer',
    pattern: /\b(?:laptop|notebook|ultrabook|macbook|probook|elitebook|thinkpad|chromebook)\b/i,
  },
  {
    category: 'Computers',
    itemType: 'Desktop computer',
    pattern: /\b(?:desktop|workstation|computer tower|imac|all-in-one computer)\b/i,
  },
  {
    category: 'Mobile Phones',
    itemType: 'Smartphone',
    pattern: /\b(?:smartphone|mobile phone|iphone|galaxy phone|pixel phone)\b/i,
  },
  {
    category: 'Video Games',
    itemType: 'Video game console',
    pattern: /\b(?:playstation|xbox|nintendo switch|game console|video game console)\b/i,
  },
  {
    category: 'Video Games',
    itemType: 'Video game',
    pattern: /\b(?:video game|game cartridge|game disc|nintendo game|playstation game|xbox game)\b/i,
  },
  {
    category: 'Cameras',
    itemType: 'Camera',
    pattern: /\b(?:camera|dslr|mirrorless|digital camera|camcorder)\b/i,
  },
  {
    category: 'Audio',
    itemType: 'Audio equipment',
    pattern: /\b(?:speaker|receiver|amplifier|headphones|earbuds|soundbar|stereo|turntable)\b/i,
  },
  {
    category: 'Tools',
    itemType: 'Power tool',
    pattern: /\b(?:power tool|drill|impact driver|circular saw|reciprocating saw|sander|grinder)\b/i,
  },
  {
    category: 'Footwear',
    itemType: 'Shoes',
    pattern: /\b(?:shoe|shoes|sneaker|sneakers|boot|boots|footwear)\b/i,
  },
  {
    category: 'Fashion',
    itemType: 'Fashion item',
    pattern: /\b(?:handbag|purse|wallet|jacket|shirt|dress|clothing|apparel|watch|jewelry)\b/i,
  },
  {
    category: 'Collectibles',
    itemType: 'Collectible',
    pattern: /\b(?:collectible|trading card|pokemon card|sports card|figurine|funko|lego|minifigure)\b/i,
  },
  {
    category: 'Music Gear',
    itemType: 'Musical instrument',
    pattern: /\b(?:guitar|bass guitar|keyboard|synthesizer|drum|microphone|musical instrument)\b/i,
  },
  {
    category: 'Home Appliances',
    itemType: 'Home appliance',
    pattern: /\b(?:appliance|vacuum|mixer|blender|coffee maker|microwave|refrigerator|washer|dryer)\b/i,
  },
];

const FAMILY_PATTERNS = [
  /\b(?:ProBook|EliteBook|ThinkPad|IdeaPad|Latitude|Inspiron|Pavilion|Aspire|ZenBook|VivoBook)\s+[A-Z0-9][A-Z0-9 .-]{1,24}/i,
  /\b(?:MacBook Pro|MacBook Air|iPhone|iPad Pro|iPad Air|Galaxy S|Galaxy Z|Pixel)\s*[A-Z0-9][A-Z0-9 .+-]{0,20}/i,
  /\b(?:PlayStation|Xbox|Nintendo Switch)\s*[A-Z0-9][A-Z0-9 .+-]{0,20}/i,
  /\b(?:Air Jordan|Jordan)\s*[A-Z0-9][A-Z0-9 .+-]{0,20}/i,
];

function cleanText(value: unknown, maximum = 160) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function uniqueStrings(values: string[], maximum = 80) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maximum) break;
  }
  return result;
}

function detectBrand(text: string) {
  for (const [pattern, brand] of BRAND_RULES) {
    if (pattern.test(text)) return brand;
  }
  return null;
}

function detectCategory(text: string) {
  return CATEGORY_RULES.find((rule) => rule.pattern.test(text)) ?? null;
}

function isLikelyNoise(line: string) {
  const normalized = line.toLowerCase();
  return (
    line.length < 3 ||
    line.length > 90 ||
    /^(?:made in|www\.|https?:|serial|s\/n|sn:|fcc|input|output|voltage|warning|caution)\b/i.test(
      normalized,
    ) ||
    /^[\d\W]+$/.test(line)
  );
}

function scoreTitleLine(line: string, brand: string | null) {
  if (isLikelyNoise(line)) return -100;
  let score = 0;
  if (brand && line.toLowerCase().includes(brand.toLowerCase())) score += 6;
  if (/\d/.test(line) && /[a-z]/i.test(line)) score += 4;
  if (/\b(?:model|product|type|series)\b/i.test(line)) score += 2;
  if (FAMILY_PATTERNS.some((pattern) => pattern.test(line))) score += 8;
  if (line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 9) score += 2;
  if (/\b(?:serial|s\/n|imei|fcc|regulatory)\b/i.test(line)) score -= 8;
  return score;
}

function extractModel(lines: string[], candidateLine: string | null) {
  const joined = [candidateLine, ...lines].filter(Boolean).join('\n');
  for (const pattern of FAMILY_PATTERNS) {
    const match = joined.match(pattern)?.[0];
    if (match) return cleanText(match, 70);
  }

  const markerMatch = joined.match(
    /\b(?:model(?:\s*(?:name|no\.?|number))?|product(?:\s*(?:name|no\.?|number))?|m\/n)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,28})\b/i,
  )?.[1];
  if (markerMatch) return markerMatch.toUpperCase();

  const tokens = joined.match(/\b(?=[A-Z0-9._/-]{4,28}\b)(?=[A-Z0-9._/-]*[A-Z])(?=[A-Z0-9._/-]*\d)[A-Z0-9][A-Z0-9._/-]+\b/gi) ?? [];
  const filtered = tokens.filter(
    (token) =>
      !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(token) &&
      !/^\d{10,}$/.test(token) &&
      !/^(?:wifi|wpa|fcc|imei|serial)$/i.test(token),
  );
  return filtered[0]?.toUpperCase() ?? null;
}

function titleFromClues({
  brand,
  category,
  lines,
  model,
}: {
  brand: string | null;
  category: { category: string; itemType: string } | null;
  lines: string[];
  model: string | null;
}) {
  const rankedLine = [...lines]
    .map((line) => ({ line, score: scoreTitleLine(line, brand) }))
    .sort((left, right) => right.score - left.score)[0];
  const bestLine = rankedLine && rankedLine.score >= 5 ? rankedLine.line : null;

  if (bestLine) {
    const normalized = cleanText(bestLine, 100);
    if (brand && !normalized.toLowerCase().includes(brand.toLowerCase())) {
      return `${brand} ${normalized}`.trim();
    }
    return normalized;
  }

  return [brand, model, category?.itemType]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

export function combineLocalVisionResults(
  photos: RawLocalVisionPhoto[],
  elapsedMs: number,
): LocalVisionSignals {
  const ocrTexts = uniqueStrings(
    photos.flatMap((photo) => [photo.text ?? '', ...(photo.lines ?? [])]),
    80,
  );
  const labels: LocalVisionLabel[] = photos
    .flatMap((photo) => photo.labels ?? [])
    .map((label) => ({
      confidence: Math.max(0, Math.min(1, Number(label.confidence ?? 0))),
      text: cleanText(label.text, 80),
    }))
    .filter((label) => Boolean(label.text))
    .sort((left, right) => right.confidence - left.confidence)
    .filter(
      (label, index, all) =>
        all.findIndex(
          (candidate) => candidate.text.toLowerCase() === label.text.toLowerCase(),
        ) === index,
    )
    .slice(0, 12);
  const barcodes: LocalVisionBarcode[] = photos
    .flatMap((photo) => photo.barcodes ?? [])
    .map((barcode) => ({
      displayValue: cleanText(barcode.displayValue, 120),
      rawValue: cleanText(barcode.rawValue, 120),
    }))
    .filter((barcode) => Boolean(barcode.rawValue || barcode.displayValue))
    .filter(
      (barcode, index, all) =>
        all.findIndex(
          (candidate) =>
            (candidate.rawValue || candidate.displayValue) ===
            (barcode.rawValue || barcode.displayValue),
        ) === index,
    )
    .slice(0, 6);
  const warnings = uniqueStrings(
    photos.flatMap((photo) => photo.warnings ?? []),
    20,
  );

  const combinedText = [
    ...ocrTexts,
    ...labels.map((label) => label.text),
  ].join(' ');
  const brand = detectBrand(combinedText);
  const category = detectCategory(combinedText);
  const candidateLine = [...ocrTexts]
    .map((line) => ({ line, score: scoreTitleLine(line, brand) }))
    .sort((left, right) => right.score - left.score)[0]?.line ?? null;
  const model = extractModel(ocrTexts, candidateLine);
  const candidateTitle = titleFromClues({ brand, category, lines: ocrTexts, model });

  let confidence = 0.12;
  if (ocrTexts.length > 0) confidence += 0.13;
  if (labels.some((label) => label.confidence >= 0.65)) confidence += 0.1;
  if (category) confidence += 0.16;
  if (brand) confidence += 0.2;
  if (model) confidence += 0.25;
  if (barcodes.length > 0) confidence += 0.12;
  if (candidateTitle && candidateTitle.split(/\s+/).length >= 2) confidence += 0.08;
  confidence = Math.min(0.92, confidence);

  const barcodeValues = barcodes
    .map((barcode) => barcode.rawValue || barcode.displayValue)
    .filter(Boolean);
  const searchTerms = uniqueStrings(
    [candidateTitle ?? '', brand ?? '', model ?? '', ...barcodeValues],
    8,
  );
  const notes = uniqueStrings(
    [
      ocrTexts.length ? `On-device OCR read ${ocrTexts.length} text clue${ocrTexts.length === 1 ? '' : 's'}.` : '',
      labels.length ? `On-device image labels: ${labels.slice(0, 5).map((label) => label.text).join(', ')}.` : '',
      barcodeValues.length ? `Detected barcode: ${barcodeValues[0]}.` : '',
    ],
    6,
  );

  return {
    available: photos.length > 0,
    barcodes,
    brand,
    candidateTitle,
    category: category?.category ?? null,
    confidence,
    elapsedMs,
    itemType: category?.itemType ?? null,
    labels,
    model,
    notes,
    ocrTexts,
    searchTerms,
    warnings,
  };
}

export function emptyLocalVisionSignals(
  warning = 'on_device_vision_unavailable',
): LocalVisionSignals {
  return {
    available: false,
    barcodes: [],
    brand: null,
    candidateTitle: null,
    category: null,
    confidence: 0,
    elapsedMs: 0,
    itemType: null,
    labels: [],
    model: null,
    notes: [],
    ocrTexts: [],
    searchTerms: [],
    warnings: [warning],
  };
}
