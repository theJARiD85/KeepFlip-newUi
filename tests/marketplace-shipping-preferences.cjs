const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadService(file, imports = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

async function main() {
  const row = { $id: 'legacy-profile-row', userId: 'seller-1', facebookShippingDefault: null, offerUpShippingDefault: 'buyerPays' };
  const writes = [];
  const service = loadService('services/marketplace-shipping-preferences-service.ts', {
    '@/lib/appwrite': {
      APPWRITE: { databaseId: 'keepflip', userProfilesTableId: 'user_profiles' },
      tablesDB: {
        updateRow: async (input) => {
          writes.push(input);
          Object.assign(row, input.data);
          return row;
        },
      },
    },
    '@/services/user-profile-onboarding-service': {
      ensureUserProfile: async ({ userId }) => {
        assert.equal(userId, 'seller-1');
        return row;
      },
    },
  });

  assert.equal((await service.getMarketplaceShippingPreferences('seller-1')).facebookMarketplace, null);
  const saved = await service.saveMarketplaceShippingPreferences('seller-1', { facebookMarketplace: 'sellerPays' });
  assert.equal(saved.facebookMarketplace, 'sellerPays');
  assert.equal(saved.offerUp, 'buyerPays');
  assert.equal(writes[0].rowId, 'legacy-profile-row');
  assert.equal(writes[0].data.facebookShippingDefault, 'sellerPays');
  assert.equal(Object.hasOwn(writes[0].data, 'offerUpShippingDefault'), false);
  await assert.rejects(service.saveMarketplaceShippingPreferences('seller-1', { offerUp: 'invalid' }), /valid shipping option/);

  const selections = loadService('lib/listing-marketplaces.ts');
  assert.deepEqual(JSON.parse(JSON.stringify(selections.normalizeMarketplaceSelections(['offerup', 'facebookMarketplace']))), ['facebookMarketplace', 'offerUp']);
  console.log('Marketplace shipping preferences: owner row update, enum validation, and legacy OfferUp selection passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
