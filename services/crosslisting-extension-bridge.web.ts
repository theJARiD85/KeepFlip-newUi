import type { CrosslistingMarketplace, CrosslistingPayload, CrosslistingPhotoAsset } from '@/services/crosslisting-service';

export type ExtensionJob = {
  marketplace: CrosslistingMarketplace;
  tabId: number | null;
  status: string;
  details?: ExtensionStatus | null;
};

export type ExtensionStatus = {
  runId: string;
  itemId: string;
  marketplace: CrosslistingMarketplace;
  status: string;
  fields?: string[];
  missingFields?: string[];
  uploadedPhotoCount?: number;
  message?: string;
  externalUrl?: string;
};

type ExtensionReply = { ok: boolean; error?: string; run?: { id: string; jobs: ExtensionJob[] } | null };
type ExtensionRequest = {
  action: 'HELLO' | 'LISTING_START' | 'LISTING_FOCUS' | 'LISTING_RESUME' | 'LISTING_SUBMIT';
  ownerId: string;
  itemId?: string;
  runId?: string;
  marketplace?: CrosslistingMarketplace;
  jobs?: { marketplace: CrosslistingMarketplace; payload: CrosslistingPayload }[];
  photos?: CrosslistingPhotoAsset[];
  unavailablePhotoCount?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requestCrosslistingExtension(input: ExtensionRequest): Promise<ExtensionReply> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Desktop browser required.'));
  return new Promise((resolve, reject) => {
    const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('KeepFlip extension did not respond. Load or reload KeepFlip Assistant in Chrome, then refresh Listing.'));
    }, input.action === 'LISTING_START' ? 30_000 : 4_000);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data) ||
        event.data.source !== 'keepflip-extension' || event.data.protocol !== 1 ||
        event.data.action !== 'RESPONSE' || event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      const reply = event.data as ExtensionReply;
      if (reply.ok) resolve(reply);
      else reject(new Error(typeof reply.error === 'string' ? reply.error : 'KeepFlip extension could not finish this action.'));
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'keepflip-webapp', protocol: 1, requestId, ...input }, window.location.origin);
  });
}

export function subscribeCrosslistingExtensionStatus(listener: (status: ExtensionStatus) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  function onMessage(event: MessageEvent) {
    if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data) ||
      event.data.source !== 'keepflip-extension' || event.data.protocol !== 1 ||
      event.data.action !== 'STATUS' || typeof event.data.runId !== 'string' ||
      typeof event.data.marketplace !== 'string' || typeof event.data.status !== 'string') return;
    listener(event.data as ExtensionStatus);
  }
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
