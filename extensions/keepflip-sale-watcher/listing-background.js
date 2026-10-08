/* global chrome */
(() => {
  const RUN_KEY = 'keepflipListingRun';
  const DESTINATIONS = {
    depop: { host: 'depop.com', createUrl: 'https://www.depop.com/products/create/' },
    poshmark: { host: 'poshmark.com', createUrl: 'https://poshmark.com/create-listing' },
    mercari: { host: 'mercari.com', createUrl: 'https://www.mercari.com/sell/' },
    facebookMarketplace: { host: 'facebook.com', createUrl: 'https://www.facebook.com/marketplace/create/item' },
    offerUp: { host: 'offerup.com', createUrl: 'https://offerup.com/' },
  };
  const WEB_ORIGINS = new Set(['https://keep-flip.com', 'https://www.keep-flip.com', 'http://localhost:8081', 'http://127.0.0.1:8081']);
  const textFields = ['title', 'description', 'price', 'category', 'condition', 'brand', 'size', 'color'];

  function urlFor(value) {
    try { return new URL(value); } catch { return null; }
  }

  function isWebTab(sender) {
    const url = urlFor(sender.url);
    return Boolean(sender.tab?.id && url && WEB_ORIGINS.has(url.origin));
  }

  function isMarketplaceUrl(value, marketplace) {
    const url = urlFor(value);
    const host = DESTINATIONS[marketplace]?.host;
    return Boolean(url && url.protocol === 'https:' && host && (url.hostname === host || url.hostname.endsWith(`.${host}`)));
  }

  function isListingUrl(value, marketplace) {
    if (!isMarketplaceUrl(value, marketplace)) return false;
    const pathname = urlFor(value).pathname;
    return ({
      depop: /^\/products\/[^/]+\/?$/i,
      poshmark: /^\/listing\/[^/]+\/?$/i,
      mercari: /^\/us\/item\/[^/]+\/?$/i,
      facebookMarketplace: /^\/marketplace\/item\/\d+\/?$/i,
      offerUp: /^\/item\/detail\/[^/]+\/?$/i,
    })[marketplace].test(pathname);
  }

  function validPayload(value, marketplace) {
    if (!value || value.version !== 1 || value.marketplace !== marketplace || !value.title?.trim() ||
      !value.description?.trim() || !value.price?.trim() || !value.platformFields ||
      typeof value.platformFields !== 'object' || Array.isArray(value.platformFields)) return false;
    return textFields.every((field) => typeof value[field] === 'string' && value[field].length <= (field === 'description' ? 12000 : 1000)) &&
      Number.isInteger(value.photoCount) && value.photoCount >= 0 && value.photoCount <= 20 &&
      Object.entries(value.platformFields).length <= 30 &&
      Object.entries(value.platformFields).every(([key, field]) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) && typeof field === 'string' && field.length <= 1000);
  }

  function validPhotos(value) {
    return Array.isArray(value) && value.length <= 8 && value.every((photo) =>
      photo && typeof photo.name === 'string' && photo.name.length <= 100 &&
      typeof photo.dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl)) &&
      value.reduce((size, photo) => size + photo.dataUrl.length, 0) <= 3_000_000;
  }

  async function readRun() {
    const stored = await chrome.storage.session.get(RUN_KEY);
    return stored[RUN_KEY] || null;
  }

  async function writeRun(run) {
    await chrome.storage.session.set({ [RUN_KEY]: run });
  }

  async function notifyWeb(run, job, fields = {}) {
    try {
      await chrome.tabs.sendMessage(run.webTabId, {
        type: 'KEEPFLIP_LISTING_STATUS',
        status: { runId: run.id, itemId: run.itemId, marketplace: job.marketplace, status: job.status, ...fields },
      });
    } catch { /* The seller can return to the Listing page and resume the run. */ }
  }

  async function handlePage(request, sender) {
    if (!isWebTab(sender) || request?.source !== 'keepflip-webapp' || request.protocol !== 1) {
      return { ok: false, error: 'This request did not come from the KeepFlip web app.' };
    }
    if (request.action === 'HELLO') {
      const run = await readRun();
      return { ok: true, run: run && run.itemId === request.itemId && run.ownerId === request.ownerId
        ? { id: run.id, jobs: run.jobs.map(({ marketplace, tabId, status, details }) => ({ marketplace, tabId, status, details })) }
        : null };
    }
    if (request.action === 'LISTING_START') {
      if (typeof request.runId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(request.runId) ||
        typeof request.itemId !== 'string' || request.itemId.length > 100 ||
        typeof request.ownerId !== 'string' || request.ownerId.length > 100 ||
        !Array.isArray(request.jobs) || request.jobs.length < 1 || request.jobs.length > 5 ||
        !validPhotos(request.photos) || !Number.isInteger(request.unavailablePhotoCount) || request.unavailablePhotoCount < 0 || request.unavailablePhotoCount > 20) {
        return { ok: false, error: 'The listing run has invalid item or photo data.' };
      }
      const unique = new Set();
      for (const job of request.jobs) {
        if (!DESTINATIONS[job?.marketplace] || unique.has(job.marketplace) || !validPayload(job.payload, job.marketplace)) {
          return { ok: false, error: 'One marketplace draft is invalid.' };
        }
        unique.add(job.marketplace);
      }
      const run = {
        id: request.runId, itemId: request.itemId, ownerId: request.ownerId,
        webTabId: sender.tab.id, createdAt: Date.now(), photos: request.photos,
        unavailablePhotoCount: request.unavailablePhotoCount,
        jobs: request.jobs.map((job) => ({ marketplace: job.marketplace, payload: job.payload, tabId: null, status: 'opening', details: null })),
      };
      await writeRun(run);
      for (const [index, job] of run.jobs.entries()) {
        try {
          const tab = await chrome.tabs.create({ url: DESTINATIONS[job.marketplace].createUrl, active: index === 0 });
          job.tabId = tab.id;
          job.status = 'opened';
        } catch {
          job.status = 'error';
          job.details = { message: 'Could not open the marketplace tab.' };
        }
      }
      await writeRun(run);
      for (const job of run.jobs) await notifyWeb(run, job, job.details || {});
      return { ok: true, run: { id: run.id, jobs: run.jobs.map(({ marketplace, tabId, status, details }) => ({ marketplace, tabId, status, details })) } };
    }
    const run = await readRun();
    if (!run || run.id !== request.runId || run.webTabId !== sender.tab.id || run.ownerId !== request.ownerId) {
      return { ok: false, error: 'This listing run is no longer active. Start a new run from Listing.' };
    }
    const job = run.jobs.find((candidate) => candidate.marketplace === request.marketplace);
    if (!job?.tabId) return { ok: false, error: 'The marketplace tab is unavailable.' };
    if (request.action === 'LISTING_FOCUS') {
      await chrome.tabs.update(job.tabId, { active: true });
      return { ok: true };
    }
    if (request.action === 'LISTING_RESUME') {
      await chrome.tabs.update(job.tabId, { url: DESTINATIONS[job.marketplace].createUrl, active: true });
      return { ok: true };
    }
    if (request.action === 'LISTING_SUBMIT') {
      if (job.status !== 'filled') return { ok: false, error: 'The draft must fill its required fields before posting.' };
      const tab = await chrome.tabs.get(job.tabId);
      if (!isMarketplaceUrl(tab.url, job.marketplace)) return { ok: false, error: 'The marketplace tab is on an unexpected website.' };
      await chrome.tabs.sendMessage(job.tabId, { type: 'KEEPFLIP_LISTING_SUBMIT', runId: run.id, marketplace: job.marketplace });
      return { ok: true };
    }
    return { ok: false, error: 'Unknown listing action.' };
  }

  async function handleTabReady(sender) {
    const run = await readRun();
    const job = run?.jobs.find((candidate) => candidate.tabId === sender.tab?.id);
    if (!job || !isMarketplaceUrl(sender.url, job.marketplace) || job.status === 'confirmed') return { ok: false };
    return { ok: true, runId: run.id, jobStatus: job.status, submittedAt: job.submittedAt || 0, payload: job.payload, photos: run.photos,
      unavailablePhotoCount: run.unavailablePhotoCount };
  }

  async function handleTabStatus(message, sender) {
    const run = await readRun();
    const job = run?.jobs.find((candidate) => candidate.tabId === sender.tab?.id);
    if (!job || run.id !== message.runId || job.marketplace !== message.marketplace ||
      !isMarketplaceUrl(sender.url, job.marketplace) ||
      !['login_required', 'filled', 'needs_review', 'submit_clicked', 'confirmed', 'error'].includes(message.status)) return;
    let status = message.status;
    const details = {
      fields: Array.isArray(message.fields) ? message.fields.filter((value) => textFields.includes(value)) : [],
      missingFields: Array.isArray(message.missingFields) ? message.missingFields.filter((value) => textFields.includes(value)) : [],
      uploadedPhotoCount: Number.isInteger(message.uploadedPhotoCount) ? Math.max(0, Math.min(8, message.uploadedPhotoCount)) : 0,
      message: typeof message.message === 'string' ? message.message.slice(0, 240) : undefined,
      externalUrl: isListingUrl(sender.url, job.marketplace) ? sender.url.split('#', 1)[0].split('?', 1)[0] : undefined,
    };
    if (status === 'confirmed' && (job.status !== 'submit_clicked' || !details.externalUrl)) status = 'needs_review';
    if (status === 'submit_clicked' && job.status !== 'filled') return;
    if (status === 'confirmed' && Date.now() - (job.submittedAt || 0) > 120_000) status = 'needs_review';
    if (status === 'submit_clicked') job.submittedAt = Date.now();
    job.status = status;
    job.details = details;
    await writeRun(run);
    await notifyWeb(run, job, details);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!['KEEPFLIP_LISTING_PAGE', 'KEEPFLIP_LISTING_TAB_READY', 'KEEPFLIP_LISTING_TAB_STATUS'].includes(message?.type)) return;
    void (async () => {
      try {
        const reply = message.type === 'KEEPFLIP_LISTING_PAGE'
          ? await handlePage(message.request, sender)
          : message.type === 'KEEPFLIP_LISTING_TAB_READY'
            ? await handleTabReady(sender)
            : await handleTabStatus(message, sender);
        sendResponse(reply || { ok: true });
      } catch {
        sendResponse({ ok: false, error: 'KeepFlip could not complete the extension action.' });
      }
    })();
    return true;
  });
})();
