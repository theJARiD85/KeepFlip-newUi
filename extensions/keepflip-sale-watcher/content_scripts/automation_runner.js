/* global chrome */
(() => {
  const MARKETPLACES = {
    depop: { host: 'depop.com', submit: ['button[type="submit"]'] },
    poshmark: { host: 'poshmark.com', submit: ['button[data-qa-id*="submit"]', 'button[type="submit"]'] },
    mercari: { host: 'mercari.com', submit: ['button[type="submit"]'] },
    facebookMarketplace: { host: 'facebook.com', submit: ['button[type="submit"]'] },
    offerUp: { host: 'offerup.com', submit: ['button[type="submit"]'] },
  };
  const marketplace = Object.keys(MARKETPLACES).find((key) => {
    const host = MARKETPLACES[key].host;
    return location.protocol === 'https:' && (location.hostname === host || location.hostname.endsWith(`.${host}`));
  });
  if (!marketplace) return;

  const patterns = {
    title: /title|item name|listing name|product name/i,
    description: /description|describe your item|item details/i,
    price: /price/i,
    category: /category/i,
    condition: /condition/i,
    brand: /brand/i,
    size: /size/i,
    color: /color/i,
  };
  const selectors = {
    title: [
      'input[data-qa-id="listing-title-input"]',
      'input[data-testid="TitleInput"]',
      'input[name*="title" i]',
      'input[placeholder*="title" i]',
      'input[aria-label*="title" i]',
      'input[id*="title" i]',
    ],
    description: [
      'textarea[data-qa-id="listing-description-input"]',
      'textarea[data-testid="DescriptionInput"]',
      'textarea[data-testid="description-input"]',
      'textarea[name*="description" i]',
      'textarea[placeholder*="description" i]',
      'textarea[aria-label*="description" i]',
      '[contenteditable="true"][aria-label*="description" i]',
      '[contenteditable="true"][data-testid*="description" i]',
    ],
    price: [
      'input[data-qa-id="listing-price-input"]',
      'input[data-testid="PriceInput"]',
      'input[data-testid="price-input"]',
      'input[name*="price" i]',
      'input[placeholder*="price" i]',
      'input[aria-label*="price" i]',
    ],
    category: [
      'select[name*="category" i]',
      'input[name*="category" i]',
      'input[placeholder*="category" i]',
      '[data-qa-id="category-dropdown"]',
      '[data-testid="CategorySelector"]',
    ],
    condition: [
      'select[name*="condition" i]',
      'input[name*="condition" i]',
      'input[placeholder*="condition" i]',
    ],
    brand: [
      'input[data-qa-id="listing-brand-input"]',
      'input[data-testid="BrandInput"]',
      'input[data-testid="brand-input"]',
      'input[name*="brand" i]',
      'input[placeholder*="brand" i]',
    ],
    size: [
      'select[name*="size" i]',
      'input[name*="size" i]',
      'input[placeholder*="size" i]',
    ],
    color: [
      'select[name*="color" i]',
      'input[name*="color" i]',
      'input[placeholder*="color" i]',
    ],
  };
  const core = ['title', 'description', 'price'];
  let assignment = null;
  let filledFields = [];
  let uploadedPhotoCount = 0;
  let offerUpSellMenuOpened = false;
  let facebookMetaAiSwitchClickRequested = false;
  let facebookMoreDetailsClickRequested = false;
  let facebookCategoryPickerOpenRequested = false;
  let facebookNextClicked = false;
  let facebookSubmissionInProgress = false;
  let facebookShippingLabelOpenRequested = false;
  let facebookShippingOptionsSaved = false;

  async function sendMessageQuietly(message) {
    try { return await chrome.runtime.sendMessage(message); } catch { /* The extension may be reloading. */ }
  }

  function report(status, details = {}) {
    if (!assignment) return Promise.resolve();
    return sendMessageQuietly({ type: 'KEEPFLIP_LISTING_TAB_STATUS', runId: assignment.runId,
      marketplace, status, ...details });
  }

  function labelFor(element) {
    const labels = element.labels ? Array.from(element.labels).map((label) => label.textContent || '').join(' ') : '';
    const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    return [element.name, element.id, element.getAttribute('placeholder'), element.getAttribute('aria-label'),
      element.getAttribute('data-qa-id'), element.getAttribute('data-testid'), labels, labelledBy,
      element.closest('label')?.textContent].join(' ');
  }

  function usable(element, key) {
    if (!element || element.disabled || element.readOnly || element.type === 'hidden' ||
      element.type === 'password' || element.type === 'file' || element.type === 'checkbox' || element.type === 'radio') return false;
    if (key === 'price' && /original|retail|msrp/i.test(labelFor(element))) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findField(key) {
    const fieldSelectors = Object.prototype.hasOwnProperty.call(selectors, key) ? selectors[key] : [];
    const fieldPattern = Object.prototype.hasOwnProperty.call(patterns, key) ? patterns[key] : (() => {
      const readableKey = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
      const escapedKey = readableKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|\\W)${escapedKey}(?:$|\\W)`, 'i');
    })();
    for (const selector of fieldSelectors) {
      const matches = document.querySelectorAll(selector);
      for (const element of matches) if (usable(element, key)) return element;
    }
    const matches = document.querySelectorAll('input,textarea,select,[contenteditable="true"]');
    for (const element of matches) {
      if (usable(element, key) && fieldPattern.test(labelFor(element))) return element;
    }
    return null;
  }

  function turnOffFacebookMetaAiDrafts() {
    if (marketplace !== 'facebookMarketplace') return true;
    const toggle = document.querySelector('input[type="checkbox"][role="switch"][aria-label="Draft listings with Meta AI"]') ||
      document.querySelector('input[type="checkbox"][role="switch"][aria-label*="Meta AI" i]') ||
      document.querySelector('[role="switch"][aria-label*="Meta AI" i]');
    if (!toggle) return true;
    if (toggle.disabled) return false;
    if ((toggle.checked || toggle.getAttribute('aria-checked') === 'true') && !facebookMetaAiSwitchClickRequested) {
      facebookMetaAiSwitchClickRequested = true;
      toggle.click();
    }
    return !toggle.checked && toggle.getAttribute('aria-checked') !== 'true';
  }

  function expandFacebookMoreDetails(fields) {
    if (marketplace !== 'facebookMarketplace' || !Object.entries(fields).some(([key, value]) => value && !core.includes(key))) return;
    const controls = document.querySelectorAll('button,[role="button"]');
    for (const control of controls) {
      const label = (control.getAttribute('aria-label') || control.innerText || control.textContent || '')
        .replace(/\s+/g, ' ').trim();
      if (!/^more details(?:\s|$)/i.test(label) || control.getAttribute('aria-expanded') !== 'false' ||
        facebookMoreDetailsClickRequested) continue;
      facebookMoreDetailsClickRequested = true;
      control.click();
      return;
    }
  }

  function normalizeChoiceLabel(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function facebookCategoryAlias(value) {
    const normalized = normalizeChoiceLabel(value);
    if (/\b(strollers?|prams?|baby|babies|infants?|toddlers?|car seats?|high chairs?|cribs?|bassinets?|baby gear|baby products)\b/.test(normalized)) return 'baby and kids';
    if (/\b(video games?|gaming|game consoles?|consoles?)\b/.test(normalized)) return 'electronics and computers';
    if (/\b(cameras?|photography|dslr|mirrorless|lenses?|computers?|electronics?|phones?|tablets?|audio|speakers?|printers?|televisions?|tv)\b/.test(normalized)) return 'electronics and computers';
    if (/\b(trading cards?|sports cards?|pokemon|collectibles?|toys?|dolls?|action figures?)\b/.test(normalized)) return 'toys and games';
    if (/\b(apparel|clothing|fashion|shoes|handbags?|accessories)\b/.test(normalized)) return 'clothing and accessories';
    return '';
  }

  function findFacebookCategoryCombobox() {
    return Array.from(document.querySelectorAll('[role="combobox"]')).find((element) =>
      visible(element) && /category/i.test(labelFor(element))) || null;
  }

  function facebookCategoryScore(value, label, context = '') {
    const normalizedValue = normalizeChoiceLabel(value);
    const normalizedLabel = normalizeChoiceLabel(String(label || '').replace(/^Suggested category:\s*/i, ''));
    if (!normalizedLabel) return 0;
    if (normalizedLabel === normalizedValue) return 120;

    const alias = facebookCategoryAlias(`${value} ${context}`);
    if (!alias) return 0;
    if (normalizedLabel === alias) return 110;
    if (alias === 'baby and kids') {
      const isStroller = /\b(strollers?|prams?)\b/i.test(`${value} ${context}`);
      if (isStroller && /\b(strollers?|prams?)\b/.test(normalizedLabel)) return 130;
      if (/\b(baby|babies|infant|infants|toddler|toddlers|kids|children)\b/.test(normalizedLabel)) return 90;
      return 0;
    }
    if (alias === 'electronics and computers' && /\b(electronics?|computers?|technology)\b/.test(normalizedLabel)) return 90;
    if (alias === 'toys and games' && /\b(toys?|games?|collectibles?)\b/.test(normalizedLabel)) return 90;
    if (alias === 'clothing and accessories' && /\b(clothing|apparel|fashion|accessories)\b/.test(normalizedLabel)) return 90;
    return 0;
  }

  function bestFacebookCategoryCandidate(elements, value, context = '') {
    const ranked = elements.map((element) => {
      const label = element.getAttribute('aria-label') || element.innerText || element.textContent || '';
      return { element, score: facebookCategoryScore(value, label, context) };
    }).filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score);
    return ranked[0]?.element || null;
  }

  async function selectFacebookSuggestedCategory(value, context = '') {
    if (marketplace !== 'facebookMarketplace' || !value) return false;
    const group = document.querySelector('[aria-label="Suggested categories"]');
    const suggestions = group
      ? Array.from(group.querySelectorAll('[aria-label^="Suggested category:"]')).filter(visible)
      : [];
    let target = bestFacebookCategoryCandidate(suggestions, value, context);
    if (target) {
      target.click();
      return true;
    }

    const combo = findFacebookCategoryCombobox();
    if (!combo) return false;
    const currentValue = facebookComboboxValue(combo);
    if (facebookCategoryScore(value, currentValue, context) > 0) return true;

    if (combo.getAttribute('aria-expanded') !== 'true' && !facebookCategoryPickerOpenRequested) {
      facebookCategoryPickerOpenRequested = true;
      combo.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"]'))
      .filter(visible);
    target = bestFacebookCategoryCandidate(options, value, context);
    if (!target) return false;
    target.click();
    return true;
  }

  function findFacebookCombobox(key) {
    return Array.from(document.querySelectorAll('[role="combobox"]')).find((element) =>
      visible(element) && new RegExp(key, 'i').test(labelFor(element))) || null;
  }

  function facebookConditionMatches(value, optionLabel) {
    const wanted = normalizeChoiceLabel(value).replace(/\s+/g, '_');
    const option = normalizeChoiceLabel(optionLabel);
    if (!option) return false;
    if (wanted.startsWith('new') || wanted === 'brand_new') {
      return /^(?:brand )?new(?: with tags| without tags)?$|^unused$|^new$/i.test(option) || (/\bnew\b/i.test(option) && !/\blike new\b/i.test(option));
    }
    if (wanted === 'like_new' || wanted === 'excellent') return /\blike new\b|\bexcellent\b/i.test(option);
    if (wanted === 'good') return /\bgood\b/i.test(option);
    if (wanted === 'fair') return /\bfair\b/i.test(option);
    if (wanted === 'poor') return /\bpoor\b/i.test(option);
    if (wanted.includes('part') || wanted.includes('repair')) return /\bfor parts\b|\brepair\b/i.test(option);
    return option === normalizeChoiceLabel(value);
  }

  function facebookComboboxValue(combo) {
    const labelText = (combo.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '').join(' ');
    return normalizeChoiceLabel((combo.innerText || combo.textContent || '').replace(labelText, ' '));
  }

  function isFacebookDeliveryStep() {
    return marketplace === 'facebookMarketplace' &&
      (/([?&])step=delivery(?:&|$)/i.test(location.search || '') || Boolean(findFacebookCombobox('delivery method')));
  }

  function facebookDeliveryPreference() {
    const payload = assignment?.payload || {};
    const platformFields = payload.platformFields && typeof payload.platformFields === 'object'
      ? payload.platformFields
      : {};
    const normalized = normalizeChoiceLabel(payload.deliveryMethod || platformFields.deliveryMethod);
    if (['both', 'shipping and local pickup', 'shipping local pickup'].includes(normalized)) {
      return ['shipping', 'local_pickup'];
    }
    if (normalized === 'shipping') return ['shipping'];
    if (normalized === 'local pickup') return ['local_pickup'];
    return null;
  }

  function facebookDeliverySelection(combo) {
    const value = facebookComboboxValue(combo);
    return {
      value,
      shipping: /\bshipping\b/.test(value),
      localPickup: /\blocal pickup\b/.test(value),
    };
  }

  function findFacebookDeliveryOption(method) {
    const controls = Array.from(document.querySelectorAll(
      '[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="checkbox"],[role="radio"],[role="button"],button',
    )).filter(visible);
    const matches = controls.filter((control) => {
      const text = normalizeChoiceLabel([
        control.getAttribute('aria-label'), control.innerText, control.textContent,
      ].filter(Boolean).join(' '));
      if (method === 'shipping') return /\bshipping\b/.test(text) && !/\blocal pickup\b/.test(text);
      return /\blocal pickup\b/.test(text);
    });
    return matches.find((control) => /^(option|menuitem|menuitemcheckbox|menuitemradio|checkbox|radio)$/.test(control.getAttribute('role') || '')) ||
      matches[0] || null;
  }

  async function applyFacebookDeliveryPreference(combo, preference) {
    let currentCombo = combo;
    let selection = facebookDeliverySelection(currentCombo);
    const wantedShipping = preference.includes('shipping');
    const wantedLocalPickup = preference.includes('local_pickup');

    for (const [method, wanted, selected] of [
      ['shipping', wantedShipping, selection.shipping],
      ['local_pickup', wantedLocalPickup, selection.localPickup],
    ]) {
      if (wanted === selected) continue;
      currentCombo = findFacebookCombobox('delivery method') || currentCombo;
      if (currentCombo.getAttribute('aria-expanded') !== 'true') {
        currentCombo.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const option = findFacebookDeliveryOption(method);
      if (!option) return { ok: false, message: `Facebook's ${method === 'local_pickup' ? 'local pickup' : 'shipping'} option was not found. Choose the delivery method in Facebook.` };
      option.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      currentCombo = findFacebookCombobox('delivery method') || currentCombo;
      selection = facebookDeliverySelection(currentCombo);
      if (method === 'shipping' && selection.shipping !== wanted) {
        return { ok: false, message: 'Facebook did not confirm the requested shipping selection. Check the delivery menu.' };
      }
      if (method === 'local_pickup' && selection.localPickup !== wanted) {
        return { ok: false, message: 'Facebook did not confirm the requested local pickup selection. Check the delivery menu.' };
      }
    }

    selection = facebookDeliverySelection(findFacebookCombobox('delivery method') || currentCombo);
    if (selection.shipping !== wantedShipping || selection.localPickup !== wantedLocalPickup) {
      return { ok: false, message: 'Facebook could not confirm the requested delivery methods. Check the delivery menu.' };
    }
    return { ok: true, selection };
  }

  function findFacebookShippingLabelButton() {
    return Array.from(document.querySelectorAll('button,[role="button"]')).find((control) =>
      visible(control) && /^select shipping label$/i.test(facebookButtonLabel(control))) || null;
  }

  function findFacebookShippingOptionsDialog() {
    const dialog = document.querySelector('[role="dialog"][aria-label*="Package weight and shipping options"]');
    return dialog && visible(dialog) ? dialog : null;
  }

  const facebookPackageWeightRanges = [
    'Under 0.5 lbs', '0.5-1 lbs', '1-2 lbs', '2-5 lbs', '5-10 lbs', '10-70 lbs',
  ];

  function facebookPackageWeightRangeForPounds(pounds) {
    if (!Number.isFinite(pounds) || pounds < 0) return null;
    if (pounds < 0.5) return facebookPackageWeightRanges[0];
    if (pounds < 1) return facebookPackageWeightRanges[1];
    if (pounds < 2) return facebookPackageWeightRanges[2];
    if (pounds < 5) return facebookPackageWeightRanges[3];
    if (pounds < 10) return facebookPackageWeightRanges[4];
    if (pounds <= 70) return facebookPackageWeightRanges[5];
    return null;
  }

  function facebookPackageWeightHint(payload) {
    const platformFields = payload?.platformFields && typeof payload.platformFields === 'object'
      ? payload.platformFields
      : {};
    const entries = [
      ...Object.entries(platformFields).filter(([key]) => /weight/i.test(key)),
      ...['packageWeight', 'shippingWeight', 'weight', 'packageWeightOz', 'shippingWeightOz']
        .filter((key) => payload?.[key] !== undefined && payload?.[key] !== null)
        .map((key) => [key, payload[key]]),
    ];

    for (const [key, rawValue] of entries) {
      const value = String(rawValue ?? '').trim();
      if (!value) continue;
      const directRange = facebookPackageWeightRanges.find((range) =>
        normalizeChoiceLabel(range) === normalizeChoiceLabel(value));
      if (directRange) return directRange;

      const amount = value.match(/\d+(?:\.\d+)?/);
      if (!amount) continue;
      const textUnit = value.match(/\b(lb|lbs|pounds?|oz|ounces?|kg|kilograms?|g|grams?)\b/i)?.[1]?.toLowerCase();
      const keyUnit = key.match(/(lbs?|pounds?|oz|ounces?|kg|kilograms?|g|grams?)$/i)?.[1]?.toLowerCase();
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      const unit = textUnit || keyUnit || (/^(package|shipping)weight$/.test(normalizedKey) ? 'lbs' : '');
      if (!unit) continue;
      let pounds = Number(amount[0]);
      if (/^(oz|ounce|ounces)$/.test(unit)) pounds /= 16;
      else if (/^(kg|kilogram|kilograms)$/.test(unit)) pounds *= 2.2046226218;
      else if (/^(g|gram|grams)$/.test(unit)) pounds /= 453.59237;
      const range = facebookPackageWeightRangeForPounds(pounds);
      if (range) return range;
    }
    return null;
  }

  function facebookPackageWeightRadios(dialog) {
    return Array.from(dialog?.querySelectorAll('input[type="radio"][name="package_weight_range"]') || []);
  }

  function facebookPackageWeightRadioLabel(radio) {
    return radio.value || radio.getAttribute('value') || radio.getAttribute('aria-label') ||
      radio.closest('label')?.innerText || radio.closest('label')?.textContent || '';
  }

  function facebookSelectedPackageWeight(dialog) {
    return facebookPackageWeightRadios(dialog).find((radio) =>
      radio.checked || radio.getAttribute('aria-checked') === 'true') || null;
  }

  function facebookSellerPaysShippingPreference(payload) {
    const fields = payload?.platformFields && typeof payload.platformFields === 'object'
      ? payload.platformFields
      : {};
    const values = [
      ['sellerPaysShipping', fields.sellerPaysShipping ?? payload?.sellerPaysShipping],
      ['coverShippingCost', fields.coverShippingCost ?? payload?.coverShippingCost],
      ['freeShipping', fields.freeShipping ?? payload?.freeShipping],
      ['shippingPaidBy', fields.shippingPaidBy ?? payload?.shippingPaidBy],
      ['shippingPayer', fields.shippingPayer ?? payload?.shippingPayer],
    ];
    for (const [key, value] of values) {
      if (typeof value === 'boolean') return value;
      const normalized = normalizeChoiceLabel(value);
      if (!normalized) continue;
      if (['true', 'yes', '1', 'seller', 'seller pays', 'seller pays shipping', 'free shipping'].includes(normalized)) return true;
      if (['false', 'no', '0', 'buyer', 'buyer pays', 'buyer pays shipping', 'paid shipping'].includes(normalized)) return false;
    }
    return null;
  }

  function findFacebookSellerPaysShippingControl(dialog) {
    const selectors = ['[role="checkbox"]', '[role="switch"]', 'input[type="checkbox"]', 'button', '[role="button"]', 'label'];
    for (const selector of selectors) {
      const control = Array.from(dialog?.querySelectorAll(selector) || []).find((element) => {
        const parentLabel = element.closest('label,[role="checkbox"],[role="switch"],button,[role="button"]');
        const labelText = [
          element.getAttribute('aria-label'), element.innerText, element.textContent,
          parentLabel?.getAttribute('aria-label'), parentLabel?.innerText, parentLabel?.textContent,
        ].filter(Boolean).join(' ');
        return /cover the shipping cost so buyers see free shipping/i.test(labelText) &&
          !element.disabled && (element.tagName === 'INPUT' || visible(element));
      });
      if (control) return control;
    }
    const textNode = Array.from(dialog?.querySelectorAll('*') || []).find((element) =>
      /cover the shipping cost so buyers see free shipping/i.test(element.innerText || element.textContent || ''));
    return textNode?.closest('input[type="checkbox"],[role="checkbox"],[role="switch"],button,[role="button"],label') || null;
  }

  function facebookShippingPaidBySellerIsChecked(control) {
    if (typeof control.checked === 'boolean') return control.checked;
    return control.getAttribute('aria-checked') === 'true';
  }

  function findFacebookDialogUpdateButton(dialog) {
    return Array.from(dialog?.querySelectorAll('button,[role="button"]') || []).find((control) =>
      visible(control) && /^update$/i.test(facebookButtonLabel(control))) || null;
  }

  async function saveFacebookShippingOptions(dialog, packageWeightCombo) {
    const payload = assignment?.payload || {};
    const expectedRange = facebookPackageWeightHint(payload);
    let radios = facebookPackageWeightRadios(dialog);
    let selectedRadio = facebookSelectedPackageWeight(dialog);
    let selectedLabel = selectedRadio ? facebookPackageWeightRadioLabel(selectedRadio) : '';

    if (expectedRange && normalizeChoiceLabel(selectedLabel) !== normalizeChoiceLabel(expectedRange)) {
      if (packageWeightCombo?.getAttribute('aria-expanded') !== 'true') {
        packageWeightCombo?.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
        dialog = findFacebookShippingOptionsDialog() || dialog;
        packageWeightCombo = findFacebookCombobox('package weight') || packageWeightCombo;
      }
      radios = facebookPackageWeightRadios(dialog);
      const target = radios.find((radio) =>
        normalizeChoiceLabel(facebookPackageWeightRadioLabel(radio)) === normalizeChoiceLabel(expectedRange));
      if (!target) return { ready: false, message: `KeepFlip could not find Facebook’s ${expectedRange} package-weight option. Choose the shipping weight in Facebook.` };
      target.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      dialog = findFacebookShippingOptionsDialog() || dialog;
      selectedRadio = facebookSelectedPackageWeight(dialog);
      selectedLabel = selectedRadio ? facebookPackageWeightRadioLabel(selectedRadio) : '';
      if (normalizeChoiceLabel(selectedLabel) !== normalizeChoiceLabel(expectedRange)) {
        return { ready: false, message: `Facebook did not confirm the ${expectedRange} package weight. Choose it in Facebook before continuing.` };
      }
    }

    if (!selectedRadio && !facebookComboboxValue(packageWeightCombo)) {
      if (packageWeightCombo?.getAttribute('aria-expanded') !== 'true') {
        packageWeightCombo?.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      return { ready: false, message: 'Choose the item’s total package weight in Facebook, then resume the listing in KeepFlip.' };
    }

    const sellerPaysShipping = facebookSellerPaysShippingPreference(payload);
    if (sellerPaysShipping !== null) {
      const sellerShippingControl = findFacebookSellerPaysShippingControl(dialog);
      if (!sellerShippingControl) {
        return { ready: false, message: 'KeepFlip could not find Facebook’s “Cover the shipping cost so buyers see free shipping” option.' };
      }
      if (facebookShippingPaidBySellerIsChecked(sellerShippingControl) !== sellerPaysShipping) {
        sellerShippingControl.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (facebookShippingPaidBySellerIsChecked(sellerShippingControl) !== sellerPaysShipping) {
        return { ready: false, message: 'Facebook did not confirm the requested seller-paid shipping setting. Check the shipping option.' };
      }
    }

    const updateButton = findFacebookDialogUpdateButton(dialog);
    if (!updateButton) return { ready: false, message: 'KeepFlip could not find Facebook’s Update button to save shipping info.' };
    updateButton.click();
    let dialogStillOpen = Boolean(findFacebookShippingOptionsDialog());
    for (let attempt = 0; dialogStillOpen && attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      dialogStillOpen = Boolean(findFacebookShippingOptionsDialog());
    }
    if (dialogStillOpen) {
      return { ready: false, message: 'KeepFlip pressed Update, but Facebook’s shipping options are still open. Review the dialog and resume.' };
    }
    facebookShippingOptionsSaved = true;
    return { ready: true };
  }

  async function prepareFacebookDeliveryStep() {
    let combo = findFacebookCombobox('delivery method');
    if (!combo) return { ready: false, message: 'Facebook opened the delivery step, but KeepFlip could not find its delivery method menu.' };
    if (combo.getAttribute('aria-expanded') !== 'true') {
      combo.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      combo = findFacebookCombobox('delivery method') || combo;
    }

    const preference = facebookDeliveryPreference();
    if (preference) {
      const result = await applyFacebookDeliveryPreference(combo, preference);
      if (!result.ok) return result;
      combo = findFacebookCombobox('delivery method') || combo;
    }

    let selection = facebookDeliverySelection(combo);
    if (!selection.shipping && !selection.localPickup) {
      return { ready: false, message: 'Choose Shipping, Local pickup, or both in Facebook before continuing.' };
    }

    if (combo.getAttribute('aria-expanded') === 'true') {
      combo.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (selection.shipping) {
      if (facebookShippingOptionsSaved) return { ready: true, selection };
      let shippingOptionsDialog = findFacebookShippingOptionsDialog();
      const shippingLabelButton = findFacebookShippingLabelButton();
      if (!shippingOptionsDialog && shippingLabelButton && !facebookShippingLabelOpenRequested) {
        facebookShippingLabelOpenRequested = true;
        shippingLabelButton.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        shippingOptionsDialog = findFacebookShippingOptionsDialog();
      }
      if (!shippingOptionsDialog) {
        if (!shippingLabelButton) return { ready: false, message: 'Shipping is selected, but Facebook’s Select shipping label button was not found.' };
        if (!facebookShippingLabelOpenRequested) return { ready: false, message: 'Facebook’s shipping options could not be opened. Try again from the marketplace tab.' };
        facebookShippingLabelOpenRequested = false;
        return { ready: false, message: 'KeepFlip pressed Select shipping label. Facebook’s shipping options did not open yet; resume the listing to retry.' };
      }

      const packageWeightCombo = findFacebookCombobox('package weight');
      if (!packageWeightCombo && !facebookSelectedPackageWeight(shippingOptionsDialog)) {
        return { ready: false, message: 'Facebook opened its shipping options, but KeepFlip could not find the Package weight control.' };
      }
      return saveFacebookShippingOptions(shippingOptionsDialog, packageWeightCombo);
    }

    return { ready: true, selection };
  }

  function facebookComboboxMatches(key, value, optionLabel) {
    if (key === 'condition') return facebookConditionMatches(value, optionLabel);
    const wanted = normalizeChoiceLabel(value);
    const option = normalizeChoiceLabel(optionLabel);
    if (!wanted || !option) return false;
    return option === wanted || (wanted.length > 2 && option.split(' ').includes(wanted));
  }

  async function selectFacebookComboboxValue(key, value) {
    if (marketplace !== 'facebookMarketplace' || !value) return false;
    const combo = findFacebookCombobox(key);
    if (!combo) return false;
    if (facebookComboboxMatches(key, value, facebookComboboxValue(combo))) return true;
    let options = Array.from(document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]'))
      .filter(visible);
    let selected = options.find((option) => facebookComboboxMatches(
      key,
      value,
      option.getAttribute('aria-label') || option.innerText || option.textContent,
    ));
    if (!selected && combo.getAttribute('aria-expanded') !== 'true') {
      combo.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      options = Array.from(document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]'))
        .filter(visible);
      selected = options.find((option) => facebookComboboxMatches(
        key,
        value,
        option.getAttribute('aria-label') || option.innerText || option.textContent,
      ));
    }
    if (!selected) return false;
    selected.click();
    return true;
  }

  async function selectFacebookCondition(value) {
    return selectFacebookComboboxValue('condition', value);
  }

  function setField(element, raw) {
    const value = String(raw).trim();
    if (!value) return false;
    const current = String(element.value ?? element.textContent ?? '').trim();
    if (current && current === value) return true;
    if (element instanceof HTMLSelectElement) {
      const option = Array.from(element.options).find((entry) =>
        entry.value.toLowerCase() === value.toLowerCase() || entry.textContent.trim().toLowerCase() === value.toLowerCase());
      if (!option) return false;
      element.value = option.value;
    } else if (element.isContentEditable) {
      element.focus();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, value);
      } catch {
        element.textContent = value;
      }
    } else {
      const proto = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
      const nextValue = element.maxLength > 0 ? value.slice(0, element.maxLength) : value;
      if (setter) setter.call(element, nextValue);
      else element.value = nextValue;
      if (element._valueTracker) {
        element._valueTracker.setValue('');
      }
    }
    try {
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    } catch {
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
    return true;
  }

  async function fillPoshmarkSpecifics(fields, platformFields, payload) {
    if (!filledFields.includes('originalPrice')) {
      const origInput = document.querySelector('input[data-qa-id="original-price-input"], input[name*="originalPrice" i], input[placeholder*="original price" i]');
      if (origInput && usable(origInput, 'price')) {
        const origVal = platformFields.originalPrice || platformFields.msrp || '0';
        if (setField(origInput, origVal)) filledFields.push('originalPrice');
      }
    }
    if (fields.brand && !filledFields.includes('brand')) {
      const brandInput = document.querySelector('input[data-qa-id="listing-brand-input"], input[name*="brand" i]');
      if (brandInput && usable(brandInput, 'brand')) {
        if (setField(brandInput, fields.brand)) {
          filledFields.push('brand');
          await new Promise((resolve) => setTimeout(resolve, 200));
          const suggestion = document.querySelector('.dropdown-menu .dropdown-item, [data-qa-id="brand-suggestion"], [role="listbox"] [role="option"]');
          if (suggestion && visible(suggestion)) suggestion.click();
        }
      }
    }
    if (fields.condition && !filledFields.includes('condition')) {
      const isNew = /^(?:brand )?new(?: with tags)?$/i.test(fields.condition.trim());
      const nwtContainer = document.querySelector('[data-qa-id="nwt-toggle"], .listing-editor__nwt, [data-testid="nwt-section"]');
      if (nwtContainer) {
        const buttons = Array.from(nwtContainer.querySelectorAll('button, [role="radio"], [role="button"]')).filter(visible);
        const targetBtn = buttons.find((btn) => {
          const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
          return isNew ? text === 'yes' : text === 'no';
        });
        if (targetBtn) {
          targetBtn.click();
          filledFields.push('condition');
        }
      }
    }
    if (fields.size && !filledFields.includes('size')) {
      const sizeOptions = Array.from(document.querySelectorAll('.size-selector [role="button"], .size-chips button, [data-qa-id*="size-item"]')).filter(visible);
      if (sizeOptions.length) {
        const wantedSize = normalizeChoiceLabel(fields.size);
        const match = sizeOptions.find((btn) => normalizeChoiceLabel(btn.innerText || btn.textContent || '') === wantedSize);
        if (match) {
          match.click();
          filledFields.push('size');
        }
      }
    }
    if (fields.category && !filledFields.includes('category')) {
      const catOptions = Array.from(document.querySelectorAll('.category-selector [role="button"], [data-qa-id*="category-item"]')).filter(visible);
      if (catOptions.length) {
        const wantedCat = normalizeChoiceLabel(fields.category);
        const match = catOptions.find((btn) => normalizeChoiceLabel(btn.innerText || btn.textContent || '').includes(wantedCat));
        if (match) {
          match.click();
          filledFields.push('category');
        }
      }
    }
  }

  async function fillMercariSpecifics(fields, platformFields, payload) {
    if (fields.condition && !filledFields.includes('condition')) {
      const conditionButtons = Array.from(document.querySelectorAll('button[data-testid*="Condition"], [role="group"] button, .condition-chips button')).filter(visible);
      if (conditionButtons.length) {
        const wanted = normalizeChoiceLabel(fields.condition).replace(/\s+/g, '_');
        const target = conditionButtons.find((btn) => {
          const label = normalizeChoiceLabel(btn.innerText || btn.textContent || '');
          if (wanted.startsWith('new') && /\bnew\b/i.test(label) && !/\blike new\b/i.test(label)) return true;
          if ((wanted === 'like_new' || wanted === 'excellent') && /\blike new\b/i.test(label)) return true;
          if (wanted === 'good' && /\bgood\b/i.test(label)) return true;
          if (wanted === 'fair' && /\bfair\b/i.test(label)) return true;
          if (wanted === 'poor' && /\bpoor\b/i.test(label)) return true;
          return label === normalizeChoiceLabel(fields.condition);
        });
        if (target) {
          target.click();
          filledFields.push('condition');
        }
      }
    }
    if (fields.category && !filledFields.includes('category')) {
      const suggestedChips = Array.from(document.querySelectorAll('[data-testid*="SuggestedCategory"], button[aria-label*="category" i]')).filter(visible);
      if (suggestedChips.length) {
        const wanted = normalizeChoiceLabel(fields.category);
        const target = suggestedChips.find((chip) => {
          const text = normalizeChoiceLabel(chip.innerText || chip.textContent || '');
          return text.includes(wanted) || wanted.includes(text);
        }) || suggestedChips[0];
        if (target) {
          target.click();
          filledFields.push('category');
        }
      }
    }
    if (fields.brand && !filledFields.includes('brand')) {
      const brandInput = document.querySelector('input[data-testid="BrandInput"], input[name="brand"]');
      if (brandInput && usable(brandInput, 'brand')) {
        if (setField(brandInput, fields.brand)) {
          filledFields.push('brand');
          await new Promise((resolve) => setTimeout(resolve, 200));
          const suggestion = document.querySelector('[data-testid*="BrandSuggestion"], [role="listbox"] [role="option"]');
          if (suggestion && visible(suggestion)) suggestion.click();
        }
      }
    }
  }

  async function fillDepopSpecifics(fields, platformFields, payload) {
    if (fields.condition && !filledFields.includes('condition')) {
      const condControls = Array.from(document.querySelectorAll('button[data-testid*="condition" i], [role="radiogroup"] [role="radio"], [data-testid*="Condition"]')).filter(visible);
      if (condControls.length) {
        const wanted = normalizeChoiceLabel(fields.condition).replace(/\s+/g, '_');
        const target = condControls.find((ctrl) => {
          const text = normalizeChoiceLabel(ctrl.innerText || ctrl.textContent || '');
          if (wanted.startsWith('new') && /\b(?:brand )?new\b/i.test(text) && !/\blike new\b/i.test(text)) return true;
          if ((wanted === 'like_new' || wanted === 'excellent') && /\b(?:like new|excellent)\b/i.test(text)) return true;
          if (wanted === 'good' && /\bgood\b/i.test(text)) return true;
          if (wanted === 'fair' && /\bfair\b/i.test(text)) return true;
          return text === normalizeChoiceLabel(fields.condition);
        });
        if (target) {
          target.click();
          filledFields.push('condition');
        }
      }
    }
    if (fields.brand && !filledFields.includes('brand')) {
      const brandInput = document.querySelector('input[data-testid="brand-input"], input[placeholder*="brand" i]');
      if (brandInput && usable(brandInput, 'brand')) {
        if (setField(brandInput, fields.brand)) filledFields.push('brand');
      }
    }
    if (!filledFields.includes('title')) {
      filledFields.push('title');
    }
  }

  async function fillOfferUpSpecifics(fields, platformFields, payload) {
    if (fields.condition && !filledFields.includes('condition')) {
      const condButtons = Array.from(document.querySelectorAll('button[data-testid*="condition" i], [role="group"] button')).filter(visible);
      if (condButtons.length) {
        const wanted = normalizeChoiceLabel(fields.condition).replace(/\s+/g, '_');
        const target = condButtons.find((btn) => {
          const text = normalizeChoiceLabel(btn.innerText || btn.textContent || '');
          if (wanted.startsWith('new') && /\bnew\b/i.test(text)) return true;
          if ((wanted === 'like_new' || wanted === 'open_box') && /\bopen box\b|\blike new\b/i.test(text)) return true;
          if (wanted === 'good' && /\bnormal wear\b|\bgood\b/i.test(text)) return true;
          if (wanted === 'fair' && /\bnormal wear\b|\bfair\b/i.test(text)) return true;
          if (wanted.includes('part') && /\bparts\b/i.test(text)) return true;
          return text === normalizeChoiceLabel(fields.condition);
        });
        if (target) {
          target.click();
          filledFields.push('condition');
        }
      }
    }
  }

  async function attachPhotos(photos) {
    if (!photos.length) return 0;
    if (typeof DataTransfer === 'undefined') return 0;
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const input = fileInputs.find((candidate) => candidate.closest('main,form,[role="dialog"]') &&
      /image/i.test(candidate.getAttribute('accept') || '')) ||
      fileInputs.find((candidate) => /image/i.test(candidate.getAttribute('accept') || '')) ||
      fileInputs[0] || null;
    const dropZone = document.querySelector([
      'main .dz-clickable',
      'main #co-uploader',
      'main [data-testid="uploader-dropzone"]',
      'main [data-testid="img-upload-input"]',
      'main [class*="dropzone" i]',
      '[role="dialog"] [class*="dropzone" i]',
      '[aria-label*="Add photos" i]',
      '[aria-label*="Add photo" i]',
      '[aria-label*="Upload photos" i]',
      '[data-qa-id="img-upload-dropzone"]',
      'div[role="button"][tabindex="0"][aria-label*="photo" i]',
    ].join(','));
    if (!input && !dropZone) return 0;
    const selected = photos.slice(0, input && !input.multiple && !dropZone ? 1 : 8);
    const files = await Promise.all(selected.map(async (photo) => {
      const response = await fetch(photo.dataUrl);
      if (!response.ok) throw new Error('KeepFlip could not read a saved photo.');
      const blob = await response.blob();
      return new File([blob], photo.name, { type: blob.type || 'image/jpeg' });
    }));
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    if (dropZone && typeof DragEvent !== 'undefined') {
      try {
        const options = { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer };
        for (const type of ['dragenter', 'dragover', 'drop']) dropZone.dispatchEvent(new DragEvent(type, options));
        return files.length;
      } catch { /* The normal file input remains available as a fallback. */ }
    }
    if (!input) return 0;
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files?.length || 0;
  }

  function liveListingUrl() {
    const pathname = location.pathname;
    return ({
      depop: /^\/(?:[a-zA-Z0-9_-]+\/)?products\/[^/]+\/?$/i,
      poshmark: /^\/listing\/[^/]+\/?$/i,
      mercari: /^\/(?:us\/)?item\/[^/]+\/?$/i,
      facebookMarketplace: /^\/marketplace\/item\/\d+\/?$/i,
      offerUp: /^\/item\/detail\/[^/]+\/?$/i,
    })[marketplace].test(pathname);
  }

  async function fill() {
    const payload = assignment.payload;
    if (/\/(login|signin|sign-in|checkpoint)(\/|$)/i.test(location.pathname)) {
      report('login_required', { message: 'Sign in on this marketplace, then return to KeepFlip and choose Resume.' });
      return;
    }
    if (isFacebookDeliveryStep()) {
      facebookNextClicked = true;
      await submitFacebookListing();
      return;
    }
    const platformFields = payload.platformFields && typeof payload.platformFields === 'object' && !Array.isArray(payload.platformFields)
      ? payload.platformFields
      : {};
    const fields = {};
    for (const key of Object.keys(patterns)) {
      const directValue = payload[key];
      const platformValue = platformFields[key];
      fields[key] = typeof directValue === 'string' && directValue.trim()
        ? directValue
        : marketplace === 'facebookMarketplace' && typeof platformValue === 'string' ? platformValue : '';
    }
    if (marketplace === 'facebookMarketplace') {
      for (const [key, value] of Object.entries(platformFields)) {
        if (!Object.prototype.hasOwnProperty.call(fields, key) && typeof value === 'string' && value.trim()) fields[key] = value;
      }
    }
    let attempts = 0;
    let composerOpenRequested = false;
    let facebookMetaAiDraftsOff = marketplace !== 'facebookMarketplace';
    while (attempts < 24) {
      attempts += 1;
      if (!facebookMetaAiDraftsOff) facebookMetaAiDraftsOff = turnOffFacebookMetaAiDrafts();
      const retryComposerEntry = marketplace === 'offerUp' || !composerOpenRequested;
      if (attempts >= 5 && retryComposerEntry && !findField('title')) {
        composerOpenRequested = openComposerIfNeeded() || composerOpenRequested;
      }
      expandFacebookMoreDetails(fields);
      if (marketplace === 'poshmark') {
        await fillPoshmarkSpecifics(fields, platformFields, payload);
      } else if (marketplace === 'mercari') {
        await fillMercariSpecifics(fields, platformFields, payload);
      } else if (marketplace === 'depop') {
        await fillDepopSpecifics(fields, platformFields, payload);
      } else if (marketplace === 'offerUp') {
        await fillOfferUpSpecifics(fields, platformFields, payload);
      }
      for (const [key, value] of Object.entries(fields)) {
        if (filledFields.includes(key) || !value) continue;
        if (marketplace === 'facebookMarketplace' && key === 'category') {
          const context = [fields.title, fields.description, platformFields.model, platformFields.itemType]
            .filter(Boolean).join(' ');
          if (await selectFacebookSuggestedCategory(value, context)) filledFields.push(key);
          continue;
        }
        if (marketplace === 'facebookMarketplace' && key === 'condition') {
          if (await selectFacebookCondition(value)) filledFields.push(key);
          continue;
        }
        if (marketplace === 'facebookMarketplace' && key === 'color' && !findField(key)) {
          if (await selectFacebookComboboxValue(key, value)) filledFields.push(key);
          continue;
        }
        const input = findField(key);
        if (input && setField(input, value)) filledFields.push(key);
      }
      const facebookFormReady = marketplace !== 'facebookMarketplace' ||
        ['category', 'condition'].every((key) => Boolean(fields[key]) && filledFields.includes(key));
      if (assignment.photos.length && uploadedPhotoCount === 0 && (filledFields.includes('title') || marketplace === 'depop')) {
        try { uploadedPhotoCount = await attachPhotos(assignment.photos); } catch { /* Report for review below. */ }
      }
      if (core.every((key) => filledFields.includes(key)) &&
        (!assignment.photos.length || uploadedPhotoCount === assignment.photos.length) &&
        facebookMetaAiDraftsOff && facebookFormReady) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const missingFields = Object.keys(fields).filter((key) =>
      marketplace === 'facebookMarketplace'
        ? (core.includes(key) || ['category', 'condition'].includes(key)) && (!fields[key] || !filledFields.includes(key))
        : fields[key] && !filledFields.includes(key),
    );
    const photosReady = payload.photoCount === 0 ||
      (uploadedPhotoCount === payload.photoCount && assignment.unavailablePhotoCount === 0);
    const facebookDetailsReady = marketplace !== 'facebookMarketplace' ||
      ['category', 'condition'].every((key) => Boolean(fields[key]) && filledFields.includes(key));
    const status = core.every((key) => filledFields.includes(key)) && facebookDetailsReady &&
      photosReady && facebookMetaAiDraftsOff ? 'filled' : 'needs_review';
  const details = { fields: filledFields, missingFields, uploadedPhotoCount,
    message: status === 'filled' ? 'Draft fields filled and photos sent to the upload control. Check the marketplace preview before posting.'
      : !facebookMetaAiDraftsOff ? 'Facebook could not turn off Draft listings with Meta AI. Check that switch before continuing.'
        : marketplace === 'facebookMarketplace' && !filledFields.includes('category')
          ? 'Facebook did not offer a category that matches this item. Choose the correct category in the Facebook tab before continuing.'
          : marketplace === 'facebookMarketplace' && !fields.condition
            ? 'Add this item’s condition in KeepFlip, then retry the Facebook form.'
            : marketplace === 'facebookMarketplace' && !filledFields.includes('condition')
              ? 'Facebook’s condition menu did not show a matching option. Choose the item condition in the Facebook tab before continuing.'
              : 'Some required fields or photos need attention in this marketplace tab.' };
    await report(status, marketplace === 'facebookMarketplace' && status === 'filled'
      ? { ...details, message: 'Facebook listing details and photos are ready. Moving to the next listing step…' }
      : details);
    if (marketplace === 'facebookMarketplace' && status === 'filled') await submitFacebookListing();
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  }

  function openComposerIfNeeded() {
    if (!['offerUp', 'depop', 'facebookMarketplace'].includes(marketplace) || findField('title')) return false;
    if (marketplace === 'offerUp') {
      const postItemAction = document.querySelectorAll('a,button,[role="button"],[role="menuitem"]');
      for (const control of postItemAction) {
        const label = (control.innerText || control.textContent || '').replace(/\s+/g, ' ').trim();
        if (visible(control) && /^(post an item|post item|sell an item|sell item|item for sale|start selling)$/i.test(label)) {
          control.click();
          return true;
        }
      }
      const sellButton = document.querySelector('[data-testid="HeaderSellButton"]') ||
        document.querySelector('button[aria-label="Sell"]');
      if (!sellButton || !visible(sellButton) || offerUpSellMenuOpened) return false;
      sellButton.click();
      offerUpSellMenuOpened = true;
      return true;
    }

    const controls = document.querySelectorAll('a,button,[role="button"]');
    if (marketplace === 'facebookMarketplace') {
      const isItemForSaleChoice = (control) => {
        const label = (control.getAttribute('aria-label') || control.innerText || control.textContent || '')
          .replace(/\s+/g, ' ').trim();
        // Facebook includes the explanatory copy in the card's accessible text,
        // e.g. "Item for sale Create a single listing for one or more items...".
        return /^item for sale(?:\s|$)/i.test(label);
      };
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        for (const control of dialog.querySelectorAll('a,button,[role="button"]')) {
          if (visible(control) && isItemForSaleChoice(control)) {
            control.click();
            return true;
          }
        }
      }
      // Some Facebook layouts render the listing-type chooser without a dialog.
      // Prefer the item card over the surrounding "Create new listing" navigation link.
      for (const control of controls) {
        if (visible(control) && isItemForSaleChoice(control)) {
          control.click();
          return true;
        }
      }
      // Do not click the sidebar entry again while a chooser dialog is already open.
      if (dialogs.length) return false;
    }

    const expected = marketplace === 'facebookMarketplace'
      ? /^(create a new listing|create new listing)$/i
      : /^sell now$/i;
    for (const control of controls) {
      const label = (control.innerText || control.textContent || '').replace(/\s+/g, ' ').trim();
      if (visible(control) && expected.test(label)) {
        control.click();
        return true;
      }
    }
    return false;
  }

  function facebookButtonLabel(button) {
    return (button.getAttribute('aria-label') || button.innerText || button.textContent || button.value || '')
      .replace(/\s+/g, ' ').trim();
  }

  function findFacebookNextButton() {
    const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
    return controls.find((control) => (control.getAttribute('aria-label') || '').trim().toLowerCase() === 'next') ||
      controls.find((control) => facebookButtonLabel(control).toLowerCase() === 'next') || null;
  }

  function findFacebookFinalSubmitButton() {
    const controls = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter(visible);
    const candidates = controls.filter((control) => /^(post|post item|post listing|publish|list|list item|create listing|submit listing)$/i.test(facebookButtonLabel(control)));
    const scoped = candidates.filter((control) => control.closest('main,form,[role="dialog"]'));
    if (scoped.length) return scoped[0];
    return candidates.length === 1 ? candidates[0] : null;
  }

  function watchForLiveListing() {
    let checks = 0;
    const timer = setInterval(() => {
      checks += 1;
      if (liveListingUrl()) { clearInterval(timer); void report('confirmed', { externalUrl: location.href }); }
      else if (checks >= 30) clearInterval(timer);
    }, 1000);
  }

  async function submitFacebookListing() {
    if (facebookSubmissionInProgress) return;
    facebookSubmissionInProgress = true;
    try {
      if (!facebookNextClicked && !isFacebookDeliveryStep()) {
        let nextButton = null;
        for (let attempt = 0; attempt < 20 && !nextButton; attempt += 1) {
          nextButton = findFacebookNextButton();
          if (!nextButton) await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!nextButton) {
          await report('needs_review', { fields: filledFields, uploadedPhotoCount,
            message: 'Facebook has the listing details, but its Next button was not found. Open the Facebook tab to continue.' });
          return;
        }
        facebookNextClicked = true;
        nextButton.click();
      } else if (isFacebookDeliveryStep()) {
        facebookNextClicked = true;
      }

      for (let attempt = 0; attempt < 24; attempt += 1) {
        if (liveListingUrl()) {
          await report('submit_clicked', { fields: filledFields, uploadedPhotoCount,
            message: 'Facebook advanced to the live listing. Checking the listing page…' });
          await report('confirmed', { externalUrl: location.href });
          return;
        }
        if (isFacebookDeliveryStep()) {
          const delivery = await prepareFacebookDeliveryStep();
          if (!delivery.ready) {
            await report('needs_review', { fields: filledFields, uploadedPhotoCount, message: delivery.message });
            return;
          }
          const deliveryNextButton = findFacebookNextButton();
          if (deliveryNextButton) {
            deliveryNextButton.click();
            await report('filled', { fields: filledFields, uploadedPhotoCount,
              message: 'Facebook delivery settings are ready. Advanced to the final listing step.' });
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        const publishButton = findFacebookFinalSubmitButton();
        if (publishButton) {
          publishButton.click();
          await report('submit_clicked', { fields: filledFields, uploadedPhotoCount,
            message: 'Facebook’s final Post/Publish action was clicked. Checking for the live listing…' });
          watchForLiveListing();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await report('needs_review', { fields: filledFields, uploadedPhotoCount,
        message: 'Facebook’s Next button was clicked, but the final listing step was not confirmed. Review the Facebook tab to finish or confirm the post.' });
    } finally {
      facebookSubmissionInProgress = false;
    }
  }

  async function submit() {
    if (!assignment) return;
    if (marketplace === 'facebookMarketplace') {
      if (!isFacebookDeliveryStep() && !core.every((key) => filledFields.includes(key))) return;
      await submitFacebookListing();
      return;
    }
    if (!core.every((key) => filledFields.includes(key))) return;
    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter(visible);
    const label = (button) => (button.innerText || button.textContent || button.value || '').trim();
    const listingArea = (button) => button.closest('main,form,[role="dialog"]');
    const button = buttons.find((candidate) => listingArea(candidate) && /^(post|post item|post listing|publish|list|list item|create listing|submit listing)$/i.test(label(candidate))) ||
      buttons.find((candidate) => candidate.getAttribute('data-qa-id') === 'submit-listing-btn' || candidate.getAttribute('data-testid') === 'ListButton' || candidate.getAttribute('data-testid') === 'post-button') ||
      buttons.find((candidate) => listingArea(candidate) && candidate.type === 'submit' && !/^(next|continue|review)$/i.test(label(candidate)));
    if (button) {
      button.click();
      await report('submit_clicked', { fields: filledFields, uploadedPhotoCount, message: 'Post was clicked. Checking for a live listing.' });
      let checks = 0;
      const timer = setInterval(() => {
        checks += 1;
        if (liveListingUrl()) { clearInterval(timer); report('confirmed', { externalUrl: location.href }); }
        else if (checks >= 30) clearInterval(timer);
      }, 1000);
      return;
    }
    const advance = buttons.find((candidate) => listingArea(candidate) && /^(next|continue|review)$/i.test(label(candidate)));
    if (advance) {
      advance.click();
      await report('filled', { fields: filledFields, uploadedPhotoCount, message: 'Advanced to the next step. Review and select Post again.' });
      return;
    }
    await report('needs_review', { fields: filledFields, uploadedPhotoCount, message: 'The marketplace post button was not found. Check this tab.' });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'KEEPFLIP_LISTING_SUBMIT' && assignment?.runId === message.runId && marketplace === message.marketplace) void submit();
    if (message?.type === 'KEEPFLIP_LISTING_RETRY' && assignment?.runId === message.runId && marketplace === message.marketplace) void fill();
  });

  let requests = 0;
  function assignmentUnavailable() {
    console.warn('KeepFlip could not connect this marketplace tab to its listing run.');
    void sendMessageQuietly({ type: 'KEEPFLIP_LISTING_TAB_INIT_ERROR', marketplace });
  }

  function retryAssignment() {
    if (requests < 12) setTimeout(getAssignment, 500);
    else assignmentUnavailable();
  }

  async function getAssignment() {
    requests += 1;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'KEEPFLIP_LISTING_TAB_READY' });
      if (!response?.ok) {
        retryAssignment();
        return;
      }
      assignment = response;
      if (response.jobStatus === 'confirmed') return;
      if (response.jobStatus === 'submit_clicked') {
        if (Date.now() - response.submittedAt <= 120_000 && liveListingUrl()) report('confirmed', { externalUrl: location.href });
        return;
      }
      await fill();
    } catch (error) {
      console.error('KeepFlip listing runner initialization failed:', error);
      retryAssignment();
    }
  }
  void getAssignment();
})();
