export const LANDING_STEPS = [
  {
    number: '01',
    title: 'SOURCE',
    detail: 'Scan a find on Android and research the item before you buy.',
    icon: 'scan-outline',
  },
  {
    number: '02',
    title: 'DECIDE',
    detail: 'Count your costs, fees, and estimated net before cash is tied up.',
    icon: 'cube-outline',
  },
  {
    number: '03',
    title: 'TRACK',
    detail: 'See what is listed, what is waiting, and where each item lives.',
    icon: 'list-outline',
  },
  {
    number: '04',
    title: 'LEARN',
    detail: 'Review sales and costs to see which buys paid off.',
    icon: 'stats-chart-outline',
  },
] as const;

export const LANDING_BENEFITS = [
  {
    title: 'Know what is tied up.',
    detail: 'Keep your purchase cost, listing status, and item location together.',
    icon: 'time-outline',
  },
  {
    title: 'Check the real margin.',
    detail: 'Estimate fees and other costs before you make the buy call.',
    icon: 'cash-outline',
  },
  {
    title: 'Work on the next item.',
    detail: 'Find what still needs research, a listing, or a price decision.',
    icon: 'alert-circle-outline',
  },
] as const;
