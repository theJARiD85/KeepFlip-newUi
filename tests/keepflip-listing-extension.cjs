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
  assert.equal(app.opened[0].active, true);
  assert.equal(app.opened[1].active, false);
  assert.equal(app.opened[2].active, false);
  assert.equal(app.opened[3].active, false);
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
    Event: class TestEvent { constructor(type) { this.type = type; } },
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

test('Facebook selects a stroller category and advances when optional fields are unavailable', async () => {
  let composerOpen = false;
  let createNewListingClicks = 0;
  let itemForSaleClicks = 0;
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
  let facebookLocation = { protocol: 'https:', hostname: 'www.facebook.com', pathname: '/marketplace/create/', href: 'https://www.facebook.com/marketplace/create/' };
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
      if (selector === 'input[type="checkbox"][role="switch"][aria-label="Draft listings with Meta AI"]' && composerOpen) return metaAiSwitch;
      if (selector === '[aria-label="Suggested categories"]' && composerOpen) return suggestedCategories;
      return null;
    },
    getElementById: (id) => ({ textContent: id === 'category-label' ? 'Category'
      : id === 'Condition-label' ? 'Condition' : id === 'Color-label' ? 'Color' : '' }),
    querySelectorAll: (selector) => {
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
      photoCount: 0, platformFields: { material: 'Plastic', era: 'Modern' } },
    photos: [],
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
    Event: class TestEvent {},
    HTMLSelectElement: class HTMLSelectElement {},
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeout: () => undefined,
    setInterval: (callback) => { queueMicrotask(callback); return 1; },
    clearInterval: () => undefined,
    console,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(createNewListingClicks, 0);
  assert.equal(itemForSaleClicks, 1);
  assert.equal(vehicleForSaleClicks, 0);
  assert.equal(moreDetailsClicks, 1);
  assert.equal(metaAiSwitchClicks, 1);
  assert.equal(metaAiSwitch.checked, false);
  assert.equal(householdCategoryClicks, 0);
  assert.equal(babyCategoryClicks, 1);
  assert.equal(selectedCategory, 'Baby & Kids');
  assert.equal(selectedCondition, 'New');
  assert.equal(selectedColor, 'Champagne');
  assert.deepEqual(fields.map((field) => field.value), [
    'Evenflo Transformer Stroller', 'New Evenflo stroller, factory sealed.', '450', 'Plastic',
  ]);
  assert.equal(fieldsReadyWhenNextClicked, true);
  assert.equal(facebookNextClicks, 1);
  assert.equal(facebookPublishClicks, 1);
  assert.ok(statuses.some((status) => status.status === 'filled'));
  assert.ok(statuses.some((status) => status.status === 'submit_clicked'));
  assert.equal(statuses.at(-1)?.status, 'confirmed');
  assert.equal(statuses.at(-1)?.externalUrl, facebookLocation.href);
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
    getAttribute: (attribute) => attribute === 'aria-label' ? 'Select shipping label' : null,
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
  assert.match(statuses.at(-1)?.message || '', /pressed Select shipping label/i);
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
