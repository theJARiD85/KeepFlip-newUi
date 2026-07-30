import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
  useIsFocused,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ItemAnalysisBubbles } from "@/components/scanner/item-analysis-bubbles";
import {
  analysisDiagnosticId,
  analysisProgressState,
} from "@/components/scanner/item-analysis-progress";
import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import {
  type ItemAnalysisState,
} from "@/components/scanner/item-analysis-overlay";
import { toItemAnalysisState } from "@/components/scanner/item-analysis-view-model";
import { ScannerAtmosphere } from "@/components/scanner/scanner-atmosphere.native";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  analyzeItemPhotos,
  AppwriteSetupError,
  ItemAnalysisError,
} from "@/services/item-analysis-service";
import type {
  ItemAnalysisStage,
  ItemAnalysisSuccess,
  ItemIdentificationSnapshot,
} from "@/types/item-analysis";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

type CompletedAnalysis = {
  analysis: ItemAnalysisSuccess;
  state: ResultState;
};

const MODEL_RENDERING_STATE = {
  detail:
    "Assembling the generated 3D projection for the result screen.",
  insights: [],
  progress: 0.98,
  stage: "Model rendering",
  status: "analyzing",
  steps: [
    { label: "Verify your signed-in session", status: "complete" },
    { label: "Upload private photo evidence", status: "complete" },
    { label: "Identify and evaluate the item", status: "complete" },
    { label: "Remove temporary cloud copies", status: "complete" },
    { label: "Research completed marketplace sales", status: "complete" },
    { label: "Render the final 3D model", status: "active" },
  ],
} satisfies Extract<ItemAnalysisState, { status: "analyzing" }>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function ItemAnalysisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const sessionId = firstParam(params.sessionId);
  const {
    clearScannerAnalysis,
    promoteScannerAnalysisToResult,
    scannerAnalysis,
  } = useItemAnalysisResult();
  const session =
    sessionId && scannerAnalysis?.id === sessionId
      ? scannerAnalysis
      : null;
  const [appState, setAppState] = useState(AppState.currentState);
  const [state, setState] = useState<ItemAnalysisState>(() =>
    analysisProgressState("authenticating", {
      localDetection: session?.localDetection,
      modeLabel: session?.modeLabel ?? "Item scan",
      photoCount: session?.photoUris.length ?? 1,
    }),
  );
  const [completedAnalysis, setCompletedAnalysis] =
    useState<CompletedAnalysis | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);
  const startedSessionIdRef = useRef<string | null>(null);
  const finalizedRef = useRef(false);
  const resultNavigationStartedRef = useRef(false);
  const activeSessionId = session?.id;
  const activeSessionCancel = session?.onCancel;
  const isFinalizingResult = state.status === "result";
  const displayedState = isFinalizingResult
    ? MODEL_RENDERING_STATE
    : state;
  const isAnalysisAnimationActive =
    state.status === "analyzing" || isFinalizingResult;
  const analysisAnimationProgress =
    state.status === "analyzing" ? state.progress : 0.98;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const leaveAnalysis = useCallback(() => {
    finalizedRef.current = true;
    runSequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    session?.onCancel();
    clearScannerAnalysis(sessionId);
    router.back();
  }, [clearScannerAnalysis, router, session, sessionId]);

  const runAnalysis = useCallback(async () => {
    if (!session || controllerRef.current) return;

    const runId = ++runSequenceRef.current;
    const controller = new AbortController();
    let currentStage: ItemAnalysisStage = "authenticating";
    let partialResult: ItemIdentificationSnapshot | undefined;
    const cognitionContext = {
      localDetection: session.localDetection,
      modeLabel: session.modeLabel,
      photoCount: session.photoUris.length,
    };
    const progressState = (stage: ItemAnalysisStage) =>
      analysisProgressState(stage, {
        ...cognitionContext,
        partialResult,
      });

    controllerRef.current = controller;
    setState(progressState(currentStage));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );

    try {
      const result = await analyzeItemPhotos(
        { photoUris: session.photoUris },
        {
          onPartialResult: (event) => {
            if (
              controller.signal.aborted ||
              runId !== runSequenceRef.current
            ) {
              return;
            }
            partialResult = event.result;
            setState(progressState(currentStage));
            void Haptics.selectionAsync().catch(() => undefined);
          },
          onStage: (stage) => {
            if (
              controller.signal.aborted ||
              runId !== runSequenceRef.current
            ) {
              return;
            }
            currentStage = stage;
            setState(progressState(stage));
          },
          signal: controller.signal,
        },
      );

      if (
        controller.signal.aborted ||
        runId !== runSequenceRef.current
      ) {
        return;
      }

      const resultState = toItemAnalysisState(result);
      if (resultState.status !== "result") {
        setState(resultState);
        return;
      }

      setState(resultState);
      setCompletedAnalysis({
        analysis: result,
        state: resultState,
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        runId !== runSequenceRef.current
      ) {
        return;
      }

      if (error instanceof AppwriteSetupError) {
        setState({
          message: error.message,
          requirements: [
            "Add the public Appwrite endpoint and project ID to .env",
            "Create a private scan-photo bucket and add its ID.",
            "Deploy the analyze-item Function and add its Function ID.",
            ...error.missingKeys.map((key) => `Missing: ${key}`),
          ],
          status: "setup",
          title: "Connect secure item analysis",
        });
        return;
      }

      const diagnosticId = analysisDiagnosticId(error);
      setState({
        code:
          error instanceof ItemAnalysisError
            ? error.code
            : "ANALYSIS_FAILED",
        message:
          error instanceof Error
            ? `${error.message}${diagnosticId ? ` Diagnostic reference: ${diagnosticId}.` : ""}`
            : "KeepFlip could not complete this analysis. Please try again.",
        status: "error",
      });
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => undefined);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [session]);

  useEffect(() => {
    if (
      !session?.modelUrl ||
      state.status !== "result" ||
      !completedAnalysis ||
      resultNavigationStartedRef.current
    ) {
      return;
    }

    resultNavigationStartedRef.current = true;
    const resultSessionId = promoteScannerAnalysisToResult(
      session.id,
      completedAnalysis,
    );

    if (!resultSessionId) {
      resultNavigationStartedRef.current = false;
      requestAnimationFrame(() => {
        setState({
          code: "ANALYSIS_SESSION_ENDED",
          message:
            "The live analysis session ended before its result could open.",
          status: "error",
        });
      });
      return;
    }

    finalizedRef.current = true;
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
    router.replace({
      pathname: "/analysis-result",
      params: { sessionId: resultSessionId },
    });
  }, [
    completedAnalysis,
    promoteScannerAnalysisToResult,
    router,
    session?.id,
    session?.modelUrl,
    state.status,
  ]);

  useEffect(() => {
    if (
      !session ||
      startedSessionIdRef.current === session.id
    ) {
      return;
    }
    startedSessionIdRef.current = session.id;
    void runAnalysis();
  }, [runAnalysis, session]);

  useEffect(
    () => () => {
      runSequenceRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;

      if (
        !finalizedRef.current &&
        activeSessionId &&
        activeSessionCancel
      ) {
        activeSessionCancel();
        clearScannerAnalysis(activeSessionId);
      }
    },
    [
      activeSessionCancel,
      activeSessionId,
      clearScannerAnalysis,
    ],
  );

  if (!session) {
    return (
      <View style={styles.root}>
        <ScannerAtmosphere
          active={isFocused && appState === "active"}
          height={height}
          phase="analyzing"
          progress={0.18}
          sceneOffsetY={-60}
          width={width}
        />
        <ItemAnalysisBubbles
          bottomInset={insets.bottom}
          doneLabel="Back to scanner"
          onDone={() => router.back()}
          onRetry={() => router.back()}
          retryLabel="Back to scanner"
          state={{
            code: "ANALYSIS_SESSION_MISSING",
            message:
              "This live analysis session is no longer available.",
            status: "error",
          }}
          topInset={insets.top}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        source={{ uri: session.backdropUri }}
        style={StyleSheet.absoluteFill}
        transition={120}
      />
      <View pointerEvents="none" style={styles.photoScrim} />
      <ScannerAtmosphere
        active={
          isAnalysisAnimationActive &&
          isFocused &&
          appState === "active"
        }
        height={height}
        phase="analyzing"
        progress={analysisAnimationProgress}
        sceneOffsetY={-60}
        width={width}
      />
      <ItemAnalysisBubbles
        bottomInset={insets.bottom}
        doneLabel="Back to scanner"
        onDone={leaveAnalysis}
        onRetry={() => {
          if (state.status === "insufficient-evidence") {
            leaveAnalysis();
            return;
          }
          void runAnalysis();
        }}
        retryLabel={
          state.status === "insufficient-evidence"
            ? "Add another photo"
            : undefined
        }
        state={displayedState}
        topInset={insets.top}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundDeep,
  },
  photoScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(1, 2, 6, 0.64)",
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 42%, rgba(88, 223, 232, 0.08) 0%, transparent 38%),
      linear-gradient(to bottom, rgba(1, 1, 4, 0.74) 0%, rgba(3, 2, 9, 0.42) 46%, rgba(1, 1, 4, 0.82) 100%)
    `,
  },
});
