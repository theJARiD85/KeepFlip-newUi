import assert from 'node:assert/strict';
import test from 'node:test';

import { listingWithTargetPrice } from '../services/listing-asking-price.ts';

test('editing a target price updates asking-price copy and every marketplace price', () => {
  const descriptions = {
    facebookMarketplace: 'Priced at $4,500. Original price: $6,000.',
    ebay: 'Listed for $4500. Retail price is $6,000.',
    offerUp: 'Asking $4,500.',
    depop: 'Available for $4,500.',
    poshmark: 'Selling for $4,500.',
    mercari: 'Price: $4500.',
  };
  const marketplaceListings = Object.fromEntries(
    Object.entries(descriptions).map(([platform, description]) => [
      platform,
      { title: 'Camera', description, price: 4500, fields: {} },
    ]),
  );
  marketplaceListings.ebay.subtitle = 'Asking $4500';
  const listing = {
    title: 'Camera', subtitle: 'Working camera',
    description: 'Priced at $4500. Includes a $50 case.',
    shortDescription: 'Asking $4,500.',
    conditionDisclosure: 'Seller says it works.',
    keySellingPoints: ['Listed for $4,500.'],
    photoChecklist: [], suggestedTags: [], warnings: [],
    priceRange: { quickSale: 4500, targetPrice: 4500, highAsk: 4500 },
    platformCopy: descriptions,
    marketplaceListings,
  };

  const corrected = listingWithTargetPrice(listing, 5075, 'USD');
  assert.deepEqual(corrected.priceRange, { quickSale: 5075, targetPrice: 5075, highAsk: 5075 });
  assert.equal(corrected.description, 'Priced at $5,075. Includes a $50 case.');
  assert.equal(corrected.shortDescription, 'Asking $5,075.');
  assert.deepEqual(corrected.keySellingPoints, ['Listed for $5,075.']);
  assert.equal(corrected.platformCopy.facebookMarketplace, 'Priced at $5,075. Original price: $6,000.');
  assert.equal(corrected.platformCopy.ebay, 'Listed for $5,075. Retail price is $6,000.');
  assert.equal(corrected.marketplaceListings.ebay.subtitle, 'Asking $5,075');
  for (const [platform, draft] of Object.entries(corrected.marketplaceListings)) {
    assert.equal(draft.price, 5075, `${platform} price`);
    assert.equal(draft.description, corrected.platformCopy[platform], `${platform} copy`);
  }
  assert.equal(listing.description, 'Priced at $4500. Includes a $50 case.');
});
