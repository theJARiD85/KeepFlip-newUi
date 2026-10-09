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
    title: ['input[data-qa-id="listing-title-input"]', 'input[name*="title" i]', 'input[placeholder*="title" i]', 'input[aria-label*="title" i]'],
    description: ['textarea[data-qa-id="listing-description-input"]', 'textarea[name*="description" i]', 'textarea[placeholder*="description" i]', '[contenteditable="true"][aria-label*="description" i]'],
    price: ['input[data-qa-id="listing-price-input"]', 'input[name*="price" i]', 'input[placeholder*="price" i]', 'input[aria-label*="price" i]'],
    category: ['select[name*="category" i]', 'input[name*="category" i]', 'input[placeholder*="category" i]'],
    condition: ['select[name*="condition" i]', 'input[name*="condition" i]', 'input[placeholder*="condition" i]'],
    brand: ['input[name*="brand" i]', 'input[placeholder*="brand" i]'],
    size: ['select[name*="size" i]', 'input[name*="size" i]', 'input[placeholder*="size" i]'],
    color: ['select[name*="color" i]', 'input[name*="color" i]', 'input[placeholder*="color" i]'],
  };
  const core = ['title', 'description', 'price'];
  let assignment = null;
  let filledFields = [];
  let uploadedPhotoCount = 0;
  let offerUpSellMenuOpened = false;
  let facebookMetaAiSwitchClickRequested = false;

  function sendMessageQuietly(message) {
    void (async () => {
      try { await chrome.runtime.sendMessage(message); } catch { /* The extension may be reloading. */ }
    })();
  }

  function report(status, details = {}) {
    if (!assignment) return;
    sendMessageQuietly({ type: 'KEEPFLIP_LISTING_TAB_STATUS', runId: assignment.runId,
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
    for (const selector of selectors[key]) {
      const matches = document.querySelectorAll(selector);
      for (const element of matches) if (usable(element, key)) return element;
    }
    const matches = document.querySelectorAll('input,textarea,select,[contenteditable="true"]');
    for (const element of matches) {
      if (usable(element, key) && patterns[key].test(labelFor(element))) return element;
    }
    return null;
  }

  function turnOffFacebookMetaAiDrafts() {
    if (marketplace !== 'facebookMarketplace') return true;
    const toggle = document.querySelector('input[type="checkbox"][role="switch"][aria-label="Draft listings with Meta AI"]');
    if (!toggle || toggle.disabled) return false;
    if (toggle.checked && !facebookMetaAiSwitchClickRequested) {
      facebookMetaAiSwitchClickRequested = true;
      toggle.click();
    }
    return !toggle.checked;
  }

  function setField(element, raw) {
    const value = String(raw).trim();
    if (!value) return false;
    const current = String(element.value ?? element.textContent ?? '').trim();
    if (current && current !== value) return false;
    if (element instanceof HTMLSelectElement) {
      const option = Array.from(element.options).find((entry) =>
        entry.value.toLowerCase() === value.toLowerCase() || entry.textContent.trim().toLowerCase() === value.toLowerCase());
      if (!option) return false;
      element.value = option.value;
    } else if (element.isContentEditable) {
      element.textContent = value;
    } else {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
      if (setter) setter.call(element, element.maxLength > 0 ? value.slice(0, element.maxLength) : value);
      else element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
    return true;
  }

  async function attachPhotos(photos) {
    if (!photos.length) return 0;
    if (typeof DataTransfer === 'undefined') return 0;
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const input = fileInputs.find((candidate) => candidate.closest('main,form,[role="dialog"]') &&
      /image/i.test(candidate.getAttribute('accept') || '')) || fileInputs.find((candidate) => /image/i.test(candidate.getAttribute('accept') || '')) || null;
    const dropZone = document.querySelector('main .dz-clickable,main #co-uploader,main [data-testid="uploader-dropzone"],main [class*="dropzone" i],[role="dialog"] [class*="dropzone" i]');
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
      depop: /^\/products\/[^/]+\/?$/i,
      poshmark: /^\/listing\/[^/]+\/?$/i,
      mercari: /^\/us\/item\/[^/]+\/?$/i,
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
    const fields = {};
    for (const key of Object.keys(patterns)) fields[key] = payload[key];
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
      for (const [key, value] of Object.entries(fields)) {
        if (filledFields.includes(key) || !value) continue;
        const input = findField(key);
        if (input && setField(input, value)) filledFields.push(key);
      }
      if (assignment.photos.length && uploadedPhotoCount === 0 && filledFields.includes('title')) {
        try { uploadedPhotoCount = await attachPhotos(assignment.photos); } catch { /* Report for review below. */ }
      }
      if (core.every((key) => filledFields.includes(key)) &&
        (!assignment.photos.length || uploadedPhotoCount === assignment.photos.length) && facebookMetaAiDraftsOff) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const missingFields = Object.keys(fields).filter((key) => fields[key] && !filledFields.includes(key));
    const photosReady = payload.photoCount === 0 ||
      (uploadedPhotoCount === payload.photoCount && assignment.unavailablePhotoCount === 0);
    const status = core.every((key) => filledFields.includes(key)) && photosReady && facebookMetaAiDraftsOff ? 'filled' : 'needs_review';
    report(status, { fields: filledFields, missingFields, uploadedPhotoCount,
      message: status === 'filled' ? 'Draft fields filled and photos sent to the upload control. Check the marketplace preview before posting.'
        : !facebookMetaAiDraftsOff ? 'Facebook could not turn off Draft listings with Meta AI. Check that switch before continuing.'
          : 'Some fields or photos need attention in this marketplace tab.' });
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

  function submit() {
    if (!assignment || !core.every((key) => filledFields.includes(key))) return;
    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter(visible);
    const label = (button) => (button.innerText || button.textContent || button.value || '').trim();
    const listingArea = (button) => button.closest('main,form,[role="dialog"]');
    const button = buttons.find((candidate) => listingArea(candidate) && /^(post|post item|post listing|publish|list|list item|create listing|submit listing)$/i.test(label(candidate))) ||
      buttons.find((candidate) => listingArea(candidate) && candidate.type === 'submit' && !/^(next|continue|review)$/i.test(label(candidate)));
    if (button) {
      button.click();
      report('submit_clicked', { fields: filledFields, uploadedPhotoCount, message: 'Post was clicked. Checking for a live listing.' });
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
      report('filled', { fields: filledFields, uploadedPhotoCount, message: 'Advanced to the next step. Review and select Post again.' });
      return;
    }
    report('needs_review', { fields: filledFields, uploadedPhotoCount, message: 'The marketplace post button was not found. Check this tab.' });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'KEEPFLIP_LISTING_SUBMIT' && assignment?.runId === message.runId && marketplace === message.marketplace) submit();
    if (message?.type === 'KEEPFLIP_LISTING_RETRY' && assignment?.runId === message.runId && marketplace === message.marketplace) void fill();
  });

  let requests = 0;
  function assignmentUnavailable() {
    console.warn('KeepFlip could not connect this marketplace tab to its listing run.');
    sendMessageQuietly({ type: 'KEEPFLIP_LISTING_TAB_INIT_ERROR', marketplace });
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
    } catch {
      retryAssignment();
    }
  }
  void getAssignment();
})();
