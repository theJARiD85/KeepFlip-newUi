import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';

// The public site keeps one visual identity regardless of the signed-in app preference.
export const KEEPFLIP_PUBLIC_COLORS = getKeepFlipThemeColors('dark');

export const KEEPFLIP_SITE_URL = 'https://keep-flip.com';
export const KEEPFLIP_GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.keepflip.app';
export const KEEPFLIP_FREE_SCANS_PER_MONTH = 10;
export const KEEPFLIP_FREE_LISTING_GENERATIONS_PER_MONTH = 10;

export const KEEPFLIP_PUBLIC_PRICING_USD = {
  web: {
    monthly: 13,
    annual: 130,
    annualSavings: 26,
  },
  android: {
    monthly: 13,
    annual: 130,
    annualSavings: 26,
  },
  activeListingLimit: 250,
} as const;

export const KEEPFLIP_HOME_TITLE =
  'KeepFlip - know your real profit before you buy | Reseller app for Android';

export const KEEPFLIP_HOME_DESCRIPTION =
  'Research a find, check net after fees, decide what to buy, and track inventory and profit from the find to the sale with KeepFlip.';

export const KEEPFLIP_HOME_FAQS = [
  {
    question: 'How much does KeepFlip cost?',
    answer:
      'Serious Reseller is $13 per month or $130 per year. Serious includes unlimited saved inventory, 200 scans each month, unlimited listing generations, and Flip. Free accounts get 10 saved inventory items, 10 scans, and 10 listing generations each month. There is no timed KeepFlip trial.',
  },
  {
    question: 'What happens when the scan gets it wrong?',
    answer:
      'A scan is an estimate, not a guaranteed sale price or profit. KeepFlip shows confidence and market evidence where available. Check the details and fees, then make the buy call yourself.',
  },
  {
    question: 'Can I try KeepFlip before paying?',
    answer:
      'Create a free account and use every KeepFlip feature except Flip Assistant, including AI valuation, inventory, Books, and insights. Free includes up to 10 saved inventory items, 10 AI scans per month, and 10 listing generations per month. Flip is included with Serious. No card or timed trial is required.',
  },
  {
    question: 'Do I need an iPhone?',
    answer:
      'KeepFlip is available on Android and in a browser. The phone-camera scan is in the Android app; there is no iPhone app available today.',
  },
  {
    question: 'Can I get my data out?',
    answer:
      'Books can export Schedule C information, but KeepFlip does not have a one-click export for every account record. Email support to request access, correction, or deletion of eligible account information.',
  },
  {
    question: 'Does KeepFlip work for a new reseller?',
    answer:
      'Start with the item in front of you. Research it, count the costs, and decide whether it makes sense for your own budget and goals. You make the buy call.',
  },
] as const;

export const KEEPFLIP_EBAY_CONNECTION_COPY =
  'Connect through eBay sign-in. KeepFlip uses authorized eBay APIs for seller and listing details used by the features you choose; your eBay password stays with eBay.';
