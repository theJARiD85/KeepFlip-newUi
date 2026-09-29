import { createElement, type CSSProperties } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';
import {
  WebActionLink,
  WebContentSection,
  WebCopy,
  WebInfoCard,
  WebMarketingPage,
  WebTextLink,
} from '@/components/web/web-public-page';
import { KEEPFLIP_PUBLIC_PRICING_USD, KEEPFLIP_SITE_URL } from '@/constants/keepflip-public-site';

export type CompetitorComparison = {
  canonicalPath: string;
  competitor: string;
  description: string;
  fitFor: string;
  additionalSources?: readonly { label: string; url: string }[];
  sourceNote?: string;
  sourceLabel: string;
  sourceUrl: string;
  title: string;
  rows: readonly {
    area: string;
    keepFlip: string;
    competitor: string;
  }[];
};

export function WebCompetitorComparison({ comparison }: { comparison: CompetitorComparison }) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const faq = [
    {
      question: `Is KeepFlip a replacement for ${comparison.competitor}?`,
      answer: comparison.fitFor,
    },
    {
      question: 'How much does KeepFlip cost?',
      answer: `US web checkout is $${KEEPFLIP_PUBLIC_PRICING_USD.web.monthly} per month or $${KEEPFLIP_PUBLIC_PRICING_USD.web.annual} per year. Google Play shows its own purchase price before you confirm.`,
    },
  ];
  const metadata = {
    canonicalPath: comparison.canonicalPath,
    description: comparison.description,
    title: comparison.title,
    structuredData: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: comparison.title,
          description: comparison.description,
          url: `${KEEPFLIP_SITE_URL}${comparison.canonicalPath}`,
        },
        {
          '@type': 'FAQPage',
          mainEntity: faq.map(({ answer, question }) => ({
            '@type': 'Question',
            name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
          })),
        },
      ],
    },
  } as const;

  return (
    <WebMarketingPage
      metadata={metadata}
      eyebrow="RESELLER TOOL COMPARISON"
      title={comparison.title}
      intro={comparison.description}
    >
      <WebContentSection title="What each tool is built to do.">
        <WebComparisonTable comparison={comparison} />
      </WebContentSection>

      <WebContentSection eyebrow="WHICH FITS?" title="Choose for the work you do most.">
        <WebCopy>{comparison.fitFor}</WebCopy>
      </WebContentSection>

      <WebContentSection eyebrow="SOURCE" title="Check the other product's current details.">
        <WebCopy>
          {comparison.sourceNote ??
            'Competitor details below are taken from the company source linked here and were checked on September 29, 2026. Features and prices can change.'}
        </WebCopy>
        <WebTextLink href={comparison.sourceUrl} label={comparison.sourceLabel} />
        {comparison.additionalSources?.map((source) => (
          <WebTextLink key={source.url} href={source.url} label={source.label} />
        ))}
      </WebContentSection>

      <WebContentSection title="KeepFlip pricing.">
        <WebCopy>
          US web checkout is ${KEEPFLIP_PUBLIC_PRICING_USD.web.monthly} per month or ${KEEPFLIP_PUBLIC_PRICING_USD.web.annual} per year. It includes every KeepFlip feature and up to 250 active listings total. The web checkout does not currently offer a free trial.
        </WebCopy>
        <View style={styles.actions}>
          <WebActionLink href="/pricing" label="See KeepFlip pricing" />
          <WebActionLink href="/features" label="See how it works" secondary />
        </View>
      </WebContentSection>

      <WebContentSection title="Questions resellers ask.">
        <View style={styles.faqList}>
          {faq.map((item) => (
            <WebInfoCard key={item.question} title={item.question}>
              <WebCopy>{item.answer}</WebCopy>
            </WebInfoCard>
          ))}
        </View>
      </WebContentSection>
    </WebMarketingPage>
  );
}

function WebComparisonTable({ comparison }: { comparison: CompetitorComparison }) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.mobileRows}>
        {comparison.rows.map((row) => (
          <WebInfoCard key={row.area} title={row.area}>
            <Text style={styles.cellHeading}>KeepFlip</Text>
            <WebCopy>{row.keepFlip}</WebCopy>
            <Text style={styles.cellHeading}>{comparison.competitor}</Text>
            <WebCopy>{row.competitor}</WebCopy>
          </WebInfoCard>
        ))}
      </View>
    );
  }

  const tableStyle: CSSProperties = {
    borderCollapse: 'collapse',
    color: colors.text,
    minWidth: '680px',
    tableLayout: 'fixed',
    width: '100%',
  };
  const headerStyle: CSSProperties = {
    backgroundColor: colors.backgroundRaised,
    borderBottom: `1px solid ${colors.divider}`,
    color: colors.goldBright,
    fontWeight: 700,
    padding: '12px 14px',
    textAlign: 'left',
    verticalAlign: 'top',
  };
  const cellStyle: CSSProperties = {
    borderBottom: `1px solid ${colors.divider}`,
    color: colors.textMuted,
    lineHeight: 1.55,
    padding: '13px 14px',
    textAlign: 'left',
    verticalAlign: 'top',
  };

  return createElement(
    'div',
    { style: { border: `1px solid ${colors.divider}`, borderRadius: 14, maxWidth: '100%', overflowX: 'auto' } },
    createElement(
      'table',
      { style: tableStyle },
      createElement('caption', { style: { clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 } }, `KeepFlip compared with ${comparison.competitor}`),
      createElement(
        'thead',
        null,
        createElement(
          'tr',
          null,
          createElement('th', { scope: 'col', style: headerStyle }, 'What matters'),
          createElement('th', { scope: 'col', style: headerStyle }, 'KeepFlip'),
          createElement('th', { scope: 'col', style: headerStyle }, comparison.competitor),
        ),
      ),
      createElement(
        'tbody',
        null,
        ...comparison.rows.map((row) =>
          createElement(
            'tr',
            { key: row.area },
            createElement('th', { scope: 'row', style: { ...headerStyle, color: colors.text } }, row.area),
            createElement('td', { style: cellStyle }, row.keepFlip),
            createElement('td', { style: cellStyle }, row.competitor),
          ),
        ),
      ),
    ),
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  faqList: { gap: 12 },
  mobileRows: { gap: 12 },
  cellHeading: { fontSize: 12, fontWeight: '700' },
});
