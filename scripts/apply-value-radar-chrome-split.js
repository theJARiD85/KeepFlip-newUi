const fs = require("node:fs");
const path = require("node:path");

const scannerPath = path.resolve(
  process.cwd(),
  "components/scanner/scanner-screen.native.tsx",
);

if (!fs.existsSync(scannerPath)) {
  throw new Error(
    `Scanner file was not found at ${scannerPath}. Run this script from the KeepFlip project root.`,
  );
}

let source = fs.readFileSync(scannerPath, "utf8");
let changed = false;

const radarImportPattern = /import \{\r?\n\s*ValueRadarOverlay,\r?\n\s*useValueRadar,\r?\n\s*type ValueRadarViewport,\r?\n\} from "@\/components\/scanner\/value-radar\.native";/;

const replacementImports = `import {
  useValueRadar,
  type ValueRadarViewport,
} from "@/components/scanner/value-radar.native";
import {
  ValueRadarBar,
  ValueRadarBubble,
  ValueRadarTargetOverlay,
} from "@/components/scanner/value-radar-chrome.native";`;

if (radarImportPattern.test(source)) {
  source = source.replace(radarImportPattern, replacementImports);
  changed = true;
} else if (!source.includes("ValueRadarTargetOverlay")) {
  throw new Error(
    "Could not find the expected Value Radar import block. The scanner source layout has changed.",
  );
}

if (source.includes("<ValueRadarOverlay")) {
  source = source.replace("<ValueRadarOverlay", "<ValueRadarTargetOverlay");
  changed = true;
} else if (!source.includes("<ValueRadarTargetOverlay")) {
  throw new Error(
    "Could not find either ValueRadarOverlay or ValueRadarTargetOverlay in the scanner.",
  );
}

const bubbleBlock = `        {!isScannerOverlayOpen ? (
          <View pointerEvents="none" style={styles.radarBubbleSlot}>
            <ValueRadarBubble
              status={radarStatus}
              width={Math.min(194, Math.max(154, scannerWidth * 0.54))}
            />
          </View>
        ) : null}

`;

if (!source.includes("style={styles.radarBubbleSlot}")) {
  const scannerAreaMarker = "        <View style={styles.scannerArea}>";
  const scannerAreaIndex = source.indexOf(scannerAreaMarker);

  if (scannerAreaIndex < 0) {
    throw new Error(
      "Could not find the scanner area insertion point for ValueRadarBubble.",
    );
  }

  source =
    source.slice(0, scannerAreaIndex) +
    bubbleBlock +
    source.slice(scannerAreaIndex);
  changed = true;
}

const barBlock = `          {!isScannerOverlayOpen ? (
            <View pointerEvents="none" style={styles.radarBarSlot}>
              <ValueRadarBar
                marker={radarMarker}
                status={radarStatus}
                width={Math.min(
                  224,
                  Math.max(168, controlDockWidth - moderateScale(28, 0.4)),
                )}
              />
            </View>
          ) : null}
`;

if (!source.includes("style={styles.radarBarSlot}")) {
  const carouselMarker = "          <ScannerToolCarousel";
  const carouselIndex = source.indexOf(carouselMarker);

  if (carouselIndex < 0) {
    throw new Error(
      "Could not find the ScannerToolCarousel insertion point for ValueRadarBar.",
    );
  }

  source =
    source.slice(0, carouselIndex) +
    barBlock +
    source.slice(carouselIndex);
  changed = true;
}

const slotStyles = `  radarBubbleSlot: {
    width: "100%",
    alignItems: "flex-end",
    paddingBottom: 8,
    zIndex: 12,
  },
  radarBarSlot: {
    width: "100%",
    alignItems: "center",
    paddingBottom: 7,
  },
`;

if (!source.includes("radarBubbleSlot: {")) {
  const scannerAreaStyleMarker = "  scannerArea: {";
  const scannerAreaStyleIndex = source.indexOf(scannerAreaStyleMarker);

  if (scannerAreaStyleIndex < 0) {
    throw new Error(
      "Could not find the scannerArea style insertion point for Value Radar chrome.",
    );
  }

  source =
    source.slice(0, scannerAreaStyleIndex) +
    slotStyles +
    source.slice(scannerAreaStyleIndex);
  changed = true;
}

if (!changed) {
  console.log("Value Radar chrome split is already applied.");
  process.exit(0);
}

fs.writeFileSync(scannerPath, source, "utf8");
console.log(
  "Applied Value Radar chrome split to components/scanner/scanner-screen.native.tsx.",
);
