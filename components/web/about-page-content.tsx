import { PublicInfoPage } from '@/components/web/public-info-page';

export function AboutPageContent() {
  return (
    <PublicInfoPage
      eyebrow="ABOUT KEEPFLIP"
      paragraphs={[
        'KeepFlip is a resale planning app for independent resellers and small shops.',
        'Use KeepFlip to research items, check a buy against your own rules, track inventory, and prepare marketplace listings.',
        'Item research and resale values are estimates. Review the item and available evidence before you decide to buy or list it.',
      ]}
      title="About KeepFlip"
    />
  );
}

// TODO(about-authorship): Add the verified builder name, start date, and team location after the site owner confirms them.
