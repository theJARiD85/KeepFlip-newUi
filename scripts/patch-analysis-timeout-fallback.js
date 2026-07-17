const fs = require('node:fs');
const path = require('node:path');

function readServiceFile(fileName) {
  const filePath = path.join(__dirname, '..', 'services', fileName);
  return {
    filePath,
    content: fs.readFileSync(filePath, 'utf8'),
  };
}

function writeIfChanged(filePath, original, updated) {
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
  }
}

const analysisService = readServiceFile('item-analysis-service.ts');
const blockedTimeoutFallback = `  const details = isRecord(error.details) ? error.details : null;\n  if (/timeout/i.test(error.code) || Number(details?.responseStatusCode) === 408) {\n    return false;\n  }\n  return /provider|openai|vision|function_execution|analysis_request|invalid_function_response/i.test(\n    error.code,\n  );`;
const enabledTimeoutFallback = `  return /provider|openai|vision|timeout|function_execution|analysis_request|invalid_function_response/i.test(\n    error.code,\n  );`;

let updatedAnalysisService = analysisService.content;
if (updatedAnalysisService.includes(enabledTimeoutFallback)) {
  console.log('Item-analysis timeout fallback is already enabled.');
} else if (updatedAnalysisService.includes(blockedTimeoutFallback)) {
  updatedAnalysisService = updatedAnalysisService.replace(
    blockedTimeoutFallback,
    enabledTimeoutFallback,
  );
  console.log('Enabled legacy item-AI fallback for Appwrite timeout failures.');
} else {
  throw new Error(
    'Could not find the expected item-analysis timeout fallback block. Refusing to patch an unknown source layout.',
  );
}
writeIfChanged(
  analysisService.filePath,
  analysisService.content,
  updatedAnalysisService,
);

const soldCompsService = readServiceFile('ebaySoldCompsService.ts');
const genericStopWords = `  "item", "original", "authentic", "genuine",`;
const expandedStopWords = `  "item", "original", "authentic", "genuine",\n  "inch", "notebook", "laptop", "computer", "pc",`;
const strictCompactModelMatch = `  if (modelVariants.length) {\n    if (!modelVariants.some((variant) => compact.includes(variant))) return false;\n  } else if (plan.route === "identifier") {`;
const tokenAwareModelMatch = `  if (modelVariants.length) {\n    const modelTokens = uniqueWords(model || "").filter(\n      (token) =>\n        (/[a-z]/.test(token) && /\\d/.test(token)) ||\n        /^\\d{3,}$/.test(token)\n    );\n    const compTokens = new Set(uniqueWords(comp.title));\n    const compactModelMatch = modelVariants.some((variant) =>\n      compact.includes(variant)\n    );\n    const tokenModelMatch =\n      modelTokens.length > 0 &&\n      modelTokens.every(\n        (token) => compTokens.has(token) || compact.includes(token)\n      );\n\n    if (!compactModelMatch && !tokenModelMatch) return false;\n  } else if (plan.route === "identifier") {`;

let updatedSoldCompsService = soldCompsService.content;
if (!updatedSoldCompsService.includes(expandedStopWords)) {
  if (!updatedSoldCompsService.includes(genericStopWords)) {
    throw new Error(
      'Could not find the expected sold-comp stop-word block. Refusing to patch an unknown source layout.',
    );
  }
  updatedSoldCompsService = updatedSoldCompsService.replace(
    genericStopWords,
    expandedStopWords,
  );
}

if (updatedSoldCompsService.includes(tokenAwareModelMatch)) {
  console.log('Sold-comp model matching is already token-aware.');
} else if (updatedSoldCompsService.includes(strictCompactModelMatch)) {
  updatedSoldCompsService = updatedSoldCompsService.replace(
    strictCompactModelMatch,
    tokenAwareModelMatch,
  );
  console.log('Enabled token-aware sold-comp model matching.');
} else {
  throw new Error(
    'Could not find the expected strict sold-comp model matcher. Refusing to patch an unknown source layout.',
  );
}
writeIfChanged(
  soldCompsService.filePath,
  soldCompsService.content,
  updatedSoldCompsService,
);
