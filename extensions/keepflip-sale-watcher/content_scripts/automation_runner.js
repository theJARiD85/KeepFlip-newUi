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
  let photoUploadAttempted = false;
  let offerUpSellMenuOpened = false;
  let facebookMetaAiSwitchClickRequested = false;
  let facebookMoreDetailsClickRequested = false;
  let facebookCategoryPickerOpenRequested = false;
  let facebookNextClicked = false;
  let facebookSubmissionInProgress = false;
  let facebookShippingOptionsSaved = false;
  const facebookItemForSaleSelector = '[id^="mount_0_0_"] > div > div:nth-child(1) > div > div.x9f619.x1n2onr6.x1ja2u2z > div > div > div.x78zum5.xdt5ytf.x1t2pt76.x1n2onr6.x1ja2u2z.x10cihs4 > div.x9f619.x2lah0s.x1nhvcw1.x1qjc9v5.xozqiw3.x1q0g3np.x78zum5.x1iyjqo2.x1t2pt76.x1n2onr6.x1ja2u2z.xvrxa7q > div.x9f619.x1n2onr6.x1ja2u2z.xdt5ytf.x193iq5w.xeuugli.x1r8uery.x1iyjqo2.xs83m0k.x78zum5.x1t2pt76 > div > div > div.xamitd3.x78zum5.x1q0g3np.x1a02dak.x1e56ztr.x2fvf9.x14vqqas.xh8yej3.x1ni0lre.x1pz0773.xnkmj2t > div:nth-child(1) > div > span > div > div';

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
    if (!toggle) return Boolean(findField('title'));
    if (toggle.disabled) return false;
    if ((toggle.checked || toggle.getAttribute('aria-checked') === 'true') && !facebookMetaAiSwitchClickRequested) {
      facebookMetaAiSwitchClickRequested = true;
      clickMarketplaceControl(toggle);
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
      clickMarketplaceControl(control);
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
    const normalizedLabel = normalizeChoiceLabel(String(label || '')
      .replace(/^Suggested category:\s*/i, '')
      .replace(/\s+Shipping available\s*$/i, ''));
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

  async function waitForFacebookCategory(value, context) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const combo = findFacebookCategoryCombobox();
      if (combo && facebookCategoryScore(value, facebookComboboxValue(combo), context) > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  async function selectFacebookSuggestedCategory(value, context = '') {
    if (marketplace !== 'facebookMarketplace' || !value) return false;
    const group = document.querySelector('[aria-label="Suggested categories"]');
    const suggestions = group
      ? Array.from(group.querySelectorAll('[aria-label^="Suggested category:"]')).filter(visible)
      : [];
    let target = bestFacebookCategoryCandidate(suggestions, value, context);
    if (target) {
      clickMarketplaceControl(target);
      return waitForFacebookCategory(value, context);
    }

    const combo = findFacebookCategoryCombobox();
    if (!combo) return false;
    const currentValue = facebookComboboxValue(combo);
    if (facebookCategoryScore(value, currentValue, context) > 0) return true;

    if (combo.getAttribute('aria-expanded') !== 'true' && !facebookCategoryPickerOpenRequested) {
      facebookCategoryPickerOpenRequested = true;
      clickMarketplaceControl(combo);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"]'))
      .filter(visible);
    target = bestFacebookCategoryCandidate(options, value, context);
    if (!target) return false;
    clickMarketplaceControl(target);
    return waitForFacebookCategory(value, context);
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
        clickMarketplaceControl(currentCombo);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const option = findFacebookDeliveryOption(method);
      if (!option) return { ok: false, message: `Facebook's ${method === 'local_pickup' ? 'local pickup' : 'shipping'} option was not found. Choose the delivery method in Facebook.` };
      clickMarketplaceControl(option);
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
    const textSpan = Array.from(document.querySelectorAll('span')).find((element) =>
      visible(element) && normalizeChoiceLabel(element.textContent) === 'select shipping label');
    const pressableButton = textSpan?.closest?.('[role="button"]');
    if (pressableButton && visible(pressableButton)) return pressableButton;

    const matchesShippingLabel = (label) => {
      const normalized = normalizeChoiceLabel(label);
      return normalized === 'select shipping label' ||
        /^(?:choose|select) (?:a )?shipping label$/.test(normalized) ||
        // Facebook replaces the placeholder with the selected service. The
        // same button reopens the dialog after a paused or retried run.
        /^prepaid label\b/.test(normalized);
    };
    return Array.from(document.querySelectorAll('button,[role="button"]')).find((control) => {
      if (!visible(control)) return false;
      const labels = [
        control.getAttribute('aria-label'),
        control.innerText,
        control.textContent,
        control.value,
      ].filter(Boolean);
      return labels.some(matchesShippingLabel);
    }) || null;
  }

  function clickFacebookShippingLabelButton(button) {
    if (!button || !visible(button)) return false;
    try { button.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch { /* Continue with the visible button. */ }
    try { button.focus?.({ preventScroll: true }); } catch { /* The marketplace may not expose focus. */ }
    try { button.click(); return true; } catch { /* Fall back to pointer and mouse events. */ }
    const rect = button.getBoundingClientRect();
    const pageWindow = typeof window === 'undefined' ? null : window;
    const mouseEventConstructor = typeof MouseEvent === 'function' ? MouseEvent : pageWindow?.MouseEvent;
    const pointerEventConstructor = typeof PointerEvent === 'function' ? PointerEvent : pageWindow?.PointerEvent;
    const x = Number.isFinite(rect.x) ? rect.x : Number(rect.left) || 0;
    const y = Number.isFinite(rect.y) ? rect.y : Number(rect.top) || 0;
    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: pageWindow || undefined,
      button: 0,
      buttons: 0,
      clientX: x + 10,
      clientY: y + 10,
      detail: 1,
    };
    if (typeof button.dispatchEvent === 'function' && typeof mouseEventConstructor === 'function') {
      try {
        for (const eventType of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          const EventConstructor = eventType.startsWith('pointer') && typeof pointerEventConstructor === 'function'
            ? pointerEventConstructor
            : mouseEventConstructor;
          const eventOptions = { ...options, buttons: /down$/.test(eventType) ? 1 : 0 };
          button.dispatchEvent(new EventConstructor(eventType, eventType.startsWith('pointer')
            ? { ...eventOptions, pointerId: 1, pointerType: 'mouse', isPrimary: true }
            : eventOptions));
        }
        return true;
      } catch { /* Fall through to the DOM activation method. */ }
    }
    try { button.click(); return true; } catch {
      return clickMarketplaceControl(button);
    }
  }

  async function waitForFacebookShippingOptionsDialog(maxAttempts = 40) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const dialog = findFacebookShippingOptionsDialog();
      if (dialog) return dialog;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return findFacebookShippingOptionsDialog();
  }

  async function openFacebookShippingOptions(button) {
    let activationMethod = 'dom_click';
    clickFacebookShippingLabelButton(button);
    let dialog = await waitForFacebookShippingOptionsDialog();
    if (dialog) return { dialog, activationMethod };

    // Reacquire the current row after React renders; a click only counts when
    // Facebook shows its shipping settings dialog.
    const liveButton = findFacebookShippingLabelButton() || button;
    if (liveButton && visible(liveButton) && typeof liveButton.dispatchEvent === 'function') {
      activationMethod = 'pointer_mouse_fallback';
      clickMarketplaceControl(liveButton);
      dialog = await waitForFacebookShippingOptionsDialog();
    }
    return { dialog, activationMethod };
  }

  async function waitForFacebookShippingLabelButton() {
    const ready = findFacebookShippingLabelButton();
    if (ready) return ready;
    // Facebook may render this row after it commits the delivery selection.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (findFacebookShippingOptionsDialog()) return null;
      const button = findFacebookShippingLabelButton();
      if (button) return button;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return findFacebookShippingLabelButton();
  }

  function clickMarketplaceControl(control) {
    if (!control) return false;
    const controlType = String(control.type || control.getAttribute?.('type') || '').toLowerCase();
    if (['checkbox', 'radio'].includes(controlType)) {
      try { control.click(); return true; } catch { return false; }
    }
    if (typeof control.getBoundingClientRect === 'function' && !visible(control)) return false;
    if (typeof control.getBoundingClientRect !== 'function') {
      try { control.click(); return true; } catch { return false; }
    }

    // Facebook's accessible controls are React-backed divs and labels. Their
    // native DOM click activates the live form; synthetic pointer sequences can
    // report success while leaving the control unchanged.
    if (marketplace === 'facebookMarketplace') {
      try { control.click(); return true; } catch { /* Try pointer events below. */ }
    }

    try { control.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch { /* Continue with the visible control. */ }
    try { control.focus?.({ preventScroll: true }); } catch { /* Marketplace controls may not be focusable. */ }
    const rect = control.getBoundingClientRect();
    const clientX = Number.isFinite(rect.left + rect.width / 2) ? rect.left + rect.width / 2 : 0;
    const clientY = Number.isFinite(rect.top + rect.height / 2) ? rect.top + rect.height / 2 : 0;
    const pageWindow = typeof window === 'undefined' ? null : window;
    const mouseEventConstructor = typeof MouseEvent === 'function' ? MouseEvent : pageWindow?.MouseEvent;
    const pointerEventConstructor = typeof PointerEvent === 'function' ? PointerEvent : pageWindow?.PointerEvent;
    if (typeof control.dispatchEvent === 'function' && typeof mouseEventConstructor === 'function') {
      const eventSequence = [['pointerdown', 1], ['mousedown', 1], ['pointerup', 0], ['mouseup', 0], ['click', 0]];
      try {
        for (const [type, buttons] of eventSequence) {
          const options = { bubbles: true, cancelable: true, composed: true, view: pageWindow || undefined,
            button: 0, buttons, clientX, clientY, detail: type === 'click' ? 1 : 0 };
          const EventConstructor = type.startsWith('pointer') && typeof pointerEventConstructor === 'function'
            ? pointerEventConstructor
            : mouseEventConstructor;
          control.dispatchEvent(new EventConstructor(type, type.startsWith('pointer')
            ? { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true }
            : options));
        }
        return true;
      } catch { /* Use the native click method if event construction is unavailable. */ }
    }
    try { control.click(); return true; } catch { return false; }
  }

  function findFacebookShippingOptionsDialog() {
    const explicit = document.querySelector('[role="dialog"][aria-label="Change shipping method"]');
    if (explicit && visible(explicit)) return explicit;

    const olderLayout = document.querySelector('[role="dialog"][aria-label*="Package weight and shipping options"]');
    if (olderLayout && visible(olderLayout) && /\bupdate\b/i.test(olderLayout.innerText || olderLayout.textContent || '')) {
      return olderLayout;
    }

    const candidates = Array.from(document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], [aria-label*="Package weight and shipping options"], [aria-label*="Change shipping method"]',
    )).filter(visible);
    return candidates.find((dialog) => {
      const text = normalizeChoiceLabel([
        dialog.getAttribute('aria-label'), dialog.innerText, dialog.textContent,
      ].filter(Boolean).join(' '));
      return text.includes('package weight') && text.includes('update') &&
        (text.includes('shipping') || text.includes('delivery'));
    }) || null;
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

  function facebookPackageWeightMeasurement(payload) {
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
      if (directRange) continue;

      const poundsPart = value.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/i);
      const ouncesPart = value.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/i);
      if (poundsPart && ouncesPart) {
        const pounds = Number(poundsPart[1]) + Number(ouncesPart[1]) / 16;
        if (pounds > 0 && Number.isFinite(pounds)) return { amount: pounds, unit: 'lbs', pounds };
      }

      const amount = value.match(/\d+(?:\.\d+)?/);
      if (!amount) continue;
      const textUnit = value.match(/\b(lb|lbs|pounds?|oz|ounces?|kg|kilograms?|g|grams?)\b/i)?.[1]?.toLowerCase();
      const keyUnit = key.match(/(lbs?|pounds?|oz|ounces?|kg|kilograms?|g|grams?)$/i)?.[1]?.toLowerCase();
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      const unit = textUnit || keyUnit || (/^(package|shipping)weight$/.test(normalizedKey) ? 'lbs' : '');
      if (!unit) continue;
      const numericAmount = Number(amount[0]);
      let pounds = numericAmount;
      let normalizedUnit = 'lbs';
      if (/^(oz|ounce|ounces)$/.test(unit)) {
        pounds /= 16;
        normalizedUnit = 'oz';
      } else if (/^(kg|kilogram|kilograms)$/.test(unit)) {
        pounds *= 2.2046226218;
        normalizedUnit = 'kg';
      } else if (/^(g|gram|grams)$/.test(unit)) {
        pounds /= 453.59237;
        normalizedUnit = 'g';
      }
      if (pounds > 0 && Number.isFinite(pounds)) {
        return { amount: numericAmount, unit: normalizedUnit, pounds };
      }
    }
    return null;
  }

  function facebookPackageWeightHint(payload) {
    const measurement = facebookPackageWeightMeasurement(payload);
    if (measurement) return facebookPackageWeightRangeForPounds(measurement.pounds);
    const platformFields = payload?.platformFields && typeof payload.platformFields === 'object'
      ? payload.platformFields
      : {};
    const values = [
      ...Object.entries(platformFields).filter(([key]) => /weight/i.test(key)).map(([, value]) => value),
      ...['packageWeight', 'shippingWeight', 'weight', 'packageWeightOz', 'shippingWeightOz']
        .map((key) => payload?.[key]).filter((value) => value !== undefined && value !== null),
    ];
    return values.map((value) => facebookPackageWeightRanges.find((range) =>
      normalizeChoiceLabel(range) === normalizeChoiceLabel(value))).find(Boolean) || null;
  }

  function facebookPackageWeightRadios(dialog) {
    const selector = 'input[type="radio"][name="package_weight_range"]';
    const scoped = Array.from(dialog?.querySelectorAll(selector) || []);
    return scoped.length ? scoped : Array.from(document.querySelectorAll(selector));
  }

  function findFacebookWeightDialog(shippingDialog) {
    const weightDialog = document.querySelector('[role="dialog"][aria-label="Package weight and shipping options"]');
    if (weightDialog && visible(weightDialog)) return weightDialog;
    // Older layouts can render the weight controls inside the shipping dialog.
    return shippingDialog || null;
  }

  function findFacebookExactWeightButton(dialog) {
    const weightDialog = findFacebookWeightDialog(dialog);
    return Array.from(weightDialog?.querySelectorAll('button,[role="button"]') || []).find((control) => {
      if (!visible(control)) return false;
      const labels = [control.getAttribute('aria-label'), control.innerText, control.textContent, control.value]
        .map(normalizeChoiceLabel).filter(Boolean);
      return labels.includes('enter exact weight');
    }) || null;
  }

  function findFacebookExactWeightInput(dialog) {
    const weightDialog = findFacebookWeightDialog(dialog);
    const scoped = Array.from(weightDialog?.querySelectorAll('input') || []);
    const allInputs = scoped.filter((input) => {
      const type = String(input.type || input.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'file', 'hidden', 'password', 'radio', 'submit'].includes(type) &&
        typeof input.getBoundingClientRect === 'function' && visible(input);
    });
    const labelForInput = (input) => [
      labelFor(input), input.getAttribute('aria-label'), input.getAttribute('placeholder'),
      input.getAttribute('name'), input.getAttribute('id'),
      input.closest('label')?.innerText, input.closest('label')?.textContent,
    ].filter(Boolean).join(' ');
    const labeled = allInputs.filter((input) => /weight/i.test(labelForInput(input)));
    if (labeled.length === 1) return labeled[0];

    const scopedNumeric = scoped.filter((input) => {
      const type = String(input.type || input.getAttribute('type') || '').toLowerCase();
      return !['button', 'checkbox', 'file', 'hidden', 'password', 'radio', 'submit'].includes(type) &&
        typeof input.getBoundingClientRect === 'function' && visible(input) &&
        (type === 'number' || input.inputMode === 'decimal' || input.getAttribute('inputmode') === 'decimal');
    });
    if (scopedNumeric.length === 1) return scopedNumeric[0];
    const globalNumeric = allInputs.filter((input) => {
      const type = String(input.type || input.getAttribute('type') || '').toLowerCase();
      return type === 'number' || input.inputMode === 'decimal' || input.getAttribute('inputmode') === 'decimal';
    });
    return globalNumeric.length === 1 ? globalNumeric[0] : null;
  }

  function findFacebookExactWeightInputs(dialog) {
    const weightDialog = findFacebookWeightDialog(dialog);
    const scoped = Array.from(weightDialog?.querySelectorAll('input') || []);
    const inputs = scoped.filter((input) => {
      const type = String(input.type || input.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'file', 'hidden', 'password', 'radio', 'submit'].includes(type) &&
        typeof input.getBoundingClientRect === 'function' && visible(input);
    });
    const unitLabel = (input) => {
      const parent = input.parentElement;
      return normalizeChoiceLabel([
        labelFor(input), input.getAttribute('aria-label'), input.getAttribute('placeholder'),
        input.getAttribute('name'), input.getAttribute('id'),
        input.closest('label')?.innerText, input.closest('label')?.textContent,
        parent?.innerText, parent?.textContent,
      ].filter(Boolean).join(' '));
    };
    const ounces = inputs.find((input) => /\b(?:oz|ounce|ounces)\b/i.test(unitLabel(input)));
    const pounds = inputs.find((input) => /\b(?:lb|lbs|pound|pounds)\b/i.test(unitLabel(input)));
    if (ounces && (pounds || inputs.length === 2)) {
      return { pounds: pounds || inputs.find((input) => input !== ounces), ounces };
    }
    if (inputs.length === 2) return { pounds: inputs[0], ounces: inputs[1] };
    const single = findFacebookExactWeightInput(dialog);
    return single ? { single } : null;
  }

  function findFacebookExactWeightDoneButton(dialog) {
    const weightDialog = findFacebookWeightDialog(dialog);
    return Array.from(weightDialog?.querySelectorAll('button,[role="button"]') || []).find((control) => {
      if (!visible(control) || control.disabled || control.getAttribute('aria-disabled') === 'true') return false;
      const labels = [control.getAttribute('aria-label'), control.innerText, control.textContent, control.value]
        .map(normalizeChoiceLabel).filter(Boolean);
      return labels.includes('done');
    }) || null;
  }

  function facebookExactWeightInputValue(measurement, input) {
    const fieldLabel = normalizeChoiceLabel([
      labelFor(input), input.getAttribute('aria-label'), input.getAttribute('placeholder'),
    ].filter(Boolean).join(' '));
    let value = measurement.pounds;
    if (/\b(oz|ounce|ounces)\b/.test(fieldLabel)) value *= 16;
    else if (/\b(kg|kilogram|kilograms)\b/.test(fieldLabel)) value /= 2.2046226218;
    else if (/\b(g|gram|grams)\b/.test(fieldLabel)) value *= 453.59237;
    return String(Number(value.toFixed(3)));
  }

  async function enterFacebookExactWeight(dialog, measurement) {
    let inputs = findFacebookExactWeightInputs(dialog);
    const button = findFacebookExactWeightButton(dialog);
    if (!inputs && button) {
      clickMarketplaceControl(button);
      for (let attempt = 0; attempt < 30 && !inputs; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        dialog = findFacebookShippingOptionsDialog() || dialog;
        inputs = findFacebookExactWeightInputs(dialog);
      }
    }
    if (!button && !inputs) return { supported: false, dialog };
    if (!inputs) return { supported: true, ready: false, dialog };

    if (inputs.pounds && inputs.ounces) {
      const totalOunces = Math.max(0, Math.round(measurement.pounds * 16));
      const poundsValue = String(Math.floor(totalOunces / 16));
      const ouncesValue = String(totalOunces % 16);
      if (!setField(inputs.pounds, poundsValue) || String(inputs.pounds.value ?? '').trim() !== poundsValue ||
        !setField(inputs.ounces, ouncesValue) || String(inputs.ounces.value ?? '').trim() !== ouncesValue) {
        return { supported: true, ready: false, dialog };
      }
    } else {
      const input = inputs.single;
      const value = facebookExactWeightInputValue(measurement, input);
      if (!setField(input, value) || String(input.value ?? '').trim() !== value) {
        return { supported: true, ready: false, dialog };
      }
    }

    let doneButton = findFacebookExactWeightDoneButton(dialog);
    const needsDone = Boolean(inputs.pounds && inputs.ounces);
    for (let attempt = 0; needsDone && !doneButton && attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      dialog = findFacebookShippingOptionsDialog() || dialog;
      doneButton = findFacebookExactWeightDoneButton(dialog);
    }
    if (needsDone && !doneButton) {
      return { supported: true, ready: false, dialog, message: 'Facebook did not show the Done button for the exact package weight.' };
    }
    if (doneButton) {
      clickMarketplaceControl(doneButton);
      let doneStillVisible = Boolean(findFacebookExactWeightDoneButton(dialog));
      for (let attempt = 0; doneStillVisible && attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        dialog = findFacebookShippingOptionsDialog() || dialog;
        doneStillVisible = Boolean(findFacebookExactWeightDoneButton(dialog));
      }
      if (doneStillVisible) return { supported: true, ready: false, dialog, message: 'Facebook’s exact weight editor is still open after Done.' };
    }
    return { supported: true, ready: true, dialog };
  }

  async function openFacebookPackageWeightOptions(dialog, packageWeightCombo) {
    let combo = findFacebookCombobox('package weight') || packageWeightCombo;
    if (!combo) return { dialog, combo, radios: [] };

    // The weight menu is a separate dialog. Find its labeled combobox instead
    // of a generated mount ID or a positional chain of Facebook classes.
    if (combo.getAttribute?.('aria-expanded') !== 'true') {
      clickMarketplaceControl(combo);
    }
    let radios = facebookPackageWeightRadios(dialog);
    for (let attempt = 0; attempt < 40 && radios.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      dialog = findFacebookShippingOptionsDialog() || dialog;
      combo = findFacebookCombobox('package weight') || combo;
      radios = facebookPackageWeightRadios(dialog);
      if (combo.getAttribute?.('aria-expanded') === 'false') break;
    }
    return { dialog, combo, radios };
  }

  function facebookPackageWeightRadioLabel(radio) {
    return radio.value || radio.getAttribute('value') || radio.getAttribute('aria-label') ||
      radio.closest('label')?.innerText || radio.closest('label')?.textContent || '';
  }

  function facebookSelectedPackageWeight(dialog) {
    return facebookPackageWeightRadios(dialog).find((radio) =>
      radio.checked || radio.getAttribute('aria-checked') === 'true') || null;
  }

  function facebookExactWeightMatches(combo, measurement) {
    if (!combo) return false;
    const value = facebookComboboxValue(combo);
    const pounds = /\b(\d+)\s*(?:lb|lbs|pound|pounds)\b/.exec(value);
    const ounces = /\b(\d+)\s*(?:oz|ounce|ounces)\b/.exec(value);
    if (!pounds && !ounces) return false;
    const actualOunces = Number(pounds?.[1] || 0) * 16 + Number(ounces?.[1] || 0);
    return actualOunces === Math.round(measurement.pounds * 16);
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
      visible(control) && !control.disabled && control.getAttribute('aria-disabled') !== 'true' &&
      /^update$/i.test(facebookButtonLabel(control))) || null;
  }

  async function saveFacebookShippingOptions(dialog, packageWeightCombo) {
    const payload = assignment?.payload || {};
    const measurement = facebookPackageWeightMeasurement(payload);
    const expectedRange = facebookPackageWeightHint(payload);
    const opened = await openFacebookPackageWeightOptions(dialog, packageWeightCombo);
    dialog = opened.dialog;
    packageWeightCombo = opened.combo;
    let radios = opened.radios;
    let selectedRadio = facebookSelectedPackageWeight(dialog);
    let selectedLabel = selectedRadio ? facebookPackageWeightRadioLabel(selectedRadio) : '';
    let exactWeightApplied = false;

    if (measurement) {
      const exactWeight = await enterFacebookExactWeight(dialog, measurement);
      if (exactWeight.supported) {
        if (!exactWeight.ready) {
          return { ready: false, message: exactWeight.message || 'Facebook opened exact package-weight entry, but KeepFlip could not find its weight field. Enter the item’s approximate packaged weight in Facebook, then click Try filling again in KeepFlip.' };
        }
        dialog = exactWeight.dialog;
        exactWeightApplied = true;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          packageWeightCombo = findFacebookCombobox('package weight') || packageWeightCombo;
          if (facebookExactWeightMatches(packageWeightCombo, measurement)) break;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        if (!facebookExactWeightMatches(packageWeightCombo, measurement)) {
          return { ready: false, message: 'Facebook did not confirm the item’s exact packaged weight. Check Package weight before continuing.' };
        }
      }
    }

    if (!exactWeightApplied && expectedRange && normalizeChoiceLabel(selectedLabel) !== normalizeChoiceLabel(expectedRange)) {
      const opened = await openFacebookPackageWeightOptions(dialog, packageWeightCombo);
      dialog = opened.dialog;
      packageWeightCombo = opened.combo;
      radios = opened.radios;
      const target = radios.find((radio) =>
        normalizeChoiceLabel(facebookPackageWeightRadioLabel(radio)) === normalizeChoiceLabel(expectedRange));
      if (!target) return { ready: false, message: `KeepFlip could not find Facebook’s ${expectedRange} package-weight option. Choose the shipping weight in Facebook.` };
      clickMarketplaceControl(target);
      await new Promise((resolve) => setTimeout(resolve, 120));
      dialog = findFacebookShippingOptionsDialog() || dialog;
      selectedRadio = facebookSelectedPackageWeight(dialog);
      selectedLabel = selectedRadio ? facebookPackageWeightRadioLabel(selectedRadio) : '';
      packageWeightCombo = findFacebookCombobox('package weight') || packageWeightCombo;
      if (normalizeChoiceLabel(selectedLabel) !== normalizeChoiceLabel(expectedRange) &&
          facebookComboboxValue(packageWeightCombo) !== normalizeChoiceLabel(expectedRange)) {
        return { ready: false, message: `Facebook did not confirm the ${expectedRange} package weight. Choose it in Facebook before continuing.` };
      }
    }

    if (!exactWeightApplied && !selectedRadio && !facebookComboboxValue(packageWeightCombo)) {
      await openFacebookPackageWeightOptions(dialog, packageWeightCombo);
      return { ready: false, message: 'Choose the item’s total package weight in Facebook, then click Try filling again in KeepFlip.' };
    }

    // Facebook calculates a carrier after the weight is committed. Update may
    // remain visible while that calculation is still loading.
    let carrier = findFacebookCombobox('shipping carrier');
    for (let attempt = 0; attempt < 20 && (!carrier || !facebookComboboxValue(carrier)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      carrier = findFacebookCombobox('shipping carrier');
    }
    if (!carrier || !facebookComboboxValue(carrier)) {
      return { ready: false, message: 'Facebook has not selected a shipping carrier yet. Choose a carrier in its shipping dialog, then retry.' };
    }

    const sellerPaysShipping = facebookSellerPaysShippingPreference(payload);
    if (sellerPaysShipping !== null) {
      const sellerShippingControl = findFacebookSellerPaysShippingControl(dialog);
      if (!sellerShippingControl) {
        return { ready: false, message: 'KeepFlip could not find Facebook’s “Cover the shipping cost so buyers see free shipping” option.' };
      }
      if (facebookShippingPaidBySellerIsChecked(sellerShippingControl) !== sellerPaysShipping) {
        clickMarketplaceControl(sellerShippingControl);
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (facebookShippingPaidBySellerIsChecked(sellerShippingControl) === sellerPaysShipping) break;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      if (facebookShippingPaidBySellerIsChecked(sellerShippingControl) !== sellerPaysShipping) {
        return { ready: false, message: 'Facebook did not confirm the requested seller-paid shipping setting. Check the shipping option.' };
      }
    }

    const updateButton = findFacebookDialogUpdateButton(dialog);
    if (!updateButton) return { ready: false, message: 'KeepFlip could not find Facebook’s Update button to save shipping info.' };
    clickMarketplaceControl(updateButton);
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
    const preference = facebookDeliveryPreference();
    let shippingOptionsDialog = findFacebookShippingOptionsDialog();
    let combo = findFacebookCombobox('delivery method');
    let selection;

    // Facebook hides the delivery method combobox while its shipping settings
    // dialog is open. Resume that dialog directly instead of reporting that
    // the delivery menu is missing.
    if (shippingOptionsDialog) {
      if (preference && !preference.includes('shipping')) {
        return { ready: false, message: 'Facebook’s shipping settings are open, but this listing is set for local pickup only. Close the shipping dialog and resume the listing.' };
      }
      selection = {
        value: 'shipping settings open',
        shipping: true,
        localPickup: Boolean(preference?.includes('local_pickup')),
      };
    } else {
      if (!combo) return { ready: false, message: 'Facebook opened the delivery step, but KeepFlip could not find its delivery method menu.' };
      if (preference) {
        const result = await applyFacebookDeliveryPreference(combo, preference);
        if (!result.ok) return result;
        combo = findFacebookCombobox('delivery method') || combo;
      }

      selection = facebookDeliverySelection(combo);
      if (!selection.shipping && !selection.localPickup) {
        return { ready: false, message: 'Choose Shipping, Local pickup, or both in Facebook before continuing.' };
      }

      if (combo.getAttribute('aria-expanded') === 'true') {
        clickMarketplaceControl(combo);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (selection.shipping) {
      if (facebookShippingOptionsSaved && !shippingOptionsDialog) return { ready: true, selection };
      let shippingLabelButton = null;
      let activationMethod = null;
      if (!shippingOptionsDialog) {
        shippingLabelButton = await waitForFacebookShippingLabelButton();
        shippingOptionsDialog = findFacebookShippingOptionsDialog() || shippingOptionsDialog;
      }
      if (!shippingOptionsDialog && shippingLabelButton) {
        const opened = await openFacebookShippingOptions(shippingLabelButton);
        shippingOptionsDialog = opened.dialog;
        activationMethod = opened.activationMethod;
      }
      if (!shippingOptionsDialog) {
        if (!shippingLabelButton) return { ready: false, message: 'Shipping is selected, but Facebook’s Select shipping label button was not found.' };
        const attemptedWith = activationMethod === 'pointer_mouse_fallback'
          ? 'a DOM click and pointer/mouse fallback'
          : 'a DOM click';
        return { ready: false, message: `KeepFlip found Select shipping label and tried ${attemptedWith}, but Facebook’s shipping options did not appear. The control is still available in the marketplace tab; click it there, then try filling again.` };
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
      clickMarketplaceControl(combo);
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
    clickMarketplaceControl(selected);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const currentCombo = findFacebookCombobox(key) || combo;
      if (facebookComboboxMatches(key, value, facebookComboboxValue(currentCombo))) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
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
          if (suggestion && visible(suggestion)) clickMarketplaceControl(suggestion);
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
          clickMarketplaceControl(targetBtn);
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
          clickMarketplaceControl(match);
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
          clickMarketplaceControl(match);
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
          clickMarketplaceControl(target);
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
          clickMarketplaceControl(target);
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
          if (suggestion && visible(suggestion)) clickMarketplaceControl(suggestion);
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
          clickMarketplaceControl(target);
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
          clickMarketplaceControl(target);
          filledFields.push('condition');
        }
      }
    }
  }

  function facebookAttachedPhotoCount() {
    if (marketplace !== 'facebookMarketplace') return null;
    const pageText = document.body?.innerText || document.body?.textContent || '';
    const counter = /\bphotos?\s+(\d+)\s*\/\s*\d+\b/i.exec(pageText) ||
      /\b(\d+)\s+photos?\s+attached\b/i.exec(pageText);
    const counterCount = counter ? Number(counter[1]) : 0;
    const blobPreviewCount = document.querySelectorAll(
      'main img[src^="blob:"], [role="dialog"] img[src^="blob:"]',
    ).length;
    return Math.max(counterCount, blobPreviewCount);
  }

  async function waitForFacebookPhotos(expectedCount) {
    let attachedCount = facebookAttachedPhotoCount();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (attachedCount >= expectedCount) return attachedCount;
      await new Promise((resolve) => setTimeout(resolve, 200));
      attachedCount = facebookAttachedPhotoCount();
    }
    return attachedCount;
  }

  async function attachPhotos(photos) {
    if (!photos.length) return 0;
    if (typeof DataTransfer === 'undefined') return 0;
    const startingFacebookPhotoCount = facebookAttachedPhotoCount();
    if (startingFacebookPhotoCount !== null && startingFacebookPhotoCount >= photos.length) {
      return photos.length;
    }
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
    const selected = marketplace === 'facebookMarketplace'
      ? photos.slice(Math.min(startingFacebookPhotoCount, photos.length))
      : photos.slice(0, input && !input.multiple && !dropZone ? 1 : 8);
    const files = await Promise.all(selected.map(async (photo) => {
      const response = await fetch(photo.dataUrl);
      if (!response.ok) throw new Error('KeepFlip could not read a saved photo.');
      const blob = await response.blob();
      return new File([blob], photo.name, { type: blob.type || 'image/jpeg' });
    }));
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    if (marketplace === 'facebookMarketplace') {
      const expectedFacebookCount = startingFacebookPhotoCount + files.length;
      if (input) {
        try {
          input.files = transfer.files;
          if (input.files?.length === files.length) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return Math.min(photos.length, await waitForFacebookPhotos(expectedFacebookCount));
          }
        } catch { /* Facebook did not accept a file-list assignment; try its drop area. */ }
      }
      if (dropZone && typeof DragEvent !== 'undefined') {
        try {
          const options = { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer };
          for (const type of ['dragenter', 'dragover', 'drop']) dropZone.dispatchEvent(new DragEvent(type, options));
          return Math.min(photos.length, await waitForFacebookPhotos(expectedFacebookCount));
        } catch { /* A visible photo count is still required before continuing. */ }
      }
      return 0;
    }
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
    if (marketplace === 'facebookMarketplace' && /^\/marketplace\/create\/?$/i.test(location.pathname)) {
      // Make the item-type choice the first automation action on Facebook's create screen.
      composerOpenRequested = openComposerIfNeeded();
    }
    while (attempts < 24) {
      attempts += 1;
      if (!facebookMetaAiDraftsOff) facebookMetaAiDraftsOff = turnOffFacebookMetaAiDrafts();
      const retryComposerEntry = marketplace === 'offerUp' || !composerOpenRequested;
      const shouldTryFacebookItemChoice = marketplace === 'facebookMarketplace' &&
        /^\/marketplace\/create\/?$/i.test(location.pathname) && !composerOpenRequested;
      if ((shouldTryFacebookItemChoice || (attempts >= 5 && retryComposerEntry)) && !findField('title')) {
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
      if (assignment.photos.length && !photoUploadAttempted && (filledFields.includes('title') || marketplace === 'depop')) {
        photoUploadAttempted = true;
        try { uploadedPhotoCount = await attachPhotos(assignment.photos); } catch { /* Report for review below. */ }
      }
      if (core.every((key) => filledFields.includes(key)) &&
        (!assignment.photos.length || uploadedPhotoCount === assignment.photos.length) &&
        facebookMetaAiDraftsOff && facebookFormReady) break;
      if (marketplace === 'facebookMarketplace' && photoUploadAttempted &&
        uploadedPhotoCount < assignment.photos.length && core.every((key) => filledFields.includes(key)) &&
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
                : marketplace === 'facebookMarketplace' && assignment.photos.length > uploadedPhotoCount
                  ? 'Facebook did not confirm the item photos. Check the photo count in the Facebook tab, then retry the upload.'
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
          clickMarketplaceControl(control);
          return true;
        }
      }
      const sellButton = document.querySelector('[data-testid="HeaderSellButton"]') ||
        document.querySelector('button[aria-label="Sell"]');
      if (!sellButton || !visible(sellButton) || offerUpSellMenuOpened) return false;
      clickMarketplaceControl(sellButton);
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
            clickMarketplaceControl(control);
            return true;
          }
        }
      }
      // Some Facebook layouts render the listing-type chooser without a dialog.
      // Prefer the item card over the surrounding "Create new listing" navigation link.
      for (const control of controls) {
        if (visible(control) && isItemForSaleChoice(control)) {
          clickMarketplaceControl(control);
          return true;
        }
      }
      // The Marketplace create chooser is a React card with unstable class names.
      // Use the seller-provided current selector only as a fallback to the semantic label.
      if (/^\/marketplace\/create\/?$/i.test(location.pathname)) {
        const itemForSaleCard = document.querySelector(facebookItemForSaleSelector);
        if (itemForSaleCard && visible(itemForSaleCard)) {
          clickMarketplaceControl(itemForSaleCard);
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
        clickMarketplaceControl(control);
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
    const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter((control) =>
      visible(control) && !control.disabled && control.getAttribute('aria-disabled') !== 'true');
    return controls.find((control) => (control.getAttribute('aria-label') || '').trim().toLowerCase() === 'next') ||
      controls.find((control) => facebookButtonLabel(control).toLowerCase() === 'next') || null;
  }

  async function waitForFacebookNextButton() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const button = findFacebookNextButton();
      if (button) return button;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return findFacebookNextButton();
  }

  function facebookStepIdentity() {
    const heading = document.querySelector('main h1,main [role="heading"][aria-level="1"]');
    const progress = document.querySelector('img[alt^="Progress, currently on step"]');
    return [location.href, heading?.textContent || '', progress?.getAttribute('alt') || ''].join('|');
  }

  async function waitForFacebookStepChange(previousStep, wasDeliveryStep) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (liveListingUrl() || facebookStepIdentity() !== previousStep ||
          (wasDeliveryStep && !isFacebookDeliveryStep())) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  function findFacebookFinalSubmitButton() {
    const controls = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter((control) =>
      visible(control) && !control.disabled && control.getAttribute('aria-disabled') !== 'true');
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
        const nextButton = await waitForFacebookNextButton();
        if (!nextButton) {
          await report('needs_review', { fields: filledFields, uploadedPhotoCount,
            message: 'Facebook has the listing details, but Next is still disabled or missing. Check the required fields and photos in the Facebook tab.' });
          return;
        }
        facebookNextClicked = true;
        clickMarketplaceControl(nextButton);
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
          const deliveryNextButton = await waitForFacebookNextButton();
          if (!deliveryNextButton) {
            await report('needs_review', { fields: filledFields, uploadedPhotoCount,
              message: 'Facebook saved the shipping options, but Next is still disabled. Check the delivery step in Facebook.' });
            return;
          }
          const previousStep = facebookStepIdentity();
          clickMarketplaceControl(deliveryNextButton);
          if (!await waitForFacebookStepChange(previousStep, true)) {
            await report('needs_review', { fields: filledFields, uploadedPhotoCount,
              message: 'Facebook did not advance past Delivery method after Next. Review that step in Facebook.' });
            return;
          }
          await report('filled', { fields: filledFields, uploadedPhotoCount,
            message: 'Facebook delivery settings were saved and the listing advanced.' });
          continue;
        }
        const publishButton = findFacebookFinalSubmitButton();
        if (publishButton) {
          clickMarketplaceControl(publishButton);
          await report('submit_clicked', { fields: filledFields, uploadedPhotoCount,
            message: 'Facebook’s final Post/Publish action was clicked. Checking for the live listing…' });
          watchForLiveListing();
          return;
        }
        const nextButton = findFacebookNextButton();
        if (nextButton) {
          const previousStep = facebookStepIdentity();
          clickMarketplaceControl(nextButton);
          if (!await waitForFacebookStepChange(previousStep, false)) {
            await report('needs_review', { fields: filledFields, uploadedPhotoCount,
              message: 'Facebook did not advance after Next. Review the current listing step.' });
            return;
          }
          continue;
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
      clickMarketplaceControl(button);
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
      clickMarketplaceControl(advance);
      await report('filled', { fields: filledFields, uploadedPhotoCount, message: 'Advanced to the next step. Review and select Post again.' });
      return;
    }
    await report('needs_review', { fields: filledFields, uploadedPhotoCount, message: 'The marketplace post button was not found. Check this tab.' });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'KEEPFLIP_LISTING_SUBMIT' && assignment?.runId === message.runId && marketplace === message.marketplace) void submit();
    if (message?.type === 'KEEPFLIP_LISTING_RETRY' && assignment?.runId === message.runId && marketplace === message.marketplace) {
      photoUploadAttempted = false;
      uploadedPhotoCount = 0;
      void fill();
    }
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
