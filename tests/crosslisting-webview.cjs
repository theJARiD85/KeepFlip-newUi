const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(process.cwd(), 'services/crosslisting-service.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const serviceModule = { exports: {} };
vm.runInNewContext(compiled, { module: serviceModule, exports: serviceModule.exports, require });
const {
  CROSSLISTING_DESTINATIONS,
  createCrosslistingPayload,
  createGeneratedCrosslistingPayload,
  buildWebViewAutofillScript,
  buildWebViewSubmitScript,
} = serviceModule.exports;

class FakeInput {
  constructor(name, tagName = 'INPUT') {
    this.name = name;
    this.tagName = tagName;
    this._value = '';
    this.events = [];
    this.maxLength = -1;
    this.type = 'text';
  }
  get value() { return this._value; }
  set value(value) { this._value = value; }
  getAttribute() { return null; }
  closest() { return null; }
  dispatchEvent(event) { this.events.push(event.type); }
  blur() {}
}

function runScript(script, { hostname = 'poshmark.com', controls = {}, photoInput = null } = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebView script did not report a result')), 6000);
    const context = {
      location: { hostname, protocol: 'https:' },
      window: { ReactNativeWebView: { postMessage: (message) => {
        clearTimeout(timeout);
        resolve(JSON.parse(message));
      } } },
      document: {
        querySelectorAll: (selector) => controls[selector] ? [controls[selector]] : [],
        querySelector: (selector) => selector.includes('type=file') ? photoInput : null,
        getElementById: () => null,
      },
      HTMLSelectElement: class {},
      Event: class { constructor(type) { this.type = type; } },
      File: class { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } },
      DataTransfer: class {
        constructor() {
          this.files = [];
          this.items = { add: (file) => this.files.push(file) };
        }
      },
      fetch,
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    };
    try { vm.runInNewContext(script, context); }
    catch (error) { clearTimeout(timeout); reject(error); }
  });
}

async function main() {
  assert.equal(CROSSLISTING_DESTINATIONS.depop.createUrl, 'https://www.depop.com/products/create/');
  assert.equal(CROSSLISTING_DESTINATIONS.poshmark.createUrl, 'https://poshmark.com/create-listing');
  const generated = createGeneratedCrosslistingPayload({
    marketplace: 'poshmark',
    listing: {
      title: 'Shared title', conditionDisclosure: 'Small sleeve scuff',
      priceRange: { targetPrice: 85 },
      marketplaceListings: {
        poshmark: {
          title: 'Poshmark jacket', description: 'Vintage leather jacket',
          fields: { category: 'Jackets', size: 'L', originalPrice: 120 },
        },
      },
    },
    item: { category: 'Clothing', itemPhotos: ['photo-1'], photoCount: 1 },
  });
  assert.equal(generated.title, 'Poshmark jacket');
  assert.equal(generated.description, 'Vintage leather jacket\n\nCondition: Small sleeve scuff');
  assert.equal(generated.platformFields.originalPrice, '120');
  assert.equal(generated.photoCount, 1);

  const title = new FakeInput('listing-title');
  const description = new FakeInput('listing-description', 'TEXTAREA');
  const price = new FakeInput('listing-price');
  const photoInput = new FakeInput('photos');
  photoInput.type = 'file';
  photoInput.multiple = true;
  const payload = createCrosslistingPayload({
    marketplace: 'poshmark',
    title: 'Vintage jacket </script>',
    description: 'Leather jacket with sleeve scuffs',
    price: '85.00',
    category: '', condition: '', brand: '', size: '', color: '', photoCount: 1,
  });
  const script = buildWebViewAutofillScript(
    payload,
    { title: ['#title'], description: ['#description'], price: ['#price'] },
    [{ name: 'jacket.jpg', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }],
    0,
    7,
  );
  const result = await runScript(script, {
    controls: { '#title': title, '#description': description, '#price': price },
    photoInput,
  });
  assert.equal(result.kind, 'keepflip-crosslisting-result');
  assert.equal(result.requestId, 7);
  assert.deepEqual([...result.fields].sort(), ['description', 'price', 'title']);
  assert.equal(result.uploadedPhotoCount, 1);
  assert.equal(photoInput.files[0].name, 'jacket.jpg');
  assert.equal(title.value, payload.title);
  assert.equal(description.value, payload.description);
  assert.equal(price.value, payload.price);
  assert.deepEqual(title.events, ['input', 'change']);

  const wrongHost = await runScript(script, { hostname: 'example.com' });
  assert.equal(wrongHost.error, 'wrong_marketplace');

  let clicks = 0;
  const submit = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 80, height: 40 }),
    click: () => { clicks += 1; },
  };
  const submitResult = await runScript(buildWebViewSubmitScript('poshmark', { submitButton: ['#publish'] }), {
    controls: { '#publish': submit },
  });
  assert.equal(submitResult.status, 'clicked');
  assert.equal(clicks, 1);
  const blockedSubmit = await runScript(buildWebViewSubmitScript('poshmark', { submitButton: ['#publish'] }), {
    hostname: 'example.com', controls: { '#publish': submit },
  });
  assert.equal(blockedSubmit.status, 'wrong_marketplace');
  assert.equal(clicks, 1);

  let nextClicks = 0;
  const nextButton = {
    innerText: 'Next',
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 80, height: 40 }),
    closest: () => ({}),
    click: () => { nextClicks += 1; },
  };
  const nextResult = await runScript(buildWebViewSubmitScript('poshmark'), {
    controls: { 'button,input[type="submit"],[role="button"]': nextButton },
  });
  assert.equal(nextResult.status, 'next_clicked');
  assert.equal(nextClicks, 1);
  console.log('Crosslisting WebView bridge: fields, image handoff, next step, and host-gated submit passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
