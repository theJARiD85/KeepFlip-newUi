import fs from "node:fs";

const path = new URL("../services/item-analysis-service.ts", import.meta.url);
let source = fs.readFileSync(path, "utf8");

source = source.replace(
  "        serialNumber: null,",
  "        serialNumber: identification.serialNumber,",
);

source = source.replace(
  "      imageIndex: null,\n      strength: strengthFromConfidence(entry.confidence),",
  "      imageIndex: entry.imageIndex,\n      strength: strengthFromConfidence(entry.confidence),",
);

if (!source.includes("serialNumber: identification.serialNumber")) {
  throw new Error("Prompt serial-number mapping was not installed.");
}
if (!source.includes("imageIndex: entry.imageIndex")) {
  throw new Error("Prompt evidence image index was not installed.");
}

fs.writeFileSync(path, source, "utf8");
console.log("Item analysis adapter now consumes optimized prompt fields.");
