import { WebCompetitorComparison } from '@/components/web/web-competitor-comparison';

export default function SpreadsheetComparisonPage() {
  return (
    <WebCompetitorComparison
      comparison={{
        canonicalPath: '/vs/spreadsheets',
        competitor: 'A spreadsheet you manage',
        title: 'KeepFlip vs a resale spreadsheet',
        description:
          'Compare KeepFlip with a spreadsheet for resale work: control and flexibility on one side, item research and a connected eBay focused record on the other.',
        rows: [
          {
            area: 'Scan and market evidence',
            keepFlip: 'Android item scan with confidence signals and market evidence.',
            competitor: 'A spreadsheet can hold your notes; item research and price evidence depend on the other tools you choose.',
          },
          {
            area: 'Buy decision',
            keepFlip: 'Flip can consider your own categories, target return, and buying rules. You make the buy call.',
            competitor: 'You can build your own formulas and decision rules, then update them yourself.',
          },
          {
            area: 'Inventory and profit records',
            keepFlip: 'Track item cost, location, eBay listing status, sales, fees, and expenses in one place. Books can export Schedule C information.',
            competitor: 'You decide the columns and enter changes as items move, list, sell, or incur costs.',
          },
          {
            area: 'Control and flexibility',
            keepFlip: 'A ready-made Android and browser workflow for an eBay focused solo reseller.',
            competitor: 'Full control over columns and formulas. The sheet can be shaped to your own way of working.',
          },
          {
            area: 'Published price',
            keepFlip: 'US web checkout: $13/month or $130/year. KeepFlip has no timed trial; the Free tier does not expire.',
            competitor: 'Spreadsheet app and template costs vary; there is no single price to compare.',
          },
        ],
        fitFor:
          'Keep the spreadsheet if it already works for you and you want full control over every column. KeepFlip may fit if you want Android item research and less manual copying between inventory and your recorded sales. This is a workflow comparison, not a claim that one approach is right for every reseller.',
        sourceNote:
          'This page compares a spreadsheet workflow with KeepFlip; it is not a feature or price review of one spreadsheet product. Google Sheets is linked as one example. Other tools, templates, and costs vary.',
        sourceUrl: 'https://workspace.google.com/products/sheets/',
        sourceLabel: 'Google Sheets product page',
      }}
    />
  );
}
