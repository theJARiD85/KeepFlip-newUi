/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const listeners = [];
  const externalListeners = [];
  const opened = [];
  const navigationSnapshots = [];
  const sent = [];
  const records = new Map();
  const tabs = new Map();
  let nextTabId = 100;
  const chrome = {
    runtime: {
      onMessage: { addListener: (listener) => listeners.push(listener) },
      onMessageExternal: { addListener: (listener) => externalListeners.push(listener) },
    },
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
      update: async (id, options) => {
        Object.assign(tabs.get(id), options);
        const openedTab = opened.find((candidate) => candidate.id === id);
        if (openedTab) Object.assign(openedTab, options);
        if (options.url && options.url !== 'about:blank') {
          navigationSnapshots.push(structuredClone(records.get('keepflipListingRun')));
        }
        return tabs.get(id);
      },
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
  async function dispatchExternal(message, sender) {
    return new Promise((resolve) => {
      const accepted = externalListeners[0](message, sender, resolve);
      assert.equal(accepted, true);
    });
  }
  return { dispatch, dispatchExternal, opened, navigationSnapshots, sent, records, tabs };
}

function listingPayload(marketplace) {
  return { version: 1, marketplace, title: 'Vintage jacket', description: 'Good condition',
    price: '85.00', category: 'Jackets', condition: 'Good', brand: 'Harley Davidson',
    size: 'L', color: 'Black', photoCount: 1, platformFields: {} };
}

test('the unpacked manifest points to bundled scripts and does not request cookie access', () => {
  const extensionDirectory = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher');
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDirectory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.ok(manifest.host_permissions.includes('https://app.keep-flip.com/*'));
  assert.deepEqual(manifest.externally_connectable.matches, [
    'https://keep-flip.com/crosslisting', 'https://keep-flip.com/crosslisting/*',
    'https://www.keep-flip.com/crosslisting', 'https://www.keep-flip.com/crosslisting/*',
    'https://app.keep-flip.com/*',
    'http://localhost:8081/*', 'http://127.0.0.1:8081/*',
  ]);
  const bridgeScript = manifest.content_scripts.find((entry) => entry.js.includes('content_scripts/webapp_bridge.js'));
  assert.ok(bridgeScript.matches.includes('https://keep-flip.com/*'));
  assert.ok(bridgeScript.matches.includes('https://www.keep-flip.com/*'));
  assert.ok(bridgeScript.matches.includes('https://app.keep-flip.com/*'));
  for (const entry of manifest.content_scripts) {
    for (const script of entry.js) assert.equal(fs.existsSync(path.join(extensionDirectory, script)), true, script);
  }
  assert.equal(fs.existsSync(path.join(extensionDirectory, 'listing-background.js')), true);
});

test('marketplace listing actions share pointer and mouse event activation', () => {
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  const source = fs.readFileSync(runnerPath, 'utf8');
  const directClickOffsets = Array.from(source.matchAll(/\b[A-Za-z_$][\w$]*\.click\(\)/g), (match) => match.index);
  const activationHelperStart = source.indexOf('function clickMarketplaceControl(control)');
  const activationHelperEnd = source.indexOf('\n  function findFacebookShippingOptionsDialog', activationHelperStart);
  const facebookLabelActivationStart = source.indexOf('function clickFacebookShippingLabelButton(button)');
  const facebookLabelActivationEnd = source.indexOf('\n  async function waitForFacebookShippingOptionsDialog', facebookLabelActivationStart);
  const facebookLabelFallbackStart = source.indexOf('async function openFacebookShippingOptions(button)');
  const facebookLabelFallbackEnd = source.indexOf('\n  async function waitForFacebookShippingLabelButton', facebookLabelFallbackStart);
  const allowedActivationRanges = [
    [activationHelperStart, activationHelperEnd],
    [facebookLabelActivationStart, facebookLabelActivationEnd],
    [facebookLabelFallbackStart, facebookLabelFallbackEnd],
  ];

  assert.match(source, /function clickMarketplaceControl\(control\)/);
  assert.match(source, /\['pointerdown', 1\], \['mousedown', 1\], \['pointerup', 0\], \['mouseup', 0\], \['click', 0\]/);
  assert.ok(directClickOffsets.length >= 1);
  assert.ok(directClickOffsets.every((offset) => allowedActivationRanges.some(([start, end]) => offset > start && offset < end)));
});

test('Facebook shipping controls use labels instead of generated mount selectors', () => {
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  const source = fs.readFileSync(runnerPath, 'utf8');
  const facebookSelectors = Array.from(source.matchAll(/const facebook(?:ItemForSale|PackageWeight|ExactWeightButton)Selector = '([^']+)'/g),
    (match) => match[1]);

  assert.equal(facebookSelectors.length, 1);
  assert.ok(facebookSelectors.every((selector) => selector.startsWith('[id^="mount_0_0_"]')));
  assert.doesNotMatch(source, /facebookPackageWeightSelector|facebookExactWeightButtonSelector/);
  assert.doesNotMatch(source, /#mount_0_0_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(source, /facebookShippingLabelSelector/);
  const finderStart = source.indexOf('function findFacebookShippingLabelButton');
  const finderEnd = source.indexOf('\n  function clickFacebookShippingLabelButton', finderStart);
  const finder = source.slice(finderStart, finderEnd);
  assert.match(finder, /querySelectorAll\('span'\)/);
  assert.match(finder, /closest\?\.\('\[role="button"\]'\)/);
  assert.doesNotMatch(finder, /mount_0_0_|document\.querySelector\(/);
});

test('the external web bridge replies to KeepFlip origins and rejects other sites', async () => {
  const app = harness();
  const request = { source: 'keepflip-webapp', protocol: 1, action: 'HELLO', ownerId: 'owner-1', itemId: 'item-1' };
  const untrusted = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://example.com/listing', tab: { id: 7 } });
  assert.equal(untrusted.ok, false);

  const trusted = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(trusted.ok, true);
  assert.equal(trusted.run, null);

  const otherKeepFlipPage = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://keep-flip.com/inventory', tab: { id: 7 } });
  assert.equal(otherKeepFlipPage.ok, false);

  const similarPath = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://keep-flip.com/crosslisting-old', tab: { id: 7 } });
  assert.equal(similarPath.ok, false);

  const nestedCrosslisting = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://keep-flip.com/crosslisting/item', tab: { id: 7 } });
  assert.equal(nestedCrosslisting.ok, true);

  const appSubdomain = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://app.keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(appSubdomain.ok, true);
  const otherAppSubdomainPage = await app.dispatchExternal({ type: 'KEEPFLIP_LISTING_EXTERNAL', request },
    { url: 'https://app.keep-flip.com/dashboard', tab: { id: 7 } });
  assert.equal(otherAppSubdomainPage.ok, true);
});

test('the injected page bridge ignores other routes and handles the crosslisting route after SPA navigation', () => {
  const handlers = {};
  const sent = [];
  const posted = [];
  const location = { origin: 'https://keep-flip.com', pathname: '/inventory' };
  const window = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    postMessage: (message, targetOrigin) => posted.push({ message, targetOrigin }),
  };
  const chrome = {
    runtime: {
      id: 'keepflip-test-extension',
      lastError: undefined,
      onMessage: { addListener: (handler) => { handlers.status = handler; } },
      sendMessage: (message, callback) => { sent.push(message); callback({ ok: true }); },
    },
  };
  const bridgePath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'webapp_bridge.js');
  vm.runInNewContext(fs.readFileSync(bridgePath, 'utf8'), { chrome, location, window, Set });
  const event = { source: window, origin: location.origin,
    data: { source: 'keepflip-webapp', protocol: 1, requestId: 'request-1', action: 'HELLO' } };

  handlers.message(event);
  assert.equal(sent.length, 0);

  location.pathname = '/crosslisting';
  handlers.message(event);
  assert.equal(sent.length, 1);
  assert.equal(posted.at(-1)?.message.action, 'RESPONSE');
  assert.equal(posted.at(-1)?.targetOrigin, location.origin);

  const appHandlers = {};
  const appSent = [];
  const appPosted = [];
  const appLocation = { origin: 'https://app.keep-flip.com', pathname: '/crosslisting' };
  const appWindow = {
    addEventListener: (type, handler) => { appHandlers[type] = handler; },
    postMessage: (message, targetOrigin) => appPosted.push({ message, targetOrigin }),
  };
  const appChrome = {
    runtime: {
      id: 'keepflip-test-extension',
      lastError: undefined,
      onMessage: { addListener: (handler) => { appHandlers.status = handler; } },
      sendMessage: (message, callback) => { appSent.push(message); callback({ ok: true }); },
    },
  };
  vm.runInNewContext(fs.readFileSync(bridgePath, 'utf8'), { chrome: appChrome, location: appLocation, window: appWindow, Set });
  appHandlers.message({ source: appWindow, origin: appLocation.origin,
    data: { source: 'keepflip-webapp', protocol: 1, requestId: 'request-2', action: 'HELLO' } });
  assert.equal(appSent.length, 1);
  assert.equal(appPosted.at(-1)?.message.action, 'RESPONSE');
  appLocation.pathname = '/dashboard';
  appHandlers.message({ source: appWindow, origin: appLocation.origin,
    data: { source: 'keepflip-webapp', protocol: 1, requestId: 'request-3', action: 'HELLO' } });
  assert.equal(appSent.length, 2);

  const staleHandlers = {};
  const stalePosted = [];
  const staleWindow = {
    addEventListener: (type, handler) => { staleHandlers[type] = handler; },
    postMessage: (message, targetOrigin) => stalePosted.push({ message, targetOrigin }),
  };
  const staleChrome = {
    runtime: {
      id: 'keepflip-test-extension',
      onMessage: { addListener: (handler) => { staleHandlers.status = handler; } },
      sendMessage: () => { throw new Error('Extension context invalidated.'); },
    },
  };
  vm.runInNewContext(fs.readFileSync(bridgePath, 'utf8'), {
    chrome: staleChrome, location: appLocation, window: staleWindow, Set,
  });
  assert.doesNotThrow(() => staleHandlers.message({ source: staleWindow, origin: appLocation.origin,
    data: { source: 'keepflip-webapp', protocol: 1, requestId: 'request-stale', action: 'HELLO' } }));
  assert.match(stalePosted.at(-1)?.message.error || '', /reload the extension.*refresh this page/i);

  const callbackHandlers = {};
  const callbackPosted = [];
  const callbackWindow = {
    addEventListener: (type, handler) => { callbackHandlers[type] = handler; },
    postMessage: (message, targetOrigin) => callbackPosted.push({ message, targetOrigin }),
  };
  const callbackChrome = {
    runtime: {
      id: 'keepflip-test-extension',
      get lastError() { throw new Error('Extension context invalidated.'); },
      onMessage: { addListener: (handler) => { callbackHandlers.status = handler; } },
      sendMessage: (_message, callback) => callback({ ok: true }),
    },
  };
  vm.runInNewContext(fs.readFileSync(bridgePath, 'utf8'), {
    chrome: callbackChrome, location: appLocation, window: callbackWindow, Set,
  });
  assert.doesNotThrow(() => callbackHandlers.message({ source: callbackWindow, origin: appLocation.origin,
    data: { source: 'keepflip-webapp', protocol: 1, requestId: 'request-callback', action: 'HELLO' } }));
  assert.match(callbackPosted.at(-1)?.message.error || '', /reload the extension.*refresh this page/i);
});

test('the extension binds a listing run to KeepFlip and its marketplace tabs', async () => {
  const app = harness();
  const request = { source: 'keepflip-webapp', protocol: 1, action: 'LISTING_START',
    runId: 'run-123456789012', itemId: 'item-1', ownerId: 'owner-1',
    jobs: [
      { marketplace: 'poshmark', payload: listingPayload('poshmark') },
      { marketplace: 'mercari', payload: listingPayload('mercari') },
      { marketplace: 'facebookMarketplace', payload: listingPayload('facebookMarketplace') },
      { marketplace: 'offerUp', payload: listingPayload('offerUp') },
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
    'https://www.facebook.com/marketplace/create/',
    'https://offerup.com/',
  ]);
  assert.equal(app.opened[0].active, false);
  assert.equal(app.opened[1].active, false);
  assert.equal(app.opened[2].active, false);
  assert.equal(app.opened[3].active, false);
  const focused = await app.dispatch({ type: 'KEEPFLIP_LISTING_PAGE', request: {
    source: 'keepflip-webapp', protocol: 1, action: 'LISTING_FOCUS', ownerId: 'owner-1',
    runId: 'run-123456789012', marketplace: 'facebookMarketplace',
  } }, { url: 'https://keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(focused.ok, true);
  assert.equal(app.opened[2].active, true, 'the user can still bring a marketplace tab forward for sign-in or review');
  assert.equal(app.navigationSnapshots.length, 4);
  for (const snapshot of app.navigationSnapshots) {
    assert.ok(snapshot.jobs.every((job) => Number.isInteger(job.tabId)),
      'all marketplace tab assignments must be saved before marketplace pages load');
  }

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
  const facebook = await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_READY' },
    { url: 'https://www.facebook.com/marketplace/create/', tab: { id: 102 } });
  assert.equal(facebook.ok, true);
  assert.equal(facebook.payload.marketplace, 'facebookMarketplace');
  const offerUp = await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_READY' },
    { url: 'https://offerup.com/', tab: { id: 103 } });
  assert.equal(offerUp.ok, true);
  assert.equal(offerUp.payload.marketplace, 'offerUp');

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

test('OfferUp opens its Sell popup before filling the listing form', async () => {
  let sellMenuOpen = false;
  let popupOpen = false;
  let sellClicks = 0;
  let postItemClicks = 0;
  let uploadChanges = 0;
  const statuses = [];
  const makeField = (name, tagName, placeholder = '') => ({
    name, id: name, type: 'text', value: '', tagName, placeholder, labels: [], disabled: false, readOnly: false,
    isContentEditable: false,
    getAttribute: (attribute) => ({ name, id: name, placeholder })[attribute] || null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    dispatchEvent: () => undefined,
    blur: () => undefined,
    closest: () => null,
  });
  const fields = [
    makeField('title', 'INPUT'),
    makeField('description', 'TEXTAREA', 'Items with a detailed description sell faster!'),
    makeField('price', 'INPUT'),
  ];
  const sellButton = {
    disabled: false,
    innerText: '',
    textContent: '',
    getAttribute: (attribute) => attribute === 'aria-disabled' ? null : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
    click: () => { sellClicks += 1; sellMenuOpen = true; },
  };
  const postItemButton = {
    disabled: false,
    innerText: 'Post an item',
    textContent: 'Post an item',
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 140, height: 44 }),
    click: () => { postItemClicks += 1; sellMenuOpen = false; popupOpen = true; },
  };
  const fileInput = {
    accept: 'image/jpeg,image/png,image/webp',
    multiple: true,
    files: [],
    getAttribute: (attribute) => attribute === 'accept' ? 'image/jpeg,image/png,image/webp' : null,
    closest: () => ({}),
    dispatchEvent: (event) => { if (event.type === 'change') uploadChanges += 1; },
  };
  const document = {
    querySelector: (selector) => selector.includes('HeaderSellButton') || selector.includes('aria-label="Sell"') ? sellButton : null,
    getElementById: () => null,
    querySelectorAll: (selector) => {
      if (selector === 'input[type="file"]') return popupOpen ? [fileInput] : [];
      if (selector === 'a,button,[role="button"],[role="menuitem"]') return sellMenuOpen ? [postItemButton] : [];
      if (!popupOpen) return [];
      if (selector === 'input,textarea,select,[contenteditable="true"]') return fields;
      const fieldName = /name\*="([^"]+)"/i.exec(selector)?.[1]?.toLowerCase();
      if (fieldName) return fields.filter((field) => field.name.toLowerCase().includes(fieldName));
      return [];
    },
  };
  const messages = [];
  const assignment = {
    ok: true,
    jobStatus: 'opened',
    runId: 'offerup-run-123456',
    payload: { title: 'Vintage shelf', description: 'Wood shelf, good condition.', price: '45',
      category: '', condition: '', brand: '', size: '', color: '', photoCount: 1 },
    photos: [{ name: 'keepflip-item-photo-1.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }],
    unavailablePhotoCount: 0,
  };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: () => undefined },
      sendMessage: (message, callback) => {
        if (message.type === 'KEEPFLIP_LISTING_TAB_READY') return Promise.resolve(assignment);
        messages.push(message);
        if (message.type === 'KEEPFLIP_LISTING_TAB_STATUS') statuses.push(message);
        if (callback) callback();
        return Promise.resolve({ ok: true });
      },
    },
  };
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  vm.runInNewContext(fs.readFileSync(runnerPath, 'utf8'), {
    chrome,
    document,
    location: { protocol: 'https:', hostname: 'offerup.com', pathname: '/' },
    Event: class TestEvent {},
    HTMLSelectElement: class HTMLSelectElement {},
    File: class TestFile {
      constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; }
    },
    DataTransfer: class TestDataTransfer {
      constructor() {
        this.files = [];
        this.items = { add: (file) => this.files.push(file) };
      }
    },
    fetch: async () => ({ ok: true, blob: async () => ({ type: 'image/jpeg' }) }),
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeout: () => undefined,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sellClicks, 1);
  assert.equal(postItemClicks, 1);
  assert.deepEqual(fields.map((field) => field.value), ['Vintage shelf', 'Wood shelf, good condition.', '45']);
  assert.equal(fileInput.files.length, 1);
  assert.equal(fileInput.files[0].name, 'keepflip-item-photo-1.jpg');
  assert.equal(uploadChanges, 1);
  assert.equal(statuses.at(-1)?.status, 'filled');
  assert.equal(statuses.at(-1)?.uploadedPhotoCount, 1);
  assert.ok(messages.some((message) => message.type === 'KEEPFLIP_LISTING_TAB_STATUS'));
});

async function runFacebookStrollerScenario({ photoMode = 'none', facebookSelectorFallback = false } = {}) {
  let composerOpen = false;
  let createNewListingClicks = 0;
  let itemForSaleClicks = 0;
  let facebookSelectorFallbackUsed = false;
  let vehicleForSaleClicks = 0;
  let metaAiSwitchClicks = 0;
  let moreDetailsClicks = 0;
  let moreDetailsExpanded = false;
  let selectedCategory = 'Household';
  let selectedCondition = '';
  let selectedColor = '';
  let categoryPickerOpen = false;
  let conditionPickerOpen = false;
  let colorPickerOpen = false;
  let householdCategoryClicks = 0;
  let babyCategoryClicks = 0;
  let facebookNextClicks = 0;
  let facebookPublishClicks = 0;
  let fieldsReadyWhenNextClicked = false;
  let attachedPhotoCount = 0;
  let photoChangeEvents = 0;
  let dropEvents = 0;
  const hasPhoto = photoMode !== 'none';
  const acknowledgePhoto = photoMode === 'accepted';
  let facebookLocation = { protocol: 'https:', hostname: 'www.facebook.com', pathname: '/marketplace/create/',
    search: '', href: 'https://www.facebook.com/marketplace/create/' };
  const statuses = [];
  const makeField = (name, tagName, placeholder = '') => ({
    name, id: name, type: 'text', value: '', tagName, placeholder, labels: [], disabled: false, readOnly: false,
    isContentEditable: false,
    getAttribute: (attribute) => ({ name, id: name, placeholder })[attribute] || null,
    getBoundingClientRect: () => ({ width: 220, height: 40 }),
    dispatchEvent: () => undefined,
    blur: () => undefined,
    closest: () => null,
  });
  const coreFields = [
    makeField('title', 'INPUT', 'Title'),
    makeField('description', 'TEXTAREA', 'Description'),
    makeField('price', 'INPUT', 'Price'),
  ];
  const fileInput = {
    accept: 'image/*',
    multiple: true,
    files: [],
    getAttribute: (attribute) => attribute === 'accept' ? 'image/*' : null,
    closest: () => ({}),
    dispatchEvent: (event) => {
      if (event.type === 'change') {
        photoChangeEvents += 1;
        if (acknowledgePhoto) attachedPhotoCount = 1;
      }
    },
  };
  const photoDropZone = {
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Add photos or drag and drop' : null,
    getBoundingClientRect: () => ({ width: 220, height: 90 }),
    dispatchEvent: () => { dropEvents += 1; },
  };
  const detailFields = [
    makeField('material', 'INPUT', 'Material'),
  ];
  const fields = [...coreFields, ...detailFields];
  const categoryCombo = {
    innerText: '',
    textContent: '',
    getAttribute: (attribute) => attribute === 'aria-labelledby' ? 'category-label'
      : attribute === 'aria-expanded' ? String(categoryPickerOpen) : null,
    getBoundingClientRect: () => ({ width: 220, height: 44 }),
    closest: () => null,
    click: () => { categoryPickerOpen = true; },
  };
  Object.defineProperty(categoryCombo, 'innerText', { get: () => `Category ${selectedCategory}` });
  Object.defineProperty(categoryCombo, 'textContent', { get: () => `Category ${selectedCategory}` });
  const makePickerCombo = (name, currentValue, isOpen, setOpen) => {
    const combo = {
      getAttribute: (attribute) => attribute === 'aria-labelledby' ? `${name}-label`
        : attribute === 'aria-expanded' ? String(isOpen()) : null,
      getBoundingClientRect: () => ({ width: 220, height: 44 }),
      closest: () => null,
      click: () => setOpen(true),
    };
    Object.defineProperty(combo, 'innerText', { get: () => `${name} ${currentValue()}` });
    Object.defineProperty(combo, 'textContent', { get: () => `${name} ${currentValue()}` });
    return combo;
  };
  const conditionCombo = makePickerCombo('Condition', () => selectedCondition,
    () => conditionPickerOpen, (value) => { conditionPickerOpen = value; });
  const colorCombo = makePickerCombo('Color', () => selectedColor,
    () => colorPickerOpen, (value) => { colorPickerOpen = value; });
  const makeChoice = (label, onClick, ariaLabel = null) => ({
    disabled: false,
    innerText: label,
    textContent: label,
    getAttribute: (attribute) => attribute === 'aria-label' ? ariaLabel : null,
    getBoundingClientRect: () => ({ width: 180, height: 44 }),
    click: onClick,
  });
  const categorySuggestions = [
    makeChoice('Household', () => { householdCategoryClicks += 1; selectedCategory = 'Household'; }, 'Suggested category: Household'),
    makeChoice('Books, Movies & Music', () => undefined, 'Suggested category: Books, Movies & Music'),
    makeChoice('Arts & Crafts', () => undefined, 'Suggested category: Arts & Crafts'),
  ];
  const suggestedCategories = {
    querySelectorAll: (selector) => selector === '[aria-label^="Suggested category:"]' ? categorySuggestions : [],
  };
  const babyCategoryOption = makeChoice('Baby & Kids', () => {
    babyCategoryClicks += 1;
    selectedCategory = 'Baby & Kids';
  }, 'Baby & Kids');
  const conditionOption = makeChoice('New', () => { selectedCondition = 'New'; }, 'New');
  const colorOption = makeChoice('Champagne', () => { selectedColor = 'Champagne'; }, 'Champagne');
  const moreDetailsButton = {
    disabled: false,
    innerText: 'More details\nAttract more interest by including more details.',
    textContent: 'More details Attract more interest by including more details.',
    getAttribute: (attribute) => attribute === 'aria-expanded' ? String(moreDetailsExpanded) : null,
    getBoundingClientRect: () => ({ width: 300, height: 60 }),
    click: () => { moreDetailsClicks += 1; moreDetailsExpanded = true; },
  };
  const metaAiSwitch = {
    checked: true,
    disabled: false,
    getAttribute: (attribute) => ({
      'aria-label': 'Draft listings with Meta AI',
      'aria-checked': metaAiSwitch.checked ? 'true' : 'false',
    })[attribute] || null,
    click: () => { metaAiSwitchClicks += 1; metaAiSwitch.checked = false; },
  };
  const nextButton = {
    disabled: false,
    innerText: 'Next',
    textContent: 'Next',
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Next' : null,
    getBoundingClientRect: () => ({ width: 120, height: 44 }),
    closest: () => null,
    click: () => {
      facebookNextClicks += 1;
      fieldsReadyWhenNextClicked = coreFields.every((field) => field.value) &&
        selectedCategory === 'Baby & Kids' && selectedCondition === 'New';
      facebookLocation.pathname = '/marketplace/create/item';
      facebookLocation.search = '?step=audience';
      facebookLocation.href = 'https://www.facebook.com/marketplace/create/item?step=audience';
    },
  };
  const publishButton = {
    disabled: false,
    innerText: 'Publish',
    textContent: 'Publish',
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Publish' : null,
    getBoundingClientRect: () => ({ width: 140, height: 44 }),
    closest: () => ({}),
    click: () => {
      facebookPublishClicks += 1;
      facebookLocation.pathname = '/marketplace/item/123456789';
      facebookLocation.href = 'https://www.facebook.com/marketplace/item/123456789';
    },
  };
  const createNewListingLink = makeChoice('Create new listing', () => { createNewListingClicks += 1; });
  const itemForSaleButton = makeChoice(
    'Item for sale\nCreate a single listing for one or more items to sell.',
    () => { itemForSaleClicks += 1; composerOpen = true; },
    facebookSelectorFallback ? 'Create listing choice' : null,
  );
  const vehicleForSaleButton = makeChoice(
    'Vehicle for sale\nSell a car, truck or other type of vehicle.',
    () => { vehicleForSaleClicks += 1; },
  );
  const listingTypeDialog = {
    innerText: 'Create new listing Choose listing type Item for sale Vehicle for sale',
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Create new listing' : null,
    querySelectorAll: (selector) => selector === 'a,button,[role="button"]' && !composerOpen
      ? [itemForSaleButton, vehicleForSaleButton]
      : [],
  };
  const document = {
    querySelector: (selector) => {
      if (facebookSelectorFallback && selector.startsWith('[id^="mount_0_0_"]') && !composerOpen) {
        facebookSelectorFallbackUsed = true;
        return itemForSaleButton;
      }
      if (selector === 'input[type="checkbox"][role="switch"][aria-label="Draft listings with Meta AI"]' && composerOpen) return metaAiSwitch;
      if (selector === '[aria-label="Suggested categories"]' && composerOpen) return suggestedCategories;
      if (hasPhoto && composerOpen && selector.includes('[aria-label*="Add photos" i]')) return photoDropZone;
      return null;
    },
    body: { get innerText() { return `Photos ${attachedPhotoCount} / 10 Videos 0 / 1 ${attachedPhotoCount} photo${attachedPhotoCount === 1 ? '' : 's'} attached`; } },
    getElementById: (id) => ({ textContent: id === 'category-label' ? 'Category'
      : id === 'Condition-label' ? 'Condition' : id === 'Color-label' ? 'Color' : '' }),
    querySelectorAll: (selector) => {
      if (selector === 'input[type="file"]') return hasPhoto && composerOpen ? [fileInput] : [];
      if (selector === '[role="dialog"]') return composerOpen ? [] : [listingTypeDialog];
      if (selector === '[role="combobox"]') return composerOpen ? [categoryCombo, conditionCombo, colorCombo] : [];
      if (selector === '[role="listbox"] [role="option"], [role="option"]') {
        return [...(conditionPickerOpen ? [conditionOption] : []), ...(colorPickerOpen ? [colorOption] : [])];
      }
      if (selector === '[role="option"], [role="menuitem"], [role="button"]') {
        return categoryPickerOpen ? [babyCategoryOption] : [];
      }
      if (selector === 'a,button,[role="button"]') {
        return composerOpen ? [] : [createNewListingLink, itemForSaleButton, vehicleForSaleButton];
      }
      if (selector === 'button,[role="button"]') {
        if (!composerOpen) return [];
        if (!moreDetailsExpanded) return [moreDetailsButton];
        return facebookNextClicks ? [publishButton] : [nextButton];
      }
      if (selector === 'button,input[type="submit"],[role="button"]') {
        if (!composerOpen || !moreDetailsExpanded) return [];
        return facebookNextClicks ? [publishButton] : [nextButton];
      }
      if (!composerOpen) return [];
      const availableFields = moreDetailsExpanded ? fields : coreFields;
      if (selector === 'input,textarea,select,[contenteditable="true"]') return availableFields;
      const fieldName = /name\*="([^"]+)"/i.exec(selector)?.[1]?.toLowerCase();
      const placeholder = /placeholder\*="([^"]+)"/i.exec(selector)?.[1]?.toLowerCase();
      if (fieldName) return availableFields.filter((field) => field.name.toLowerCase().includes(fieldName));
      if (placeholder) return availableFields.filter((field) => field.placeholder.toLowerCase().includes(placeholder));
      return [];
    },
  };
  const assignment = {
    ok: true,
    jobStatus: 'opened',
    runId: 'facebook-run-123456',
    payload: { title: 'Evenflo Transformer Stroller', description: 'New Evenflo stroller, factory sealed.', price: '450',
      category: 'Baby & Toddler Gear', condition: 'New', brand: 'Evenflo', size: 'One Size', color: 'Champagne',
      photoCount: hasPhoto ? 1 : 0, platformFields: { material: 'Plastic', era: 'Modern' } },
    photos: hasPhoto ? [{ name: 'stroller.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }] : [],
    unavailablePhotoCount: 0,
  };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: () => undefined },
      sendMessage: (message, callback) => {
        if (message.type === 'KEEPFLIP_LISTING_TAB_READY') return Promise.resolve(assignment);
        if (message.type === 'KEEPFLIP_LISTING_TAB_STATUS') statuses.push(message);
        if (callback) callback();
        return Promise.resolve({ ok: true });
      },
    },
  };
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  vm.runInNewContext(fs.readFileSync(runnerPath, 'utf8'), {
    chrome,
    document,
    location: facebookLocation,
    window: { HTMLInputElement: class HTMLInputElement {}, HTMLTextAreaElement: class HTMLTextAreaElement {} },
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    Event: class TestEvent { constructor(type) { this.type = type; } },
    HTMLSelectElement: class HTMLSelectElement {},
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeout: () => undefined,
    setInterval: (callback) => { queueMicrotask(callback); return 1; },
    clearInterval: () => undefined,
    DataTransfer: class TestDataTransfer {
      constructor() {
        this.files = [];
        this.items = { add: (file) => this.files.push(file) };
      }
    },
    DragEvent: class TestDragEvent {
      constructor(type) { this.type = type; }
    },
    File: class TestFile {
      constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; }
    },
    fetch: async () => ({ ok: true, blob: async () => ({ type: 'image/jpeg' }) }),
    console,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  return { createNewListingClicks, itemForSaleClicks, facebookSelectorFallbackUsed, vehicleForSaleClicks, moreDetailsClicks,
    metaAiSwitchClicks, metaAiSwitch, householdCategoryClicks, babyCategoryClicks, selectedCategory,
    selectedCondition, selectedColor, fields, fieldsReadyWhenNextClicked, facebookNextClicks,
    facebookPublishClicks, facebookLocation, statuses, fileInput, photoChangeEvents, dropEvents,
    attachedPhotoCount };
}

test('Facebook selects a stroller category and advances when optional fields are unavailable', async () => {
  const result = await runFacebookStrollerScenario();
  const { statuses, facebookLocation } = result;
  assert.equal(result.createNewListingClicks, 0);
  assert.equal(result.itemForSaleClicks, 1);
  assert.equal(result.vehicleForSaleClicks, 0);
  assert.equal(result.moreDetailsClicks, 1);
  assert.equal(result.metaAiSwitchClicks, 1);
  assert.equal(result.metaAiSwitch.checked, false);
  assert.equal(result.householdCategoryClicks, 0);
  assert.equal(result.babyCategoryClicks, 1);
  assert.equal(result.selectedCategory, 'Baby & Kids');
  assert.equal(result.selectedCondition, 'New');
  assert.equal(result.selectedColor, 'Champagne');
  assert.deepEqual(result.fields.map((field) => field.value), [
    'Evenflo Transformer Stroller', 'New Evenflo stroller, factory sealed.', '450', 'Plastic',
  ]);
  assert.equal(result.fieldsReadyWhenNextClicked, true);
  assert.equal(result.facebookNextClicks, 1);
  assert.equal(result.facebookPublishClicks, 0);
  assert.ok(statuses.some((status) => status.status === 'filled'));
  assert.ok(!statuses.some((status) => status.status === 'submit_clicked'));
  assert.equal(statuses.at(-1)?.status, 'filled');
  assert.equal(facebookLocation.search, '?step=audience');
});

test('Facebook clicks the supplied item-for-sale card selector when its semantic label is unavailable', async () => {
  const result = await runFacebookStrollerScenario({ facebookSelectorFallback: true });
  assert.equal(result.facebookSelectorFallbackUsed, true);
  assert.equal(result.itemForSaleClicks, 1);
  assert.equal(result.vehicleForSaleClicks, 0);
  assert.equal(result.facebookNextClicks, 1);
  assert.equal(result.facebookPublishClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'filled');
});

test('Facebook adds selected image files and waits for the photo count before advancing', async () => {
  const result = await runFacebookStrollerScenario({ photoMode: 'accepted' });
  assert.equal(result.fileInput.files.length, 1);
  assert.equal(result.fileInput.files[0].name, 'stroller.jpg');
  assert.equal(result.photoChangeEvents, 1);
  assert.equal(result.attachedPhotoCount, 1);
  assert.equal(result.dropEvents, 0);
  assert.equal(result.facebookNextClicks, 1);
  assert.equal(result.statuses.find((status) => status.status === 'filled')?.uploadedPhotoCount, 1);
  assert.equal(result.statuses.at(-1)?.status, 'filled');
});

test('Facebook does not report success or advance when its photo upload remains at zero', async () => {
  const result = await runFacebookStrollerScenario({ photoMode: 'ignored' });
  assert.equal(result.fileInput.files.length, 1);
  assert.equal(result.photoChangeEvents, 1);
  assert.equal(result.attachedPhotoCount, 0);
  assert.equal(result.dropEvents, 0);
  assert.equal(result.facebookNextClicks, 0);
  assert.equal(result.facebookPublishClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.equal(result.statuses.at(-1)?.uploadedPhotoCount, 0);
  assert.match(result.statuses.at(-1)?.message || '', /did not confirm the item photos/i);
});

async function runFacebookFinalStepsScenario(startStep = 'offer', minimumOfferPrice = null,
  { offerSwitchAppearsAfterChecks = 0, publishButtonAppearsAfterChecks = 0 } = {}) {
  const statuses = [];
  const listeners = [];
  const location = { protocol: 'https:', hostname: 'www.facebook.com', pathname: '/marketplace/create/item',
    search: `?step=${startStep}`, href: `https://www.facebook.com/marketplace/create/item?step=${startStep}` };
  let offersChecked = true;
  let offerClicks = 0;
  let nextClicks = 0;
  let publishClicks = 0;
  let offerSwitchLookupChecks = 0;
  let publishButtonLookupChecks = 0;
  const rect = () => ({ width: 180, height: 44 });
  const offerSwitch = {
    get checked() { return offersChecked; },
    getAttribute: (key) => key === 'aria-label' ? 'Let buyers negotiate a price equal to or above the minimum price you set.'
      : key === 'aria-checked' ? String(offersChecked) : null,
    getBoundingClientRect: rect,
    click: () => { offersChecked = !offersChecked; offerClicks += 1; },
  };
  const offerInput = {
    type: 'text', tagName: 'INPUT', value: '$138', labels: [], disabled: false, readOnly: false,
    getAttribute: () => null,
    getBoundingClientRect: rect,
    closest: (selector) => selector === 'label' ? { textContent: "Minimum price you'll consider" } : null,
    dispatchEvent: () => undefined,
    blur: () => undefined,
  };
  const nextButton = {
    disabled: false,
    getAttribute: (key) => key === 'aria-label' ? 'Next' : null,
    getBoundingClientRect: rect,
    click: () => {
      nextClicks += 1;
      location.search = '?step=audience';
      location.href = 'https://www.facebook.com/marketplace/create/item?step=audience';
    },
  };
  const publishButton = {
    disabled: false,
    getAttribute: (key) => key === 'aria-label' ? 'Publish' : null,
    getBoundingClientRect: rect,
    closest: () => ({}),
    click: () => { publishClicks += 1; },
  };
  const document = {
    querySelector: () => null,
    getElementById: () => null,
    querySelectorAll: (selector) => {
      if (selector === '[role="switch"]') {
        offerSwitchLookupChecks += 1;
        return location.search === '?step=offer' && offerSwitchLookupChecks >= offerSwitchAppearsAfterChecks ? [offerSwitch] : [];
      }
      if (selector === 'input[type="text"]') return location.search === '?step=offer' && offersChecked ? [offerInput] : [];
      if (selector === 'button,[role="button"]') return location.search === '?step=offer' ? [nextButton] : [publishButton];
      if (selector === 'button,input[type="submit"],[role="button"]') {
        publishButtonLookupChecks += 1;
        return location.search === '?step=audience' && publishButtonLookupChecks >= publishButtonAppearsAfterChecks ? [publishButton] : [];
      }
      return [];
    },
  };
  const payload = listingPayload('facebookMarketplace');
  payload.platformFields.allowOffers = String(minimumOfferPrice != null);
  if (minimumOfferPrice != null) payload.platformFields.minimumOfferPrice = String(minimumOfferPrice);
  const assignment = { ok: true, runId: 'facebook-final-run-123456', jobStatus: 'opened',
    payload, photos: [], unavailablePhotoCount: 0 };
  const chrome = { runtime: {
    onMessage: { addListener: (listener) => listeners.push(listener) },
    sendMessage: async (message) => message.type === 'KEEPFLIP_LISTING_TAB_READY'
      ? assignment : (statuses.push(message), { ok: true }),
  } };
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  vm.runInNewContext(fs.readFileSync(runnerPath, 'utf8'), {
    chrome, document, location, console,
    HTMLSelectElement: class HTMLSelectElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    window: { HTMLInputElement: class HTMLInputElement {}, HTMLTextAreaElement: class HTMLTextAreaElement {} },
    Event: class TestEvent { constructor(type) { this.type = type; } },
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  for (let attempt = 0; attempt < 20 && !statuses.some((status) => status.status === 'filled'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return {
    statuses, location,
    get offerSwitchLookupChecks() { return offerSwitchLookupChecks; },
    get publishButtonLookupChecks() { return publishButtonLookupChecks; },
    get offersChecked() { return offersChecked; },
    get offerClicks() { return offerClicks; },
    get minimumOfferValue() { return offerInput.value; },
    get nextClicks() { return nextClicks; },
    get publishClicks() { return publishClicks; },
    submit: async () => {
      listeners[0]({ type: 'KEEPFLIP_LISTING_SUBMIT', runId: assignment.runId, marketplace: 'facebookMarketplace' });
      for (let attempt = 0; attempt < 20 && !statuses.some((status) => status.status === 'submit_clicked'); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

test('Facebook disables default half-price offers and stops at final review without publishing', async () => {
  const result = await runFacebookFinalStepsScenario();
  assert.equal(result.offersChecked, false);
  assert.equal(result.offerClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.equal(result.location.search, '?step=audience');
  assert.equal(result.publishClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'filled');
  assert.match(result.statuses.at(-1)?.message || '', /final review/i);
});

test('Facebook waits for offer and final review controls after each URL change', async () => {
  const result = await runFacebookFinalStepsScenario('offer', null, {
    offerSwitchAppearsAfterChecks: 5,
    publishButtonAppearsAfterChecks: 5,
  });

  assert.ok(result.offerSwitchLookupChecks >= 5);
  assert.ok(result.publishButtonLookupChecks >= 5);
  assert.equal(result.nextClicks, 1);
  assert.equal(result.publishClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'filled');
});

test('Facebook publishes only after KeepFlip sends the separate Post listing action', async () => {
  const result = await runFacebookFinalStepsScenario('audience');
  assert.equal(result.publishClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'filled');
  await result.submit();
  assert.equal(result.publishClicks, 1);
  assert.equal(result.statuses.at(-1)?.status, 'submit_clicked');
});

test('Facebook keeps offers enabled only when KeepFlip provides a valid minimum', async () => {
  const result = await runFacebookFinalStepsScenario('offer', 70);
  assert.equal(result.offersChecked, true);
  assert.equal(result.offerClicks, 0);
  assert.equal(result.minimumOfferValue, '70');
  assert.equal(result.nextClicks, 1);
  assert.equal(result.publishClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'filled');
});

test('Facebook applies an explicit shipping and pickup choice, then opens the shipping label picker', async () => {
  let deliveryMenuOpen = false;
  let shippingSelected = false;
  let localPickupSelected = false;
  let shippingOptionClicks = 0;
  let localPickupOptionClicks = 0;
  let shippingLabelClicks = 0;
  let nextClicks = 0;
  const statuses = [];
  const currentDeliveryText = () => {
    const selections = [shippingSelected ? 'Shipping' : '', localPickupSelected ? 'Local pickup' : ''].filter(Boolean);
    return selections.join(' & ');
  };
  const deliveryCombo = {
    disabled: false,
    name: '',
    id: 'delivery-method',
    getAttribute: (attribute) => attribute === 'aria-labelledby' ? 'delivery-label'
      : attribute === 'aria-expanded' ? String(deliveryMenuOpen) : null,
    getBoundingClientRect: () => ({ width: 260, height: 44 }),
    closest: () => null,
    click: () => { deliveryMenuOpen = !deliveryMenuOpen; },
  };
  Object.defineProperty(deliveryCombo, 'innerText', { get: () => `Delivery method ${currentDeliveryText()}` });
  Object.defineProperty(deliveryCombo, 'textContent', { get: () => `Delivery method ${currentDeliveryText()}` });
  const shippingOption = {
    disabled: false,
    innerText: 'Shipping. Buyers pay for shipping. We provide the prepaid shipping labels.',
    textContent: 'Shipping. Buyers pay for shipping. We provide the prepaid shipping labels.',
    getAttribute: (attribute) => attribute === 'role' ? 'option' : null,
    getBoundingClientRect: () => ({ width: 260, height: 48 }),
    click: () => { shippingOptionClicks += 1; shippingSelected = !shippingSelected; },
  };
  const localPickupOption = {
    disabled: false,
    innerText: 'Local pickup',
    textContent: 'Local pickup',
    getAttribute: (attribute) => attribute === 'role' ? 'option' : null,
    getBoundingClientRect: () => ({ width: 260, height: 48 }),
    click: () => { localPickupOptionClicks += 1; localPickupSelected = !localPickupSelected; },
  };
  const shippingLabelButton = {
    disabled: false,
    innerText: 'Select shipping label',
    textContent: 'Select shipping label',
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 260, height: 44 }),
    click: () => { shippingLabelClicks += 1; },
  };
  const nextButton = {
    disabled: true,
    innerText: 'Next',
    textContent: 'Next',
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Next' : null,
    getBoundingClientRect: () => ({ width: 120, height: 44 }),
    click: () => { nextClicks += 1; },
  };
  const document = {
    getElementById: (id) => ({ textContent: id === 'delivery-label' ? 'Delivery method' : '' }),
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === '[role="combobox"]') return [deliveryCombo];
      if (selector === '[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="checkbox"],[role="radio"],[role="button"],button') {
        return deliveryMenuOpen ? [shippingOption, localPickupOption] : [];
      }
      if (selector === 'button,[role="button"]' || selector === 'button,input[type="submit"],[role="button"]') {
        return [shippingLabelButton, nextButton];
      }
      return [];
    },
  };
  const assignment = {
    ok: true,
    jobStatus: 'opened',
    runId: 'facebook-delivery-run-123456',
    payload: { title: 'Baby stroller', description: 'Stroller in good condition.', price: '80', photoCount: 0,
      platformFields: { deliveryMethod: 'shipping_and_local_pickup' } },
    photos: [],
    unavailablePhotoCount: 0,
  };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: () => undefined },
      sendMessage: (message) => {
        if (message.type === 'KEEPFLIP_LISTING_TAB_READY') return Promise.resolve(assignment);
        if (message.type === 'KEEPFLIP_LISTING_TAB_STATUS') statuses.push(message);
        return Promise.resolve({ ok: true });
      },
    },
  };
  const location = {
    protocol: 'https:',
    hostname: 'www.facebook.com',
    pathname: '/marketplace/create/item',
    search: '?step=delivery',
    href: 'https://www.facebook.com/marketplace/create/item?step=delivery',
  };
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  vm.runInNewContext(fs.readFileSync(runnerPath, 'utf8'), {
    chrome,
    document,
    location,
    Event: class TestEvent {},
    HTMLSelectElement: class HTMLSelectElement {},
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeout: () => undefined,
    setInterval: (callback) => { queueMicrotask(callback); return 1; },
    clearInterval: () => undefined,
    console,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(shippingSelected, true);
  assert.equal(localPickupSelected, true);
  assert.equal(shippingOptionClicks, 1);
  assert.equal(localPickupOptionClicks, 1);
  assert.equal(deliveryMenuOpen, false);
  assert.equal(shippingLabelClicks, 1);
  assert.equal(nextClicks, 0);
  assert.equal(statuses.at(-1)?.status, 'needs_review');
  assert.match(statuses.at(-1)?.message || '', /found Select shipping label and tried a DOM click/i);
});

async function runFacebookShippingOptionsScenario({ runId, platformFields, selectedWeight = null,
  shippingDialogInitiallyOpen = false, hideDeliveryMenuWhileDialogOpen = false,
  shippingDialogFoundByFallback = false, shippingLabelAriaLabel = 'Select shipping label',
  deliveryComboAppearsAfterChecks = 0,
  shippingLabelAppearsAfterChecks = 0,
  shippingDialogOpensAfterChecks = 0, weightOptionsOpenAfterChecks = 0,
  hidePackageWeightCombobox = false,
  exactWeightEntry = false, exactWeightInputAppearsAfterChecks = 0,
  shippingLabelVisibleText = 'Select shipping label',
  shippingDialogOpensOnSyntheticClick = true, shippingDialogOpensOnDomClick = true,
  packageWeightSelectorFallback = false, exactWeightSelectorFallback = false,
  exactWeightButtonLabel = 'Enter exact weight', carrierAvailable = true,
  nextDisabled = false }) {
  let deliveryMenuOpen = false;
  let deliveryMenuClicks = 0;
  let weightMenuOpen = false;
  let shippingDialogOpen = shippingDialogInitiallyOpen;
  let shippingDialogLookupChecks = 0;
  let weightOptionsLookupChecks = 0;
  let weightChoiceCommitted = false;
  let exactWeightModeOpen = false;
  let exactWeightInputLookupChecks = 0;
  let exactWeightClicks = 0;
  let exactWeightDoneClicks = 0;
  let exactWeightSelectorUsed = false;
  let exactWeightInputsWhenDone = null;
  let exactWeightLabel = '';
  let packageWeightClicks = 0;
  let packageWeightSelectorUsed = false;
  let packageWeightTargetClicks = 0;
  let shippingLabelClicks = 0;
  let shippingLabelDomClicks = 0;
  let shippingLabelLookupChecks = 0;
  let deliveryComboLookupChecks = 0;
  const shippingLabelEventTypes = [];
  const shippingLabelEventDetails = [];
  const shippingLabelClosestSelectors = [];
  let shippingCostChecked = false;
  let shippingCostClicks = 0;
  let updateClicks = 0;
  let nextClicks = 0;
  let simulatedWaitMs = 0;
  const shippingActions = [];
  const weightWorkflowActions = [];
  const statuses = [];
  const deliveryCombo = {
    disabled: false,
    name: '',
    id: 'delivery-method',
    getAttribute: (attribute) => attribute === 'aria-labelledby' ? 'delivery-label'
      : attribute === 'aria-expanded' ? String(deliveryMenuOpen) : null,
    getBoundingClientRect: () => ({ width: 260, height: 44 }),
    closest: () => null,
    click: () => { deliveryMenuClicks += 1; deliveryMenuOpen = !deliveryMenuOpen; },
  };
  Object.defineProperty(deliveryCombo, 'innerText', { get: () => 'Delivery method Shipping & local pickup' });
  Object.defineProperty(deliveryCombo, 'textContent', { get: () => 'Delivery method Shipping & local pickup' });
  const packageWeightCombo = {
    disabled: false,
    name: '',
    id: 'package-weight',
    getAttribute: (attribute) => attribute === 'aria-labelledby' ? 'weight-label'
      : attribute === 'aria-expanded' ? String(weightMenuOpen) : null,
    getBoundingClientRect: () => ({ width: 260, height: 44 }),
    closest: () => null,
    click: () => { packageWeightClicks += 1; weightWorkflowActions.push('Package weight'); weightMenuOpen = !weightMenuOpen; },
  };
  Object.defineProperty(packageWeightCombo, 'innerText', { get: () => `Package weight ${exactWeightLabel || selectedWeight || ''}` });
  Object.defineProperty(packageWeightCombo, 'textContent', { get: () => `Package weight ${exactWeightLabel || selectedWeight || ''}` });
  const carrierCombo = {
    disabled: false,
    name: '',
    id: 'shipping-carrier',
    getAttribute: (attribute) => attribute === 'aria-labelledby' ? 'carrier-label' : null,
    getBoundingClientRect: () => ({ width: 260, height: 44 }),
    closest: () => null,
  };
  Object.defineProperty(carrierCombo, 'innerText', { get: () => `Shipping carrier ${carrierAvailable && (exactWeightLabel || selectedWeight) ? 'USPS Ground Advantage ($10.29)' : ''}` });
  Object.defineProperty(carrierCombo, 'textContent', { get: () => `Shipping carrier ${carrierAvailable && (exactWeightLabel || selectedWeight) ? 'USPS Ground Advantage ($10.29)' : ''}` });
  const weightValues = ['Under 0.5 lbs', '0.5-1 lbs', '1-2 lbs', '2-5 lbs', '5-10 lbs', '10-70 lbs'];
  const weightRadios = weightValues.map((value) => {
    let checked = value === selectedWeight;
    const radio = {
      type: 'radio',
      name: 'package_weight_range',
      value,
      get checked() { return checked; },
      set checked(next) { checked = next; },
      getAttribute: (attribute) => attribute === 'aria-checked' ? String(checked)
        : attribute === 'value' ? value : null,
      closest: () => ({ innerText: value, textContent: value }),
      click: () => {
        weightRadios.forEach((other) => { other.checked = false; });
        checked = true;
        selectedWeight = value;
        exactWeightLabel = '';
        weightChoiceCommitted = true;
        weightMenuOpen = false;
      },
    };
    return radio;
  });
  const sellerShippingControl = {
    disabled: false,
    getAttribute: (attribute) => attribute === 'aria-checked' ? String(shippingCostChecked) : null,
    getBoundingClientRect: () => ({ width: 280, height: 44 }),
    closest: () => null,
    innerText: 'Cover the shipping cost so buyers see free shipping.',
    textContent: 'Cover the shipping cost so buyers see free shipping.',
    click: () => { shippingCostClicks += 1; shippingCostChecked = !shippingCostChecked; },
  };
  const updateButton = {
    disabled: false,
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Update' : null,
    getBoundingClientRect: () => ({ width: 90, height: 44 }),
    innerText: 'Update',
    textContent: 'Update',
    click: () => { updateClicks += 1; shippingActions.push('Update'); shippingDialogOpen = false; },
  };
  class MockHTMLInputElement {
    constructor(id, unit) {
      this.type = 'text';
      this.id = id;
      this.name = '';
      this.value = '';
      this.disabled = false;
      this.parentElement = { innerText: unit, textContent: unit };
    }
    getAttribute(attribute) {
      return attribute === 'type' ? this.type : attribute === 'id' ? this.id
        : attribute === 'name' ? this.name : null;
    }
    getBoundingClientRect() { return { width: 160, height: 40 }; }
    closest() { return null; }
    dispatchEvent() { return true; }
    blur() {}
    focus() {}
  }
  const exactWeightPoundsInput = new MockHTMLInputElement('facebook-weight-lb', 'lb');
  const exactWeightOuncesInput = new MockHTMLInputElement('facebook-weight-oz', 'oz');
  const exactWeightButton = {
    disabled: false,
    getAttribute: (attribute) => attribute === 'aria-label' ? exactWeightButtonLabel : null,
    getBoundingClientRect: () => ({ width: 240, height: 44 }),
    innerText: exactWeightButtonLabel,
    textContent: exactWeightButtonLabel,
    click: () => { exactWeightClicks += 1; weightWorkflowActions.push('Enter exact weight'); exactWeightModeOpen = true; },
  };
  const exactWeightNestedTarget = {
    getBoundingClientRect: () => ({ width: 220, height: 40 }),
    closest: (selector) => selector === 'button,[role="button"]' ? exactWeightButton : null,
  };
  const exactWeightDoneButton = {
    disabled: false,
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Done' : null,
    getBoundingClientRect: () => ({ width: 100, height: 44 }),
    innerText: 'Done',
    textContent: 'Done',
    click: () => {
      exactWeightDoneClicks += 1;
      weightWorkflowActions.push('Done');
      exactWeightInputsWhenDone = [exactWeightPoundsInput.value, exactWeightOuncesInput.value];
      exactWeightLabel = `${exactWeightPoundsInput.value} lb, ${exactWeightOuncesInput.value} oz`;
      exactWeightModeOpen = false;
      weightMenuOpen = false;
    },
  };
  const shippingDialog = {
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 500, height: 600 }),
    innerText: 'Change shipping method Shipping option Package weight Shipping carrier Update',
    textContent: 'Change shipping method Shipping option Package weight Shipping carrier Update',
    querySelectorAll: (selector) => {
      if (selector === '[role="checkbox"]') return [sellerShippingControl];
      if (selector === 'button,[role="button"]') return [updateButton];
      return [];
    },
  };
  const weightDialog = {
    getAttribute: () => 'Package weight and shipping options',
    getBoundingClientRect: () => ({ width: 500, height: 500 }),
    querySelectorAll: (selector) => {
      if (selector === 'input') {
        if (!exactWeightModeOpen) return weightRadios;
        exactWeightInputLookupChecks += 1;
        const exactInputReady = exactWeightInputAppearsAfterChecks <= 0 ||
          exactWeightInputLookupChecks >= exactWeightInputAppearsAfterChecks;
        return [...weightRadios, ...(exactInputReady ? [exactWeightPoundsInput, exactWeightOuncesInput] : [])];
      }
      if (selector === 'input[type="radio"][name="package_weight_range"]') {
        if (weightMenuOpen && weightOptionsOpenAfterChecks > 0) {
          weightOptionsLookupChecks += 1;
          if (weightOptionsLookupChecks >= weightOptionsOpenAfterChecks) return weightRadios;
          return [];
        }
        return weightMenuOpen && !exactWeightModeOpen ? weightRadios : [];
      }
      if (selector === 'button,[role="button"]') return [
        ...(exactWeightEntry && weightMenuOpen && !exactWeightModeOpen ? [exactWeightButton] : []),
        ...(exactWeightModeOpen ? [exactWeightDoneButton] : []),
      ];
      return [];
    },
  };
  const shippingLabelButton = {
    disabled: false,
    getAttribute: (attribute) => attribute === 'aria-label' ? shippingLabelAriaLabel : null,
    getBoundingClientRect: () => ({ x: 100, y: 200, left: 100, top: 200, width: 260, height: 44 }),
    innerText: shippingLabelVisibleText,
    textContent: shippingLabelVisibleText,
    click: () => {
      shippingLabelClicks += 1;
      shippingLabelDomClicks += 1;
      if (shippingDialogOpensOnDomClick) shippingDialogOpen = true;
    },
    dispatchEvent: (event) => {
      shippingLabelEventTypes.push(event.type);
      shippingLabelEventDetails.push(event.options || {});
      if (event.type === 'click') {
        shippingLabelClicks += 1;
        if (shippingDialogOpensOnSyntheticClick) shippingDialogOpen = true;
      }
      return true;
    },
  };
  const shippingLabelTextSpan = {
    textContent: shippingLabelVisibleText,
    innerText: shippingLabelVisibleText,
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 180, height: 20 }),
    closest: (selector) => {
      shippingLabelClosestSelectors.push(selector);
      return selector === '[role="button"]' ? shippingLabelButton : null;
    },
  };
  const nextButton = {
    disabled: false,
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Next'
      : attribute === 'aria-disabled' ? String(nextDisabled) : null,
    getBoundingClientRect: () => ({ width: 260, height: 44 }),
    innerText: 'Next',
    textContent: 'Next',
    click: () => { nextClicks += 1; shippingActions.push('Next'); location.pathname = '/marketplace/item/123456789'; },
  };
  const document = {
    getElementById: (id) => ({ textContent: id === 'delivery-label' ? 'Delivery method'
      : id === 'weight-label' ? 'Package weight' : id === 'carrier-label' ? 'Shipping carrier' : '' }),
    querySelector: (selector) => {
      if (selector.includes('Change shipping method') && shippingDialogOpen && !shippingDialogFoundByFallback) return shippingDialog;
      if (selector.includes('Package weight and shipping options') && shippingDialogOpen && weightMenuOpen) return weightDialog;
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === 'input[type="radio"][name="package_weight_range"]') {
        return weightMenuOpen && !exactWeightModeOpen ? weightRadios : [];
      }
      if (selector === 'input') {
        return weightMenuOpen && exactWeightModeOpen
          ? [exactWeightPoundsInput, exactWeightOuncesInput] : [];
      }
      if (selector === 'span') {
        shippingLabelLookupChecks += 1;
        const shippingLabelReady = shippingLabelAppearsAfterChecks <= 0 ||
          shippingLabelLookupChecks >= shippingLabelAppearsAfterChecks;
        return shippingLabelReady && !shippingDialogOpen && shippingLabelVisibleText.trim() === 'Select shipping label'
          ? [shippingLabelTextSpan]
          : [];
      }
      if (selector.includes('[role="dialog"]')) {
        if (shippingLabelClicks > 0 && !shippingDialogOpen && shippingDialogOpensAfterChecks > 0) {
          shippingDialogLookupChecks += 1;
          if (shippingDialogLookupChecks >= shippingDialogOpensAfterChecks) shippingDialogOpen = true;
        }
        if (shippingDialogOpen && shippingDialogFoundByFallback) return [shippingDialog];
      }
      if (selector === '[role="combobox"]') {
        if (shippingDialogOpen && hideDeliveryMenuWhileDialogOpen) return hidePackageWeightCombobox ? [carrierCombo] : [packageWeightCombo, carrierCombo];
        deliveryComboLookupChecks += 1;
        const deliveryComboReady = deliveryComboAppearsAfterChecks <= 0 ||
          deliveryComboLookupChecks >= deliveryComboAppearsAfterChecks;
        return [...(deliveryComboReady ? [deliveryCombo] : []), ...(shippingDialogOpen
          ? hidePackageWeightCombobox ? [carrierCombo] : [packageWeightCombo, carrierCombo]
          : [])];
      }
      if (selector === 'button,[role="button"]' || selector === 'button,input[type="submit"],[role="button"]') {
        const shippingLabelReady = shippingLabelAppearsAfterChecks <= 0 ||
          shippingLabelLookupChecks >= shippingLabelAppearsAfterChecks;
        return [...(shippingLabelReady ? [shippingLabelButton] : []), nextButton];
      }
      return [];
    },
  };
  const assignment = {
    ok: true,
    jobStatus: 'opened',
    runId,
    payload: { title: 'Baby stroller', description: 'Stroller in good condition.', price: '80', photoCount: 0,
      platformFields },
    photos: [],
    unavailablePhotoCount: 0,
  };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: () => undefined },
      sendMessage: (message) => {
        if (message.type === 'KEEPFLIP_LISTING_TAB_READY') return Promise.resolve(assignment);
        if (message.type === 'KEEPFLIP_LISTING_TAB_STATUS') statuses.push(message);
        return Promise.resolve({ ok: true });
      },
    },
  };
  const location = {
    protocol: 'https:',
    hostname: 'www.facebook.com',
    pathname: '/marketplace/create/item',
    search: '?step=delivery',
    href: 'https://www.facebook.com/marketplace/create/item?step=delivery',
  };
  const runnerPath = path.join(__dirname, '..', 'extensions', 'keepflip-sale-watcher', 'content_scripts', 'automation_runner.js');
  vm.runInNewContext(fs.readFileSync(runnerPath, 'utf8'), {
    chrome,
    document,
    location,
    Event: class TestEvent {},
    MouseEvent: class TestMouseEvent { constructor(type, options) { this.type = type; this.options = options; } },
    PointerEvent: class TestPointerEvent { constructor(type, options) { this.type = type; this.options = options; } },
    HTMLSelectElement: class HTMLSelectElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    InputEvent: class TestInputEvent {},
    window: { HTMLInputElement: MockHTMLInputElement, HTMLTextAreaElement: class HTMLTextAreaElement {} },
    setTimeout: (callback, delay = 0) => { simulatedWaitMs += Number(delay) || 0; queueMicrotask(callback); return 1; },
    clearTimeout: () => undefined,
    setInterval: (callback) => { queueMicrotask(callback); return 1; },
    clearInterval: () => undefined,
    console,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  return { statuses, weightRadios, deliveryMenuClicks, packageWeightClicks, packageWeightSelectorUsed, packageWeightTargetClicks, shippingLabelClicks, shippingLabelDomClicks, shippingCostChecked,
    shippingLabelEventTypes, shippingLabelEventDetails, shippingLabelClosestSelectors,
    shippingLabelLookupChecks, deliveryComboLookupChecks, simulatedWaitMs,
    exactWeightClicks, exactWeightDoneClicks, exactWeightSelectorUsed, exactWeightInputsWhenDone, exactWeightPoundsInput, exactWeightOuncesInput, weightWorkflowActions,
    shippingCostClicks, updateClicks, nextClicks, shippingActions };
}

test('Facebook opens the shipping options before opening the Package weight dropdown', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-weight-run-123456',
    platformFields: { deliveryMethod: 'shipping_and_local_pickup' },
  });

  assert.equal(result.shippingLabelClicks, 1);
  assert.equal(result.deliveryMenuClicks, 0);
  assert.equal(result.packageWeightClicks, 1);
  assert.equal(result.updateClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.match(result.statuses.at(-1)?.message || '', /total package weight/i);
});

test('Facebook waits for the delivery menu after the URL advances before opening the shipping label', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-delayed-delivery-menu-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'false',
    },
    deliveryComboAppearsAfterChecks: 5,
    selectedWeight: '10-70 lbs',
  });

  assert.ok(result.deliveryComboLookupChecks >= 5);
  assert.ok(result.simulatedWaitMs >= 600);
  assert.equal(result.shippingLabelClicks, 1);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook pauses and retries until the Select shipping label control renders', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-delayed-shipping-label-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'false',
    },
    selectedWeight: '10-70 lbs',
    shippingLabelAriaLabel: 'Delivery settings',
    shippingLabelAppearsAfterChecks: 5,
    shippingDialogOpensAfterChecks: 3,
  });

  assert.equal(result.shippingLabelClicks, 1);
  assert.ok(result.shippingLabelLookupChecks >= 5);
  assert.ok(result.simulatedWaitMs >= 900);
  assert.deepEqual(result.shippingLabelClosestSelectors, ['[role="button"]']);
  assert.equal(result.shippingLabelDomClicks, 1);
  assert.deepEqual(result.shippingLabelEventTypes, []);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook finds the shipping-label button by its visible text when wording varies', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-shipping-label-selector-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'false',
    },
    selectedWeight: '10-70 lbs',
    shippingLabelAriaLabel: 'Delivery settings',
    shippingLabelVisibleText: 'Choose a shipping label',
  });

  assert.equal(result.shippingLabelClicks, 1);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook reopens a previously selected prepaid label when resuming', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-existing-label-run-123456',
    platformFields: { deliveryMethod: 'shipping_and_local_pickup', shippingWeight: '24 lbs' },
    selectedWeight: '10-70 lbs',
    shippingLabelVisibleText: 'Prepaid label USPS Ground Advantage Arrives in 2-5 days $10.29',
  });

  assert.equal(result.shippingLabelClicks, 1);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
});

test('Facebook targets the visible label span and its semantic button', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-shipping-label-xpath-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'false',
    },
    selectedWeight: '10-70 lbs',
    shippingLabelAriaLabel: 'Select shipping label',
  });

  assert.equal(result.shippingLabelClicks, 1);
  assert.equal(result.shippingLabelDomClicks, 1);
  assert.deepEqual(result.shippingLabelEventTypes, []);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook opens Select shipping label with a DOM click when synthetic events would fail', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-shipping-label-dom-click-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'false',
    },
    selectedWeight: '10-70 lbs',
    shippingDialogOpensOnSyntheticClick: false,
    shippingDialogOpensOnDomClick: true,
  });

  assert.equal(result.shippingLabelDomClicks, 1);
  assert.deepEqual(result.shippingLabelEventTypes, []);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook reports when both shipping-label activation attempts leave the picker closed', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-shipping-label-no-open-run-123456',
    platformFields: { deliveryMethod: 'shipping_and_local_pickup' },
    shippingDialogOpensOnSyntheticClick: false,
    shippingDialogOpensOnDomClick: false,
  });

  assert.equal(result.shippingLabelDomClicks, 2);
  assert.equal(result.updateClicks, 0);
  assert.equal(result.nextClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.match(result.statuses.at(-1)?.message || '', /a DOM click and pointer\/mouse fallback/i);
});

test('Facebook pauses when the labeled Package weight control is missing', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-package-weight-selector-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'false',
    },
    selectedWeight: '10-70 lbs',
    packageWeightSelectorFallback: true,
    hidePackageWeightCombobox: true,
  });

  assert.equal(result.packageWeightSelectorUsed, false);
  assert.equal(result.packageWeightClicks, 0);
  assert.equal(result.updateClicks, 0);
  assert.equal(result.nextClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.match(result.statuses.at(-1)?.message || '', /package weight control/i);
});

test('Facebook resumes an already open shipping dialog when it hides the delivery method menu', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-open-shipping-dialog-run-123456',
    platformFields: { deliveryMethod: 'shipping_and_local_pickup' },
    shippingDialogInitiallyOpen: true,
    hideDeliveryMenuWhileDialogOpen: true,
  });

  assert.equal(result.shippingLabelClicks, 0);
  assert.equal(result.packageWeightClicks, 1);
  assert.equal(result.updateClicks, 0);
  assert.equal(result.nextClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.match(result.statuses.at(-1)?.message || '', /total package weight/i);
  assert.doesNotMatch(result.statuses.at(-1)?.message || '', /delivery method menu/i);
});

test('Facebook saves an already open shipping dialog and advances when the item has a saved weight', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-saved-weight-open-dialog-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'true',
    },
    selectedWeight: '0.5-1 lbs',
    shippingDialogInitiallyOpen: true,
    hideDeliveryMenuWhileDialogOpen: true,
    shippingDialogFoundByFallback: true,
  });

  assert.equal(result.weightRadios.find((radio) => radio.value === '10-70 lbs')?.checked, true);
  assert.equal(result.shippingCostChecked, true);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook selects the saved package-weight range, applies seller-paid shipping, and presses Update', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-weight-save-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: '24 lbs',
      sellerPaysShipping: 'true',
    },
    selectedWeight: '0.5-1 lbs',
    weightOptionsOpenAfterChecks: 3,
  });

  assert.equal(result.packageWeightClicks, 1);
  assert.equal(result.weightRadios.find((radio) => radio.value === '10-70 lbs')?.checked, true);
  assert.equal(result.shippingCostChecked, true);
  assert.equal(result.shippingCostClicks, 1);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook waits for a selected shipping carrier before Update', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-carrier-loading-run-123456',
    platformFields: { deliveryMethod: 'shipping_and_local_pickup', shippingWeight: '24 lbs' },
    selectedWeight: '10-70 lbs',
    carrierAvailable: false,
  });

  assert.equal(result.updateClicks, 0);
  assert.equal(result.nextClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.match(result.statuses.at(-1)?.message || '', /shipping carrier/i);
});

test('Facebook does not click a disabled Next button after shipping settings save', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-disabled-next-run-123456',
    platformFields: { deliveryMethod: 'shipping_and_local_pickup', shippingWeight: '24 lbs' },
    selectedWeight: '10-70 lbs',
    nextDisabled: true,
  });

  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 0);
  assert.equal(result.statuses.at(-1)?.status, 'needs_review');
  assert.match(result.statuses.at(-1)?.message || '', /Next is still disabled/i);
});

test('Facebook enters the generated approximate weight through Enter exact weight', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-exact-weight-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: 'Approx. 24 oz packaged',
      sellerPaysShipping: 'false',
    },
    exactWeightEntry: true,
    exactWeightInputAppearsAfterChecks: 3,
    exactWeightButtonLabel: 'Enter exact weight',
  });

  assert.equal(result.packageWeightClicks, 1);
  assert.equal(result.exactWeightClicks, 1);
  assert.equal(result.exactWeightSelectorUsed, false);
  assert.equal(result.exactWeightDoneClicks, 1);
  assert.deepEqual(result.exactWeightInputsWhenDone, ['1', '8']);
  assert.deepEqual(result.weightWorkflowActions, ['Package weight', 'Enter exact weight', 'Done']);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook keeps pounds and ounces when the generated weight uses both units', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-mixed-weight-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: 'Approx. 1 lb 8 oz packaged',
    },
    exactWeightEntry: true,
  });

  assert.deepEqual(result.exactWeightInputsWhenDone, ['1', '8']);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook converts the generated approximate ounces into the matching weight range', async () => {
  const result = await runFacebookShippingOptionsScenario({
    runId: 'facebook-approx-weight-run-123456',
    platformFields: {
      deliveryMethod: 'shipping_and_local_pickup',
      shippingWeight: 'Approx. 24 oz packaged',
      sellerPaysShipping: 'false',
    },
    selectedWeight: '10-70 lbs',
  });

  assert.equal(result.weightRadios.find((radio) => radio.value === '1-2 lbs')?.checked, true);
  assert.equal(result.updateClicks, 1);
  assert.equal(result.nextClicks, 1);
  assert.deepEqual(result.shippingActions, ['Update', 'Next']);
  assert.equal(result.statuses.at(-1)?.status, 'confirmed');
});

test('Facebook runner initialization failure is surfaced to the Listing page', async () => {
  const app = harness();
  const request = { source: 'keepflip-webapp', protocol: 1, action: 'LISTING_START',
    runId: 'run-facebook-init-error-123', itemId: 'item-1', ownerId: 'owner-1',
    jobs: [{ marketplace: 'facebookMarketplace', payload: listingPayload('facebookMarketplace') }],
    photos: [], unavailablePhotoCount: 0 };
  const started = await app.dispatch({ type: 'KEEPFLIP_LISTING_PAGE', request },
    { url: 'https://app.keep-flip.com/crosslisting', tab: { id: 7 } });
  assert.equal(started.ok, true);

  await app.dispatch({ type: 'KEEPFLIP_LISTING_TAB_INIT_ERROR', marketplace: 'facebookMarketplace' },
    { url: 'https://www.facebook.com/marketplace/create/', tab: { id: 100 } });
  const reported = app.sent.filter(({ id, message }) => id === 7 && message.status?.marketplace === 'facebookMarketplace').at(-1);
  assert.equal(reported?.message.status.status, 'error');
  assert.match(reported?.message.status.message || '', /could not connect/i);
});
