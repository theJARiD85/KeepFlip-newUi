import { useSyncExternalStore } from "react";

export type ScannerHudToolId =
  | "single"
  | "barcode"
  | "multi"
  | "batch"
  | "upload";

export type ScannerHudSnapshot = {
  badges: Partial<Record<ScannerHudToolId, number>>;
  selectedTool: ScannerHudToolId;
};

const DEFAULT_SNAPSHOT: ScannerHudSnapshot = {
  badges: {},
  selectedTool: "single",
};

let snapshot = DEFAULT_SNAPSHOT;
const listeners = new Set<() => void>();

function snapshotsMatch(
  current: ScannerHudSnapshot,
  next: ScannerHudSnapshot,
) {
  if (current.selectedTool !== next.selectedTool) return false;

  return (
    current.badges.single === next.badges.single &&
    current.badges.barcode === next.badges.barcode &&
    current.badges.multi === next.badges.multi &&
    current.badges.batch === next.badges.batch &&
    current.badges.upload === next.badges.upload
  );
}

export function publishScannerHudSnapshot(next: ScannerHudSnapshot) {
  if (snapshotsMatch(snapshot, next)) return;

  snapshot = {
    selectedTool: next.selectedTool,
    badges: { ...next.badges },
  };

  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useScannerHudSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function scannerHudCopy({
  badges,
  selectedTool,
}: ScannerHudSnapshot) {
  if (selectedTool === "barcode") {
    return {
      eyebrow: "BARCODE LOOKUP",
      title: "Scan a product barcode",
      helper:
        "Center a UPC, EAN, ISBN, or product code to identify the item.",
    };
  }

  if (selectedTool === "multi") {
    const count = badges.multi ?? 0;
    return {
      eyebrow: "MULTI-VIEW CAPTURE",
      title: "Scan multiple angles",
      helper:
        count > 0
          ? `${count} view${count === 1 ? "" : "s"} ready for review.`
          : "Capture several angles of the same item.",
    };
  }

  if (selectedTool === "batch") {
    const count = badges.batch ?? 0;
    return {
      eyebrow: "BATCH CAPTURE",
      title: "Scan multiple items",
      helper:
        count > 0
          ? `${count} item${count === 1 ? "" : "s"} captured.`
          : "Capture one photo per item.",
    };
  }

  if (selectedTool === "upload") {
    const count = badges.upload ?? 0;
    return {
      eyebrow: "PHOTO IMPORT",
      title: "Upload item photos",
      helper:
        count > 0
          ? `${count} photo${count === 1 ? "" : "s"} ready for AI analysis.`
          : "Choose up to four photos of the same item.",
    };
  }

  const count = badges.single ?? 0;
  return {
    eyebrow: "SINGLE TARGET",
    title: "Scan an item",
    helper:
      count > 0
        ? "Photo ready. Tap the scan control to replace it."
        : "One item, one photo.",
  };
}
