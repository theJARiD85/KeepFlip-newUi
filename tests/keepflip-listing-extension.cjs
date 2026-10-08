const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const listeners = [];
  const opened = [];
  const sent = [];
  const records = new Map();
  const tabs = new Map();
  let nextTabId = 100;
  const chrome = {
    runtime: { onMessage: { addListener: (listener) => listeners.push(listener) } },
    storage: { session: {
      get: async (key) => ({ [key]: records.get(key) }),
      set: async (values) => Object.entries(values).forEach(([key, value]) => records.set(key, structuredClone(value))),
    } },
    tabs: {
      create: async (options) => {
        const tab = { id: nextTabId++, url: options.url };
        tabs.set(tab.id, tab);
        opened.push({ ...options, id: tab.id });
        return tab;
      },
      get: async (id) => tabs.get(id),
      update: async (id, options) => { Object.assign(tabs.get(id), options); return tabs.get(id); },
      sendMessage: async (id, message) => { sent.push({ id, message }); },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'listing-background.js'), 'utf8');
  vm.runInNewContext(source, { chrome, URL, Date, Set, Object, Array, Number, String, RegExp, Promise });
  async function dispatch(message, sender) {
    return new Promise((resolve) => {
      const accepted = listeners[0](message, sender, resolve);
      assert.equal(accepted, true);
    });
  }
  return { dispatch, opened, sent, records, tabs };
}

function listingPayload(marketplace) {
  return { version: 1, marketplace, title: 'Vintage jacket', description: 'Good condition',
    price: '85.00', category: 'Jackets', condition: 'Good', brand: 'Harley Davidson',
    size: 'L', color: 'Black', photoCount: 1, platformFields: {} };
}

test('the extension binds a listing run to KeepFlip and its marketplace tabs', async () => {
  const app = harness();
  const request = { source: 'keepflip-webapp', protocol: 1, action: 'LISTING_START',
    runId: 'run-123456789012', itemId: 'item-1', ownerId: 'owner-1',
    jobs: [
      { marketplace: 'poshmark', payload: listingPayload('poshmark') },
      { marketplace: 'mercari', payload: listingPayload('mercari') },
    ],
    photos: [{ name: 'item.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }], unavailablePhotoCount: 0 };
  const spoof = await app.dispatch({ type: 'KEEPFLIP_LISTING_PAGE', request },
    { url: 'https://example.com/listing', tab: { id: 7 } });
  assert.equal(spoof.ok, false);
  assert.equal(app.opened.length, 0);

  const started = await app.dispatch({ type: 'KEEPFLIP_LISTING_PAGE', request },
    { url: 'https://keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(started.ok, true);
  assert.deepEqual(app.opened.map((tab) => tab.url), [
    'https://poshmark.com/create-listing', 'https://www.mercari.com/sell/',
  ]);
  assert.equal(app.opened[0].active, true);
  assert.equal(app.opened[1].active, false);

  const poshmark = await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_READY' },
    { url: 'https://poshmark.com/create-listing', tab: { id: 100 } });
  assert.equal(poshmark.ok, true);
  assert.equal(poshmark.payload.marketplace, 'poshmark');
  assert.equal(poshmark.photos.length, 1);
  const otherTab = await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_READY' },
    { url: 'https://poshmark.com/create-listing', tab: { id: 999 } });
  assert.equal(otherTab.ok, false);
  const wrongHost = await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_READY' },
    { url: 'https://www.mercari.com/sell/', tab: { id: 100 } });
  assert.equal(wrongHost.ok, false);

  const postBeforeFill = await app.dispatch({ type: 'KEEPFLIP_LISTING_PAGE', request: {
    source: 'keepflip-webapp', protocol: 1, action: 'LISTING_SUBMIT', runId: request.runId,
    ownerId: request.ownerId, marketplace: 'poshmark',
  } }, { url: 'https://keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(postBeforeFill.ok, false);

  await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_STATUS', runId: request.runId,
    marketplace: 'poshmark', status: 'filled', fields: ['title', 'description', 'price'], uploadedPhotoCount: 1 },
  { url: 'https://poshmark.com/create-listing', tab: { id: 100 } });
  const post = await app.dispatch({ type: 'KEEPFLIP_LISTING_PAGE', request: {
    source: 'keepflip-webapp', protocol: 1, action: 'LISTING_SUBMIT', runId: request.runId,
    ownerId: request.ownerId, marketplace: 'poshmark',
  } }, { url: 'https://keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(post.ok, true);
  assert.ok(app.sent.some(({ id, message }) => id === 100 && message.type === 'KEEPFLIP_LISTING_SUBMIT'));

  await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_STATUS', runId: request.runId,
    marketplace: 'poshmark', status: 'submit_clicked' },
  { url: 'https://poshmark.com/create-listing', tab: { id: 100 } });
  await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_STATUS', runId: request.runId,
    marketplace: 'poshmark', status: 'confirmed' },
  { url: 'https://poshmark.com/listing/vintage-jacket-123', tab: { id: 100 } });
  assert.ok(app.sent.some(({ id, message }) => id === 7 && message.status?.status === 'confirmed'));
});
