import fs from 'node:fs';

const scannerPath = 'components/scanner/scanner-screen.native.tsx';
const bubblesPath = 'components/scanner/item-analysis-bubbles.tsx';
const scannerSource = fs.readFileSync(scannerPath, 'utf8');
const bubblesSource = fs.readFileSync(bubblesPath, 'utf8');

const alreadyApplied =
  scannerSource.includes("import { saveAnalyzedItemToInventory } from '@/services/inventory-service';") &&
  scannerSource.includes('const resetScannerSession = useCallback') &&
  bubblesSource.includes('onSave?: () => void;');

if (alreadyApplied) {
  console.log('Scanner inventory migration is already applied.');
} else {
  await import('./apply-scanner-inventory-workflow.mjs');
}
