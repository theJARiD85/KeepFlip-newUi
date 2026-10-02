/* global chrome, KeepFlipSaleParser */
(function installGmailSaleWatcher() {
  let debounceTimer = null;
  let lastCandidateId = null;

  function latestExpandedMessage() {
    const messages = Array.from(document.querySelectorAll('.adn')).filter((message) =>
      message.querySelector('.a3s.aiL, .a3s'),
    );
    const message = messages.at(-1);
    if (!message) return null;

    const body = message.querySelector('.a3s.aiL, .a3s');
    const senderElement = message.querySelector('.gD[email], [email]');
    const sender = senderElement?.getAttribute('email') || '';
    const subject = document.querySelector('h2.hP')?.innerText || document.title || '';
    const messageIdentity = message.getAttribute('data-message-id') ||
      message.getAttribute('data-legacy-message-id') ||
      message.getAttribute('data-thread-id') || '';
    const receivedAt = message.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    return { message, body, sender, subject, messageIdentity, receivedAt };
  }

  async function scan() {
    const current = latestExpandedMessage();
    if (!current || !current.body) return;
    const candidate = await KeepFlipSaleParser.parseOpenMessage({
      sender: current.sender,
      subject: current.subject,
      text: current.body.innerText || '',
      messageElement: current.body,
      messageIdentity: current.messageIdentity,
      receivedAt: current.receivedAt,
    });
    if (!candidate || candidate.idempotencyKey === lastCandidateId) return;
    lastCandidateId = candidate.idempotencyKey;
    chrome.runtime.sendMessage({ type: 'KEEPFLIP_SALE_CANDIDATE', candidate }).catch(() => {});
  }

  function scheduleScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void scan(), 500);
  }

  scheduleScan();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
