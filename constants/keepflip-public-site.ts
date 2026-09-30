export const KEEPFLIP_SITE_URL = 'https://keep-flip.com';
export const KEEPFLIP_GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.keepflip.app';
export const KEEPFLIP_FREE_ANDROID_SCANS_PER_MONTH = 20;

export const KEEPFLIP_PUBLIC_PRICING_USD = {
  web: {
    monthly: 18,
    annual: 180,
    annualSavings: 36,
  },
  android: {
    monthly: 12,
    annual: 120,
    annualSavings: 24,
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
      'There is one Serious Reseller plan. US web checkout is $18 per month or $180 per year; paying yearly saves $36, the cost of two monthly payments. Google Play sets the price shown in its purchase screen. Its public listing currently reports in-app purchases from $18 to $180, so check the final store price before you confirm. The web checkout does not currently offer a free trial.',
  },
  {
    question: 'What happens when the scan gets it wrong?',
    answer:
      'A scan is an estimate, not a guaranteed sale price or profit. KeepFlip shows confidence and market evidence where available. Check the details and fees, then make the buy call yourself.',
  },
  {
    question: 'Can I try KeepFlip before paying?',
    answer:
      'Create a free account in the Android app, then use the KeepFlip workspace on Android and web with up to 10 inventory items, 10 active listings, and 20 AI valuations per month. No card is required. The web checkout itself does not currently offer a free trial.',
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
