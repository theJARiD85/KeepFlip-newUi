const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(
  __dirname,
  '..',
  'services',
  'item-analysis-service.ts',
);

const current = fs.readFileSync(servicePath, 'utf8');

const blockedTimeoutFallback = `  const details = isRecord(error.details) ? error.details : null;\n  if (/timeout/i.test(error.code) || Number(details?.responseStatusCode) === 408) {\n    return false;\n  }\n  return /provider|openai|vision|function_execution|analysis_request|invalid_function_response/i.test(\n    error.code,\n  );`;

const enabledTimeoutFallback = `  return /provider|openai|vision|timeout|function_execution|analysis_request|invalid_function_response/i.test(\n    error.code,\n  );`;

if (current.includes(enabledTimeoutFallback)) {
  console.log('Item-analysis timeout fallback is already enabled.');
  process.exit(0);
}

if (!current.includes(blockedTimeoutFallback)) {
  throw new Error(
    'Could not find the expected item-analysis timeout fallback block. Refusing to patch an unknown source layout.',
  );
}

fs.writeFileSync(
  servicePath,
  current.replace(blockedTimeoutFallback, enabledTimeoutFallback),
  'utf8',
);

console.log('Enabled legacy item-AI fallback for Appwrite timeout failures.');
