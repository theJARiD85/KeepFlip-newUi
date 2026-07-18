import fs from 'node:fs';

const path = 'app/(app)/inventory.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`Could not apply ${label}; expected exactly one source match.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  `import { useCallback, useState } from 'react';`,
  `import { useCallback, useMemo, useState } from 'react';`,
  'React imports',
);

replaceOnce(
  `import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';`,
  `import { KeepFlipNativeAdCard } from '@/components/ads/keepflip-native-ad-card';\nimport { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';`,
  'native ad import',
);

replaceOnce(
  `}\n\nexport default function InventoryScreen() {`,
  `}\n\ntype InventoryFeedRow =\n  | { id: string; item: InventoryItem; kind: 'item' }\n  | { id: string; kind: 'native-ad' };\n\nfunction buildInventoryFeed(items: InventoryItem[]): InventoryFeedRow[] {\n  return items.flatMap((item, index) => {\n    const rows: InventoryFeedRow[] = [\n      { id: item.id, item, kind: 'item' },\n    ];\n\n    if ((index + 1) % 5 === 0) {\n      rows.push({\n        id: \\`inventory-native-ad-\\${Math.floor((index + 1) / 5)}\\`,\n        kind: 'native-ad',\n      });\n    }\n\n    return rows;\n  });\n}\n\nexport default function InventoryScreen() {`,
  'inventory feed row helpers',
);

replaceOnce(
  `  const [error, setError] = useState<string | null>(null);`,
  `  const [error, setError] = useState<string | null>(null);\n  const feedRows = useMemo(() => buildInventoryFeed(items), [items]);`,
  'memoized inventory feed',
);

replaceOnce(
  `        data={items}\n        keyExtractor={(item) => item.id}`,
  `        data={feedRows}\n        keyExtractor={(row) => row.id}`,
  'FlatList data source',
);

replaceOnce(
  `        renderItem={({ item }) => (\n          <View style={{ width: contentWidth }}>\n            <InventoryCard item={item} />\n          </View>\n        )}`,
  `        renderItem={({ item: row }) =>\n          row.kind === 'native-ad' ? (\n            <View style={{ width: contentWidth }}>\n              <KeepFlipNativeAdCard placement="inventory_feed" />\n            </View>\n          ) : (\n            <View style={[styles.feedItem, { width: contentWidth }]}>\n              <InventoryCard item={row.item} />\n            </View>\n          )\n        }`,
  'FlatList row rendering',
);

replaceOnce(
  `  content: {\n    flexGrow: 1,\n    alignItems: 'center',\n    gap: 14,\n  },\n  header: {\n    gap: 7,\n    marginBottom: 8,\n  },`,
  `  content: {\n    flexGrow: 1,\n    alignItems: 'center',\n  },\n  header: {\n    gap: 7,\n    marginBottom: 22,\n  },\n  feedItem: {\n    marginBottom: 14,\n  },`,
  'dynamic feed spacing',
);

fs.writeFileSync(path, source, 'utf8');
console.log('Applied Appodeal native inventory integration.');
