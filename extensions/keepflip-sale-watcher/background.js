/* global chrome */
const QUEUE_KEY = 'saleQueue';
const COMPLETED_KEY = 'completedSaleIds';
const IGNORED_KEY = 'ignoredSaleIds';
const MAX_QUEUE = 100;

async function updateBadge() {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  const queue = Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
  await chrome.action.setBadgeBackgroundColor({ color: '#0f766e' });
  await chrome.action.setBadgeText({ text: queue.length ? String(Math.min(queue.length, 99)) : '' });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'KEEPFLIP_SALE_CANDIDATE') return;
  if (!sender.url?.startsWith('https://mail.google.com/')) return;
  const candidate = message.candidate;
  if (!candidate || !/^[a-f0-9]{64}$/.test(String(candidate.idempotencyKey || '').replace(/^email-/, ''))) return;

  void (async () => {
    const stored = await chrome.storage.local.get([QUEUE_KEY, COMPLETED_KEY, IGNORED_KEY]);
    const queue = Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
    const completed = Array.isArray(stored[COMPLETED_KEY]) ? stored[COMPLETED_KEY] : [];
    const ignored = Array.isArray(stored[IGNORED_KEY]) ? stored[IGNORED_KEY] : [];
    if (completed.includes(candidate.idempotencyKey) || ignored.includes(candidate.idempotencyKey)) return;
    if (queue.some((event) => event.idempotencyKey === candidate.idempotencyKey)) return;

    queue.unshift({ ...candidate, detectedAt: new Date().toISOString(), recorded: false, ebayEnded: false });
    await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(0, MAX_QUEUE) });
    await updateBadge();
  })();
});

chrome.runtime.onInstalled.addListener(() => void updateBadge());
chrome.runtime.onStartup.addListener(() => void updateBadge());
