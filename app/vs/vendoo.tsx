import { WebCompetitorComparison } from '@/components/web/web-competitor-comparison';

export default function VendooComparisonPage() {
  return (
    <WebCompetitorComparison
      comparison={{
        canonicalPath: '/vs/vendoo',
        competitor: 'Vendoo',
        title: 'KeepFlip vs Vendoo for resellers',
        description:
          'Compare KeepFlip and Vendoo by marketplace coverage, workflow, and published prices to see which matches how you sell.',
        rows: [
          {
            area: 'Scan and market evidence',
            keepFlip: 'Android scan with confidence signals and market evidence; estimates still need your review.',
            competitor: 'The linked pricing page is about Vendoo plans and crosslisting; it does not present a scan-accuracy comparison.',
          },
          {
            area: 'Buy decision',
            keepFlip: 'Flip can consider your own categories, target return, and buying rules. You make the buy call.',
            competitor: 'The linked pricing page does not describe an equivalent personalized buy-rules feature.',
          },
          {
            area: 'Profit records',
            keepFlip: 'Books brings sales, fees, expenses, and inventory costs together and can export Schedule C information.',
            competitor: 'The linked pricing page does not provide enough detail for a like-for-like comparison of Books or Schedule C export.',
          },
          {
            area: 'Marketplace coverage',
            keepFlip: 'Built around eBay and solo sourcing. KeepFlip does not currently crosslist to five or more marketplaces.',
            competitor: 'Vendoo promotes crosslisting to 10+ marketplaces.',
          },
          {
            area: 'Published price',
            keepFlip: 'US web checkout: $13/month or $130/year. KeepFlip has no timed trial; the Free tier does not expire.',
            competitor: 'The annual pricing page lists Starter/Growth/Pro at $14.99/$29.99/$59.99 monthly, or $12.49/$24.99/$49.99 per month with annual billing. It advertises a 14-day trial.',
          },
        ],
        fitFor:
          'Vendoo may fit better if moving listings among many marketplaces is the main job. KeepFlip may fit if you want Android item research, costs before buying, and inventory tied to an eBay sale. This is a product fit inference from the companies’ published descriptions, not a performance comparison.',
        sourceUrl: 'https://marketing.vendoo.co/pricing-yearly-plans',
        sourceLabel: 'Vendoo official annual pricing page',
        additionalSources: [
          {
            url: 'https://vendoo.co/marketplaces/resell-on-shopify',
            label: 'Vendoo official marketplace overview',
          },
        ],
      }}
    />
  );
}
