#!/usr/bin/env node
'use strict';
/* global __dirname */

/**
 * Add web-responsive values to React styles under app/ and components/.
 * Every nested source file is parsed. Numeric UI values are changed only when
 * they can be connected to a component: inline JSX styles, a responsive style
 * factory, or a module-level StyleSheet used by a component. The mobile branch
 * keeps the original value. Geometry expressed as formulas, percentages,
 * transforms, and platform-specific native files is left for manual review.
 *
 * npm run responsive:ui           # inspect the plan
 * npm run responsive:ui:apply     # write the plan
 * node scripts/apply-responsive-layout.cjs --json --root=PATH
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DIRECTORIES = ['app', 'components'];
const MODULE = '@/hooks/use-responsive-layout';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRECTORIES = new Set([
  '.git', '.expo', '.next', 'android', 'ios', 'node_modules', 'dist',
  'build', 'coverage', 'backup', 'backups',
]);
const SKIP_FILE_PATTERN = /(?:\.backup(?:[-.]|$)|\.bak(?:[-.]|$)|\.orig(?:[-.]|$)|\.secret(?:[-.]|$))/i;
const NATIVE_ONLY_PATTERN = /\.(?:native|android|ios)\.[jt]sx?$/i;

// Only values that represent UI dimensions are mapped. Unitless values such
// as flex, opacity, zIndex, fontWeight, borderWidth, and animation data stay put.
const PROPERTY_HELPER = new Map([
  ...['fontSize', 'lineHeight'].map((name) => [name, 'webResponsiveFont']),
  ...[
    'width', 'minWidth', 'maxWidth', 'paddingHorizontal', 'paddingLeft',
    'paddingRight', 'marginHorizontal', 'marginLeft', 'marginRight',
    'gap', 'columnGap', 'borderRadius',
  ].map((name) => [name, 'webResponsiveWidth']),
  ...[
    'height', 'minHeight', 'maxHeight', 'paddingVertical', 'paddingTop',
    'paddingBottom', 'marginVertical', 'marginTop', 'marginBottom', 'rowGap',
  ].map((name) => [name, 'webResponsiveHeight']),
]);

function parseOptions(args) {
  const options = { root: DEFAULT_ROOT, write: false, json: false };
  for (const arg of args) {
    if (arg === '--write') options.write = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--root=')) options.root = path.resolve(arg.slice(7));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/apply-responsive-layout.cjs [--write] [--json] [--root=PATH]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function walk(root) {
  const files = [];
  const counts = { directories: 0, files: 0, nonSourceFiles: 0 };
  function visit(directory) {
    counts.directories += 1;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) visit(filePath);
      } else if (entry.isFile()) {
        counts.files += 1;
        if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !SKIP_FILE_PATTERN.test(entry.name)) {
          files.push(filePath);
        } else counts.nonSourceFiles += 1;
      }
    }
  }
  for (const name of DIRECTORIES) {
    const directory = path.join(root, name);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      throw new Error(`Required source directory not found: ${directory}`);
    }
    visit(directory);
  }
  return { files: files.sort(), counts };
}

function parse(filePath, source) {
  const extension = path.extname(filePath);
  const kind = extension === '.tsx' ? ts.ScriptKind.TSX
    : extension === '.jsx' ? ts.ScriptKind.JSX
      : extension === '.js' ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
}

function propertyName(node) {
  if (!node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

function numericValue(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    if (node.operator === ts.SyntaxKind.MinusToken) return -Number(node.operand.text);
    if (node.operator === ts.SyntaxKind.PlusToken) return Number(node.operand.text);
  }
  return null;
}

function valueHelper(property, node) {
  const helper = PROPERTY_HELPER.get(property);
  const value = numericValue(node);
  // Tiny values are often hairlines, indicator geometry, or deliberate zeros.
  if (!helper || value === null || !Number.isFinite(value) || Math.abs(value) < 3) return null;
  return helper;
}

function isStyleSheetCreate(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'StyleSheet'
    && node.expression.name.text === 'create'
    && node.arguments.length === 1
    && ts.isObjectLiteralExpression(node.arguments[0]);
}

function styleEntries(object) {
  const entries = [];
  for (const style of object.properties) {
    if (!ts.isPropertyAssignment(style) || !ts.isObjectLiteralExpression(style.initializer)) continue;
    const name = propertyName(style);
    if (!name || style.initializer.properties.some((item) => ts.isSpreadAssignment(item))) continue;
    const values = [];
    for (const property of style.initializer.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const field = propertyName(property);
      const helper = valueHelper(field, property.initializer);
      if (helper) values.push({ field, helper, literal: property.initializer.getText() });
    }
    if (values.length > 0) entries.push({ name, values });
  }
  return entries;
}

function topLevelStyleSheets(sourceFile) {
  const sheets = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !isStyleSheetCreate(declaration.initializer)) continue;
      const entries = styleEntries(declaration.initializer.arguments[0]);
      if (entries.length > 0) sheets.push({ name: declaration.name.text, statement, entries });
    }
  }
  return sheets;
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node)) {
    if (node.name) return node.name.text;
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) return '<default>';
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    let parent = node.parent;
    if (ts.isCallExpression(parent)) parent = parent.parent; // memo(() => ...)
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  }
  return null;
}

function componentsIn(sourceFile) {
  const components = new Set();
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      && node.body && ts.isBlock(node.body)) {
      const name = functionName(node);
      if (name && (name === '<default>' || /^[A-Z]/.test(name))) components.add(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return components;
}

function ownerOf(node, components) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (components.has(parent)) return parent;
  }
  return null;
}

function allIdentifiers(node) {
  const names = new Set();
  function visit(child) {
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return names;
}

function uniqueName(base, used) {
  let name = base;
  for (let index = 2; used.has(name); index += 1) name = `${base}${index}`;
  used.add(name);
  return name;
}

function localBindingExists(component, name) {
  let found = component.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === name);
  function visit(node) {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = true;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = true;
    ts.forEachChild(node, visit);
  }
  visit(component.body);
  return found;
}

function isReference(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.name === node) return false;
  return true;
}

function unwrap(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current) || ts.isTypeAssertionExpression(current))) current = current.expression;
  return current;
}

function collectInlineObjects(expression, result) {
  const node = unwrap(expression);
  if (!node) return;
  if (ts.isObjectLiteralExpression(node)) result.push(node);
  else if (ts.isArrayLiteralExpression(node)) {
    for (const item of node.elements) if (!ts.isSpreadElement(item)) collectInlineObjects(item, result);
  } else if (ts.isConditionalExpression(node)) {
    collectInlineObjects(node.whenTrue, result);
    collectInlineObjects(node.whenFalse, result);
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    collectInlineObjects(node.right, result);
  } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (!ts.isBlock(node.body)) collectInlineObjects(node.body, result);
    else {
      function returns(child) {
        if (ts.isReturnStatement(child)) collectInlineObjects(child.expression, result);
        else if (child === node.body || !(ts.isArrowFunction(child) || ts.isFunctionExpression(child))) ts.forEachChild(child, returns);
      }
      returns(node.body);
    }
  }
}

function eolOf(source) { return source.includes('\r\n') ? '\r\n' : '\n'; }

function lineIndent(source, position) {
  const line = source.slice(source.lastIndexOf('\n', position - 1) + 1, position);
  return /^\s*/.exec(line)?.[0] || '';
}

function addImport(sourceFile, source, names, edits, eol) {
  if (names.size === 0) return;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== MODULE) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const existing = new Set(clause.namedBindings.elements.map((item) => item.propertyName?.text || item.name.text));
    const missing = [...names].filter((name) => !existing.has(name));
    if (missing.length) edits.push({
      start: clause.namedBindings.end - 1,
      end: clause.namedBindings.end - 1,
      replacement: `${clause.namedBindings.elements.length ? ', ' : ''}${missing.join(', ')}`,
    });
    return;
  }
  const imports = sourceFile.statements.filter((statement) => ts.isImportDeclaration(statement));
  const last = imports.at(-1);
  const position = last ? last.end : 0;
  edits.push({
    start: position,
    end: position,
    replacement: last ? `${eol}import { ${[...names].join(', ')} } from '${MODULE}';`
      : `import { ${[...names].join(', ')} } from '${MODULE}';${eol}`,
  });
}

function applyTextEdits(source, edits) {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) {
      throw new Error(`Overlapping edits at ${ordered[index - 1].start} and ${ordered[index].start}`);
    }
  }
  let next = source;
  for (const edit of ordered.reverse()) next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end);
  return next;
}

function planFile(filePath, root) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = parse(filePath, source);
  const name = relative(root, filePath);
  if (sourceFile.parseDiagnostics.length) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    throw new Error(`${name}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
  if (NATIVE_ONLY_PATTERN.test(filePath)) return { filePath, file: name, next: source, inlineValues: 0, stylesheetValues: 0, reason: 'native-only' };

  const eol = eolOf(source);
  const components = componentsIn(sourceFile);
  const sheets = topLevelStyleSheets(sourceFile);
  const edits = [];
  const usedNames = allIdentifiers(sourceFile);
  const details = new Map();
  const sheetByName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  const sheetUsers = new Map(sheets.map((sheet) => [sheet, new Map()]));
  let inlineValues = 0;
  let stylesheetValues = 0;

  function detail(component) {
    if (!details.has(component)) details.set(component, {
      inline: false, layoutName: null, sheetAliases: new Map(),
    });
    return details.get(component);
  }

  // Inline style literals can refer directly to the layout hook at render time.
  function inspectJsx(node) {
    if (ts.isJsxAttribute(node) && /style$/i.test(node.name.getText(sourceFile))
      && node.initializer && ts.isJsxExpression(node.initializer)) {
      const owner = ownerOf(node, components);
      if (owner) {
        const objects = [];
        collectInlineObjects(node.initializer.expression, objects);
        for (const object of objects) {
          for (const property of object.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const helper = valueHelper(propertyName(property), property.initializer);
            if (!helper) continue;
            const info = detail(owner);
            if (!info.layoutName) info.layoutName = uniqueName('responsiveLayout', usedNames);
            info.inline = true;
            const literal = property.initializer.getText(sourceFile);
            edits.push({
              start: property.initializer.getStart(sourceFile), end: property.initializer.end,
              replacement: `${info.layoutName}.isWeb ? ${info.layoutName}.${helper}(${literal}) : ${literal}`,
            });
            inlineValues += 1;
          }
        }
      }
    }
    ts.forEachChild(node, inspectJsx);
  }
  inspectJsx(sourceFile);

  // Existing responsive style factories already have a layout argument. Edit
  // their StyleSheet values in place instead of adding another hook or copy.
  // A StyleSheet created inside a component can use that component's hook.
  function inspectLocalStyleSheets(node) {
    if (isStyleSheetCreate(node)) {
      let factory = null;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
          const name = functionName(parent);
          const parameter = parent.parameters[0];
          const parameterName = parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null;
          if (name && /^create.*Styles$/i.test(name)
            && parameterName && /^(?:layout|responsiveLayout|responsiveUi)$/.test(parameterName)
            && (parameter.type?.getText(sourceFile).includes('useResponsiveLayout')
              || /responsive(?:Font|Width|Height)/.test(parent.body?.getText(sourceFile) || ''))) {
            factory = parameterName;
          }
          break;
        }
      }
      const owner = factory ? null : ownerOf(node, components);
      let receiver = factory;
      if (!receiver && owner) {
        const info = detail(owner);
        if (!info.layoutName) info.layoutName = uniqueName('responsiveLayout', usedNames);
        info.inline = true;
        receiver = info.layoutName;
      }
      if (receiver) {
        for (const style of node.arguments[0].properties) {
          if (!ts.isPropertyAssignment(style) || !ts.isObjectLiteralExpression(style.initializer)) continue;
          for (const property of style.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const helper = valueHelper(propertyName(property), property.initializer);
            if (!helper) continue;
            const literal = property.initializer.getText(sourceFile);
            edits.push({
              start: property.initializer.getStart(sourceFile), end: property.initializer.end,
              replacement: `${receiver}.isWeb ? ${receiver}.${helper}(${literal}) : ${literal}`,
            });
            stylesheetValues += 1;
          }
        }
      }
    }
    ts.forEachChild(node, inspectLocalStyleSheets);
  }
  inspectLocalStyleSheets(sourceFile);

  // A static StyleSheet stays available to module helpers. Every component
  // using it receives a hook-backed copy with web overrides.
  function inspectIdentifiers(node) {
    if (ts.isIdentifier(node) && sheetByName.has(node.text) && isReference(node)) {
      const owner = ownerOf(node, components);
      if (owner && !localBindingExists(owner, node.text)) {
        const sheet = sheetByName.get(node.text);
        if (!sheetUsers.get(sheet).has(owner)) {
          const aliasBase = node.text === 'styles' ? 'responsiveStyles'
            : `responsive${node.text[0].toUpperCase()}${node.text.slice(1)}`;
          sheetUsers.get(sheet).set(owner, uniqueName(aliasBase, usedNames));
        }
        const alias = sheetUsers.get(sheet).get(owner);
        detail(owner).sheetAliases.set(sheet, alias);
        edits.push({ start: node.getStart(sourceFile), end: node.end, replacement: alias });
      }
    }
    ts.forEachChild(node, inspectIdentifiers);
  }
  inspectIdentifiers(sourceFile);

  for (const sheet of sheets) {
    if (sheetUsers.get(sheet).size === 0) continue;
    const factory = uniqueName(`create${sheet.name[0].toUpperCase()}${sheet.name.slice(1)}WebResponsive`, usedNames);
    sheet.factory = factory;
    const overrides = sheet.entries.map((entry) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(entry.name) ? entry.name : JSON.stringify(entry.name);
      const fields = entry.values.map(({ field, helper, literal }) =>
        `      ${field}: layout.isWeb ? layout.${helper}(${literal}) : ${literal},`).join(eol);
      return `    ${key}: {${eol}      ...${sheet.name}[${JSON.stringify(entry.name)}],${eol}${fields}${eol}    },`;
    }).join(eol);
    const declaration = [
      '', '',
      `function ${factory}(layout${/\.tsx?$/.test(filePath) ? ': ReturnType<typeof useResponsiveLayout>' : ''}) {`,
      '  return StyleSheet.create({',
      `    ...${sheet.name},`,
      overrides,
      '  });',
      '}',
    ].join(eol);
    edits.push({ start: sheet.statement.end, end: sheet.statement.end, replacement: declaration });
    stylesheetValues += sheet.entries.reduce((total, entry) => total + entry.values.length, 0);
  }

  for (const [component, info] of details) {
    const lines = [];
    if (info.inline) lines.push(`const ${info.layoutName} = useResponsiveLayout();`);
    for (const [sheet, alias] of info.sheetAliases) lines.push(`const ${alias} = useResponsiveStyles(${sheet.factory});`);
    if (!lines.length) continue;
    const position = component.body.getStart(sourceFile) + 1;
    const indent = `${lineIndent(source, component.getStart(sourceFile))}  `;
    edits.push({
      start: position, end: position,
      replacement: `${eol}${indent}${lines.join(`${eol}${indent}`)}`,
    });
  }

  const imports = new Set();
  if ([...details.values()].some((info) => info.inline || info.sheetAliases.size) || [...sheets].some((sheet) => sheetUsers.get(sheet).size)) {
    imports.add('useResponsiveLayout');
  }
  if ([...sheets].some((sheet) => sheetUsers.get(sheet).size)) imports.add('useResponsiveStyles');
  addImport(sourceFile, source, imports, edits, eol);

  const next = edits.length ? applyTextEdits(source, edits) : source;
  if (next !== source) {
    const transformed = parse(filePath, next);
    if (transformed.parseDiagnostics.length) {
      const diagnostic = transformed.parseDiagnostics[0];
      throw new Error(`${name}: generated code failed to parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
  }
  return { filePath, file: name, next, inlineValues, stylesheetValues, reason: next === source ? 'no-eligible-values' : null };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const { files, counts } = walk(options.root);
  const plans = files.map((filePath) => planFile(filePath, options.root));
  const changed = plans.filter((plan) => plan.reason === null);
  const report = {
    applied: options.write,
    directoriesVisited: counts.directories,
    filesVisited: counts.files,
    sourceFilesScanned: files.length,
    nonSourceFiles: counts.nonSourceFiles,
    changedFiles: changed.map(({ file, inlineValues, stylesheetValues }) => ({ file, inlineValues, stylesheetValues })),
    unchangedFiles: plans.filter((plan) => plan.reason).map(({ file, reason }) => ({ file, reason })),
    totals: {
      files: changed.length,
      inlineValues: changed.reduce((sum, plan) => sum + plan.inlineValues, 0),
      stylesheetValues: changed.reduce((sum, plan) => sum + plan.stylesheetValues, 0),
    },
  };
  // Planning and syntax validation finish for every file before any write.
  if (options.write) for (const plan of changed) fs.writeFileSync(plan.filePath, plan.next, 'utf8');
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Responsive layout ${options.write ? 'applied' : 'dry run'}`);
    console.log(`Directories visited: ${report.directoriesVisited}; files visited: ${report.filesVisited}`);
    console.log(`Source files scanned: ${report.sourceFilesScanned}; files with edits: ${report.totals.files}`);
    console.log(`Inline values: ${report.totals.inlineValues}; StyleSheet values: ${report.totals.stylesheetValues}`);
    for (const item of report.changedFiles) console.log(`  ${item.file} (${item.inlineValues} inline, ${item.stylesheetValues} StyleSheet)`);
    if (!options.write) console.log('Use --write to apply these edits. --json lists every scanned source file.');
  }
}

try { main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
