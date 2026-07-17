const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) {
    throw new Error(`Could not find ${label}`);
  }
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Expected one occurrence of ${label}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

function replaceAllExpected(source, search, replacement, count, label) {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== count) {
    throw new Error(`Expected ${count} occurrences of ${label}, found ${occurrences}`);
  }
  return source.split(search).join(replacement);
}

function updateNativeScanner() {
  const file = path.join(root, 'components/scanner/scanner-screen.native.tsx');
  let source = fs.readFileSync(file, 'utf8');

  source = replaceOnce(
    source,
    "import { useSafeAreaInsets } from 'react-native-safe-area-context';\n",
    '',
    'legacy safe-area hook import',
  );
  source = replaceOnce(
    source,
    "import { keepFlipTheme as theme } from '@/constants/keepflip-theme';\n",
    "import { keepFlipTheme as theme } from '@/constants/keepflip-theme';\nimport { useResponsiveLayout } from '@/hooks/use-responsive-layout';\n",
    'responsive hook import location',
  );
  source = replaceOnce(
    source,
    "export default function ScannerScreen() {\n  const insets = useSafeAreaInsets();\n",
    `export default function ScannerScreen() {\n  const {\n    contentWidth,\n    controlDockWidth,\n    insets,\n    isCompactHeight,\n    moderateScale,\n    pageGutter,\n    responsiveFont,\n    scannerHeight,\n    scannerWidth,\n    verticalScale,\n  } = useResponsiveLayout();\n  const scannerCornerSize = moderateScale(54, 0.65);\n  const torchButtonSize = moderateScale(35, 0.65);\n  const permissionCardWidth = Math.min(contentWidth, 480);\n  const analysisButtonWidth = Math.min(controlDockWidth, 360);\n`,
    'scanner layout initialization',
  );

  source = replaceOnce(
    source,
    '        style={styles.analyzeButtonShell}>',
    `        style={[styles.analyzeButtonShell, { maxWidth: analysisButtonWidth }]}>`,
    'analysis button shell',
  );
  source = replaceOnce(
    source,
    '          <View style={styles.analyzeReticle}>',
    `          <View\n            style={[\n              styles.analyzeReticle,\n              {\n                width: moderateScale(38, 0.7),\n                height: moderateScale(38, 0.7),\n                borderRadius: moderateScale(19, 0.7),\n              },\n            ]}>`,
    'analysis reticle',
  );
  source = replaceOnce(
    source,
    '<Text style={styles.analyzeButtonEyebrow}>KEEPFLIP INTELLIGENCE</Text>',
    `<Text style={[styles.analyzeButtonEyebrow, { fontSize: responsiveFont(8) }]}>\n              KEEPFLIP INTELLIGENCE\n            </Text>`,
    'analysis eyebrow',
  );
  source = replaceOnce(
    source,
    '<Text style={styles.analyzeButtonText}>',
    `<Text style={[styles.analyzeButtonText, { fontSize: responsiveFont(15) }]}>`,
    'analysis button text',
  );
  source = replaceOnce(
    source,
    '<Text style={styles.analyzeButtonArrow}>›</Text>',
    `<Text\n            style={[\n              styles.analyzeButtonArrow,\n              { fontSize: responsiveFont(27), lineHeight: responsiveFont(30) },\n            ]}>\n            ›\n          </Text>`,
    'analysis button arrow',
  );

  source = replaceAllExpected(
    source,
    '<KeepFlipBackground contentStyle={styles.centeredState}>',
    `<KeepFlipBackground\n        contentStyle={[styles.centeredState, { paddingHorizontal: pageGutter }]}>`,
    2,
    'centered scanner state',
  );
  source = replaceAllExpected(
    source,
    'style={styles.permissionCard}',
    `style={[\n              styles.permissionCard,\n              {\n                width: permissionCardWidth,\n                maxWidth: permissionCardWidth,\n                gap: moderateScale(14, 0.55),\n                padding: moderateScale(28, 0.55),\n              },\n            ]}`,
    2,
    'permission cards',
  );
  source = replaceOnce(
    source,
    '<View style={styles.permissionIcon}>',
    `<View\n              style={[\n                styles.permissionIcon,\n                {\n                  width: moderateScale(62, 0.65),\n                  height: moderateScale(62, 0.65),\n                  borderRadius: moderateScale(31, 0.65),\n                },\n              ]}>`,
    'permission icon',
  );
  source = replaceOnce(
    source,
    '<IconSymbol name="camera.fill" size={30} color={theme.colors.goldBright} />',
    `<IconSymbol\n                name="camera.fill"\n                size={Math.round(moderateScale(30, 0.6))}\n                color={theme.colors.goldBright}\n              />`,
    'permission icon symbol',
  );
  source = replaceAllExpected(
    source,
    '<Text style={styles.permissionTitle}>',
    `<Text style={[styles.permissionTitle, { fontSize: responsiveFont(25) }]}>`,
    2,
    'permission titles',
  );
  source = replaceOnce(
    source,
    '<Text style={styles.permissionBody}>',
    `<Text\n              style={[\n                styles.permissionBody,\n                { fontSize: responsiveFont(15), lineHeight: responsiveFont(22) },\n              ]}>`,
    'permission body',
  );

  source = replaceOnce(
    source,
    "          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 10 },",
    `          {\n            paddingHorizontal: pageGutter,\n            paddingTop: insets.top + verticalScale(14, 0.5),\n            paddingBottom:\n              insets.bottom + verticalScale(isCompactHeight ? 4 : 10, 0.5),\n          },`,
    'scanner content insets',
  );
  source = replaceOnce(
    source,
    '<View style={styles.topBar}>',
    `<View\n          style={[\n            styles.topBar,\n            {\n              marginBottom: verticalScale(12, 0.55),\n              paddingRight: moderateScale(60, 0.35),\n            },\n          ]}>`,
    'responsive top bar',
  );
  source = replaceOnce(
    source,
    '<Text style={styles.eyebrow}>KEEPFLIP AI</Text>',
    `<Text\n              style={[\n                styles.eyebrow,\n                {\n                  fontSize: responsiveFont(11),\n                  letterSpacing: moderateScale(2.4, 0.28),\n                },\n              ]}>\n              KEEPFLIP AI\n            </Text>`,
    'responsive scanner eyebrow',
  );
  source = replaceOnce(
    source,
    '<Text style={styles.title}>{selectedToolHeader.title}</Text>',
    `<Text\n                style={[\n                  styles.title,\n                  {\n                    fontSize: responsiveFont(25),\n                    lineHeight: responsiveFont(30),\n                  },\n                ]}>\n                {selectedToolHeader.title}\n              </Text>`,
    'responsive scanner title',
  );
  source = replaceOnce(
    source,
    "                    styles.headerHint,\n                    { color: captureFeedback ? selectedToolAppearance.accent : theme.colors.text },",
    `                    styles.headerHint,\n                    {\n                      color: captureFeedback\n                        ? selectedToolAppearance.accent\n                        : theme.colors.text,\n                      fontSize: responsiveFont(12),\n                      lineHeight: responsiveFont(16),\n                    },`,
    'responsive scanner hint',
  );
  source = replaceOnce(
    source,
    '<View style={styles.scanFrame}>',
    `<View\n            style={[\n              styles.scanFrame,\n              {\n                width: scannerWidth,\n                height: scannerHeight,\n                maxHeight: undefined,\n                aspectRatio: undefined,\n                bottom: 0,\n              },\n            ]}>`,
    'responsive scan frame',
  );
  source = replaceAllExpected(
    source,
    '<View style={[styles.corner, styles.topLeft]} />',
    `<View\n              style={[\n                styles.corner,\n                styles.topLeft,\n                { width: scannerCornerSize, height: scannerCornerSize },\n              ]}\n            />`,
    1,
    'top-left scanner corner',
  );
  source = replaceAllExpected(
    source,
    '<View style={[styles.corner, styles.topRight]} />',
    `<View\n              style={[\n                styles.corner,\n                styles.topRight,\n                { width: scannerCornerSize, height: scannerCornerSize },\n              ]}\n            />`,
    1,
    'top-right scanner corner',
  );
  source = replaceAllExpected(
    source,
    '<View style={[styles.corner, styles.bottomLeft]} />',
    `<View\n              style={[\n                styles.corner,\n                styles.bottomLeft,\n                { width: scannerCornerSize, height: scannerCornerSize },\n              ]}\n            />`,
    1,
    'bottom-left scanner corner',
  );
  source = replaceAllExpected(
    source,
    '<View style={[styles.corner, styles.bottomRight]} />',
    `<View\n              style={[\n                styles.corner,\n                styles.bottomRight,\n                { width: scannerCornerSize, height: scannerCornerSize },\n              ]}\n            />`,
    1,
    'bottom-right scanner corner',
  );
  source = replaceOnce(
    source,
    `              styles.iconButton,\n              torchEnabled && styles.iconButtonActive,`,
    `              styles.iconButton,\n              {\n                width: torchButtonSize,\n                height: torchButtonSize,\n                marginLeft: moderateScale(20, 0.5),\n                marginTop: moderateScale(20, 0.5),\n                borderRadius: torchButtonSize / 2,\n              },\n              torchEnabled && styles.iconButtonActive,`,
    'responsive torch button',
  );
  source = replaceOnce(
    source,
    `              size={22}\n              color={torchEnabled ? theme.colors.background : theme.colors.goldBright}`,
    `              size={Math.round(moderateScale(22, 0.6))}\n              color={torchEnabled ? theme.colors.background : theme.colors.goldBright}`,
    'responsive torch icon',
  );
  source = replaceOnce(
    source,
    '<View style={styles.scanLine} />',
    `<View\n              style={[\n                styles.scanLine,\n                {\n                  left: moderateScale(18, 0.55),\n                  right: moderateScale(18, 0.55),\n                  height: Math.max(2, moderateScale(2, 0.5)),\n                },\n              ]}\n            />`,
    'responsive scan line',
  );
  source = replaceOnce(
    source,
    'style={[styles.bottomPanel, toolbarAnimatedStyle]}',
    `style={[styles.bottomPanel, { width: controlDockWidth }, toolbarAnimatedStyle]}`,
    'responsive bottom panel',
  );

  fs.writeFileSync(file, source);
}

function updateWebScanner() {
  const file = path.join(root, 'components/scanner/scanner-screen.tsx');
  let source = fs.readFileSync(file, 'utf8');

  source = replaceOnce(
    source,
    "import { keepFlipTheme as theme } from '@/constants/keepflip-theme';\n",
    "import { keepFlipTheme as theme } from '@/constants/keepflip-theme';\nimport { useResponsiveLayout } from '@/hooks/use-responsive-layout';\n",
    'web responsive hook import',
  );
  source = replaceOnce(
    source,
    'export default function ScannerScreen() {\n  return (',
    `export default function ScannerScreen() {\n  const {\n    contentWidth,\n    isCompactHeight,\n    moderateScale,\n    pageGutter,\n    responsiveFont,\n    verticalScale,\n  } = useResponsiveLayout();\n\n  return (`,
    'web scanner layout initialization',
  );
  source = replaceOnce(
    source,
    '        contentContainerStyle={styles.content}>',
    `        contentContainerStyle={[\n          styles.content,\n          {\n            paddingHorizontal: pageGutter,\n            paddingVertical: verticalScale(isCompactHeight ? 24 : 40, 0.55),\n          },\n        ]}>`,
    'web content sizing',
  );
  source = replaceOnce(
    source,
    '<View style={styles.preview}>',
    `<View\n          style={[\n            styles.preview,\n            {\n              width: contentWidth,\n              minHeight: verticalScale(isCompactHeight ? 480 : 560, 0.45),\n            },\n          ]}>`,
    'web preview sizing',
  );
  source = replaceOnce(
    source,
    '<Text selectable style={styles.eyebrow}>KEEPFLIP VISION</Text>',
    `<Text selectable style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>\n                KEEPFLIP VISION\n              </Text>`,
    'web eyebrow sizing',
  );
  source = replaceOnce(
    source,
    '<Text selectable style={styles.title}>Live scanner on mobile</Text>',
    `<Text selectable style={[styles.title, { fontSize: responsiveFont(25) }]}>\n                Live scanner on mobile\n              </Text>`,
    'web title sizing',
  );
  source = replaceOnce(
    source,
    '<Text selectable style={styles.body}>',
    `<Text\n                selectable\n                style={[\n                  styles.body,\n                  { fontSize: responsiveFont(14), lineHeight: responsiveFont(21) },\n                ]}>`,
    'web body sizing',
  );
  source = replaceOnce(
    source,
    'style={styles.card}',
    `style={[\n              styles.card,\n              {\n                gap: moderateScale(20, 0.5),\n                padding: moderateScale(28, 0.5),\n              },\n            ]}`,
    'web card sizing',
  );

  fs.writeFileSync(file, source);
}

updateNativeScanner();
updateWebScanner();
console.log('Responsive scanner layout applied.');
