import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type LocalScanProofAvailability =
  | "available"
  | "failed"
  | "unavailable";

export type LocalScanProofSignals = {
  availability: LocalScanProofAvailability;
  barcodes: string[];
  text: string;
  textBlocks: string[];
};

type NativeScanProofResponse = {
  barcodes?: unknown;
  text?: unknown;
  textBlocks?: unknown;
};

type KeepFlipScanProofNativeModule = {
  inspectPhoto: (photoUri: string) => Promise<NativeScanProofResponse>;
};

const nativeModule =
  Platform.OS === "android"
    ? requireOptionalNativeModule<KeepFlipScanProofNativeModule>(
        "KeepFlipScanProof",
      )
    : null;

function toBoundedStrings(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim().slice(0, maxLength))
    .filter(Boolean)
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, maxItems);
}

function emptySignals(
  availability: LocalScanProofAvailability,
): LocalScanProofSignals {
  return {
    availability,
    barcodes: [],
    text: "",
    textBlocks: [],
  };
}

/**
 * Local-only extraction for an already captured photo. The caller decides
 * whether any derivative evidence should ever leave the device.
 */
export async function inspectPhotoOnDevice(
  photoUri: string,
): Promise<LocalScanProofSignals> {
  if (!photoUri.trim() || !nativeModule) return emptySignals("unavailable");

  try {
    const response = await nativeModule.inspectPhoto(photoUri);
    const textBlocks = toBoundedStrings(response.textBlocks, 8, 160);
    const text =
      typeof response.text === "string"
        ? response.text.replace(/\s+/g, " ").trim().slice(0, 900)
        : textBlocks.join(" ").slice(0, 900);

    return {
      availability: "available",
      barcodes: toBoundedStrings(response.barcodes, 4, 96),
      text,
      textBlocks,
    };
  } catch {
    // A proof read is optional and must never block a normal cloud analysis.
    return emptySignals("failed");
  }
}
