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

  function postResponse(requestId, reply) {
    try {
      window.postMessage({ source: 'keepflip-extension', protocol: 1, action: 'RESPONSE', requestId, ...reply }, location.origin);
    } catch { /* The page may be navigating while the extension reloads. */ }
  }

  function postUnavailable(requestId) {
    postResponse(requestId, { ok: false, error: 'KeepFlip extension is unavailable. Reload the extension, then refresh this page.' });
  }

  // content_scripts/webapp_bridge.js
  window.addEventListener('message', (event) => {
    if (!isAllowedPage() || event.source !== window || event.origin !== location.origin) return;
    const request = event.data;
    if (!request || request.source !== 'keepflip-webapp' || request.protocol !== 1 ||
      typeof request.requestId !== 'string' || request.requestId.length > 100 ||
      !['HELLO', 'LISTING_START', 'LISTING_FOCUS', 'LISTING_RESUME', 'LISTING_RETRY', 'LISTING_SUBMIT'].includes(request.action)) return;

    try {
      const runtime = chrome.runtime;
      if (!runtime?.id) {
        postUnavailable(request.requestId);
        return;
      }
      runtime.sendMessage({ type: 'KEEPFLIP_LISTING_PAGE', request }, (reply) => {
        try {
          if (runtime.lastError || !reply) postUnavailable(request.requestId);
          else postResponse(request.requestId, reply);
        } catch {
          postUnavailable(request.requestId);
        }
      });
    } catch {
      // A synchronous Chrome exception occurs if this page still has an invalidated
      // content-script context after the extension was reloaded.
      postUnavailable(request.requestId);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!isAllowedPage() || message?.type !== 'KEEPFLIP_LISTING_STATUS' || !message.status) return;
    window.postMessage({ source: 'keepflip-extension', protocol: 1, action: 'STATUS', ...message.status }, location.origin);
  });
})();
