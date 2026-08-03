import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".backups", `cerebro-compile-fix-${stamp}`);

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function read(relativePath) {
  const filePath = absolute(relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing expected file: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function backup(relativePath) {
  if (!exists(relativePath)) return;
  const target = path.join(backupRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(absolute(relativePath), target);
}

function write(relativePath, content) {
  backup(relativePath);
  const filePath = absolute(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`updated ${relativePath}`);
}

function patchHologramImage() {
  const relativePath = "components/scanner/hologram-image.tsx";
  if (!exists(relativePath)) return;

  let source = read(relativePath);

  if (!source.includes("uniforms={{ time: shaderTime }}")) {
    console.log(`unchanged ${relativePath} (shader uniform already patched)`);
    return;
  }

  if (!source.includes("useDerivedValue")) {
    if (source.includes("  useSharedValue,")) {
      source = source.replace(
        "  useSharedValue,",
        "  useDerivedValue,\n  useSharedValue,",
      );
    } else {
      throw new Error(
        `Could not add useDerivedValue to ${relativePath}; inspect its Reanimated import.`,
      );
    }
  }

  const shaderTimeDeclaration = /(\s*const\s+shaderTime\s*=\s*useSharedValue\([^;]+;\r?\n)/;
  const declarationMatch = source.match(shaderTimeDeclaration);
  if (!declarationMatch) {
    throw new Error(`Could not find shaderTime declaration in ${relativePath}.`);
  }

  source = source.replace(
    shaderTimeDeclaration,
    `$1\n  const shaderUniforms = useDerivedValue(() => ({\n    time: shaderTime.value,\n  }));\n`,
  );
  source = source.replace(
    "uniforms={{ time: shaderTime }}",
    "uniforms={shaderUniforms}",
  );

  write(relativePath, source);
}

function moveCompiledBackupOutOfTypeScript() {
  const relativePath =
    "components/scanner/item-analysis-result-screen.native.backup.tsx";
  if (!exists(relativePath)) return;

  const sourcePath = absolute(relativePath);
  const destinationRelative =
    "components/scanner/item-analysis-result-screen.native.backup.txt";
  const destinationPath = absolute(destinationRelative);

  backup(relativePath);
  fs.renameSync(sourcePath, destinationPath);
  console.log(`renamed ${relativePath} -> ${destinationRelative}`);
}

function patchCerebroNaming() {
  const relativePath =
    "components/scanner/cerebro-analysis-field.native.tsx";
  if (!exists(relativePath)) {
    throw new Error(
      `Missing ${relativePath}. Copy the supplied corrected component first.`,
    );
  }

  let source = read(relativePath);
  source = source
    .replaceAll("CerebraAnalysisField", "CerebroAnalysisField")
    .replaceAll("CerebraAnalysisFieldProps", "CerebroAnalysisFieldProps");
  write(relativePath, source);

  const screenPath = "components/scanner/item-analysis-screen.native.tsx";
  if (!exists(screenPath)) return;
  let screen = read(screenPath);
  screen = screen
    .replaceAll("CerebraAnalysisField", "CerebroAnalysisField")
    .replaceAll(
      "@/components/scanner/cerebra-analysis-field.native",
      "@/components/scanner/cerebro-analysis-field.native",
    );
  write(screenPath, screen);
}

function patchAnalysisVisualTypes() {
  const relativePath = "components/scanner/item-analysis-overlay.tsx";
  if (!exists(relativePath)) return;

  let source = read(relativePath);

  if (!source.includes("AnalysisProfitPlan")) {
    const importAnchor =
      "import type { Thought } from '@/components/scanner/scanner-thought-stream';";
    const doubleQuoteAnchor =
      'import type { Thought } from "@/components/scanner/scanner-thought-stream";';
    const addedImport =
      'import type { AnalysisProfitPlan } from "@/components/scanner/analysis-visual-types";';

    if (source.includes(importAnchor)) {
      source = source.replace(importAnchor, `${importAnchor}\n${addedImport}`);
    } else if (source.includes(doubleQuoteAnchor)) {
      source = source.replace(
        doubleQuoteAnchor,
        `${doubleQuoteAnchor}\n${addedImport}`,
      );
    } else {
      throw new Error(
        `Could not find the type-import anchor in ${relativePath}.`,
      );
    }
  }

  source = source
    .replace(
      "source?: 'ebay' | 'multi_market' | 'supplied';",
      "source?: 'ebay' | 'multi_market' | 'serpapi_ai' | 'supplied';",
    )
    .replace(
      'source?: "ebay" | "multi_market" | "supplied";',
      'source?: "ebay" | "multi_market" | "serpapi_ai" | "supplied";',
    );

  const resultTypeStart = "export type ItemAnalysisResult = {";
  const resultStartIndex = source.indexOf(resultTypeStart);
  if (resultStartIndex < 0) {
    throw new Error(`Could not find ItemAnalysisResult in ${relativePath}.`);
  }
  const resultEndIndex = source.indexOf("\n};", resultStartIndex);
  const resultBlock = source.slice(resultStartIndex, resultEndIndex);
  if (!resultBlock.includes("profitPlan:")) {
    source = source.replace(
      `${resultTypeStart}\n`,
      `${resultTypeStart}\n  profitPlan: AnalysisProfitPlan;\n`,
    );
  }

  write(relativePath, source);
}

function patchResultScreenProjection() {
  const relativePath =
    "components/scanner/item-analysis-result-screen.native.tsx";
  if (!exists(relativePath)) return;

  let source = read(relativePath);

  source = source.replace(
    /import\s+ModelProjectionScanner\s+from\s+["']@\/components\/scanner\/model-projection-scanner\.native["'];?\r?\n/,
    'import { HudImageFrame } from "@/components/scanner/hud-image-frame.native";\n',
  );
  source = source.replaceAll("<ModelProjectionScanner", "<HudImageFrame");
  source = source.replaceAll("</ModelProjectionScanner>", "</HudImageFrame>");

  write(relativePath, source);
}

function patchInventorySaveInput() {
  const relativePath = "services/inventory-service.ts";
  if (!exists(relativePath)) return;

  let source = read(relativePath);
  const inputStart = source.indexOf("export type SaveAnalyzedItemInput = {");
  if (inputStart < 0) return;
  const inputEnd = source.indexOf("\n};", inputStart);
  if (inputEnd < 0) {
    throw new Error(`Malformed SaveAnalyzedItemInput in ${relativePath}.`);
  }

  const before = source.slice(0, inputStart);
  const block = source.slice(inputStart, inputEnd + 3);
  const after = source.slice(inputEnd + 3);
  const patchedBlock = block.replace(/^\s*coverPhotoId:\s*string;\r?\n/m, "");

  if (block !== patchedBlock) {
    source = before + patchedBlock + after;
    write(relativePath, source);
  } else {
    console.log(
      `unchanged ${relativePath} (SaveAnalyzedItemInput already derives its cover photo from scanId)`,
    );
  }
}

patchHologramImage();
moveCompiledBackupOutOfTypeScript();
patchCerebroNaming();
patchAnalysisVisualTypes();
patchResultScreenProjection();
patchInventorySaveInput();

console.log("");
console.log("Cerebro compile fixes applied.");
console.log(`Backups: ${path.relative(root, backupRoot)}`);
console.log("Run: npx tsc --noEmit");
