(function installKeepFlipSaleParser(global) {
  const RULES = [
    {
      platform: 'depop',
      domain: 'depop.com',
      markers: [/you['’]ve sold an item/i],
    },
    {
      platform: 'poshmark',
      domain: 'poshmark.com',
      markers: [/congrats!\s*you just made a sale/i],
    },
    {
      platform: 'mercari',
      domain: 'mercari.com',
      markers: [/your item sold/i, /you made a sale/i, /sold your item/i, /you sold an item/i],
    },
  ];

  function cleanLine(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t ]+/g, ' ')
      .trim()
      .replace(/^[:#\-–—\s]+|[:#\-–—\s]+$/g, '');
  }

  function senderDomain(sender) {
    const address = String(sender || '').trim().toLowerCase();
    const at = address.lastIndexOf('@');
    return at >= 0 ? address.slice(at + 1).replace(/>.*$/, '') : '';
  }

  function hostMatches(hostname, expected) {
    return hostname === expected || hostname.endsWith('.' + expected);
  }

  function findRule(sender, text) {
    const domain = senderDomain(sender);
    return RULES.find((rule) =>
      hostMatches(domain, rule.domain) && rule.markers.some((marker) => marker.test(text)),
    ) || null;
  }

  function extractSku(text) {
    const match = String(text || '').match(
      /\b(?:custom\s+)?(?:seller\s+)?sku\s*[:#-]\s*([A-Z0-9][A-Z0-9._-]{1,79})\b/i,
    );
    return match ? cleanLine(match[1]).slice(0, 120) : null;
  }

  function extractTitle(text, messageElement, rule) {
    const source = String(text || '');
    const label = source.match(
      /^\s*(?:item|listing|product)\s*(?:title|name)?\s*[:#-]\s*(.{2,200})\s*$/im,
    );
    if (label) return cleanLine(label[1]).slice(0, 300) || null;

    const productLink = Array.from(messageElement?.querySelectorAll('a[href]') || []).find((anchor) => {
      try {
        const url = new URL(anchor.href);
        const path = url.pathname.toLowerCase();
        return hostMatches(url.hostname.toLowerCase(), rule.domain) &&
          !/(order|receipt|help|support|unsubscribe|settings|account)/.test(path) &&
          cleanLine(anchor.innerText).length >= 3 && cleanLine(anchor.innerText).length <= 200;
      } catch {
        return false;
      }
    });
    if (productLink) return cleanLine(productLink.innerText).slice(0, 300) || null;

    const lines = source.split(/\r?\n/).map(cleanLine).filter(Boolean);
    const markerIndex = lines.findIndex((line) => rule.markers.some((marker) => marker.test(line)));
    if (markerIndex >= 0) {
      for (const line of lines.slice(markerIndex + 1, markerIndex + 6)) {
        if (/^(view|open|see|review)\s+(order|sale|details|item)\b/i.test(line)) continue;
        if (line.length >= 3 && line.length <= 200 && !/@/.test(line)) return line.slice(0, 300);
      }
    }
    return null;
  }

  function extractSaleAmount(text) {
    const match = String(text || '').match(
      /\b(?:sold\s+for|sale\s+price|item\s+price)\b\s*:?\s*(US\$|CA\$|AU\$|[$£€])\s*([\d,]+(?:\.\d{1,2})?)/i,
    );
    if (!match) return { saleCents: null, currency: 'USD' };
    const amount = Number(match[2].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
      return { saleCents: null, currency: 'USD' };
    }
    const currency = ({
      'CA$': 'CAD',
      'AU$': 'AUD',
      '£': 'GBP',
      '€': 'EUR',
    })[match[1].toUpperCase()] || 'USD';
    return { saleCents: Math.round(amount * 100), currency };
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function parseOpenMessage({ sender, subject, text, messageElement, messageIdentity, receivedAt }) {
    const rule = findRule(sender, text);
    if (!rule) return null;
    const title = extractTitle(text, messageElement, rule);
    const sku = extractSku(text);
    if (!title && !sku) return null;

    const { saleCents, currency } = extractSaleAmount(text);
    const identity = String(messageIdentity || [sender, subject, title, sku, saleCents, receivedAt].join('|'));
    const idempotencyKey = 'email-' + await sha256(rule.platform + '|' + identity);
    return {
      idempotencyKey,
      platform: rule.platform,
      title,
      sku,
      saleCents,
      currency,
      receivedAt: receivedAt || new Date().toISOString(),
    };
  }

  global.KeepFlipSaleParser = Object.freeze({ parseOpenMessage });
})(globalThis);
