$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\theja\KeepFlip"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $projectRoot ".backups\space-grotesk-$timestamp"
$tempScript = Join-Path $projectRoot ".tmp-apply-space-grotesk.cjs"

Set-Location $projectRoot

if (-not (Test-Path (Join-Path $projectRoot "assets\fonts"))) {
    throw "Could not find C:\Users\theja\KeepFlip\assets\fonts."
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$nodeScript = @'
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = process.cwd();
const backupRoot = process.env.KEEPFLIP_FONT_BACKUP_ROOT;

if (!backupRoot) {
  throw new Error("KEEPFLIP_FONT_BACKUP_ROOT was not supplied.");
}

const fontDir = path.join(root, "assets", "fonts");
const rootLayoutPath = path.join(root, "app", "_layout.tsx");
const themePath = path.join(root, "constants", "keepflip-theme.ts");
const wrapperPath = path.join(root, "components", "ui", "keepflip-text.tsx");

function normalize(filePath) {
  return filePath.split(path.sep).join("/");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return;

  const relative = path.relative(root, filePath);
  const destination = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(filePath, destination);
}

function write(filePath, content) {
  backup(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function listFontFiles() {
  return fs
    .readdirSync(fontDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^SpaceGrotesk.*\.(?:ttf|otf)$/i.test(name));
}

const allSpaceGroteskFiles = listFontFiles();

if (allSpaceGroteskFiles.length === 0) {
  throw new Error(
    "No SpaceGrotesk .ttf or .otf files were found in assets/fonts.",
  );
}

const staticFiles = allSpaceGroteskFiles.filter(
  (name) => !/variable/i.test(name),
);
const fontFiles = staticFiles.length > 0 ? staticFiles : allSpaceGroteskFiles;

if (staticFiles.length === 0) {
  console.warn(
    "Only a variable Space Grotesk font was found. Static Regular/Medium/SemiBold/Bold files are more reliable across Android and iOS.",
  );
}

function scoreFont(name, patterns) {
  const stem = path.basename(name, path.extname(name)).toLowerCase();
  return patterns.some((pattern) => pattern.test(stem));
}

function firstMatch(patterns) {
  return fontFiles.find((name) => scoreFont(name, patterns));
}

const regular =
  firstMatch([/(?:^|[-_])regular(?:$|[-_])/, /(?:^|[-_])400(?:$|[-_])/]) ??
  firstMatch([/(?:^|[-_])book(?:$|[-_])/]) ??
  fontFiles[0];

const medium =
  firstMatch([/(?:^|[-_])medium(?:$|[-_])/, /(?:^|[-_])500(?:$|[-_])/]) ??
  regular;

const semibold =
  firstMatch([
    /(?:^|[-_])semi[-_]?bold(?:$|[-_])/,
    /(?:^|[-_])demi[-_]?bold(?:$|[-_])/,
    /(?:^|[-_])600(?:$|[-_])/,
  ]) ??
  firstMatch([/(?:^|[-_])bold(?:$|[-_])/, /(?:^|[-_])700(?:$|[-_])/]) ??
  medium;

const bold =
  firstMatch([
    /(?:^|[-_])extra[-_]?bold(?:$|[-_])/,
    /(?:^|[-_])800(?:$|[-_])/,
  ]) ??
  firstMatch([
    /(?:^|[-_])bold(?:$|[-_])/,
    /(?:^|[-_])700(?:$|[-_])/,
    /(?:^|[-_])black(?:$|[-_])/,
    /(?:^|[-_])900(?:$|[-_])/,
  ]) ??
  semibold;

const aliases = [
  ["SpaceGrotesk-Regular", regular],
  ["SpaceGrotesk-Medium", medium],
  ["SpaceGrotesk-SemiBold", semibold],
  ["SpaceGrotesk-Bold", bold],
];

console.log("Detected Space Grotesk mapping:");
for (const [alias, file] of aliases) {
  console.log(`  ${alias} -> assets/fonts/${file}`);
}

function quoteRequirePath(fileName) {
  return `require('../assets/fonts/${fileName.replace(/\\/g, "/").replace(/'/g, "\\'")}')`;
}

function patchRootLayout() {
  let source = read(rootLayoutPath);
  const sourceFile = ts.createSourceFile(
    rootLayoutPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let objectLiteral = null;

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useFonts" &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      objectLiteral = node.arguments[0];
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!objectLiteral) {
    throw new Error("Could not find the useFonts({...}) map in app/_layout.tsx.");
  }

  const missing = aliases.filter(([alias]) => !source.includes(`${alias}:`) && !source.includes(`'${alias}':`) && !source.includes(`"${alias}":`));

  if (missing.length === 0) {
    console.log("app/_layout.tsx already loads every Space Grotesk alias.");
    return;
  }

  const closeBrace = objectLiteral.end - 1;
  const objectBody = source.slice(objectLiteral.getStart(sourceFile) + 1, closeBrace);
  const needsComma = objectBody.trim().length > 0 && !objectBody.trimEnd().endsWith(",");
  const prefix = needsComma ? "," : "";
  const entries = missing
    .map(
      ([alias, file]) =>
        `    '${alias}': ${quoteRequirePath(file)},`,
    )
    .join("\n");

  source =
    source.slice(0, closeBrace) +
    prefix +
    "\n" +
    entries +
    "\n  " +
    source.slice(closeBrace);

  write(rootLayoutPath, source);
  console.log("Added Space Grotesk to the existing Expo useFonts map.");
}

function patchTheme() {
  let source = read(themePath);
  const fontBlock = `fonts: {
    analysis: 'LucidaConsole',
    body: 'SpaceGrotesk-Regular',
    medium: 'SpaceGrotesk-Medium',
    semibold: 'SpaceGrotesk-SemiBold',
    bold: 'SpaceGrotesk-Bold',
    display: 'SpaceGrotesk-Bold',
  },`;

  const pattern = /fonts:\s*\{[\s\S]*?\},\s*(?=colors:)/;

  if (!pattern.test(source)) {
    throw new Error("Could not locate keepFlipTheme.fonts.");
  }

  source = source.replace(pattern, fontBlock + "\n  ");
  write(themePath, source);
  console.log("Added Space Grotesk typography tokens to keepFlipTheme.");
}

const wrapperSource = `import {
  forwardRef,
  type ComponentRef,
} from "react";
import {
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from "react-native";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

function numericWeight(weight: TextStyle["fontWeight"]) {
  if (typeof weight === "number") return weight;

  if (weight === "bold") return 700;
  if (weight === "normal" || weight == null) return 400;

  const parsed = Number(weight);
  return Number.isFinite(parsed) ? parsed : 400;
}

function fontForWeight(weight: TextStyle["fontWeight"]) {
  const value = numericWeight(weight);

  if (value >= 700) return theme.fonts.bold;
  if (value >= 600) return theme.fonts.semibold;
  if (value >= 500) return theme.fonts.medium;
  return theme.fonts.body;
}

/**
 * Default KeepFlip application text.
 *
 * Analysis components intentionally continue rendering with
 * theme.fonts.analysis and are excluded from the migration.
 */
export const KeepFlipText = forwardRef<
  ComponentRef<typeof NativeText>,
  TextProps
>(function KeepFlipText({ style, ...props }, ref) {
  const flattened = StyleSheet.flatten(style);

  if (flattened?.fontFamily) {
    return <NativeText {...props} ref={ref} style={style} />;
  }

  const fontFamily = fontForWeight(flattened?.fontWeight);

  return (
    <NativeText
      {...props}
      ref={ref}
      style={[
        style,
        {
          fontFamily,
          fontWeight: "normal",
        },
      ]}
    />
  );
});
`;

function writeWrapper() {
  write(wrapperPath, wrapperSource);
  console.log("Created components/ui/keepflip-text.tsx.");
}

function collectTsxFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const results = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".expo" ||
      entry.name === ".backups"
    ) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }

  return results;
}

function shouldSkip(filePath, source) {
  const relative = normalize(path.relative(root, filePath));

  if (filePath === wrapperPath) return true;

  if (
    relative.startsWith("components/scanner/item-analysis-") ||
    relative === "components/scanner/item-analysis-result-stage.tsx"
  ) {
    return true;
  }

  return (
    source.includes("fonts.analysis") ||
    source.includes("LucidaConsole")
  );
}

function replaceNativeTextImport(filePath) {
  let source = read(filePath);

  if (shouldSkip(filePath, source)) return false;

  if (
    source.includes(
      'from "@/components/ui/keepflip-text"',
    ) ||
    source.includes(
      "from '@/components/ui/keepflip-text'",
    )
  ) {
    return false;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const edits = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "react-native"
    ) {
      continue;
    }

    const clause = statement.importClause;
    const named = clause?.namedBindings;

    if (!clause || !named || !ts.isNamedImports(named)) continue;

    const target = named.elements.find((element) => {
      const importedName = element.propertyName?.text ?? element.name.text;
      return importedName === "Text" && element.name.text === "Text";
    });

    if (!target) continue;

    const remaining = named.elements.filter((element) => element !== target);
    const quote = statement.moduleSpecifier.getText(sourceFile);
    const typePrefix = clause.isTypeOnly ? "type " : "";
    const defaultImport = clause.name?.text;

    let replacement = "";

    if (remaining.length > 0) {
      const namedText = remaining
        .map((element) => element.getText(sourceFile))
        .join(", ");

      const bindings = defaultImport
        ? `${defaultImport}, { ${namedText} }`
        : `{ ${namedText} }`;

      replacement = `import ${typePrefix}${bindings} from ${quote};`;
    } else if (defaultImport) {
      replacement = `import ${typePrefix}${defaultImport} from ${quote};`;
    }

    edits.push({
      start: statement.getStart(sourceFile),
      end: statement.end,
      replacement,
    });
  }

  if (edits.length === 0) return false;

  edits.sort((left, right) => right.start - left.start);

  for (const edit of edits) {
    source =
      source.slice(0, edit.start) +
      edit.replacement +
      source.slice(edit.end);
  }

  const reparsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const importStatements = reparsed.statements.filter(ts.isImportDeclaration);
  const insertionPoint =
    importStatements.length > 0
      ? importStatements[importStatements.length - 1].end
      : 0;

  const keepFlipImport =
    '\nimport { KeepFlipText as Text } from "@/components/ui/keepflip-text";';

  source =
    source.slice(0, insertionPoint) +
    keepFlipImport +
    source.slice(insertionPoint);

  write(filePath, source);
  return true;
}

function migrateDisplayedText() {
  const files = [
    ...collectTsxFiles(path.join(root, "app")),
    ...collectTsxFiles(path.join(root, "components")),
  ];

  let changed = 0;

  for (const filePath of files) {
    if (replaceNativeTextImport(filePath)) {
      changed += 1;
    }
  }

  console.log(
    `Migrated ${changed} non-analysis TSX file${changed === 1 ? "" : "s"} to KeepFlipText.`,
  );
}

patchRootLayout();
patchTheme();
writeWrapper();
migrateDisplayedText();

console.log("");
console.log("Space Grotesk migration complete.");
console.log("Analysis typography remains LucidaConsole.");
'@

[System.IO.File]::WriteAllText(
    $tempScript,
    $nodeScript,
    [System.Text.UTF8Encoding]::new($false)
)

$env:KEEPFLIP_FONT_BACKUP_ROOT = $backupRoot

try {
    node $tempScript
    if ($LASTEXITCODE -ne 0) {
        throw "The Space Grotesk migration script failed."
    }
}
finally {
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
    Remove-Item Env:KEEPFLIP_FONT_BACKUP_ROOT -ErrorAction SilentlyContinue
}

Remove-Item -Recurse -Force (Join-Path $projectRoot ".expo") -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Running TypeScript validation..." -ForegroundColor Cyan
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
    Write-Warning "The font migration was saved, but TypeScript still reports errors. Copy the new error list so only those remaining errors are corrected."
}
else {
    Write-Host "TypeScript validation passed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Backup created at:" -ForegroundColor DarkCyan
Write-Host $backupRoot
Write-Host ""
Write-Host "Restart Metro with: npx expo start --clear" -ForegroundColor Yellow
