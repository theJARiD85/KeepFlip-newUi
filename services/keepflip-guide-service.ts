export const FLIP_GUIDE_IDS = [
  'scan_item',
  'save_inventory',
  'update_inventory',
  'review_books',
  'create_listing',
  'connect_ebay',
  'money_sync',
  'market_research',
  'repair_item',
  'command_center',
  'flip_plan',
  'account_settings',
] as const;

export type FlipGuideId = (typeof FLIP_GUIDE_IDS)[number];

export type FlipGuideStep = {
  body: string;
  buttonLabel: string;
  id: string;
  route: string;
  title: string;
};

export type FlipGuide = {
  description: string;
  id: FlipGuideId;
  steps: FlipGuideStep[];
  title: string;
};

export const FLIP_GUIDES: Record<FlipGuideId, FlipGuide> = {
  account_settings: {
    description: 'Review your KeepFlip profile, access, subscription, and account controls.',
    id: 'account_settings',
    steps: [
      {
        body: 'Open Account to review your profile, security, privacy, and subscription controls.',
        buttonLabel: 'Open Account',
        id: 'open-account',
        route: '/account',
        title: 'Open Account',
      },
      {
        body: 'Use the section that matches what you need. KeepFlip keeps billing and account changes behind the relevant native controls.',
        buttonLabel: 'I found the control',
        id: 'choose-account-control',
        route: '/account',
        title: 'Choose the right control',
      },
    ],
    title: 'Account help',
  },
  command_center: {
    description: 'Use the Command Center to see what deserves attention next.',
    id: 'command_center',
    steps: [
      {
        body: 'Open the Command Center for the Pulse of your reselling business.',
        buttonLabel: 'Open Command Center',
        id: 'open-command-center',
        route: '/command-center',
        title: 'Open the Command Center',
      },
      {
        body: 'Start with the attention cards, then choose one concrete next move. Flip can help compare the tradeoffs before you act.',
        buttonLabel: 'I see the next move',
        id: 'read-pulse',
        route: '/command-center',
        title: 'Read the Pulse',
      },
    ],
    title: 'Command Center help',
  },
  flip_plan: {
    description: 'Turn a business goal into a practical resale plan and measurable next moves.',
    id: 'flip_plan',
    steps: [
      {
        body: 'Open Flip Plan to define the business outcome you are trying to improve, such as cash flow, sell-through, sourcing focus, or profit quality.',
        buttonLabel: 'Open Flip Plan',
        id: 'open-flip-plan',
        route: '/flip-plan',
        title: 'Name the outcome',
      },
      {
        body: 'Use your real Books, inventory, and seller-operation evidence to choose a goal. Keep estimated resale upside separate from realized profit.',
        buttonLabel: 'Evidence reviewed',
        id: 'review-plan-evidence',
        route: '/flip-plan',
        title: 'Ground the plan in evidence',
      },
      {
        body: 'Choose one next action you can complete this week. Flip can help pressure-test the tradeoff before you commit.',
        buttonLabel: 'Next action chosen',
        id: 'choose-plan-action',
        route: '/flip-plan',
        title: 'Choose the next move',
      },
    ],
    title: 'Flip Plan help',
  },
  connect_ebay: {
    description: 'Connect or reconnect the seller account before using live marketplace actions.',
    id: 'connect_ebay',
    steps: [
      {
        body: 'Open eBay Connection and start the secure connection flow.',
        buttonLabel: 'Open eBay Connection',
        id: 'open-ebay-connect',
        route: '/ebay-connect',
        title: 'Open eBay Connection',
      },
      {
        body: 'Complete the eBay sign-in and consent screens. Return to KeepFlip so it can verify the connection status.',
        buttonLabel: 'I completed eBay sign-in',
        id: 'complete-ebay-auth',
        route: '/ebay-connect',
        title: 'Complete the secure connection',
      },
      {
        body: 'Check that KeepFlip shows the connection as active before preparing or publishing a listing.',
        buttonLabel: 'Connection is verified',
        id: 'verify-ebay-status',
        route: '/ebay-connect',
        title: 'Verify the status',
      },
    ],
    title: 'Connect eBay',
  },
  create_listing: {
    description: 'Move a saved item through identity, photos, condition, pricing, and listing review.',
    id: 'create_listing',
    steps: [
      {
        body: 'Open Inventory and choose the exact saved item you want to list.',
        buttonLabel: 'Open Inventory',
        id: 'open-inventory-for-listing',
        route: '/inventory',
        title: 'Choose the item',
      },
      {
        body: 'Tap “List item” on that card. KeepFlip opens the listing workspace for the selected record.',
        buttonLabel: 'I opened the listing workspace',
        id: 'open-listing-workspace',
        route: '/inventory',
        title: 'Open the listing workspace',
      },
      {
        body: 'Review identity, photos, condition disclosure, pricing, shipping, and the final marketplace details before publishing.',
        buttonLabel: 'Review listing details in Inventory',
        id: 'review-listing',
        route: '/inventory',
        title: 'Review before publishing',
      },
    ],
    title: 'Create a listing',
  },
  market_research: {
    description: 'Use market evidence to pressure-test a sourcing or pricing decision.',
    id: 'market_research',
    steps: [
      {
        body: 'Open Market Research and start with the item identity, condition, and marketplace you are comparing.',
        buttonLabel: 'Open Market Research',
        id: 'open-market-research',
        route: '/market-research',
        title: 'Open Market Research',
      },
      {
        body: 'Treat asking listings as context, not proof of a sale. Compare like-for-like condition, fees, shipping, and time to sale.',
        buttonLabel: 'I know what to compare',
        id: 'compare-evidence',
        route: '/market-research',
        title: 'Compare the evidence',
      },
    ],
    title: 'Market research help',
  },
  money_sync: {
    description: 'Bring seller activity into Books, then resolve anything that still needs review.',
    id: 'money_sync',
    steps: [
      {
        body: 'Open Seller Operations from the Command Center and run Money Sync when you want to refresh seller activity.',
        buttonLabel: 'Open Seller Operations',
        id: 'open-money-sync',
        route: '/command-center?openSellerOperations=1',
        title: 'Open Money Sync',
      },
      {
        body: 'Read the sync result. Posted records are durable; anything marked for review needs an explicit correction instead of a guess.',
        buttonLabel: 'I read the sync result',
        id: 'read-sync-result',
        route: '/command-center?openSellerOperations=1',
        title: 'Read the result',
      },
      {
        body: 'Open the review queue for missing item matches, missing costs, invalid imports, or other bookkeeping details.',
        buttonLabel: 'Open the review queue',
        id: 'open-review-queue',
        route: '/command-center?openReviewQueue=1',
        title: 'Resolve what needs review',
      },
    ],
    title: 'Money Sync help',
  },
  repair_item: {
    description: 'Research repair options without treating a repair estimate as guaranteed profit.',
    id: 'repair_item',
    steps: [
      {
        body: 'Open Repair Assist and choose the item or problem you want to investigate.',
        buttonLabel: 'Open Repair Assist',
        id: 'open-repair-assist',
        route: '/repair-assist',
        title: 'Open Repair Assist',
      },
      {
        body: 'Compare the likely repair cost and time with the item’s evidence-backed resale reference and your buy rules.',
        buttonLabel: 'Repair tradeoff reviewed',
        id: 'review-repair-tradeoff',
        route: '/repair-assist',
        title: 'Review the tradeoff',
      },
    ],
    title: 'Repair help',
  },
  review_books: {
    description: 'Resolve an imported Books record with the exact transaction and inventory evidence.',
    id: 'review_books',
    steps: [
      {
        body: 'Open the Books review queue from the Command Center and choose the exact record that needs attention.',
        buttonLabel: 'Open Books review',
        id: 'open-books-review',
        route: '/command-center?openReviewQueue=1',
        title: 'Open the review queue',
      },
      {
        body: 'For a cost review, use the actual historical item cost. For an item-match review, choose the exact inventory item. Never use an estimate just to clear the queue.',
        buttonLabel: 'I found the correction',
        id: 'make-books-correction',
        route: '/command-center?openReviewQueue=1',
        title: 'Make the correction',
      },
      {
        body: 'Confirm only after the amount, item, currency, and transaction details match the source record.',
        buttonLabel: 'Review complete',
        id: 'confirm-books-review',
        route: '/command-center?openReviewQueue=1',
        title: 'Confirm the review',
      },
    ],
    title: 'Books review help',
  },
  save_inventory: {
    description: 'Turn a completed scan into a durable inventory record with its actual cost and evidence.',
    id: 'save_inventory',
    steps: [
      {
        body: 'Start in Scanner and capture the item from several useful angles, including labels and visible flaws.',
        buttonLabel: 'Open Scanner',
        id: 'open-scanner-to-save',
        route: '/scanner',
        title: 'Capture the evidence',
      },
      {
        body: 'Review Flip’s identification, condition, and market reference. If evidence is thin, add the suggested close-up before saving.',
        buttonLabel: 'Analysis reviewed',
        id: 'review-analysis-to-save',
        route: '/scanner',
        title: 'Review the analysis',
      },
      {
        body: 'Save the item with what you actually paid, quantity, source, storage location, and any receipt or notes you want to preserve.',
        buttonLabel: 'Save details reviewed',
        id: 'save-item-details',
        route: '/scanner',
        title: 'Save the real numbers',
      },
    ],
    title: 'Save to inventory',
  },
  scan_item: {
    description: 'Use the scanner to collect evidence before making a buy or skip decision.',
    id: 'scan_item',
    steps: [
      {
        body: 'Open Scanner and frame the whole item clearly. Keep the camera steady so Flip can inspect useful details.',
        buttonLabel: 'Open Scanner',
        id: 'open-scanner',
        route: '/scanner',
        title: 'Open Scanner',
      },
      {
        body: 'Capture front, back, labels, model or serial details, and any flaw that could change condition or value.',
        buttonLabel: 'Evidence captured',
        id: 'capture-scan-evidence',
        route: '/scanner',
        title: 'Capture useful evidence',
      },
      {
        body: 'Read Flip’s confidence and unknowns before deciding whether to buy, skip, save, or collect another photo.',
        buttonLabel: 'I understand the read',
        id: 'read-scan-result',
        route: '/scanner',
        title: 'Read the result',
      },
    ],
    title: 'Scan an item',
  },
  update_inventory: {
    description: 'Correct a saved inventory number, including incomplete records that still need review.',
    id: 'update_inventory',
    steps: [
      {
        body: 'Open Inventory and choose the exact record. Imported, incomplete, and review-flagged records remain eligible for number corrections.',
        buttonLabel: 'Open Inventory',
        id: 'open-inventory-for-update',
        route: '/inventory',
        title: 'Choose the exact record',
      },
      {
        body: 'Tell Flip the exact number and field to change—for example, “set the Coach bag acquisition cost to 24.99” or “set quantity on hand to 2.”',
        buttonLabel: 'I stated the exact update',
        id: 'state-inventory-update',
        route: '/inventory',
        title: 'State the correction',
      },
      {
        body: 'Review Flip’s before-and-after confirmation. Flip saves only after you confirm, and it keeps Books review confirmation as a separate step.',
        buttonLabel: 'Update reviewed',
        id: 'confirm-inventory-update',
        route: '/inventory',
        title: 'Confirm the new number',
      },
    ],
    title: 'Update inventory numbers',
  },
};

export function isFlipGuideId(value: unknown): value is FlipGuideId {
  return typeof value === 'string' && FLIP_GUIDE_IDS.includes(value as FlipGuideId);
}

export function getFlipGuide(guideId: FlipGuideId) {
  return FLIP_GUIDES[guideId];
}
