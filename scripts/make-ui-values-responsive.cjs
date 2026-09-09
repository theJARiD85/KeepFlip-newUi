#!/usr/bin/env node
'use strict';
/* global __dirname */

/**
 * KeepFlip's targeted responsive-value codemod.
 *
 * It changes only literal React Native style values under these exact rules:
 *
 *   fontSize: N -> fontSize: responsiveFont(N)
 *   height: N   -> height: responsiveHeight(N)
 *   width: N    -> width: responsiveWidth(N)
 *
 * Responsive helpers are applied only to inline JSX styles. Module-level
 * StyleSheet.create declarations stay static because they cannot consume
 * component-local values returned by useResponsiveLayout().
 *
 * The runner intentionally does not touch padding, margin, gap, radius,
 * opacity, flex, zIndex, icon props, animation values, percentages, or data.
 * Its default mode is a dry run; use --write to apply a reviewed plan.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIRECTORIES = ['app', 'components', 'modules'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.expo',
  '.next',
  'android',
  'backup',
  'backups',
  'build',
  'coverage',
  'dist',
  'ios',
  'node_modules',
]);
const SKIP_FILE_PATTERN = /(?:\.backup(?:[-.]|$)|\.bak(?:[-.]|$)|\.orig(?:[-.]|$))/i;
const RESPONSIVE_MODULE = '@/lib/responsiveFont';
const PROPERTY_HELPERS = {
  fontSize: 'responsiveFont',
  height: 'responsiveHeight',
  width: 'responsiveWidth',
};

function parseOptions(argv) {
  const options = {
    directories: DEFAULT_DIRECTORIES,
    json: false,
    root: DEFAULT_ROOT,
    write: false,
  };

  for (const argument of argv) {
    if (argument === '--write') {
      options.write = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument.startsWith('--root=')) {
      options.root = path.resolve(argument.slice('--root='.length));
    } else if (argument.startsWith('--dirs=')) {
      const directories = argument
        .slice('--dirs='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (directories.length === 0) throw new Error('--dirs must include at least one source directory.');
      options.directories = directories;
    } else if (argument === '--help' || argument === '-h') {
      console.log([
        'KeepFlip targeted responsive-value codemod',
        '',
        '  node scripts/make-ui-values-responsive.cjs',
        '  node scripts/make-ui-values-responsive.cjs --write',
        '  node scripts/make-ui-values-responsive.cjs --write --dirs=app,components',
        '',
        'Only fontSize, height, and width numeric style values are changed.',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function sourceFileKind(filePath) {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function createSourceFile(filePath, source) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, sourceFileKind(filePath));
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walkSourceFiles(root, directories) {
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (SKIP_FILE_PATTERN.test(entry.name)) continue;
      files.push(fullPath);
    }
  }

  for (const directory of directories) {
    const fullPath = path.resolve(root, directory);
    if (!isWithinRoot(root, fullPath)) throw new Error(`Source directory is outside the requested root: ${directory}`);
    if (fs.existsSync(fullPath)) visit(fullPath);
  }

  return files.sort();
}

function propertyName(property) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function addRoot(roots, root) {
  if (roots.some((candidate) => candidate.getStart() <= root.getStart() && candidate.end >= root.end)) return;
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const candidate = roots[index];
    if (root.getStart() <= candidate.getStart() && root.end >= candidate.end) roots.splice(index, 1);
  }
  roots.push(root);
}

function addInlineStyleRoots(expression, roots) {
  if (!expression) return;
  const current = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(current)) {
    addRoot(roots, current);
    return;
  }
  if (ts.isArrayLiteralExpression(current)) {
    for (const element of current.elements) {
      if (!ts.isSpreadElement(element)) addInlineStyleRoots(element, roots);
    }
    return;
  }
  if (ts.isConditionalExpression(current)) {
    addInlineStyleRoots(current.whenTrue, roots);
    addInlineStyleRoots(current.whenFalse, roots);
    return;
  }
  if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
    if (!ts.isBlock(current.body)) {
      addInlineStyleRoots(current.body, roots);
      return;
    }

    function findReturns(node) {
      if (ts.isReturnStatement(node) && node.expression) {
        addInlineStyleRoots(node.expression, roots);
        return;
      }
      if (node !== current.body && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))) return;
      ts.forEachChild(node, findReturns);
    }

    findReturns(current.body);
  }
}

function findStyleRoots(sourceFile) {
  const roots = [];

  function visit(node) {
    if (ts.isJsxAttribute(node) && /style$/i.test(node.name.text)) {
      const initializer = node.initializer;
      if (initializer && ts.isJsxExpression(initializer)) addInlineStyleRoots(initializer.expression, roots);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return roots;
}

function staticNumericValue(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(node.operand)
  ) {
    const value = Number(node.operand.text);
    return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return null;
}

function collectImportBindings(sourceFile) {
  const bindings = {};
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== RESPONSIVE_MODULE || !statement.importClause) continue;
    if (statement.importClause.name) bindings.responsiveFont = statement.importClause.name.text;
    const named = statement.importClause.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const specifier of named.elements) {
      const exported = specifier.propertyName?.text || specifier.name.text;
      if (['responsiveFont', 'responsiveHeight', 'responsiveWidth'].includes(exported)) {
        bindings[exported] = specifier.name.text;
      }
    }
  }
  return bindings;
}

function topLevelBindings(sourceFile) {
  const names = new Set();

  function addBindingName(name) {
    if (ts.isIdentifier(name)) names.add(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) addBindingName(element.name);
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name) names.add(statement.importClause.name.text);
      const named = statement.importClause.namedBindings;
      if (named && ts.isNamespaceImport(named)) names.add(named.name.text);
      if (named && ts.isNamedImports(named)) {
        for (const specifier of named.elements) names.add(specifier.name.text);
      }
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name) {
      names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) addBindingName(declaration.name);
    }
  }

  return names;
}

function helperPlan(sourceFile) {
  const imported = collectImportBindings(sourceFile);
  const topLevel = topLevelBindings(sourceFile);
  const localNames = {};
  const importsNeeded = new Set();

  for (const helper of new Set(Object.values(PROPERTY_HELPERS))) {
    if (imported[helper]) {
      localNames[helper] = imported[helper];
    } else if (topLevel.has(helper)) {
      // A top-level function or existing import with this exact helper name is
      // already available. Reuse it rather than introduce a conflicting import.
      localNames[helper] = helper;
    } else {
      localNames[helper] = helper;
      importsNeeded.add(helper);
    }
  }

  return { importsNeeded, localNames };
}

function importEdit(sourceFile, source, helpers) {
  const needsDefault = helpers.has('responsiveFont');
  const named = ['responsiveHeight', 'responsiveWidth'].filter((helper) => helpers.has(helper));
  if (!needsDefault && named.length === 0) return null;

  const declaration = needsDefault
    ? `import responsiveFont${named.length > 0 ? `, { ${named.join(', ')} }` : ''} from '${RESPONSIVE_MODULE}';`
    : `import { ${named.join(', ')} } from '${RESPONSIVE_MODULE}';`;
  const imports = sourceFile.statements.filter((statement) => ts.isImportDeclaration(statement));
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  if (imports.length === 0) return { end: 0, replacement: `${declaration}${eol}`, start: 0 };

  // Keep generated helper imports in the leading import section. A dirty
  // file can contain a top-level statement before a later import; appending
  // after the last import would leave the new import below executable code.
  const firstNonImport = sourceFile.statements.find((statement) => !ts.isImportDeclaration(statement));
  if (firstNonImport) {
    const start = firstNonImport.getStart(sourceFile);
    return { end: start, replacement: `${declaration}${eol}`, start };
  }

  const lastImport = imports[imports.length - 1];
  return { end: lastImport.end, replacement: `${eol}${declaration}`, start: lastImport.end };
}

function applyEdits(source, edits) {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) {
      throw new Error(`Overlapping edits at offsets ${ordered[index - 1].start} and ${ordered[index].start}.`);
    }
  }

  let nextSource = source;
  for (const edit of [...ordered].sort((left, right) => right.start - left.start)) {
    nextSource = `${nextSource.slice(0, edit.start)}${edit.replacement}${nextSource.slice(edit.end)}`;
  }
  return nextSource;
}

function buildPlan(filePath, root) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = createSourceFile(filePath, source);
  const helpers = helperPlan(sourceFile);
  const edits = [];
  const positions = new Set();
  const counts = { fontSize: 0, height: 0, width: 0 };

  function addEdit(node, property) {
    if (staticNumericValue(node) == null) return;
    const start = node.getStart(sourceFile);
    const end = node.end;
    const key = `${start}:${end}`;
    if (positions.has(key)) return;
    positions.add(key);
    const helper = PROPERTY_HELPERS[property];
    edits.push({
      end,
      replacement: `${helpers.localNames[helper]}(${source.slice(start, end)})`,
      start,
    });
    counts[property] += 1;
  }

  function visitStyleNode(node) {
    if (ts.isPropertyAssignment(node)) {
      const property = propertyName(node);
      if (property && Object.prototype.hasOwnProperty.call(PROPERTY_HELPERS, property)) {
        addEdit(node.initializer, property);
      }
    }
    ts.forEachChild(node, visitStyleNode);
  }

  for (const styleRoot of findStyleRoots(sourceFile)) visitStyleNode(styleRoot);

  const requiredHelpers = new Set();
  for (const property of Object.keys(counts)) {
    if (counts[property] > 0 && helpers.importsNeeded.has(PROPERTY_HELPERS[property])) {
      requiredHelpers.add(PROPERTY_HELPERS[property]);
    }
  }
  const nextEdits = [...edits];
  if (nextEdits.length > 0) {
    const addImport = importEdit(sourceFile, source, requiredHelpers);
    if (addImport) nextEdits.push(addImport);
  }

  const nextSource = nextEdits.length > 0 ? applyEdits(source, nextEdits) : source;
  if (nextEdits.length > 0) {
    const transformed = createSourceFile(filePath, nextSource);
    if (transformed.parseDiagnostics.length > 0) {
      const diagnostic = transformed.parseDiagnostics[0];
      throw new Error(`${relativePath(root, filePath)}: transformed source did not parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
  }

  return {
    changed: nextEdits.length > 0,
    counts,
    filePath,
    nextSource,
    relativePath: relativePath(root, filePath),
    values: edits.length,
  };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const files = walkSourceFiles(options.root, options.directories);
  const plans = files.map((filePath) => buildPlan(filePath, options.root));
  const changed = plans.filter((plan) => plan.changed);
  const totals = { files: changed.length, fontSize: 0, height: 0, width: 0, values: 0 };
  for (const plan of changed) {
    totals.fontSize += plan.counts.fontSize;
    totals.height += plan.counts.height;
    totals.width += plan.counts.width;
    totals.values += plan.values;
  }

  const report = {
    applied: options.write,
    changedFiles: changed.map((plan) => ({ file: plan.relativePath, values: plan.values, ...plan.counts })),
    scannedFiles: files.length,
    totals,
  };

  // Every transformed file has parsed before this loop begins.
  if (options.write) {
    for (const plan of changed) fs.writeFileSync(plan.filePath, plan.nextSource, 'utf8');
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Targeted responsive-value codemod ${options.write ? 'applied' : 'dry run'}`);
    console.log(`Files scanned: ${report.scannedFiles}`);
    console.log(`Files with changes: ${report.totals.files}`);
    console.log(`fontSize → responsiveFont: ${report.totals.fontSize}`);
    console.log(`height → responsiveHeight: ${report.totals.height}`);
    console.log(`width → responsiveWidth: ${report.totals.width}`);
    if (!options.write && changed.length > 0) console.log('No source files were changed. Re-run with --write to apply this exact mapping.');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
