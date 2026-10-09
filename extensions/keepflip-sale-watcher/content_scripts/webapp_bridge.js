/* global chrome */
(() => {
  const allowed = new Set([
    'https://keep-flip.com',
    'https://www.keep-flip.com',
    'https://app.keep-flip.com',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
  ]);
  if (!allowed.has(location.origin)) return;
  const crosslistingOnlyOrigins = new Set(['https://keep-flip.com', 'https://www.keep-flip.com']);
  const isCrosslistingPage = () => location.pathname === '/crosslisting' || location.pathname.startsWith('/crosslisting/');
  const isAllowedPage = () => !crosslistingOnlyOrigins.has(location.origin) || isCrosslistingPage();

  window.addEventListener('message', (event) => {
    if (!isAllowedPage() || event.source !== window || event.origin !== location.origin) return;
    const request = event.data;
    if (!request || request.source !== 'keepflip-webapp' || request.protocol !== 1 ||
      typeof request.requestId !== 'string' || request.requestId.length > 100 ||
      !['HELLO', 'LISTING_START', 'LISTING_FOCUS', 'LISTING_RESUME', 'LISTING_RETRY', 'LISTING_SUBMIT'].includes(request.action)) return;
    chrome.runtime.sendMessage({ type: 'KEEPFLIP_LISTING_PAGE', request }, (reply) => {
      const error = chrome.runtime.lastError;
      window.postMessage({
        source: 'keepflip-extension', protocol: 1, action: 'RESPONSE', requestId: request.requestId,
        ...(error ? { ok: false, error: 'KeepFlip extension is unavailable. Reload the extension and this page.' } : reply),
      }, location.origin);
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!isAllowedPage() || message?.type !== 'KEEPFLIP_LISTING_STATUS' || !message.status) return;
    window.postMessage({ source: 'keepflip-extension', protocol: 1, action: 'STATUS', ...message.status }, location.origin);
  });
})();
