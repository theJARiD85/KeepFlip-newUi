import { WebCompetitorComparison } from '@/components/web/web-competitor-comparison';

export default function FlipAiComparisonPage() {
  return (
    <WebCompetitorComparison
      comparison={{
        canonicalPath: '/vs/flipai',
        competitor: 'FlipAI',
        title: 'KeepFlip vs FlipAI for resellers',
        description:
          'Compare KeepFlip and FlipAI by platform, scan and listing tools, marketplace coverage, and price using each company’s published information.',
        rows: [
          {
            area: 'Scan and market evidence',
            keepFlip: 'Android scan with confidence signals and market evidence. Results are estimates, not a promised accuracy rate.',
            competitor: 'FlipAI promotes AI photo scanning. The company page reviewed does not publish a head-to-head accuracy figure.',
          },
          {
            area: 'Buy decision',
            keepFlip: 'Flip can use your categories, target return, and buying rules as context. You make the buy call.',
            competitor: 'The site promotes scanning and resale pricing. We did not find a published comparison of personalized buying rules on the linked page.',
          },
          {
            area: 'Profit records',
            keepFlip: 'Books brings sales, fees, expenses, and inventory costs together and can export Schedule C information.',
            competitor: 'FlipAI lists profit tracking. The linked company page does not describe connected books or a Schedule C export.',
          },
          {
            area: 'Platforms and listings',
            keepFlip: 'Android app and browser access; eBay focused. KeepFlip does not currently crosslist to five marketplaces.',
            competitor: 'The site lists iOS and says Android is in development. It promotes listing and crosslisting to nine marketplaces.',
          },
          {
            area: 'Published price',
            keepFlip: 'US web checkout: $18/month or $180/year. The web checkout has no free trial.',
            competitor: 'The site lists 10 lifetime scans on free, Pro at $9.99/month, and Power Seller at $14.99/month.',
          },
        ],
        fitFor:
          'FlipAI may fit if iPhone scanning or multi-marketplace crosslisting is your main need. KeepFlip may fit if you use Android and want to follow an eBay focused flip from buy decision through costs and inventory. That fit guidance is an inference from each company’s published product descriptions.',
        sourceUrl: 'https://flipai.app/',
        sourceLabel: 'FlipAI official site and pricing',
      }}
    />
  );
}
