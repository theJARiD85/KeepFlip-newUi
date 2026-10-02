/* global chrome, KEEPFLIP_EXTENSION_DEFAULTS */
const QUEUE_KEY = 'saleQueue';
const COMPLETED_KEY = 'completedSaleIds';
const IGNORED_KEY = 'ignoredSaleIds';
const SETTINGS_KEY = 'keepflipAppwriteSettings';
const SESSION_KEY = 'keepflipAppwriteSession';

const $ = (id) => document.getElementById(id);
const loginPanel = $('loginPanel');
const queuePanel = $('queuePanel');
const queueElement = $('queue');

function setStatus(message, kind = '') {
  const status = $('status');
  status.textContent = message;
  status.className = kind;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    appwriteEndpoint: KEEPFLIP_EXTENSION_DEFAULTS.appwriteEndpoint,
    appwriteProjectId: KEEPFLIP_EXTENSION_DEFAULTS.appwriteProjectId,
    ...(stored[SETTINGS_KEY] || {}),
  };
}

async function sessionSecret() {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return stored[SESSION_KEY]?.secret || null;
}

async function appwriteRequest(path, { method = 'GET', body, session } = {}) {
  const settings = await loadSettings();
  const headers = { 'X-Appwrite-Project': settings.appwriteProjectId };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers['X-Appwrite-Session'] = session;
  const response = await fetch(settings.appwriteEndpoint.replace(/\/+$/, '') + path, {
    method,
    headers,
    credentials: 'omit',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message : 'Appwrite request failed.';
    throw new Error(message);
  }
  return payload;
}

async function functionRequest(functionId, path, body) {
  if (!functionId) throw new Error('Enter the required Appwrite Function ID in settings.');
  const session = await sessionSecret();
  if (!session) throw new Error('Sign in to KeepFlip again.');
  const settings = await loadSettings();
  const response = await fetch(
    settings.appwriteEndpoint.replace(/\/+$/, '') + '/functions/' + encodeURIComponent(functionId) + '/executions',
    {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': settings.appwriteProjectId,
        'X-Appwrite-Session': session,
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({
        body: JSON.stringify(body),
        path,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        async: false,
      }),
    },
  );
  const execution = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(execution.message || 'Appwrite Function could not run.');
  let result = {};
  try { result = JSON.parse(execution.responseBody || '{}'); } catch { /* Show a stable error below. */ }
  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || result.error) {
    const message = typeof result.error === 'string'
      ? result.error
      : result.error?.message || 'Appwrite Function rejected the request.';
    throw new Error(message);
  }
  return result;
}

async function readQueue() {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
}

async function saveQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  await chrome.action.setBadgeText({ text: queue.length ? String(Math.min(queue.length, 99)) : '' });
}

async function finishEvent(eventId, ignored = false) {
  const queue = await readQueue();
  const next = queue.filter((event) => event.idempotencyKey !== eventId);
  await saveQueue(next);
  const key = ignored ? IGNORED_KEY : COMPLETED_KEY;
  const stored = await chrome.storage.local.get(key);
  const history = Array.isArray(stored[key]) ? stored[key] : [];
  await chrome.storage.local.set({ [key]: [eventId, ...history.filter((id) => id !== eventId)].slice(0, 300) });
  await renderQueue();
}

function makeButton(label, className, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', callback);
  return button;
}

function renderCandidateResult(area, result, onSelect) {
  area.replaceChildren();
  if (result.status === 'no_match') {
    area.textContent = 'No exact SKU or title match was found in your available inventory.';
    area.className = 'match-results warning';
    return;
  }
  const candidates = result.status === 'matched'
    ? [result.candidate]
    : Array.isArray(result.candidates) ? result.candidates : [];
  if (!candidates.length) {
    area.textContent = 'No selectable inventory match was returned.';
    area.className = 'match-results warning';
    return;
  }
  area.className = 'match-results';
  const heading = document.createElement('p');
  heading.textContent = result.status === 'matched'
    ? 'Exact ' + (result.matchType === 'sku' ? 'SKU' : 'title') + ' match:'
    : result.totalMatches + ' exact matches. Choose the item that sold:';
  area.append(heading);
  const options = document.createElement('div');
  for (const [index, candidate] of candidates.entries()) {
    const label = document.createElement('label');
    label.className = 'candidate-choice';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'inventory-match';
    radio.value = candidate.itemId;
    radio.checked = index === 0;
    const text = document.createElement('span');
    text.textContent = candidate.title + (candidate.sku ? ' — SKU ' + candidate.sku : '');
    label.append(radio, text);
    options.append(label);
  }
  area.append(options);
  area.dataset.candidates = JSON.stringify(candidates);
  const inputLabel = document.createElement('label');
  inputLabel.textContent = 'Sale price';
  const price = document.createElement('input');
  price.className = 'sale-price';
  price.type = 'number';
  price.min = '0';
  price.step = '0.01';
  price.inputMode = 'decimal';
  price.placeholder = '0.00';
  if (Number.isSafeInteger(result.suggestedSaleCents)) {
    price.value = (result.suggestedSaleCents / 100).toFixed(2);
  }
  inputLabel.append(price);
  area.append(inputLabel);
  area.append(makeButton('Confirm and record sale', '', () => {
    const selectedId = area.querySelector('input[name="inventory-match"]:checked')?.value;
    const selected = candidates.find((candidate) => candidate.itemId === selectedId);
    const amount = Number(price.value);
    if (!selected) { setStatus('Choose the inventory item that sold.', 'warning'); return; }
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
      setStatus('Enter the sale price from the email, or enter 0.00 if it was free.', 'warning');
      return;
    }
    void onSelect(selected, Math.round(amount * 100));
  }));
}

async function renderQueue() {
  const queue = await readQueue();
  queueElement.replaceChildren();
  if (!queue.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No sale confirmation emails are waiting for review. Open a sale email in Gmail to scan it.';
    queueElement.append(empty);
    return;
  }

  for (const event of queue) {
    const card = document.createElement('article');
    card.className = 'sale-card';
    const title = document.createElement('h3');
    title.textContent = event.platform[0].toUpperCase() + event.platform.slice(1) + ' sale';
    const item = document.createElement('p');
    item.textContent = event.title || 'Title not found';
    card.append(title, item);
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = [event.sku ? 'SKU ' + event.sku : null,
      Number.isSafeInteger(event.saleCents) ? (event.currency || 'USD') + ' ' + (event.saleCents / 100).toFixed(2) : 'Sale price needs review']
      .filter(Boolean).join(' · ');
    card.append(meta);

    if (event.recorded) {
      const followUp = document.createElement('p');
      followUp.className = event.ebayError ? 'warning' : 'success';
      followUp.textContent = event.ebayError
        ? 'Sale is recorded. eBay did not confirm the withdrawal: ' + event.ebayError
        : event.ebayEnded
          ? 'Sale recorded and the linked eBay offer was withdrawn. Check for copies on other marketplaces.'
          : 'Sale recorded. Check eBay quantity and remove any other marketplace copies.';
      card.append(followUp);
      if (!event.ebayEnded && event.ebayOfferId) {
        card.append(makeButton('Retry eBay withdrawal', 'secondary', () => void recordAndDelist(event, event.itemId, event.saleCents, true)));
      }
      card.append(makeButton('Finish review', 'dismiss', () => void finishEvent(event.idempotencyKey)));
    } else {
      const resultArea = document.createElement('div');
      resultArea.className = 'match-results';
      const match = makeButton('Find inventory match', 'secondary', async () => {
        match.disabled = true;
        setStatus('Checking your KeepFlip inventory…');
        try {
          const settings = await loadSettings();
          const result = await functionRequest(settings.sellerOperationsFunctionId, '/email-sale/match', {
            platform: event.platform,
            title: event.title,
            sku: event.sku,
          });
          renderCandidateResult(resultArea, { ...result, suggestedSaleCents: event.saleCents }, (candidate, saleCents) =>
            void recordAndDelist(event, candidate.itemId, saleCents, false, candidate),
          );
          setStatus('Review the exact match, then confirm the sale.');
        } catch (error) {
          setStatus(error.message || 'Could not match this sale.', 'warning');
        } finally {
          match.disabled = false;
        }
      });
      const dismiss = makeButton('Dismiss', 'dismiss', () => void finishEvent(event.idempotencyKey, true));
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.append(match, dismiss);
      card.append(actions, resultArea);
    }
    queueElement.append(card);
  }
}

async function recordAndDelist(event, itemId, saleCents, retry, selectedCandidate) {
  const queue = await readQueue();
  const current = queue.find((entry) => entry.idempotencyKey === event.idempotencyKey);
  if (!current) return;
  setStatus(retry ? 'Retrying eBay withdrawal…' : 'Recording the sale…');
  try {
    let sale = null;
    if (!retry) {
      const settings = await loadSettings();
      sale = await functionRequest(settings.sellerOperationsFunctionId, '/email-sale/record', {
        idempotencyKey: event.idempotencyKey,
        itemId,
        platform: event.platform,
        title: selectedCandidate?.title || event.title || '',
        sku: selectedCandidate?.sku || event.sku || '',
        quantity: 1,
        saleCents,
        currency: event.currency || 'USD',
        soldAt: event.receivedAt && Number.isFinite(Date.parse(event.receivedAt))
          ? new Date(event.receivedAt).toISOString()
          : new Date().toISOString(),
      });
      current.recorded = true;
      current.itemId = itemId;
      current.saleCents = saleCents;
      current.quantityRemaining = sale.item?.quantityRemaining;
      current.ebayOfferId = sale.item?.ebayOfferId || null;
      current.ebayListingId = sale.item?.ebayListingId || null;
      current.ebayError = null;
      await saveQueue(queue);
    }

    const latest = sale?.item || current;
    if (latest.quantityRemaining === 0 && latest.ebayOfferId) {
      const settings = await loadSettings();
      try {
        const ended = await functionRequest(settings.ebayFunctionId, '/listing/withdraw', {
          environment: settings.ebayEnvironment || 'production',
          itemId: latest.itemId || itemId,
        });
        current.recorded = true;
        current.ebayEnded = ended.status === 'ended' || ended.status === 'already_ended';
        current.ebayError = null;
      } catch (error) {
        current.recorded = true;
        current.ebayError = error.message || 'eBay withdrawal failed.';
      }
    } else {
      current.recorded = true;
      current.ebayEnded = false;
      current.ebayError = null;
    }
    await saveQueue(queue);
    await renderQueue();
    setStatus(current.ebayError ? 'Sale recorded; eBay withdrawal needs attention.' : 'Sale recorded. Review the remaining delisting steps.', current.ebayError ? 'warning' : 'success');
  } catch (error) {
    setStatus(error.message || 'Could not record this sale.', 'warning');
  }
}

async function signIn() {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) { setStatus('Enter your KeepFlip email and password.', 'warning'); return; }
  $('signIn').disabled = true;
  setStatus('Connecting to KeepFlip…');
  try {
    const session = await appwriteRequest('/account/sessions/email', {
      method: 'POST',
      body: { email, password },
    });
    if (!session.secret) throw new Error('Appwrite did not return a session.');
    await chrome.storage.session.set({ [SESSION_KEY]: { secret: session.secret, userId: session.userId || null } });
    $('password').value = '';
    await refreshConnectionState();
    setStatus('Connected to KeepFlip.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not connect to KeepFlip.', 'warning');
  } finally {
    $('signIn').disabled = false;
  }
}

async function signOut() {
  const session = await sessionSecret();
  if (session) {
    try { await appwriteRequest('/account/sessions/current', { method: 'DELETE', session }); }
    catch { /* Local credentials are still cleared. */ }
  }
  await chrome.storage.session.remove(SESSION_KEY);
  await refreshConnectionState();
  setStatus('Signed out.');
}

async function refreshConnectionState() {
  const session = await sessionSecret();
  loginPanel.hidden = Boolean(session);
  queuePanel.hidden = !session;
  if (!session) {
    setStatus('Connect your KeepFlip account to review sale matches.');
    return;
  }
  try {
    const account = await appwriteRequest('/account', { session });
    setStatus('Connected as ' + (account.email || 'KeepFlip user') + '.');
    await renderQueue();
  } catch {
    await chrome.storage.session.remove(SESSION_KEY);
    loginPanel.hidden = false;
    queuePanel.hidden = true;
    setStatus('Your KeepFlip session expired. Sign in again.', 'warning');
  }
}

async function initialize() {
  const settings = await loadSettings();
  $('sellerFunctionId').value = settings.sellerOperationsFunctionId || '';
  $('ebayFunctionId').value = settings.ebayFunctionId || '';
  $('ebayEnvironment').value = settings.ebayEnvironment || 'production';
  $('saveSettings').addEventListener('click', async () => {
    await chrome.storage.local.set({ [SETTINGS_KEY]: {
      ...settings,
      sellerOperationsFunctionId: $('sellerFunctionId').value.trim(),
      ebayFunctionId: $('ebayFunctionId').value.trim(),
      ebayEnvironment: $('ebayEnvironment').value,
    } });
    setStatus('Function settings saved.', 'success');
  });
  $('signIn').addEventListener('click', () => void signIn());
  $('signOut').addEventListener('click', () => void signOut());
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[QUEUE_KEY] && !queuePanel.hidden) void renderQueue();
  });
  await refreshConnectionState();
}

void initialize();
