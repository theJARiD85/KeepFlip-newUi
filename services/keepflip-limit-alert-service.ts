export type KeepFlipLimitCategory = 'scan' | 'inventory' | 'listing_generation';

export type KeepFlipLimitNotice = {
  category: KeepFlipLimitCategory;
  limit: number;
  plan: 'free' | 'serious';
  usage: number;
};

type Listener = (notice: KeepFlipLimitNotice) => void;

const listeners = new Set<Listener>();

export function subscribeToKeepFlipLimitNotices(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportKeepFlipLimitReached(notice: KeepFlipLimitNotice) {
  for (const listener of listeners) listener(notice);
}
