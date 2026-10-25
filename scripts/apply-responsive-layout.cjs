#!/usr/bin/env node
'use strict';
/* global __dirname */

/**
 * Add platform-responsive values to React styles under app/ and components/.
 * Every nested source file is parsed. Numeric UI values are changed only when
 * they can be connected to a component: inline JSX/createElement styles, local
 * style objects, a responsive style
 * factory, or a module-level StyleSheet used by a component. Wide web and
 * compact/native branches use the responsive helpers from use-responsive-layout.
 * The normal run also upgrades existing responsive isWeb branches in shared
 * and .web source to isWideWeb.
 * Platform-specific .web, .native, .ios, and .android source files are
 * included. Geometry expressed as formulas, percentages, and transforms is
 * left for manual review.
 *
 * npm run responsive:ui           # inspect the plan
 * npm run responsive:ui:apply     # write the plan
 * node scripts/apply-responsive-layout.cjs --json --root=PATH
 * node scripts/apply-responsive-layout.cjs --wide-web-only [--write]
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DIRECTORIES = ['app', 'components'];
const MODULE = '@/hooks/use-responsive-layout';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const NON_WEB_PLATFORM_FILE_PATTERN = /(?:\.(?:native|android|ios))+\.[jt]sx?$/i;
const SKIP_DIRECTORIES = new Set([
  '.git', '.expo', '.next', 'node_modules', 'dist',
  'build', 'coverage', 'backup', 'backups',
]);
const SKIP_FILE_PATTERN = /(?:\.backup(?:[-.]|$)|\.bak(?:[-.]|$)|\.orig(?:[-.]|$)|\.secret(?:[-.]|$))/i;

// Only values that represent UI dimensions are mapped. Unitless values such
// as flex, opacity, zIndex, fontWeight, borderWidth, and animation data stay put.
const PROPERTY_HELPER = new Map([
  ...['fontSize', 'lineHeight', 'letterSpacing'].map((name) => [name, 'webResponsiveFont']),
  ...[
    'width', 'minWidth', 'maxWidth', 'left', 'right', 'start', 'end',
    'padding', 'paddingHorizontal', 'paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd',
    'margin', 'marginHorizontal', 'marginLeft', 'marginRight', 'marginStart', 'marginEnd',
    'gap', 'columnGap', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius', 'flexBasis', 'insetHorizontal',
  ].map((name) => [name, 'webResponsiveWidth']),
  ...[
    'height', 'minHeight', 'maxHeight', 'top', 'bottom', 'paddingVertical', 'paddingTop',
    'paddingBottom', 'marginVertical', 'marginTop', 'marginBottom', 'rowGap', 'insetVertical',
  ].map((name) => [name, 'webResponsiveHeight']),
]);

const NATIVE_HELPER = new Map([
  ['webResponsiveFont', 'responsiveFont'],
  ['webResponsiveWidth', 'responsiveWidth'],
  ['webResponsiveHeight', 'responsiveHeight'],
]);

function parseOptions(args) {
  const options = { root: DEFAULT_ROOT, write: false, json: false, wideWebOnly: false };
  for (const arg of args) {
    if (arg === '--write') options.write = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--wide-web-only') options.wideWebOnly = true;
    else if (arg.startsWith('--root=')) options.root = path.resolve(arg.slice(7));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/apply-responsive-layout.cjs [--write] [--json] [--wide-web-only] [--root=PATH]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function platformFor(filePath) {
  const stem = path.basename(filePath).replace(/\.[^.]+$/, '').toLowerCase();
  const suffix = stem.split('.').at(-1);
  return ['web', 'native', 'android', 'ios'].includes(suffix) ? suffix : 'shared';
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
  // Zero remains unchanged; nonzero spacing and geometry values can scale even
  // when they are small (for example, a 2px gap or compact padding).
  if (!helper || value === null || !Number.isFinite(value) || value === 0) return null;
  return helper;
}

function numericStyleExpression(node) {
  const value = unwrap(node);
  if (numericValue(value) !== null) return true;
  return ts.isConditionalExpression(value)
    && numericStyleExpression(value.whenTrue)
    && numericStyleExpression(value.whenFalse);
}

function hasResponsiveNumericValue(node) {
  const value = unwrap(node);
  if (numericValue(value) !== null) return numericValue(value) !== 0;
  return ts.isConditionalExpression(value)
    && (hasResponsiveNumericValue(value.whenTrue) || hasResponsiveNumericValue(value.whenFalse));
}

function isOnePixelValue(node) {
  const value = unwrap(node);
  if (numericValue(value) === 1) return true;
  return ts.isConditionalExpression(value)
    && isOnePixelValue(value.whenTrue)
    && isOnePixelValue(value.whenFalse);
}

function isVisuallyHiddenStyle(object) {
  if (!object || !ts.isObjectLiteralExpression(object)) return false;
  const values = new Map();
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) values.set(propertyName(property), unwrap(property.initializer));
  }
  const textValue = (name) => {
    const value = values.get(name);
    return value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : null;
  };
  return textValue('clip')?.startsWith('rect(') === true
    && textValue('clipPath')?.startsWith('inset(') === true
    && textValue('position') === 'absolute'
    && textValue('overflow') === 'hidden';
}

function responsiveBranchValues(node, helper) {
  const value = unwrap(node);
  if (!ts.isConditionalExpression(value) || !helper) return null;
  const condition = unwrap(value.condition);
  if (!ts.isPropertyAccessExpression(condition)
    || !['isWeb', 'isWideWeb'].includes(condition.name.text)
    || !ts.isIdentifier(condition.expression)) return null;
  const receiver = condition.expression.text;
  const branchArgument = (branch, expectedHelper) => {
    const candidate = unwrap(branch);
    if (numericStyleExpression(candidate)) return candidate.getText();
    if (!ts.isCallExpression(candidate) || !ts.isPropertyAccessExpression(candidate.expression)
      || candidate.expression.name.text !== expectedHelper
      || !ts.isIdentifier(candidate.expression.expression)
      || candidate.expression.expression.text !== receiver
      || candidate.arguments.length !== 1
      || !numericStyleExpression(candidate.arguments[0])) return null;
    return candidate.arguments[0].getText();
  };
  const webArgument = branchArgument(value.whenTrue, helper);
  const mobileArgument = branchArgument(value.whenFalse, NATIVE_HELPER.get(helper));
  if (webArgument === null || mobileArgument === null) return null;
  return { receiver, webArgument, mobileArgument };
}

function isResponsiveHelperPair(node, helper) {
  const value = unwrap(node);
  if (!ts.isConditionalExpression(value)) return false;
  const condition = unwrap(value.condition);
  if (!ts.isPropertyAccessExpression(condition)
    || !['isWeb', 'isWideWeb'].includes(condition.name.text)
    || !ts.isIdentifier(condition.expression)) return false;
  const receiver = condition.expression.text;
  const isHelperCall = (branch, expectedHelper) => {
    const candidate = unwrap(branch);
    return ts.isCallExpression(candidate)
      && ts.isPropertyAccessExpression(candidate.expression)
      && candidate.expression.name.text === expectedHelper
      && ts.isIdentifier(candidate.expression.expression)
      && candidate.expression.expression.text === receiver
      && candidate.arguments.length === 1
      && numericStyleExpression(candidate.arguments[0]);
  };
  return isHelperCall(value.whenTrue, helper)
    && isHelperCall(value.whenFalse, NATIVE_HELPER.get(helper));
}

function styleValueHelper(property, node, styleObject = null) {
  const helper = PROPERTY_HELPER.get(property);
  if (!helper) return null;
  const branches = responsiveBranchValues(node, helper);
  if (isVisuallyHiddenStyle(styleObject)
    && ['width', 'height'].includes(property)
    && (isOnePixelValue(node) || (branches
      && Number(branches.webArgument) === 1 && Number(branches.mobileArgument) === 1))) return null;
  if (valueHelper(property, node)) return helper;
  if (branches && (Number(branches.webArgument) !== 0 || Number(branches.mobileArgument) !== 0)) return helper;
  return numericStyleExpression(node) && hasResponsiveNumericValue(node) ? helper : null;
}

function isZeroResponsiveStyleValue(property, node) {
  const helper = PROPERTY_HELPER.get(property);
  if (!helper) return false;
  const branches = responsiveBranchValues(node, helper);
  return Boolean(branches && isResponsiveHelperPair(node, helper)
    && Number(branches.webArgument) === 0 && Number(branches.mobileArgument) === 0);
}

function responsiveStyleValue(receiver, helper, node, sourceFile) {
  const nativeHelper = NATIVE_HELPER.get(helper);
  if (!nativeHelper) return null;

  const branches = responsiveBranchValues(node, helper);
  if (branches) {
    const webValue = Number(branches.webArgument) === 0 ? branches.webArgument : `${branches.receiver}.${helper}(${branches.webArgument})`;
    const mobileValue = Number(branches.mobileArgument) === 0 ? branches.mobileArgument : `${branches.receiver}.${nativeHelper}(${branches.mobileArgument})`;
    return `${branches.receiver}.isWideWeb ? ${webValue} : ${mobileValue}`;
  }
  if (!numericStyleExpression(node)) return null;
  const literal = node.getText(sourceFile);
  return `${receiver}.isWideWeb ? ${receiver}.${helper}(${literal}) : ${receiver}.${nativeHelper}(${literal})`;
}

function cssLengthTokens(node) {
  const value = unwrap(node);
  if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) return null;
  const source = value.text.trim();
  if (!source || source.includes('/') || /calc\(|var\(|%|auto/i.test(source)) return null;
  const tokens = source.split(/\s+/);
  if (tokens.length > 4) return null;
  const parsed = tokens.map((token) => {
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px)?$/i.exec(token);
    if (!match) return null;
    const number = Number(match[1]);
    if (!Number.isFinite(number) || (!match[2] && number !== 0)) return null;
    return { literal: match[1], unit: match[2] || '', number };
  });
  return parsed.some((token) => token === null) ? null : parsed;
}

function cssShorthandHelper(property, index, count) {
  const horizontal = PROPERTY_HELPER.get(property) || 'webResponsiveWidth';
  const vertical = 'webResponsiveHeight';
  if (['padding', 'margin'].includes(property)) {
    if (count === 1) return horizontal;
    if (count === 2) return index === 0 ? vertical : horizontal;
    if (count === 3) return index === 1 ? horizontal : vertical;
    return index % 2 === 0 ? vertical : horizontal;
  }
  if (property === 'gap' && count === 2) return index === 0 ? vertical : horizontal;
  return horizontal;
}

function responsiveCssStyleValue(receiver, property, node, styleObject = null) {
  const tokens = cssLengthTokens(node);
  if (!tokens || !PROPERTY_HELPER.has(property) || !tokens.some((token) => token.number !== 0)) return null;
  if (isVisuallyHiddenStyle(styleObject) && ['width', 'height'].includes(property)
    && tokens.length === 1 && tokens[0].number === 1) return null;
  const parts = tokens.map((token, index) => {
    if (token.number === 0) return token.literal + token.unit;
    const helper = cssShorthandHelper(property, index, tokens.length);
    const nativeHelper = NATIVE_HELPER.get(helper);
    const value = `${receiver}.isWideWeb ? ${receiver}.${helper}(${token.literal}) : ${receiver}.${nativeHelper}(${token.literal})`;
    return `\${${value}}${token.unit || 'px'}`;
  });
  return `\`${parts.join(' ')}\``;
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

function isIdentifierCall(node, name) {
  return Boolean(node) && ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === name;
}

function hasResponsiveStyleValues(node) {
  let found = false;
  function visit(child) {
    if (found) return;
    if (isStyleSheetCreate(child)) {
      const styles = child.arguments[0];
      for (const style of styles.properties) {
        if (!ts.isPropertyAssignment(style) || !ts.isObjectLiteralExpression(style.initializer)) continue;
        for (const property of style.initializer.properties) {
          if (ts.isPropertyAssignment(property)
            && styleValueHelper(propertyName(property), property.initializer, style.initializer)) {
            found = true;
            return;
          }
        }
      }
      return;
    }
    ts.forEachChild(child, visit);
  }
  if (node.body) visit(node.body);
  return found;
}

function appendLayoutParameter(functionNode, name, sourceFile, edits) {
  const firstParameterName = functionNode.parameters[0]?.name;
  const parameter = firstParameterName && ts.isIdentifier(firstParameterName)
    ? firstParameterName.text
    : null;
  if (parameter) return parameter;
  if (functionNode.parameters.length > 0) return null;
  const annotation = /\.tsx?$/.test(sourceFile.fileName)
    ? `${name}: ReturnType<typeof useResponsiveLayout>`
    : name;
  edits.push({ start: functionNode.parameters.end, end: functionNode.parameters.end, replacement: annotation });
  return name;
}

function appendMemoDependency(node, name, sourceFile, edits) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!isIdentifierCall(parent, 'useMemo')) continue;
    const dependencies = parent.arguments[1];
    if (dependencies && ts.isArrayLiteralExpression(dependencies)) {
      if (dependencies.elements.some((element) => ts.isIdentifier(element) && element.text === name)) return;
      const beforeClose = sourceFile.text.slice(dependencies.elements.end, dependencies.end - 1);
      const separator = dependencies.elements.length === 0 ? '' : /,\s*$/.test(beforeClose) ? ' ' : ', ';
      edits.push({
        start: dependencies.end - 1,
        end: dependencies.end - 1,
        replacement: `${separator}${name}`,
      });
    } else if (!dependencies) {
      edits.push({
        start: parent.arguments.end,
        end: parent.arguments.end,
        replacement: `, [${name}]`,
      });
    }
    return;
  }
}

function styleEntries(object, sourceFile) {
  const entries = [];
  for (const style of object.properties) {
    if (!ts.isPropertyAssignment(style) || !ts.isObjectLiteralExpression(style.initializer)) continue;
    const name = propertyName(style);
    if (!name) continue;
    const values = [];
    for (const property of style.initializer.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const field = propertyName(property);
      const helper = styleValueHelper(field, property.initializer, style.initializer);
      if (helper && !isResponsiveHelperPair(property.initializer, helper)) {
        values.push({ field, helper, literal: property.initializer.getText(sourceFile), node: property });
      }
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
      const entries = styleEntries(declaration.initializer.arguments[0], sourceFile);
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
      if (name && (name === '<default>' || /^[A-Z]/.test(name) || /^use[A-Z]/.test(name))) components.add(node);
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

function findLocalVariableInitializer(name, reference, owner, components) {
  for (let scope = reference.parent; scope; scope = scope.parent) {
    if (!ts.isBlock(scope)) continue;
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name
          && declaration.initializer && ownerOf(declaration, components) === owner) {
          return declaration.initializer;
        }
      }
    }
    if (scope === owner.body) break;
  }
  return null;
}

function collectInlineObjects(expression, result, sourceFile, owner, components, seen = new Set()) {
  const node = unwrap(expression);
  if (!node) return;
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return;
    const initializer = findLocalVariableInitializer(node.text, node, owner, components);
    if (initializer) {
      seen.add(node.text);
      collectInlineObjects(initializer, result, sourceFile, owner, components, seen);
    }
  } else if (ts.isObjectLiteralExpression(node)) result.push(node);
  else if (ts.isArrayLiteralExpression(node)) {
    for (const item of node.elements) {
      if (!ts.isSpreadElement(item)) collectInlineObjects(item, result, sourceFile, owner, components, seen);
    }
  } else if (ts.isConditionalExpression(node)) {
    collectInlineObjects(node.whenTrue, result, sourceFile, owner, components, seen);
    collectInlineObjects(node.whenFalse, result, sourceFile, owner, components, seen);
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    collectInlineObjects(node.right, result, sourceFile, owner, components, seen);
  } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (!ts.isBlock(node.body)) collectInlineObjects(node.body, result, sourceFile, owner, components, seen);
    else {
      function returns(child) {
        if (ts.isReturnStatement(child)) {
          collectInlineObjects(child.expression, result, sourceFile, owner, components, seen);
        }
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

function collectWideWebBranchEdits(sourceFile) {
  const edits = [];
  function visit(node) {
    if (ts.isConditionalExpression(node)) {
      const condition = unwrap(node.condition);
      const whenTrue = unwrap(node.whenTrue);
      const whenFalse = unwrap(node.whenFalse);
      const parent = node.parent;
      if (ts.isPropertyAssignment(parent) && parent.initializer === node
        && isZeroResponsiveStyleValue(propertyName(parent), node)) return;
      if (condition && ts.isPropertyAccessExpression(condition)
        && condition.name.text === 'isWeb'
        && whenTrue && ts.isCallExpression(whenTrue)
        && ts.isPropertyAccessExpression(whenTrue.expression)
        && whenFalse && ts.isCallExpression(whenFalse)
        && ts.isPropertyAccessExpression(whenFalse.expression)) {
        const webHelper = whenTrue.expression.name.text;
        const receiver = condition.expression.getText(sourceFile);
        if (NATIVE_HELPER.get(webHelper) === whenFalse.expression.name.text
          && whenTrue.expression.expression.getText(sourceFile) === receiver
          && whenFalse.expression.expression.getText(sourceFile) === receiver) {
          edits.push({
            start: condition.name.getStart(sourceFile),
            end: condition.name.end,
            replacement: 'isWideWeb',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return edits;
}

function planWideWebFile(filePath, root) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = parse(filePath, source);
  const name = relative(root, filePath);
  if (sourceFile.parseDiagnostics.length) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    throw new Error(`${name}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }

  const edits = collectWideWebBranchEdits(sourceFile);
  const next = edits.length ? applyTextEdits(source, edits) : source;
  if (edits.length && parse(filePath, next).parseDiagnostics.length) {
    throw new Error(`${name}: wide web migration failed to parse`);
  }
  return {
    filePath, file: name, next, inlineValues: 0, stylesheetValues: 0,
    wideWebBranches: edits.length,
    reason: edits.length ? null : 'no-eligible-branches',
  };
}

function planFile(filePath, root) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = parse(filePath, source);
  const name = relative(root, filePath);
  if (sourceFile.parseDiagnostics.length) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    throw new Error(`${name}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
  const eol = eolOf(source);
  const components = componentsIn(sourceFile);
  const sheets = topLevelStyleSheets(sourceFile);
  // Keep older web-responsive pairs current during the normal run too.
  // Native-only files still receive new responsive values below, but their
  // existing platform checks do not need a web-width migration.
  const wideWebEdits = NON_WEB_PLATFORM_FILE_PATTERN.test(filePath)
    ? []
    : collectWideWebBranchEdits(sourceFile);
  const edits = [...wideWebEdits];
  const usedNames = allIdentifiers(sourceFile);
  const details = new Map();
  const sheetByName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  const sheetUsers = new Map(sheets.map((sheet) => [sheet, new Map()]));
  const responsiveFactoryReceivers = new Map();
  const processedInlineProperties = new Set();
  let needsResponsiveLayoutImport = false;
  let inlineValues = 0;
  let stylesheetValues = 0;

  function detail(component) {
    if (!details.has(component)) details.set(component, {
      inline: false, layoutName: null, sheetAliases: new Map(),
    });
    return details.get(component);
  }

  function existingLayoutBinding(component) {
    let directBinding = null;
    const destructuredBindings = [];
    for (const statement of component.body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const initializer = unwrap(declaration.initializer);
        if (!isIdentifierCall(initializer, 'useResponsiveLayout')) continue;
        if (ts.isIdentifier(declaration.name)) directBinding ||= declaration.name.text;
        else if (ts.isObjectBindingPattern(declaration.name)) destructuredBindings.push(initializer);
      }
    }
    if (directBinding) {
      for (const initializer of destructuredBindings) {
        edits.push({ start: initializer.getStart(sourceFile), end: initializer.end, replacement: directBinding });
      }
      return { name: directBinding, needsDeclaration: false };
    }
    if (destructuredBindings.length) {
      const name = uniqueName('responsiveLayout', usedNames);
      for (const initializer of destructuredBindings) {
        edits.push({ start: initializer.getStart(sourceFile), end: initializer.end, replacement: name });
      }
      return { name, needsDeclaration: true };
    }
    return null;
  }

  function layoutFor(component) {
    const info = detail(component);
    if (!info.layoutName) {
      const binding = existingLayoutBinding(component);
      info.layoutName = binding?.name || uniqueName('responsiveLayout', usedNames);
      info.inline = !binding || binding.needsDeclaration;
    }
    return info.layoutName;
  }

  const functions = [];
  const functionsByName = new Map();
  const responsiveStyleCallbacks = new Set();
  const responsiveStyleCallbackNames = new Set();
  function collectFunctions(node) {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      functions.push(node);
      const name = functionName(node);
      if (name) {
        if (!functionsByName.has(name)) functionsByName.set(name, []);
        functionsByName.get(name).push(node);
      }
    }
    if (isIdentifierCall(node, 'useResponsiveStyles')) {
      for (const argument of node.arguments) {
        if (ts.isIdentifier(argument)) responsiveStyleCallbackNames.add(argument.text);
        if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) responsiveStyleCallbacks.add(argument);
      }
    }
    ts.forEachChild(node, collectFunctions);
  }
  collectFunctions(sourceFile);

  // Style factories passed directly to useResponsiveStyles receive their
  // layout from the hook. Add that parameter even when the factory was
  // originally written with no arguments.
  for (const styleFactory of functions) {
    const factoryName = functionName(styleFactory);
    const isHookFactoryCallback = responsiveStyleCallbacks.has(styleFactory)
      || (factoryName && responsiveStyleCallbackNames.has(factoryName));
    if (!isHookFactoryCallback || !hasResponsiveStyleValues(styleFactory)) continue;
    const receiver = appendLayoutParameter(
      styleFactory,
      uniqueName('responsiveLayout', usedNames),
      sourceFile,
      edits,
    );
    if (receiver) {
      responsiveFactoryReceivers.set(styleFactory, receiver);
      needsResponsiveLayoutImport = true;
    }
  }

  // A plain create*Styles() helper can also be used from a component or a
  // custom hook. Thread the responsive layout through that call and include it
  // in a surrounding useMemo dependency list when present.
  for (const [factoryName, factoryFunctions] of functionsByName) {
    if (!/^create.*(?:Styles|Responsive)$/i.test(factoryName)
      || !factoryFunctions.some(hasResponsiveStyleValues)
      || responsiveStyleCallbackNames.has(factoryName)) continue;
    for (const styleFactory of factoryFunctions) {
      if (styleFactory.parameters.length !== 0) continue;
      let receiver = null;
      function findFactoryCalls(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
          && node.expression.text === factoryName && node.arguments.length === 0) {
          const owner = ownerOf(node, components);
          if (owner) {
            receiver ||= layoutFor(owner);
            edits.push({ start: node.end - 1, end: node.end - 1, replacement: receiver });
            appendMemoDependency(node, receiver, sourceFile, edits);
          }
        }
        ts.forEachChild(node, findFactoryCalls);
      }
      findFactoryCalls(sourceFile);
      if (receiver) {
        const parameter = appendLayoutParameter(styleFactory, receiver, sourceFile, edits);
        if (parameter) {
          responsiveFactoryReceivers.set(styleFactory, parameter);
          needsResponsiveLayoutImport = true;
        }
      }
    }
  }

  // Inline style objects can refer directly to the layout hook at render time.
  function inspectStyleExpression(expression, owner, allowCssStrings = false) {
    if (!owner) return;
    const objects = [];
    collectInlineObjects(expression, objects, sourceFile, owner, components);
    for (const object of objects) {
      for (const property of object.properties) {
        if (!ts.isPropertyAssignment(property) || processedInlineProperties.has(property)) continue;
        if (isZeroResponsiveStyleValue(propertyName(property), property.initializer)) {
          edits.push({
            start: property.initializer.getStart(sourceFile), end: property.initializer.end,
            replacement: '0',
          });
          processedInlineProperties.add(property);
          inlineValues += 1;
          continue;
        }
        const helper = styleValueHelper(propertyName(property), property.initializer, object);
        if (helper && isResponsiveHelperPair(property.initializer, helper)) continue;
        const field = propertyName(property);
        let replacement = null;
        if (helper) {
          const existing = responsiveBranchValues(property.initializer, helper);
          const receiver = existing?.receiver || layoutFor(owner);
          replacement = responsiveStyleValue(receiver, helper, property.initializer, sourceFile);
        } else if (allowCssStrings
          && responsiveCssStyleValue('responsiveLayout', field, property.initializer, object)) {
          replacement = responsiveCssStyleValue(layoutFor(owner), field, property.initializer, object);
        }
        if (!replacement) continue;
        edits.push({
          start: property.initializer.getStart(sourceFile), end: property.initializer.end,
          replacement,
        });
        processedInlineProperties.add(property);
        inlineValues += 1;
      }
    }
  }

  function inspectJsx(node) {
    if (ts.isJsxAttribute(node) && /style$/i.test(node.name.getText(sourceFile))
      && node.initializer && ts.isJsxExpression(node.initializer)) {
      const owner = ownerOf(node, components);
      const opening = node.parent.parent;
      const tagName = (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening))
        ? opening.tagName.getText(sourceFile) : '';
      inspectStyleExpression(node.initializer.expression, owner, /^[a-z]/.test(tagName));
    }
    ts.forEachChild(node, inspectJsx);
  }
  inspectJsx(sourceFile);

  // React.createElement styles use a props object instead of a JSX attribute.
  function inspectCreateElement(node) {
    if (ts.isCallExpression(node)
      && ((ts.isIdentifier(node.expression) && node.expression.text === 'createElement')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'createElement'))
      && node.arguments.length > 1 && ts.isObjectLiteralExpression(unwrap(node.arguments[1]))) {
      const owner = ownerOf(node, components);
      const tag = unwrap(node.arguments[0]);
      const allowCssStrings = ts.isStringLiteral(tag) && /^[a-z]/.test(tag.text);
      for (const prop of unwrap(node.arguments[1]).properties) {
        if (ts.isPropertyAssignment(prop) && propertyName(prop) === 'style') {
          inspectStyleExpression(prop.initializer, owner, allowCssStrings);
        }
      }
    }
    ts.forEachChild(node, inspectCreateElement);
  }
  inspectCreateElement(sourceFile);

  // Existing responsive style factories already have a layout argument. Edit
  // their StyleSheet values in place instead of adding another hook or copy.
  // A StyleSheet created inside a component can use that component's hook.
  function inspectLocalStyleSheets(node) {
    if (isStyleSheetCreate(node)) {
      let factory = null;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
          if (responsiveFactoryReceivers.has(parent)) {
            factory = responsiveFactoryReceivers.get(parent);
            break;
          }
          const name = functionName(parent);
          const parameter = parent.parameters[0];
          const parameterName = parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null;
          if (name && /^create.*(?:Styles|Responsive)$/i.test(name)
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
        receiver = layoutFor(owner);
      }
      if (receiver) {
        for (const style of node.arguments[0].properties) {
          if (!ts.isPropertyAssignment(style) || !ts.isObjectLiteralExpression(style.initializer)) continue;
          for (const property of style.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            if (isZeroResponsiveStyleValue(propertyName(property), property.initializer)) {
              edits.push({
                start: property.initializer.getStart(sourceFile), end: property.initializer.end,
                replacement: '0',
              });
              stylesheetValues += 1;
              continue;
            }
            const helper = styleValueHelper(propertyName(property), property.initializer, style.initializer);
            if (!helper) continue;
            if (isResponsiveHelperPair(property.initializer, helper)) continue;
            const replacement = responsiveStyleValue(receiver, helper, property.initializer, sourceFile);
            if (!replacement) continue;
            edits.push({
              start: property.initializer.getStart(sourceFile), end: property.initializer.end,
              replacement,
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
      const fields = entry.values.map(({ field, helper, node }) =>
        `      ${field}: ${responsiveStyleValue('layout', helper, node.initializer, sourceFile)},`).join(eol);
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
  if (needsResponsiveLayoutImport) imports.add('useResponsiveLayout');
  if ([...sheets].some((sheet) => sheetUsers.get(sheet).size)) imports.add('useResponsiveStyles');
  addImport(sourceFile, source, imports, edits, eol);

  const next = edits.length ? applyTextEdits(source, edits) : source;
  if (next !== source) {
    const transformed = parse(filePath, next);
    if (transformed.parseDiagnostics.length) {
      const diagnostic = transformed.parseDiagnostics[0];
      const line = transformed.getLineAndCharacterOfPosition(diagnostic.start || 0).line + 1;
      throw new Error(`${name}:${line}: generated code failed to parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
  }
  return { filePath, file: name, next, inlineValues, stylesheetValues, wideWebBranches: wideWebEdits.length, reason: next === source ? 'no-eligible-values' : null };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const { files, counts } = walk(options.root);
  const platformFileCounts = { shared: 0, web: 0, native: 0, android: 0, ios: 0 };
  for (const filePath of files) platformFileCounts[platformFor(filePath)] += 1;
  const eligibleFiles = options.wideWebOnly
    ? files.filter((filePath) => !NON_WEB_PLATFORM_FILE_PATTERN.test(filePath))
    : files;
  const plans = eligibleFiles.map((filePath) => options.wideWebOnly
    ? planWideWebFile(filePath, options.root)
    : planFile(filePath, options.root));
  const changed = plans.filter((plan) => plan.reason === null);
  const report = {
    applied: options.write,
    directoriesVisited: counts.directories,
    filesVisited: counts.files,
    sourceFilesScanned: eligibleFiles.length,
    nonSourceFiles: counts.nonSourceFiles,
    platformFileCounts,
    changedFiles: changed.map(({ file, inlineValues, stylesheetValues, wideWebBranches }) => ({ file, inlineValues, stylesheetValues, wideWebBranches })),
    unchangedFiles: plans.filter((plan) => plan.reason).map(({ file, reason }) => ({ file, reason })),
    totals: {
      files: changed.length,
      inlineValues: changed.reduce((sum, plan) => sum + plan.inlineValues, 0),
      stylesheetValues: changed.reduce((sum, plan) => sum + plan.stylesheetValues, 0),
      wideWebBranches: changed.reduce((sum, plan) => sum + plan.wideWebBranches, 0),
    },
  };
  // Planning and syntax validation finish for every file before any write.
  if (options.write) for (const plan of changed) fs.writeFileSync(plan.filePath, plan.next, 'utf8');
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Responsive layout${options.wideWebOnly ? ' wide web migration' : ''} ${options.write ? 'applied' : 'dry run'}`);
    console.log(`Directories visited: ${report.directoriesVisited}; files visited: ${report.filesVisited}`);
    console.log(`Source files scanned: ${report.sourceFilesScanned}; files with edits: ${report.totals.files}`);
    console.log(`Source files by platform: ${Object.entries(report.platformFileCounts).map(([platform, count]) => `${platform} ${count}`).join(', ')}`);
    console.log(`Inline values: ${report.totals.inlineValues}; StyleSheet values: ${report.totals.stylesheetValues}`);
    console.log(`Wide web branches: ${report.totals.wideWebBranches}`);
    for (const item of report.changedFiles) console.log(`  ${item.file} (${item.inlineValues} inline, ${item.stylesheetValues} StyleSheet, ${item.wideWebBranches} wide web)`);
    if (!options.write) console.log('Use --write to apply these edits. --json lists every scanned source file.');
  }
}

try { main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
