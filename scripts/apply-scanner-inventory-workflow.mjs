import fs from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = fs.readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source was not found in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected source appeared more than once in ${path}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

const bubblesPath = 'components/scanner/item-analysis-bubbles.tsx';
const scannerPath = 'components/scanner/scanner-screen.native.tsx';
const inventoryPath = 'app/(app)/inventory.tsx';
const inventoryServicePath = 'services/inventory-service.ts';

replaceOnce(
  bubblesPath,
  `type ItemAnalysisBubblesProps = {\n  bottomInset: number;\n  doneLabel?: string;\n  onDone: () => void;\n  onRetry: () => void;\n  retryLabel?: string;\n  state: ItemAnalysisState;\n  topInset: number;\n};`,
  `type ItemAnalysisBubblesProps = {\n  bottomInset: number;\n  doneLabel?: string;\n  onDone: () => void;\n  onRetry: () => void;\n  onSave?: () => void;\n  retryLabel?: string;\n  saveLabel?: string;\n  saving?: boolean;\n  state: ItemAnalysisState;\n  topInset: number;\n};`,
  'extend result action props',
);

replaceOnce(
  bubblesPath,
  `function BubbleButton({\n  accent,\n  label,\n  onPress,\n  secondary = false,\n}: {\n  accent: string;\n  label: string;\n  onPress: () => void;\n  secondary?: boolean;\n}) {\n  return (\n    <Pressable\n      accessibilityRole="button"\n      onPress={onPress}\n      style={({ pressed }) => [\n        styles.actionButton,\n        {\n          borderColor: withAlpha(accent, 0.58),\n          backgroundColor: secondary ? 'rgba(5, 5, 8, 0.82)' : withAlpha(accent, 0.9),\n          boxShadow: \`0 8px 22px rgba(0, 0, 0, 0.38), 0 0 16px \${withAlpha(accent, 0.18)}\`,\n        },\n        pressed && styles.pressed,\n      ]}>\n      <Text style={[styles.actionButtonText, { color: secondary ? accent : theme.colors.backgroundDeep }]}>\n        {label}\n      </Text>\n    </Pressable>\n  );\n}`,
  `function BubbleButton({\n  accent,\n  disabled = false,\n  label,\n  onPress,\n  secondary = false,\n}: {\n  accent: string;\n  disabled?: boolean;\n  label: string;\n  onPress: () => void;\n  secondary?: boolean;\n}) {\n  return (\n    <Pressable\n      accessibilityRole="button"\n      accessibilityState={{ disabled }}\n      disabled={disabled}\n      onPress={onPress}\n      style={({ pressed }) => [\n        styles.actionButton,\n        {\n          borderColor: withAlpha(accent, 0.58),\n          backgroundColor: secondary ? 'rgba(5, 5, 8, 0.82)' : withAlpha(accent, 0.9),\n          boxShadow: \`0 8px 22px rgba(0, 0, 0, 0.38), 0 0 16px \${withAlpha(accent, 0.18)}\`,\n        },\n        pressed && !disabled && styles.pressed,\n        disabled && styles.disabled,\n      ]}>\n      <Text style={[styles.actionButtonText, { color: secondary ? accent : theme.colors.backgroundDeep }]}>\n        {label}\n      </Text>\n    </Pressable>\n  );\n}`,
  'make bubble buttons disableable',
);

replaceOnce(
  bubblesPath,
  `export function ItemAnalysisBubbles({\n  bottomInset,\n  doneLabel = 'Done',\n  onDone,\n  onRetry,\n  retryLabel,\n  state,\n  topInset,\n}: ItemAnalysisBubblesProps) {`,
  `export function ItemAnalysisBubbles({\n  bottomInset,\n  doneLabel = 'Done',\n  onDone,\n  onRetry,\n  onSave,\n  retryLabel,\n  saveLabel = 'Save to inventory',\n  saving = false,\n  state,\n  topInset,\n}: ItemAnalysisBubblesProps) {`,
  'destructure save action props',
);

replaceOnce(
  bubblesPath,
  `          <Pressable\n            accessibilityLabel="Close item analysis"\n            accessibilityRole="button"\n            onPress={onDone}\n            style={({ pressed }) => [styles.closeBubble, pressed && styles.pressed]}>`,
  `          <Pressable\n            accessibilityLabel="Close item analysis"\n            accessibilityRole="button"\n            accessibilityState={{ disabled: saving }}\n            disabled={saving}\n            onPress={onDone}\n            style={({ pressed }) => [\n              styles.closeBubble,\n              pressed && !saving && styles.pressed,\n              saving && styles.disabled,\n            ]}>`,
  'disable close while saving',
);

replaceOnce(
  bubblesPath,
  `            <View style={styles.actions}>\n              {!isResult ? (\n                <BubbleButton accent={accent} label={resolvedRetryLabel} onPress={onRetry} />\n              ) : null}\n              <BubbleButton\n                accent={isResult ? theme.colors.goldBright : accent}\n                label={doneLabel}\n                onPress={onDone}\n                secondary={!isResult}\n              />\n            </View>`,
  `            <View style={styles.actions}>\n              {!isResult ? (\n                <BubbleButton accent={accent} label={resolvedRetryLabel} onPress={onRetry} />\n              ) : null}\n              {isResult && onSave ? (\n                <BubbleButton\n                  accent={theme.colors.goldBright}\n                  disabled={saving}\n                  label={saving ? 'Saving…' : saveLabel}\n                  onPress={onSave}\n                />\n              ) : null}\n              <BubbleButton\n                accent={isResult ? theme.colors.goldBright : accent}\n                disabled={saving}\n                label={doneLabel}\n                onPress={onDone}\n                secondary={!isResult || Boolean(onSave)}\n              />\n            </View>`,
  'render save and new scan actions',
);

replaceOnce(
  bubblesPath,
  `  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },`,
  `  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },\n  disabled: { opacity: 0.52 },`,
  'add disabled style',
);

replaceOnce(
  scannerPath,
  `import * as ImagePicker from 'expo-image-picker';\nimport { useCallback, useEffect, useRef, useState } from 'react';`,
  `import * as ImagePicker from 'expo-image-picker';\nimport { useRouter } from 'expo-router';\nimport { useCallback, useEffect, useRef, useState } from 'react';`,
  'import router',
);

replaceOnce(
  scannerPath,
  `  ActivityIndicator,\n  AppState,`,
  `  ActivityIndicator,\n  Alert,\n  AppState,`,
  'import alert',
);

replaceOnce(
  scannerPath,
  `import { ItemAnalysisBubbles } from '@/components/scanner/item-analysis-bubbles';\nimport { toItemAnalysisState } from '@/components/scanner/item-analysis-view-model';`,
  `import { ItemAnalysisBubbles } from '@/components/scanner/item-analysis-bubbles';\nimport { toItemAnalysisState } from '@/components/scanner/item-analysis-view-model';\nimport { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';`,
  'import auth context',
);

replaceOnce(
  scannerPath,
  `  MAX_ANALYSIS_PHOTOS,\n  type ItemAnalysisStage,\n} from '@/services/item-analysis-service';`,
  `  MAX_ANALYSIS_PHOTOS,\n  type ItemAnalysisStage,\n  type ItemAnalysisSuccess,\n} from '@/services/item-analysis-service';\nimport { saveAnalyzedItemToInventory } from '@/services/inventory-service';`,
  'import inventory service',
);

replaceOnce(
  scannerPath,
  `export default function ScannerScreen() {\n  const {`,
  `export default function ScannerScreen() {\n  const router = useRouter();\n  const { user } = useKeepFlipAuth();\n  const {`,
  'initialize router and auth',
);

replaceOnce(
  scannerPath,
  `  const [analysisState, setAnalysisState] = useState<ItemAnalysisState | null>(null);\n  const [analysisBackdropUri, setAnalysisBackdropUri] = useState<string | null>(null);`,
  `  const [analysisState, setAnalysisState] = useState<ItemAnalysisState | null>(null);\n  const [analysisBackdropUri, setAnalysisBackdropUri] = useState<string | null>(null);\n  const [completedAnalysis, setCompletedAnalysis] = useState<ItemAnalysisSuccess | null>(null);\n  const [completedPhotoUris, setCompletedPhotoUris] = useState<string[]>([]);\n  const [isSavingToInventory, setIsSavingToInventory] = useState(false);`,
  'add completed analysis state',
);

replaceOnce(
  scannerPath,
  `  const closeAnalysis = () => {\n    analysisAbortControllerRef.current?.abort();\n    analysisAbortControllerRef.current = null;\n    setAnalysisState(null);\n    setAnalysisBackdropUri(null);\n  };\n\n  async function runAnalysis(photoUris: string[]) {`,
  `  const resetScannerSession = useCallback(() => {\n    analysisAbortControllerRef.current?.abort();\n    analysisAbortControllerRef.current = null;\n    clearAtmosphereTimer();\n    captureLockRef.current = false;\n    multiScanSequenceRef.current = 0;\n    uploadSequenceRef.current = 0;\n    setSinglePhotoUri(null);\n    setMultiScanPhotos([]);\n    setBatchScanPhotos([]);\n    setUploadedPhotos([]);\n    setIsMultiReviewOpen(false);\n    setIsUploadReviewOpen(false);\n    setAnalysisState(null);\n    setAnalysisBackdropUri(null);\n    setCompletedAnalysis(null);\n    setCompletedPhotoUris([]);\n    setSelectedTool('single');\n    setMessage('Center one item inside the frame');\n    setCaptureFeedback(null);\n    setAtmospherePhase('idle');\n    setTorchEnabled(false);\n  }, [clearAtmosphereTimer]);\n\n  const closeAnalysis = () => {\n    if (analysisState?.status === 'result') {\n      resetScannerSession();\n      return;\n    }\n\n    analysisAbortControllerRef.current?.abort();\n    analysisAbortControllerRef.current = null;\n    setAnalysisState(null);\n    setAnalysisBackdropUri(null);\n    setCompletedAnalysis(null);\n    setCompletedPhotoUris([]);\n  };\n\n  const saveCompletedAnalysis = useCallback(async () => {\n    if (!completedAnalysis || isSavingToInventory) return;\n    if (!user?.$id) {\n      Alert.alert('Sign in required', 'Sign in before saving an item to inventory.');\n      return;\n    }\n\n    setIsSavingToInventory(true);\n    try {\n      const saved = await saveAnalyzedItemToInventory({\n        analysis: completedAnalysis,\n        ownerId: user.$id,\n        photoUris: completedPhotoUris,\n      });\n      resetScannerSession();\n      router.push('/inventory');\n      if (saved.photoWarning) {\n        Alert.alert('Item saved', saved.photoWarning);\n      }\n    } catch (error) {\n      Alert.alert(\n        'Could not save item',\n        error instanceof Error ? error.message : 'KeepFlip could not save this item.',\n      );\n    } finally {\n      setIsSavingToInventory(false);\n    }\n  }, [\n    completedAnalysis,\n    completedPhotoUris,\n    isSavingToInventory,\n    resetScannerSession,\n    router,\n    user?.$id,\n  ]);\n\n  async function runAnalysis(photoUris: string[]) {`,
  'add session reset and save flow',
);

replaceOnce(
  scannerPath,
  `    const controller = new AbortController();\n    analysisAbortControllerRef.current = controller;`,
  `    setCompletedAnalysis(null);\n    setCompletedPhotoUris([]);\n    const controller = new AbortController();\n    analysisAbortControllerRef.current = controller;`,
  'clear prior completed analysis',
);

replaceOnce(
  scannerPath,
  `      if (controller.signal.aborted) return;\n      setAnalysisState(toItemAnalysisState(result));`,
  `      if (controller.signal.aborted) return;\n      setCompletedAnalysis(result);\n      setCompletedPhotoUris([...photoUris]);\n      setAnalysisState(toItemAnalysisState(result));`,
  'retain completed analysis for inventory save',
);

replaceOnce(
  scannerPath,
  `    <ItemAnalysisBubbles\n      bottomInset={insets.bottom}\n      doneLabel="Done"\n      onDone={closeAnalysis}\n      onRetry={() => {`,
  `    <ItemAnalysisBubbles\n      bottomInset={insets.bottom}\n      doneLabel={analysisState.status === 'result' ? 'Start new scan' : 'Done'}\n      onDone={closeAnalysis}\n      onSave={analysisState.status === 'result' ? () => void saveCompletedAnalysis() : undefined}\n      onRetry={() => {`,
  'connect result save action',
);

replaceOnce(
  scannerPath,
  `      retryLabel={\n        analysisState.status === 'insufficient-evidence' ? 'Add another photo' : undefined\n      }\n      state={analysisState}`,
  `      retryLabel={\n        analysisState.status === 'insufficient-evidence' ? 'Add another photo' : undefined\n      }\n      saveLabel="Save to inventory"\n      saving={isSavingToInventory}\n      state={analysisState}`,
  'pass save state to result overlay',
);

replaceOnce(
  inventoryPath,
  `name="cube.fill"`,
  `name="shippingbox.fill"`,
  'use mapped inventory icon',
);

replaceOnce(
  inventoryPath,
  `name="photo.fill"`,
  `name="photo.on.rectangle.angled"`,
  'use mapped photo icon',
);

replaceOnce(
  inventoryServicePath,
  `  return [\n    'new',\n    'like_new',\n    'excellent',\n    'good',\n    'fair',\n    'poor',\n    'unknown',\n  ].includes(normalized)\n    ? normalized\n    : 'unknown';`,
  `  if (normalized === 'excellent') return 'like_new';\n\n  return ['new', 'like_new', 'good', 'fair', 'poor', 'unknown'].includes(normalized)\n    ? normalized\n    : 'unknown';`,
  'map excellent into the existing item condition enum',
);

console.log('Scanner inventory workflow migration applied successfully.');
