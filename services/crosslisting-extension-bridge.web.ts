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
  action: 'HELLO' | 'LISTING_START' | 'LISTING_FOCUS' | 'LISTING_RESUME' | 'LISTING_RETRY' | 'LISTING_SUBMIT';
  ownerId: string;
  itemId?: string;
  runId?: string;
  marketplace?: CrosslistingMarketplace;
  jobs?: { marketplace: CrosslistingMarketplace; payload: CrosslistingPayload }[];
  photos?: CrosslistingPhotoAsset[];
  unavailablePhotoCount?: number;
};

type PageChromeRuntime = {
  sendMessage: (extensionId: string, message: Record<string, unknown>, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

const KEEPFLIP_EXTENSION_ID = 'obidmfnpdginjpppjopacllakgmlbapf';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function requestCrosslistingExtension(input: ExtensionRequest): Promise<ExtensionReply> {
  if (typeof window === 'undefined') throw new Error('Desktop browser required.');
  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const request = { source: 'keepflip-webapp', protocol: 1, requestId, ...input };
  const pageRuntime = (globalThis as typeof globalThis & { chrome?: { runtime?: PageChromeRuntime } }).chrome?.runtime;

  function requestThroughPageBridge(): Promise<ExtensionReply> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('KeepFlip Assistant could not be reached. Allow it on this KeepFlip page in Chrome, then reload Listing.'));
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
      window.postMessage(request, window.location.origin);
    });
  }

  if (!pageRuntime?.sendMessage) return requestThroughPageBridge();

  let timedOut = false;
  let response: unknown;
  try {
    response = await new Promise<unknown>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        timedOut = true;
        reject(new Error('KeepFlip Assistant did not answer the listing request. Reload the extension and Listing, then try again.'));
      }, input.action === 'LISTING_START' ? 30_000 : 4_000);

      try {
        pageRuntime.sendMessage(KEEPFLIP_EXTENSION_ID, { type: 'KEEPFLIP_LISTING_EXTERNAL', request }, (reply) => {
          window.clearTimeout(timeout);
          const runtimeError = pageRuntime.lastError;
          if (runtimeError) reject(new Error(runtimeError.message || 'KeepFlip Assistant could not be reached.'));
          else resolve(reply);
        });
      } catch (error) {
        window.clearTimeout(timeout);
        reject(error);
      }
    });
  } catch {
    // Do not send LISTING_START twice if the extension received it but took too long to reply.
    if (timedOut) {
      throw new Error('KeepFlip Assistant did not answer the listing request. Reload the extension and Listing, then try again.');
    }
    return requestThroughPageBridge();
  }

  if (!isRecord(response) || typeof response.ok !== 'boolean') return requestThroughPageBridge();
  const reply = response as unknown as ExtensionReply;
  if (!reply.ok) throw new Error(typeof reply.error === 'string' ? reply.error : 'KeepFlip Assistant could not finish this action.');
  return reply;
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
