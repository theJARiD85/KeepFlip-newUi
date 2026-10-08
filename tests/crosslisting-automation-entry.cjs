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
  const listingService = loadService('services/crosslisting-service.ts');
  const planService = loadService('services/crosslisting-automation-plan.ts', {
    '@/services/crosslisting-service': listingService,
  });
  const item = {
    id: 'item-1', itemPhotos: ['photo-1', 'photo-1', 'photo-2'], coverPhotoId: 'cover-1',
    photoCount: 3, category: 'Clothing',
  };
  const listing = {
    title: 'Vintage jacket', conditionDisclosure: 'Sleeve scuff', priceRange: { targetPrice: 85 },
    marketplaceListings: {
      poshmark: { title: 'Poshmark jacket', description: 'Vintage jacket', fields: { size: 'L' } },
      mercari: { title: 'Mercari jacket', description: 'Leather jacket', fields: { brand: 'Harley Davidson' } },
    },
  };
  const plan = planService.createCrosslistingAutomationPlan({
    item, listing, marketplaces: ['mercari', 'poshmark', 'mercari'],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.jobs.map((job) => job.marketplace))), ['poshmark', 'mercari']);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.photoFileIds)), ['photo-1', 'photo-2']);
  assert.equal(plan.jobs[0].payload.title, 'Poshmark jacket');
  assert.equal(plan.jobs[1].payload.title, 'Mercari jacket');
  assert.equal(plan.jobs[0].payload.price, '85.00');
  assert.throws(() => planService.createCrosslistingAutomationPlan({ item, listing, marketplaces: [] }), /Choose at least one/);

  const sent = [];
  const web = loadService('services/crosslisting-automation-dispatch.web.ts', {
    '@/services/crosslisting-automation-plan': planService,
    '@/services/crosslisting-extension-bridge.web': {
      requestCrosslistingExtension: async (request) => {
        sent.push(request);
        return { ok: true, run: { jobs: request.jobs.map((job) => ({ marketplace: job.marketplace, status: 'opened', tabId: 1 })) } };
      },
    },
    '@/services/crosslisting-extension-photos.web': {
      loadCrosslistingExtensionPhotos: async (ids) => {
        assert.deepEqual(JSON.parse(JSON.stringify(ids)), ['photo-1', 'photo-2']);
        return { photos: [{ name: 'photo.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }], unavailablePhotoCount: 1 };
      },
    },
  });
  let photosReady = false;
  const jobs = await web.dispatchToAutomationEngine({
    ownerId: 'owner-1', runId: 'run-123456789', item, listing,
    marketplaces: ['poshmark', 'mercari'], onPhotosReady: () => { photosReady = true; },
  });
  assert.equal(photosReady, true);
  assert.equal(jobs.length, 2);
  assert.equal(sent[0].action, 'LISTING_START');
  assert.equal(sent[0].ownerId, 'owner-1');
  assert.equal(sent[0].itemId, 'item-1');
  assert.equal(sent[0].photos.length, 1);
  assert.equal(sent[0].unavailablePhotoCount, 1);

  const emptyWeb = loadService('services/crosslisting-automation-dispatch.web.ts', {
    '@/services/crosslisting-automation-plan': planService,
    '@/services/crosslisting-extension-bridge.web': {
      requestCrosslistingExtension: async () => ({ ok: true, run: null }),
    },
    '@/services/crosslisting-extension-photos.web': {
      loadCrosslistingExtensionPhotos: async () => ({ photos: [], unavailablePhotoCount: 0 }),
    },
  });
  await assert.rejects(emptyWeb.dispatchToAutomationEngine({
    ownerId: 'owner-1', runId: 'run-123456789', item, listing, marketplaces: ['poshmark'],
  }), /did not open any marketplace tabs/);

  const native = loadService('services/crosslisting-automation-dispatch.native.ts', {
    '@/services/crosslisting-automation-plan': planService,
  });
  let nativePlan = null;
  native.dispatchToAutomationEngine({ item, listing, marketplaces: ['mercari'] }, (plan) => { nativePlan = plan; });
  assert.equal(nativePlan.jobs[0].payload.title, 'Mercari jacket');
  console.log('Crosslisting automation entry: shared plan, desktop protocol, and native host handoff passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
