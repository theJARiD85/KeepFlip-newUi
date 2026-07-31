import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ItemAnalysisState } from "@/components/scanner/item-analysis-overlay";
import type { ItemAnalysisSuccess } from "@/types/item-analysis";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

export type ScannerAnalysisSession = {
  backdropUri: string;
  ensurePhotosSaved?: () => Promise<void>;
  id: string;
  localDetection?: {
    label: string;
    score: number;
  };
  modeLabel: string;
  modelUrl: string | null;
  onCancel: () => void;
  onReset: () => void;
  photoUris: string[];
  scanId: string;
};

export type ScannerAnalysisResultSession = {
  analysis: ItemAnalysisSuccess;
  backdropUri: string;
  ensurePhotosSaved?: () => Promise<void>;
  id: string;
  modelUrl: string | null;
  onReset: () => void;
  scanId: string;
  state: ResultState;
};

type OpenScannerAnalysisInput = Omit<
  ScannerAnalysisSession,
  "id" | "modelUrl"
> & {
  modelUrl?: string | null;
};

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
  updateScannerModel: (scanId: string, modelUrl: string) => void;
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
        modelUrl: input.modelUrl ?? null,
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
        ensurePhotosSaved: analysisSession.ensurePhotosSaved,
        id,
        modelUrl: analysisSession.modelUrl,
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

  const updateScannerModel = useCallback(
    (scanId: string, modelUrl: string) => {
      const currentAnalysis = scannerAnalysisRef.current;
      if (currentAnalysis?.scanId === scanId) {
        const nextAnalysis = {
          ...currentAnalysis,
          modelUrl,
        };
        scannerAnalysisRef.current = nextAnalysis;
        setScannerAnalysis(nextAnalysis);
      }
      setScannerResult((current) =>
        current?.scanId === scanId
          ? {
              ...current,
              modelUrl,
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
      updateScannerModel,
    }),
    [
      clearScannerAnalysis,
      clearScannerResult,
      openScannerAnalysis,
      promoteScannerAnalysisToResult,
      scannerAnalysis,
      scannerResult,
      updateScannerModel,
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
