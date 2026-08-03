import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ItemAnalysisState } from "@/components/scanner/analysis-visual-types";
import type { ItemAnalysisSuccess } from "@/types/item-analysis";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

export type ScannerAnalysisSession = {
  backdropUri: string;
  modelUrl: string | null;
  ensurePhotosSaved?: () => Promise<void>;
  id: string;
  localDetection?: {
    label: string;
    score: number;
  };
  modeLabel: string;
  onCancel: () => void;
  onReset: () => void;
  photoUris: string[];
  scanId: string;
};

export type ScannerAnalysisResultSession = {
  analysis: ItemAnalysisSuccess;
  backdropUri: string;
  modelUrl: string | null;
  ensurePhotosSaved?: () => Promise<void>;
  id: string;
  onReset: () => void;
  scanId: string;
  state: ResultState;
};

type OpenScannerAnalysisInput = Omit<ScannerAnalysisSession, "id">;

export type ItemAnalysisResultContextValue = {
  clearScannerAnalysis: (sessionId?: string) => void;
  clearScannerResult: (sessionId?: string) => void;
  openScannerAnalysis: (input: OpenScannerAnalysisInput) => string;
  promoteScannerAnalysisToResult: (
    sessionId: string,
    input: {
      analysis: ItemAnalysisSuccess;
      state: ResultState;
    },
  ) => string | null;
  scannerAnalysis: ScannerAnalysisSession | null;
  scannerResult: ScannerAnalysisResultSession | null;
  updateScannerResult: (
    sessionId: string,
    input: {
      analysis: ItemAnalysisSuccess;
      state: ResultState;
    },
  ) => void;
};

const ItemAnalysisResultContext =
  createContext<ItemAnalysisResultContextValue | null>(null);

let analysisSessionSequence = 0;

function createAnalysisSessionId(kind: "job" | "result") {
  analysisSessionSequence += 1;
  return `${kind}-${Date.now()}-${analysisSessionSequence}`;
}

export function ItemAnalysisResultProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [scannerAnalysis, setScannerAnalysis] =
    useState<ScannerAnalysisSession | null>(null);
  const scannerAnalysisRef =
    useRef<ScannerAnalysisSession | null>(null);
  const [scannerResult, setScannerResult] =
    useState<ScannerAnalysisResultSession | null>(null);

  const openScannerAnalysis = useCallback(
    (input: OpenScannerAnalysisInput) => {
      const id = createAnalysisSessionId("job");
      setScannerResult(null);
      const session = {
        ...input,
        id,
      };
      scannerAnalysisRef.current = session;
      setScannerAnalysis(session);
      return id;
    },
    [],
  );

  const promoteScannerAnalysisToResult = useCallback(
    (
      sessionId: string,
      input: {
        analysis: ItemAnalysisSuccess;
        state: ResultState;
      },
    ) => {
      const analysisSession = scannerAnalysisRef.current;
      if (analysisSession?.id !== sessionId) return null;

      const id = createAnalysisSessionId("result");
      setScannerResult({
        analysis: input.analysis,
        backdropUri: analysisSession.backdropUri,
        modelUrl: analysisSession.modelUrl,
        ensurePhotosSaved: analysisSession.ensurePhotosSaved,
        id,
        onReset: analysisSession.onReset,
        scanId: analysisSession.scanId,
        state: input.state,
      });
      scannerAnalysisRef.current = null;
      setScannerAnalysis(null);
      return id;
    },
    [],
  );

  const updateScannerResult = useCallback(
    (
      sessionId: string,
      input: {
        analysis: ItemAnalysisSuccess;
        state: ResultState;
      },
    ) => {
      setScannerResult((current) =>
        current?.id === sessionId
          ? {
            ...current,
            analysis: input.analysis,
            state: input.state,
          }
          : current,
      );
    },
    [],
  );

  const clearScannerAnalysis = useCallback((sessionId?: string) => {
    const current = scannerAnalysisRef.current;
    if (sessionId && current?.id !== sessionId) return;
    scannerAnalysisRef.current = null;
    setScannerAnalysis(null);
  }, []);

  const clearScannerResult = useCallback((sessionId?: string) => {
    setScannerResult((current) => {
      if (!sessionId || current?.id === sessionId) return null;
      return current;
    });
  }, []);

  const value = useMemo(
    () => ({
      clearScannerAnalysis,
      clearScannerResult,
      openScannerAnalysis,
      promoteScannerAnalysisToResult,
      scannerAnalysis,
      scannerResult,
      updateScannerResult,
    }),
    [
      clearScannerAnalysis,
      clearScannerResult,
      openScannerAnalysis,
      promoteScannerAnalysisToResult,
      scannerAnalysis,
      scannerResult,
      updateScannerResult,
    ],
  );

  return (
    <ItemAnalysisResultContext.Provider value={value}>
      {children}
    </ItemAnalysisResultContext.Provider>
  );
}

export function useItemAnalysisResult(): ItemAnalysisResultContextValue {
  const value = useContext(ItemAnalysisResultContext);
  if (!value) {
    throw new Error(
      "useItemAnalysisResult must be used inside ItemAnalysisResultProvider.",
    );
  }
  return value;
}
