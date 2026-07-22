import {
  identifyItemWithAI as identifyOptimizedItemWithAI,
  type KeepFlipIdentification,
} from "@/services/itemAiOptimizedService";

export {
  ItemIdentificationGuidanceError,
  formatItemIdentificationGuidance,
  getItemIdentificationGuidance,
} from "@/services/itemAiOptimizedService";

export type {
  ItemCandidateMatch,
  ItemConfidenceBreakdown,
  ItemEvidenceField,
  ItemIdentificationGuidance,
  ItemIdentityEvidence,
  ItemValuationReadiness,
  ItemValuationSignals,
  KeepFlipIdentification,
} from "@/services/itemAiOptimizedService";

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function identifyItemWithAI(
  fileIds: string[],
  notes = "",
): Promise<KeepFlipIdentification> {
  const identification = await identifyOptimizedItemWithAI(
    fileIds,
    notes,
  );

  const evidence = identification.identityEvidence.map((entry) => ({
    ...entry,
    explanation:
      entry.imageIndex == null
        ? entry.explanation
        : `Photo ${entry.imageIndex + 1}: ${entry.explanation}`,
  }));

  const serialNumber = identification.serialNumber?.trim() || null;
  const hasSerialEvidence =
    serialNumber != null &&
    evidence.some(
      (entry) =>
        entry.value.toLowerCase() === serialNumber.toLowerCase(),
    );

  const identityEvidence =
    serialNumber && !hasSerialEvidence
      ? [
          ...evidence,
          {
            field: "variant" as const,
            value: serialNumber,
            source: "photo_text" as const,
            confidence:
              identification.confidenceBreakdown.model,
            explanation:
              "Serial number returned by the optimized prompt from visible or owner-confirmed evidence.",
            imageIndex: null,
          },
        ]
      : evidence;

  const evidenceFields =
    serialNumber &&
    !identification.evidenceFields.some(
      (field) => field.key === "serial_number",
    )
      ? [
          {
            key: "serial_number",
            label: "Serial number",
            inputType: "text" as const,
            value: serialNumber,
            options: [],
            importance: "helpful" as const,
            confidence:
              identification.confidenceBreakdown.model,
            reason:
              "The serial number helps distinguish this exact unit and preserves the prompt output.",
            photoHint:
              "Photograph the serial label straight-on so every character is readable.",
          },
          ...identification.evidenceFields,
        ].slice(0, 6)
      : identification.evidenceFields;

  return {
    ...identification,
    detectedText: serialNumber
      ? uniqueStrings([
          ...identification.detectedText,
          serialNumber,
        ])
      : identification.detectedText,
    identityEvidence,
    evidenceFields,
  };
}
