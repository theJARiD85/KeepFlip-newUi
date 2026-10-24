'use strict';
/* global __dirname */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'use-responsive-layout.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function layoutFor(platform, width, height = 800) {
  const exports = {};
  const context = {
    exports,
    window: { innerWidth: width },
    require(moduleName) {
      if (moduleName === 'react') return {
        createContext: () => null,
        createElement: () => null,
        useContext: () => null,
        useMemo: (compute) => compute(),
      };
      if (moduleName === 'react-native') return {
        Platform: { OS: platform },
        useWindowDimensions: () => ({ width, height, fontScale: 1, scale: 1 }),
      };
      if (moduleName === 'react-native-safe-area-context') return {
        useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      };
      if (moduleName === '@/components/settings/keepflip-appearance-context') return {
        useKeepFlipAppearance: () => ({ appliedColorScheme: 'dark' }),
      };
      throw new Error(`Unexpected import: ${moduleName}`);
    },
  };
  vm.runInNewContext(compiled, context, { filename: 'use-responsive-layout.js' });
  return exports.useResponsiveLayout();
}

const compactWeb = layoutFor('web', 979);
assert.equal(compactWeb.isWeb, true);
assert.equal(compactWeb.isWideWeb, false);
assert.equal(compactWeb.widthScale, 1.24);
assert.equal(compactWeb.responsiveWidth(100), 112);
assert.equal(compactWeb.webResponsiveWidth(100), 112);

const wideWeb = layoutFor('web', 980);
assert.equal(wideWeb.isWideWeb, true);
assert.equal(wideWeb.widthScale, 1.5);
assert.equal(wideWeb.responsiveWidth(100), 125);
assert.equal(wideWeb.webResponsiveWidth(100), 125);

const native = layoutFor('android', 1200);
assert.equal(native.isWeb, false);
assert.equal(native.isWideWeb, false);
assert.equal(native.widthScale, 1.24);

const zeroWidthWeb = layoutFor('web', 0);
assert.equal(zeroWidthWeb.width, 390);
assert.equal(zeroWidthWeb.isWideWeb, false);

console.log('Responsive web width boundary and native fallback passed.');
