import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Could not find ${label}.`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Found more than one ${label}.`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

function replaceRegexOnce(content, pattern, replacement, label) {
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label}; found ${matches.length}.`);
  }
  return content.replace(pattern, replacement);
}

const appwritePath = "lib/appwrite.ts";
let appwrite = read(appwritePath);
appwrite = replaceOnce(
  appwrite,
  `  itemPhotosTableId: publicEnvironmentValue(\n    process.env.EXPO_PUBLIC_APPWRITE_ITEM_PHOTOS_COLLECTION_ID,\n  ),\n  marketplaceListingsTableId:`,
  `  itemPhotosTableId: publicEnvironmentValue(\n    process.env.EXPO_PUBLIC_APPWRITE_ITEM_PHOTOS_COLLECTION_ID,\n  ),\n  modelFilesTableId: publicEnvironmentValue(\n    process.env.EXPO_PUBLIC_APPWRITE_MODEL_FILES_COLLECTION_ID,\n  ),\n  marketplaceListingsTableId:`,
  "item photo table configuration",
);
appwrite = replaceOnce(
  appwrite,
  `  itemImagesBucketId: publicEnvironmentValue(\n    process.env.EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID,\n  ),\n  profileImagesBucketId:`,
  `  itemImagesBucketId: publicEnvironmentValue(\n    process.env.EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID,\n  ),\n  modelFilesBucketId: publicEnvironmentValue(\n    process.env.EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID,\n  ),\n  profileImagesBucketId:`,
  "item image bucket configuration",
);
write(appwritePath, appwrite);

const scannerPath = "components/scanner/scanner-screen.native.tsx";
let scanner = read(scannerPath);
scanner = replaceOnce(
  scanner,
  `import {\n  createTripo3dModelFromImage,\n  type Tripo3dModelResult,\n} from "@/services/tripo3d-model-api";`,
  `import {\n  createScanId,\n  saveScannerPhoto,\n  type SavedScanPhoto,\n} from "@/services/scan-photo-service";\nimport {\n  waitForTripo3dModel,\n  type Tripo3dModelResult,\n} from "@/services/tripo3d-model-api";`,
  "Tripo service import",
);
scanner = replaceOnce(
  scanner,
  `  const modelGenerationRequestRef = useRef(0);\n  const modelSourceUriRef = useRef<string | null>(null);`,
  `  const modelGenerationRequestRef = useRef(0);\n  const scanIdRef = useRef(createScanId());\n  const modelSourcePhotoIdRef = useRef<string | null>(null);`,
  "model generation refs",
);
scanner = scanner.replaceAll("modelSourceUriRef", "modelSourcePhotoIdRef");
scanner = replaceOnce(
  scanner,
  `  const [completedPhotoUris, setCompletedPhotoUris] = useState<string[]>([]);`,
  `  const [completedScanId, setCompletedScanId] = useState<string | null>(null);`,
  "completed photo state",
);

scanner = replaceRegexOnce(
  scanner,
  /  const startModelGeneration = useCallback\([\s\S]*?\n  \);\n\n  const handleModelViewerError/,
  `  const startModelGeneration = useCallback(\n    async (itemPhotoId: string) => {\n      const normalizedItemPhotoId = itemPhotoId.trim();\n      if (!normalizedItemPhotoId) return;\n\n      if (!user?.$id) {\n        setModelGenerationError(\n          "Sign in before generating a 3D model for this scan.",\n        );\n        return;\n      }\n\n      if (\n        modelSourcePhotoIdRef.current === normalizedItemPhotoId &&\n        modelGenerationStateRef.current !== "idle"\n      ) {\n        return;\n      }\n\n      const requestId = ++modelGenerationRequestRef.current;\n      modelSourcePhotoIdRef.current = normalizedItemPhotoId;\n      modelGenerationStateRef.current = "loading";\n      setGeneratedModel(null);\n      setModelGenerationError(null);\n      setIsGeneratingModel(true);\n\n      try {\n        const result = await waitForTripo3dModel({\n          itemPhotoId: normalizedItemPhotoId,\n        });\n\n        if (requestId !== modelGenerationRequestRef.current) return;\n        modelGenerationStateRef.current = "ready";\n        setGeneratedModel(result);\n        void Haptics.notificationAsync(\n          Haptics.NotificationFeedbackType.Success,\n        ).catch(() => undefined);\n      } catch (error) {\n        if (requestId !== modelGenerationRequestRef.current) return;\n\n        const errorMessage =\n          error instanceof Error\n            ? error.message\n            : "KeepFlip could not generate the 3D model.";\n        modelGenerationStateRef.current = "idle";\n        setModelGenerationError(errorMessage);\n\n        if (__DEV__) {\n          console.error("[KeepFlip Tripo3D] Model generation failed.", error);\n        }\n      } finally {\n        if (requestId === modelGenerationRequestRef.current) {\n          setIsGeneratingModel(false);\n        }\n      }\n    },\n    [user?.$id],\n  );\n\n  const handleModelViewerError`,
  "startModelGeneration callback",
);

const persistPickedPhotos = `\n  const persistPickedPhotos = useCallback(\n    async (assets: readonly ImagePicker.ImagePickerAsset[]) => {\n      if (!user?.$id) {\n        throw new Error("Sign in before saving scanner photos.");\n      }\n\n      const knownUris = new Set(uploadedPhotos.map((photo) => photo.path));\n      const remainingSlots = MAX_ANALYSIS_PHOTOS - uploadedPhotos.length;\n      const selectedAssets = assets\n        .filter((asset) => {\n          const uri = asset.uri?.trim();\n          if (!uri || knownUris.has(uri)) return false;\n          knownUris.add(uri);\n          return true;\n        })\n        .slice(0, remainingSlots);\n\n      if (selectedAssets.length === 0) return;\n\n      const firstSortOrder = uploadedPhotos.length;\n      const savedPhotos: SavedScanPhoto[] = [];\n      for (const [index, asset] of selectedAssets.entries()) {\n        const saved = await saveScannerPhoto({\n          imageUri: asset.uri,\n          ownerId: user.$id,\n          scanId: scanIdRef.current,\n          sortOrder: firstSortOrder + index,\n          isPrimary: firstSortOrder + index === 0,\n        });\n        savedPhotos.push(saved);\n      }\n\n      acceptPickedPhotos(selectedAssets);\n      if (firstSortOrder === 0 && savedPhotos[0]) {\n        void startModelGeneration(savedPhotos[0].itemPhotoId);\n      }\n    },\n    [\n      acceptPickedPhotos,\n      startModelGeneration,\n      uploadedPhotos,\n      user?.$id,\n    ],\n  );\n`;
scanner = replaceOnce(
  scanner,
  `\n  useEffect(() => {\n    if (Platform.OS !== "android") return;\n\n    let isMounted = true;`,
  `${persistPickedPhotos}\n  useEffect(() => {\n    if (Platform.OS !== "android") return;\n\n    let isMounted = true;`,
  "pending picker effect",
);
scanner = replaceOnce(
  scanner,
  `          acceptPickedPhotos(pendingResult.assets);`,
  `          await persistPickedPhotos(pendingResult.assets);`,
  "restored picker handling",
);
scanner = replaceOnce(
  scanner,
  `  }, [acceptPickedPhotos]);`,
  `  }, [persistPickedPhotos]);`,
  "restored picker dependency",
);
scanner = replaceOnce(
  scanner,
  `      acceptPickedPhotos(result.assets);\n      const firstUri = result.assets[0]?.uri?.trim();\n      if (firstUri) {\n        void startModelGeneration(firstUri);\n      }`,
  `      await persistPickedPhotos(result.assets);`,
  "library photo persistence",
);
scanner = replaceOnce(
  scanner,
  `  }, [\n    acceptPickedPhotos,\n    clearAtmosphereTimer,\n    isPickingPhoto,\n    startModelGeneration,\n    uploadedPhotos.length,\n  ]);`,
  `  }, [\n    clearAtmosphereTimer,\n    isPickingPhoto,\n    persistPickedPhotos,\n    uploadedPhotos.length,\n  ]);`,
  "library photo callback dependencies",
);

scanner = replaceRegexOnce(
  scanner,
  /  const capturePhoto = useCallback\([\s\S]*?\n  \]\);\n\n  const openMultiReview/,
  `  const capturePhoto = useCallback(\n    async ({\n      scanId,\n      sortOrder,\n      isPrimary,\n    }: {\n      scanId: string;\n      sortOrder: number;\n      isPrimary: boolean;\n    }): Promise<{ path: string; saved: SavedScanPhoto } | null> => {\n      if (!isCameraActive || !isCameraReady) {\n        const feedback = "Camera is getting ready. Try again in a moment.";\n        setMessage(feedback);\n        setCaptureFeedback(feedback);\n        return null;\n      }\n\n      if (!user?.$id) {\n        const feedback = "Sign in before capturing an item.";\n        setMessage(feedback);\n        setCaptureFeedback(feedback);\n        return null;\n      }\n\n      if (captureLockRef.current) return null;\n      captureLockRef.current = true;\n      clearAtmosphereTimer();\n      setIsCapturing(true);\n      setAtmospherePhase("scanning");\n      setMessage("Capturing item...");\n      setCaptureFeedback("Capturing item...");\n\n      try {\n        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(\n          () => undefined,\n        );\n        const photo = await photoOutput.capturePhotoToFile(\n          { flashMode: "off" },\n          {},\n        );\n        if (!photo.filePath) {\n          throw new Error("VisionCamera returned an empty photo file path.");\n        }\n\n        setMessage("Saving scanner image...");\n        const saved = await saveScannerPhoto({\n          imageUri: photo.filePath,\n          ownerId: user.$id,\n          scanId,\n          sortOrder,\n          isPrimary,\n        });\n\n        setAtmospherePhase("captured");\n        setCaptureFeedback(null);\n        scheduleAtmosphereReset();\n        return { path: photo.filePath, saved };\n      } catch (error) {\n        const feedback =\n          error instanceof Error\n            ? error.message\n            : "Could not capture and save this item.";\n        setAtmospherePhase("idle");\n        setMessage(feedback);\n        setCaptureFeedback(feedback);\n        return null;\n      } finally {\n        captureLockRef.current = false;\n        setIsCapturing(false);\n      }\n    },\n    [\n      clearAtmosphereTimer,\n      isCameraActive,\n      isCameraReady,\n      photoOutput,\n      scheduleAtmosphereReset,\n      user?.$id,\n    ],\n  );\n\n  const openMultiReview`,
  "capturePhoto callback",
);

scanner = replaceRegexOnce(
  scanner,
  /  const handleToolActivate = async \(tool: ScannerToolId\) => \{[\s\S]*?\n  \};\n\n  const resetScannerSession/,
  `  const handleToolActivate = async (tool: ScannerToolId) => {\n    if (tool === "upload") {\n      await handleUploadPhoto();\n      return;\n    }\n\n    const scanId = tool === "batch" ? createScanId() : scanIdRef.current;\n    const sortOrder = tool === "multi" ? multiScanPhotos.length : 0;\n    const isPrimary = tool !== "multi" || multiScanPhotos.length === 0;\n    const captured = await capturePhoto({ scanId, sortOrder, isPrimary });\n    if (!captured) return;\n\n    const photoPath = captured.path;\n    if (tool === "single") {\n      setSinglePhotoUri(photoPath);\n      setMessage("Photo saved. Building 3D model and starting analysis...");\n      void startModelGeneration(captured.saved.itemPhotoId);\n      await runAnalysis([photoPath]);\n      return;\n    }\n\n    if (tool === "multi") {\n      if (captured.saved.isPrimary) {\n        void startModelGeneration(captured.saved.itemPhotoId);\n      }\n\n      setMultiScanPhotos((photos) => {\n        multiScanSequenceRef.current += 1;\n        const photo: MultiScanPhoto = {\n          createdAt: Date.now(),\n          id: captured.saved.itemPhotoId,\n          path: photoPath,\n          uri: toDisplayUri(photoPath),\n        };\n        const nextPhotos = [...photos, photo];\n        setMessage(\n          \`${"${nextPhotos.length}"} view${"${nextPhotos.length === 1 ? \"\" : \"s\"}"} saved. Keep scanning or tap the photo stack to analyze.\`,\n        );\n        return nextPhotos;\n      });\n      return;\n    }\n\n    setBatchScanPhotos((photos) => {\n      const nextPhotos = [...photos, photoPath];\n      setMessage(\n        \`Batch-scan - ${"${nextPhotos.length}"} item${"${nextPhotos.length === 1 ? \"\" : \"s\"}"} saved\`,\n      );\n      return nextPhotos;\n    });\n  };\n\n  const resetScannerSession`,
  "handleToolActivate function",
);

scanner = replaceOnce(
  scanner,
  `    multiScanSequenceRef.current = 0;\n    uploadSequenceRef.current = 0;\n    modelGenerationRequestRef.current += 1;`,
  `    multiScanSequenceRef.current = 0;\n    uploadSequenceRef.current = 0;\n    scanIdRef.current = createScanId();\n    modelGenerationRequestRef.current += 1;`,
  "scanner reset counters",
);
scanner = scanner.replaceAll("setCompletedPhotoUris([]);", "setCompletedScanId(null);");
scanner = replaceOnce(
  scanner,
  `      setCompletedPhotoUris([...photoUris]);`,
  `      setCompletedScanId(scanIdRef.current);`,
  "completed scan assignment",
);
scanner = replaceOnce(
  scanner,
  `    void startModelGeneration(photoUris[0]);\n\n    setCompletedAnalysis(null);`,
  `    setCompletedAnalysis(null);`,
  "duplicate model start in runAnalysis",
);
scanner = replaceRegexOnce(
  scanner,
  /  const handleAnalyzeItem = \(\) => \{[\s\S]*?\n  \};\n\n  const analysisButton/,
  `  const handleAnalyzeItem = () => runAnalysis(analysisPhotoUris);\n\n  const analysisButton`,
  "handleAnalyzeItem function",
);
scanner = replaceOnce(
  scanner,
  `    if (!completedAnalysis || isSavingToInventory) return;`,
  `    if (!completedAnalysis || !completedScanId || isSavingToInventory) return;`,
  "save inventory guard",
);
scanner = replaceOnce(
  scanner,
  `        photoUris: completedPhotoUris,`,
  `        scanId: completedScanId,`,
  "inventory save input",
);
scanner = replaceOnce(
  scanner,
  `    completedPhotoUris,`,
  `    completedScanId,`,
  "inventory save dependency",
);

if (scanner.includes("createTripo3dModelFromImage")) {
  throw new Error("Old Tripo upload call remains in scanner-screen.native.tsx.");
}
if (scanner.includes("completedPhotoUris")) {
  throw new Error("Old completedPhotoUris state remains in scanner-screen.native.tsx.");
}
write(scannerPath, scanner);

fs.rmSync("scripts/apply-scanner-model-refactor.mjs", { force: true });
fs.rmSync(".github/workflows/apply-scanner-model-refactor.yml", { force: true });
