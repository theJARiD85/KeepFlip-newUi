#!/usr/bin/env node
'use strict';

/**
 * Responsive layout migration runner for KeepFlip.
 *
 * This is intentionally a conservative codemod. It only changes layout code
 * that can be identified semantically:
 *
 *   - screen/page shells named content, scrollContent, screen, page, or
 *     listContent get contentWidth/contentMaxWidth/pageGutter;
 *   - direct page headings/body copy get responsiveFont overrides when their
 *     base font metrics are available in a local StyleSheet.create call;
 *   - literal two-column FlatLists can use gridColumns.
 *
 * It does not blindly scale every number in a StyleSheet. Scanner geometry,
 * shader coordinates, hit targets, and item-analysis HUD values need their
 * owning component's geometry rules and are reported for review instead.
 *
 * Usage from the repository root:
 *
 *   node scripts/apply-responsive-layout.cjs              # dry-run report
 *   node scripts/apply-responsive-layout.cjs --write      # apply edits
 *   node scripts/apply-responsive-layout.cjs --write --all-text
 *   node scripts/apply-responsive-layout.cjs --write --all-text --include-scanner-text
 *   node scripts/apply-responsive-layout.cjs --json       # machine-readable report
 *
 * The command is idempotent. Run the dry-run first, review the proposed files,
 * then use --write. A write is transactional at the file level: all source
 * edits are prepared and validated before any file is written.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const HOOK_RELATIVE_PATH = 'hooks/use-responsive-layout.ts';
const HOOK_IMPORT = "import { useResponsiveLayout } from '@/hooks/use-responsive-layout';";
const SOURCE_DIRECTORIES = ['app', 'components'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  'android',
  'ios',
  'node_modules',
  'dist',
  'backup',
  'backups',
]);
const SKIP_FILE_PATTERN = /(?:\.backup(?:[-.]|$)|\.bak(?:[-.]|$)|\.orig(?:[-.]|$))/i;

const SHELL_STYLE_NAMES = new Set([
  'centeredState',
  'content',
  'document',
  'listContent',
  'page',
  'screen',
  'scrollContent',
]);

const PAGE_FUNCTION_PATTERN = /(?:screen|route|document|guide|plan|review|subscription|account|shelf|walkthrough|onboarding)/i;
const TEXT_STYLE_PATTERN = /(?:body|button|copy|date|description|detail|error|eyebrow|heading|headline|hint|label|message|name|prompt|question|status|subtitle|summary|text|title|value|welcome)/i;

const SHELL_FIELDS = ['contentMaxWidth', 'contentWidth', 'pageGutter'];
const TYPOGRAPHY_FIELDS = ['responsiveFont'];
const GRID_FIELDS = ['gridColumns'];

function parseOptions(argv) {
  const options = {
    allText: false,
    includeScannerText: false,
    json: false,
    root: DEFAULT_ROOT,
    write: false,
  };

  for (const argument of argv) {
    if (argument === '--write') {
      options.write = true;
    } else if (argument === '--all-text') {
      options.allText = true;
    } else if (argument === '--include-scanner-text') {
      options.includeScannerText = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument.startsWith('--root=')) {
      options.root = path.resolve(argument.slice('--root='.length));
    } else if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function printHelp() {
  console.log([
    'Responsive layout migration runner',
    '',
    '  node scripts/apply-responsive-layout.cjs',
    '  node scripts/apply-responsive-layout.cjs --write',
    '  node scripts/apply-responsive-layout.cjs --write --all-text',
    '  node scripts/apply-responsive-layout.cjs --json',
    '',
    'Options:',
    '  --write       write the prepared edits; omitted means dry-run',
    '  --all-text    include eligible reusable child components, not only pages',
    '  --include-scanner-text  include scanner/HUD typography in the optional text pass',
    '  --json        print the report as JSON',
    '  --root=PATH   scan another checkout root',
  ].join('\n'));
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function sourceFileKind(filePath) {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function createSourceFile(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourceFileKind(filePath),
  );
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function detectEol(source) {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function walkSourceFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRECTORY_NAMES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;

      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (SKIP_FILE_PATTERN.test(entry.name)) continue;
      files.push(fullPath);
    }
  }

  for (const directory of SOURCE_DIRECTORIES) {
    const fullPath = path.join(root, directory);
    if (fs.existsSync(fullPath)) visit(fullPath);
  }

  return files.sort();
}

function propertyName(property, sourceFile) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }
  return property.name.getText(sourceFile);
}

function readHookFields(root) {
  const hookPath = path.join(root, HOOK_RELATIVE_PATH);
  if (!fs.existsSync(hookPath)) {
    throw new Error(`Hook file not found: ${hookPath}`);
  }

  const source = readText(hookPath);
  const sourceFile = createSourceFile(hookPath, source);
  const fields = new Set();

  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'useResponsiveLayout' &&
      node.body
    ) {
      function inspectBody(child) {
        if (ts.isReturnStatement(child) && child.expression && ts.isObjectLiteralExpression(child.expression)) {
          for (const property of child.expression.properties) {
            const name = propertyName(property, sourceFile);
            if (name) fields.add(name);
          }
        }
        ts.forEachChild(child, inspectBody);
      }
      inspectBody(node.body);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (fields.size === 0) {
    throw new Error(`Could not find a return object in ${HOOK_RELATIVE_PATH}`);
  }

  return [...fields];
}

function getPropertyValue(property, sourceFile) {
  if (!ts.isPropertyAssignment(property)) return null;
  return {
    name: propertyName(property, sourceFile),
    value: property.initializer,
  };
}

function staticNumber(node) {
  if (!node) return null;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.Minus && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  return null;
}

function findStyleMetrics(sourceFile) {
  const metrics = new Map();

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      const method = node.expression.name;
      if (
        method.text === 'create' &&
        target.getText(sourceFile) === 'StyleSheet' &&
        node.arguments.length === 1 &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        for (const styleProperty of node.arguments[0].properties) {
          if (!ts.isPropertyAssignment(styleProperty) || !ts.isObjectLiteralExpression(styleProperty.initializer)) continue;
          const styleName = propertyName(styleProperty, sourceFile);
          if (!styleName) continue;

          const styleMetrics = {};
          for (const metricProperty of styleProperty.initializer.properties) {
            const metric = getPropertyValue(metricProperty, sourceFile);
            if (!metric || metric.name !== 'fontSize') continue;
            const value = staticNumber(metric.value);
            if (value != null) styleMetrics[metric.name] = value;
          }

          if (styleMetrics.fontSize != null) {
            metrics.set(styleName, styleMetrics);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return metrics;
}

function findFunctionName(node, sourceFile) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;

  let parent = node.parent;
  while (parent) {
    if (ts.isVariableDeclaration(parent)) return parent.name.getText(sourceFile);
    if (ts.isPropertyAssignment(parent)) return propertyName(parent, sourceFile) || '<property-function>';
    if (ts.isMethodDeclaration(parent) && parent.name) return parent.name.getText(sourceFile);
    parent = parent.parent;
  }

  return '<anonymous-function>';
}

function findFunctionLikes(sourceFile) {
  const functions = [];

  function visit(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      functions.push({
        end: node.body.end,
        name: findFunctionName(node, sourceFile),
        node,
        start: node.body.getStart(sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

function containingFunction(functions, node) {
  return functions
    .filter((candidate) => candidate.start <= node.getStart() && candidate.end >= node.end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0] || null;
}

function isPageFunction(functionInfo) {
  // Route files can contain reusable children. Restrict the default typography
  // pass to the page-like function itself; --all-text is the opt-in escape
  // hatch for child views.
  return PAGE_FUNCTION_PATTERN.test(functionInfo.name);
}

function canTransformTypography(relativePath, functionInfo, options) {
  if (
    relativePath.startsWith('components/scanner/') &&
    !options.includeScannerText
  ) {
    // Scanner and item-analysis typography has deliberate HUD sizing. The
    // scanner geometry pass still runs; use --include-scanner-text only after
    // reviewing those visual surfaces.
    return false;
  }

  return options.allText || isPageFunction(functionInfo);
}

function hasHookImport(source) {
  return /from\s+['"][^'"]*hooks\/use-responsive-layout['"]/.test(source);
}

function hookImportEdit(sourceFile, source, eol) {
  if (hasHookImport(source)) return null;

  const imports = sourceFile.statements.filter((statement) => ts.isImportDeclaration(statement));
  if (imports.length === 0) {
    return { end: 0, replacement: `${HOOK_IMPORT}${eol}`, start: 0 };
  }

  // Keep the hook import in the leading import section even if a file has a
  // top-level statement before an existing later import.
  const firstNonImport = sourceFile.statements.find((statement) => !ts.isImportDeclaration(statement));
  if (firstNonImport) {
    const start = firstNonImport.getStart(sourceFile);
    return { end: start, replacement: `${HOOK_IMPORT}${eol}`, start };
  }

  const lastImport = imports[imports.length - 1];
  return {
    end: lastImport.end,
    replacement: `${eol}${HOOK_IMPORT}`,
    start: lastImport.end,
  };
}

function fieldNamesFromDestructure(raw) {
  return raw
    .split(',')
    .map((part) => part.trim().split(/\s*:/, 1)[0])
    .map((part) => part.replace(/[^A-Za-z0-9_$].*$/, '').trim())
    .filter(Boolean);
}

function findHookDestructure(source) {
  const hookCall = /useResponsiveLayout\s*\(\s*\)/.exec(source);
  if (!hookCall) return null;

  const declarations = [...source.slice(0, hookCall.index).matchAll(/const\s*\{/g)];
  const declarationStart = declarations.at(-1)?.index;
  if (declarationStart == null) return null;

  const declaration = source.slice(declarationStart, hookCall.index + hookCall[0].length);
  const match = /^const\s*\{([\s\S]*?)\}\s*=\s*useResponsiveLayout\s*\(\s*\)/.exec(declaration);
  if (!match) return null;

  const openBraceOffset = declarationStart + declaration.indexOf('{');
  const closeBraceOffset = declarationStart + declaration.indexOf('}');
  return {
    closeBraceOffset,
    hookCall,
    openBraceOffset,
    raw: match[1],
  };
}

function ensureHookEdit(source, functionInfo, fields, eol) {
  const functionSource = source.slice(functionInfo.start, functionInfo.end);
  const destructured = findHookDestructure(functionSource);

  if (destructured) {
    const existingFields = new Set(fieldNamesFromDestructure(destructured.raw));
    const missingFields = fields.filter((field) => !existingFields.has(field));
    if (missingFields.length === 0) return null;

    const current = destructured.raw.trim().replace(/,\s*$/, '');
    const replacement = current
      ? `${eol}    ${current},${eol}    ${missingFields.join(`,${eol}    `)}${eol}  `
      : `${eol}    ${missingFields.join(`,${eol}    `)}${eol}  `;

    return {
      end: functionInfo.start + destructured.closeBraceOffset,
      replacement,
      start: functionInfo.start + destructured.openBraceOffset + 1,
    };
  }

  const hasHookCall = /useResponsiveLayout\s*\(\s*\)/.test(functionSource);
  const openingBrace = source.indexOf('{', functionInfo.start);
  if (openingBrace < 0) return null;

  const declaration = `const {${eol}    ${fields.join(`,${eol}    `)}${eol}  } = useResponsiveLayout();`;
  return {
    end: openingBrace + 1,
    replacement: `${hasHookCall ? '' : `${eol}  `}${declaration}${eol}`,
    start: openingBrace + 1,
  };
}

function exactStyleReference(expressionText) {
  const match = /^styles\.([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(expressionText.trim());
  return match ? match[1] : null;
}

function shellStyleReference(expressionText) {
  const references = [...expressionText.matchAll(/styles\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((match) => match[1]);
  return references.find((reference) => SHELL_STYLE_NAMES.has(reference)) || null;
}

function shellReplacement(expressionText) {
  const dynamicStyle = "{ width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }";
  const trimmed = expressionText.trim();

  if (trimmed.includes('contentWidth') && trimmed.includes('pageGutter')) return null;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    // The existing style array may already end in a comma. Strip it before
    // appending the generated shell style so reruns never create an array
    // hole (`},, { ... }`).
    const contents = trimmed.slice(1, -1).trim().replace(/,\s*$/, '');
    return `[${contents ? `${contents}, ` : ''}${dynamicStyle}]`;
  }

  if (exactStyleReference(trimmed)) return `[${trimmed}, ${dynamicStyle}]`;
  return null;
}

function isTextElement(node, sourceFile) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const tagName = opening.tagName.getText(sourceFile);
  return /(?:^|\.)(?:Text|KeepFlipText|NativeText)$/.test(tagName);
}

function typographyReplacement(styleName, metrics) {
  const dynamic = [];
  if (metrics.fontSize != null) dynamic.push(`fontSize: responsiveFont(${metrics.fontSize})`);
  // Keep lineHeight, width, height, spacing, and control geometry in the
  // owning StyleSheet. responsiveFont is intentionally limited to fontSize;
  // scaling every numeric text metric can distort layout and accessibility.
  if (dynamic.length === 0) return null;
  return `[styles.${styleName}, { ${dynamic.join(', ')} }]`;
}

function collectDirectHookFields(source) {
  const fields = new Set();
  const calls = [...source.matchAll(/useResponsiveLayout\s*\(\s*\)/g)];
  let lowerBound = 0;
  for (const call of calls) {
    const beforeCall = source.slice(lowerBound, call.index);
    const declarations = [...beforeCall.matchAll(/const\s*\{/g)];
    const declarationStart = declarations.at(-1)?.index;
    if (declarationStart != null) {
      const declaration = beforeCall.slice(declarationStart);
      const match = /^const\s*\{([\s\S]*?)\}\s*=\s*$/.exec(declaration);
      if (match) {
        for (const field of fieldNamesFromDestructure(match[1])) fields.add(field);
      }
    }
    lowerBound = (call.index ?? 0) + call[0].length;
  }
  return [...fields];
}

function buildFilePlan({ filePath, fields, options, root }) {
  const source = readText(filePath);
  const relativePath = normalizeRelativePath(path.relative(root, filePath));
  const sourceFile = createSourceFile(filePath, source);
  const functions = findFunctionLikes(sourceFile);
  const styleMetrics = findStyleMetrics(sourceFile);
  const edits = [];
  const fieldRequests = new Map();
  const planned = [];

  function requestFields(functionInfo, requestedFields) {
    if (!functionInfo) return;
    if (!fieldRequests.has(functionInfo)) fieldRequests.set(functionInfo, new Set());
    for (const field of requestedFields) fieldRequests.get(functionInfo).add(field);
  }

  function addEdit(start, end, replacement, label) {
    if (edits.some((edit) => start < edit.end && end > edit.start)) return;
    edits.push({ end, label, replacement, start });
  }

  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const attributeName = node.name.getText(sourceFile);
      const initializer = node.initializer;
      const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
      const functionInfo = containingFunction(functions, node);

      if (
        expression &&
        ['contentContainerStyle', 'contentStyle', 'style'].includes(attributeName) &&
        functionInfo &&
        isPageFunction(functionInfo)
      ) {
        const expressionText = expression.getText(sourceFile);
        const shellReference = shellStyleReference(expressionText);
        if (shellReference) {
          const replacement = shellReplacement(expressionText);
          if (replacement) {
            addEdit(expression.getStart(sourceFile), expression.end, replacement, `${attributeName} via ${shellReference}`);
            requestFields(functionInfo, SHELL_FIELDS);
            planned.push({ fields: SHELL_FIELDS, kind: 'shell', line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
          }
        }
      }

      if (
        expression &&
        attributeName === 'numColumns' &&
        functionInfo &&
        isPageFunction(functionInfo) &&
        /^\d+$/.test(expression.getText(sourceFile).trim()) &&
        expression.getText(sourceFile).trim() !== '1'
      ) {
        addEdit(expression.getStart(sourceFile), expression.end, 'gridColumns', 'numColumns via gridColumns');
        requestFields(functionInfo, GRID_FIELDS);
        planned.push({ fields: GRID_FIELDS, kind: 'grid', line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
      }
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const openingElement = ts.isJsxElement(node) ? node.openingElement : node;
      const styleAttribute = openingElement.attributes.properties.find(
        (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === 'style',
      );
      const expression = styleAttribute && ts.isJsxAttribute(styleAttribute) && ts.isJsxExpression(styleAttribute.initializer)
        ? styleAttribute.initializer.expression
        : null;
      const styleName = expression ? exactStyleReference(expression.getText(sourceFile)) : null;
      const functionInfo = containingFunction(functions, node);

      if (
        expression &&
        styleName &&
        functionInfo &&
        isTextElement(node, sourceFile) &&
        styleMetrics.has(styleName) &&
        TEXT_STYLE_PATTERN.test(styleName) &&
        canTransformTypography(relativePath, functionInfo, options)
      ) {
        const metrics = styleMetrics.get(styleName);
        const replacement = typographyReplacement(styleName, metrics);
        if (replacement && !expression.getText(sourceFile).includes('responsiveFont')) {
          addEdit(expression.getStart(sourceFile), expression.end, replacement, `font metrics via ${styleName}`);
          requestFields(functionInfo, TYPOGRAPHY_FIELDS);
          planned.push({ fields: TYPOGRAPHY_FIELDS, kind: 'typography', line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  for (const [functionInfo, requested] of fieldRequests) {
    const requestedFields = [...requested].filter((field) => fields.includes(field));
    if (requestedFields.length !== requested.size) {
      const missing = [...requested].filter((field) => !fields.includes(field));
      throw new Error(`${relativePath}: hook does not return required field(s): ${missing.join(', ')}`);
    }

    const hookEdit = ensureHookEdit(source, functionInfo, requestedFields, detectEol(source));
    if (hookEdit) addEdit(hookEdit.start, hookEdit.end, hookEdit.replacement, `hook fields in ${functionInfo.name}`);
  }

  const importEdit = fieldRequests.size > 0 ? hookImportEdit(sourceFile, source, detectEol(source)) : null;
  if (importEdit) addEdit(importEdit.start, importEdit.end, importEdit.replacement, 'responsive hook import');

  edits.sort((left, right) => right.start - left.start);
  let nextSource = source;
  for (const edit of edits) {
    nextSource = `${nextSource.slice(0, edit.start)}${edit.replacement}${nextSource.slice(edit.end)}`;
  }

  if (edits.length > 0) {
    const transformedSourceFile = createSourceFile(filePath, nextSource);
    if (transformedSourceFile.parseDiagnostics.length > 0) {
      const diagnostic = transformedSourceFile.parseDiagnostics[0];
      const detail = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      throw new Error(`${relativePath}: transformed source did not parse: ${detail}`);
    }
  }

  return {
    changed: edits.length > 0,
    currentDirectHookFields: collectDirectHookFields(source),
    directHookFields: collectDirectHookFields(nextSource),
    edits: edits.map(({ end, label, start }) => ({ end, label, start })),
    filePath,
    nextSource,
    planned,
    relativePath,
  };
}

function applyEdits(plans) {
  for (const plan of plans) {
    if (!plan.changed) continue;
    fs.writeFileSync(plan.filePath, plan.nextSource, 'utf8');
  }
}

function makeReport({ fields, options, plans, scannedFileCount }) {
  const changedPlans = plans.filter((plan) => plan.changed);
  const currentUseCounts = new Map(fields.map((field) => [field, 0]));
  const directUseCounts = new Map(fields.map((field) => [field, 0]));
  for (const plan of plans) {
    for (const field of plan.currentDirectHookFields) {
      if (currentUseCounts.has(field)) currentUseCounts.set(field, currentUseCounts.get(field) + 1);
    }
    for (const field of plan.directHookFields) {
      if (directUseCounts.has(field)) directUseCounts.set(field, directUseCounts.get(field) + 1);
    }
  }

  const unusedDirectFields = fields.filter((field) => directUseCounts.get(field) === 0);
  return {
    applied: options.write,
    changedFiles: changedPlans.map((plan) => ({
      edits: plan.edits,
      file: plan.relativePath,
      planned: plan.planned,
    })),
    currentDirectHookFieldUsage: Object.fromEntries(fields.map((field) => [field, currentUseCounts.get(field)])),
    directHookFieldUsage: Object.fromEntries(fields.map((field) => [field, directUseCounts.get(field)])),
    hookFields: fields,
    options: {
      allText: options.allText,
      includeScannerText: options.includeScannerText,
      json: options.json,
      root: options.root,
      write: options.write,
    },
    scannedFileCount,
    unusedDirectFields,
  };
}

function printReport(report) {
  if (report.options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Responsive layout migration ${report.applied ? 'applied' : 'dry-run'}`);
  console.log(`Hook fields discovered: ${report.hookFields.length}`);
  console.log(`Source files scanned: ${report.scannedFileCount}`);
  console.log(`Files with planned edits: ${report.changedFiles.length}`);

  if (report.changedFiles.length > 0) {
    console.log('');
    for (const file of report.changedFiles) {
      console.log(`  ${file.file}`);
      for (const item of file.planned) {
        console.log(`    line ${item.line}: ${item.kind} (${item.fields.join(', ')})`);
      }
    }
  }

  if (report.unusedDirectFields.length > 0) {
    console.log('');
    console.log('Hook fields with no direct consumer yet:');
    console.log(`  ${report.unusedDirectFields.join(', ')}`);
    console.log('These are not blanket replacements; review them in their owning geometry/component before wiring them.');
  }

  if (!report.applied && report.changedFiles.length > 0) {
    console.log('');
    console.log('No files were changed. Re-run with --write after reviewing this plan.');
  }
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const fields = readHookFields(options.root);
  const files = walkSourceFiles(options.root);
  const plans = [];

  for (const filePath of files) {
    const plan = buildFilePlan({ fields, filePath, options, root: options.root });
    if (plan.changed || plan.directHookFields.length > 0) plans.push(plan);
  }

  const report = makeReport({ fields, options, plans, scannedFileCount: files.length });
  if (options.write) applyEdits(plans);
  printReport(report);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
