import { createElement, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { SemanticHeading, WebMarketingPage, WebTextLink } from '@/components/web/web-public-page';
import { FIRST_BLOG_POST } from '@/constants/keepflip-blog';
import { KEEPFLIP_PUBLIC_COLORS as colors, KEEPFLIP_SITE_URL } from '@/constants/keepflip-public-site';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

const categories = [
  {
    name: 'Used clothing and shoes',
    check: 'Exact brand, style, size, condition, and recent sold listings',
    consider: 'Measurements, wear, seasonality, and fit-related returns',
  },
  {
    name: 'Electronics',
    check: 'Exact model, included accessories, and whether the item works',
    consider: 'Testing, battery condition, compatibility, and careful packing',
  },
  {
    name: 'Trading cards and collectibles',
    check: 'Exact edition, variant, grade or condition, and recent sold prices',
    consider: 'Price swings, counterfeit risk, grading costs, and eligibility for authentication',
  },
  {
    name: 'Auto parts',
    check: 'Part number, dimensions, and vehicle fitment',
    consider: 'Fitment errors, compatibility questions, and return shipping',
  },
  {
    name: 'Home goods',
    check: 'Sold listings for the same size, material, and condition',
    consider: 'Fragility, package dimensions, shipping weight, and whether the margin covers them',
  },
] as const;

const metadata = {
  canonicalPath: FIRST_BLOG_POST.path,
  description: FIRST_BLOG_POST.description,
  ogType: 'article' as const,
  title: `${FIRST_BLOG_POST.headline} | KeepFlip`,
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: FIRST_BLOG_POST.headline,
    description: FIRST_BLOG_POST.description,
    author: { '@type': 'Person', name: FIRST_BLOG_POST.author },
    publisher: { '@type': 'Organization', name: 'KeepFlip', url: KEEPFLIP_SITE_URL },
    mainEntityOfPage: `${KEEPFLIP_SITE_URL}${FIRST_BLOG_POST.path}`,
  },
} as const;

const contents = [
  ['categories', 'Categories to research'],
  ['profit', 'Calculate net profit'],
  ['price-bands', 'Three price bands'],
  ['first-niche', 'Choose a first niche'],
  ['test-niche', 'Test a niche'],
  ['after-sale', 'After an item sells'],
  ['faq', 'Questions and answers'],
] as const;

export function WebEbayBlogArticle() {
  return (
    <WebMarketingPage
      metadata={metadata}
      eyebrow="RESELLER BLOG / EBAY"
      title={FIRST_BLOG_POST.headline}
      intro="“Best-selling” does not automatically mean “best buy.” A category can have plenty of buyers and still be a poor fit if the item costs too much to source, is expensive to ship, or carries a high return or authenticity risk."
      heroMeta={
        <>
          <Text style={styles.byline}>By {FIRST_BLOG_POST.author}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.updated}>Updated {FIRST_BLOG_POST.updated}</Text>
        </>
      }
    >
      <View style={styles.article}>
        <ArticleText>
          A better way to evaluate a potential flip is to look at the specific item, recent sold listings, your total costs, and how long you may have to wait for your money back. This guide covers common resale categories, practical price bands, and a simple way to test a niche before you buy deeply.
        </ArticleText>

        <View style={[styles.contents, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
          <Text style={styles.contentsLabel}>IN THIS GUIDE</Text>
          <View style={styles.contentsLinks}>
            {contents.map(([id, label]) =>
              Platform.OS === 'web'
                ? createElement('a', { key: id, href: `#${id}`, style: { color: colors.goldBright, fontFamily: theme.fonts.semibold, fontSize: 13, textDecoration: 'none' } }, label)
                : <Text key={id} style={styles.contentsLink}>{label}</Text>,
            )}
          </View>
        </View>

        <ArticleSection id="takeaways" title="Key takeaways">
          <ArticleList items={[
            'Category popularity alone does not tell you whether an item will be profitable for you.',
            'Estimate net profit after marketplace fees, shipping, packing, promotions, and acquisition cost.',
            'The under-$50, $50–$200, and $200+ bands are useful planning ranges, not universal rules.',
            'Test an unfamiliar niche with a small batch you can afford to hold while it sells.',
            'Record both the expected profit and the realized result so your next sourcing decision uses better information.',
          ]} />
        </ArticleSection>

        <ArticleSection id="categories" title="Which eBay categories are worth researching?">
          <ArticleText>
            Resellers often explore used clothing and shoes, electronics, collectibles, auto parts, and home goods. Each category has different research and handling needs. The categories below are a starting point for evaluation, not a ranking of sales volume.
          </ArticleText>
          <View style={styles.categoryGrid}>
            {categories.map((category) => (
              <View key={category.name} style={[styles.categoryCard, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
                <Text style={styles.categoryTitle}>{category.name}</Text>
                <Text style={styles.cardLabel}>CHECK BEFORE BUYING</Text>
                <ArticleText>{category.check}</ArticleText>
                <Text style={styles.cardLabel}>COMMON CONSIDERATIONS</Text>
                <ArticleText>{category.consider}</ArticleText>
              </View>
            ))}
          </View>
          <ArticleText>
            A category is only a starting point. A specific item’s model, size, condition, completeness, and shipping method can change the result. Compare like with like, and use recent sold listings rather than active asking prices to estimate demand.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="best-selling" title="Why “best selling” depends on your sourcing and costs">
          <ArticleText>
            A product can sell frequently and still leave little profit if the buy-in is high or the shipping is difficult. A less popular item may be a better fit if you can source it cheaply, identify it confidently, and ship it at a manageable cost.
          </ArticleText>
          <ArticleText>Before buying, ask:</ArticleText>
          <ArticleList ordered items={[
            'Can I identify the exact item and condition?',
            'Are there several recent sold listings that match it closely?',
            'Does the expected sale price leave enough after fees and costs?',
            'Can I store, pack, and ship it without creating more work or expense than the margin justifies?',
            'How much of my cash could be tied up if it takes longer to sell?',
          ]} />
          <ArticleText>
            Sold prices are evidence, not a promise of what your item will sell for. Condition, timing, shipping, and competition all matter.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="profit" title="Calculate net profit before you buy">
          <ArticleText>The gross sale price is not the amount you keep. A practical estimate should include:</ArticleText>
          <ArticleList items={[
            'Acquisition cost',
            'eBay selling fees',
            'Shipping you pay',
            'Packing materials',
            'Promoted listing or other optional fees',
            'Expected discounts, refunds, or return-related costs, where relevant',
          ]} />
          <ArticleText>
            eBay’s fees vary by category and other factors. At the time of this update, its standard U.S. fee schedule lists a 13.6% final value fee for most categories, plus a per-order fee of $0.40 on orders over $10 or $0.30 on orders of $10 or less. Some categories and Store subscription schedules have different rates. The fee calculation can include the item price, buyer-paid shipping, sales tax, and other applicable amounts. Check eBay’s <WebTextLink href="https://www.ebay.com/help/selling/fees-credits-invoices/x?id=4822" label="current selling-fee schedule" /> before you buy.
          </ArticleText>
          <ArticleText>
            For a useful estimate, start with the amount you expect to receive after eBay’s fees and deductions, then subtract your acquisition cost and the other expenses you pay. Avoid treating a simple percentage as the complete answer: the category, shipping amount, buyer’s tax, and optional promotion can all affect the final numbers.
          </ArticleText>
          <View style={[styles.formula, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.divider }]}>
            <Text style={styles.formulaLabel}>A BASIC ESTIMATE</Text>
            <Text style={styles.formulaText}>
              Estimated net profit = expected proceeds after selling fees − acquisition cost − seller-paid shipping − packing and other selling costs
            </Text>
          </View>
          <ArticleText>
            If you use promoted listings, include the applicable ad fee. If you accept a return or issue a refund, record what actually happened rather than relying on the original estimate. The difference between estimated and realized profit can show where your assumptions need adjustment.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="price-bands" title="How to think about three price bands">
          <ArticleText>
            The following bands can help organize your research. They are not proven universal “sweet spots”; your sourcing access, costs, and cash-flow needs determine which range works for you.
          </ArticleText>
          <ArticleSubheading title="Under $50: keep costs and time in view" />
          <ArticleText>
            Lower-priced items can be easier to test with less money at risk, but fees, packing, and handling can take a larger share of the sale. Consider small, easy-to-ship items only when the sold comps and your costs leave enough margin.
          </ArticleText>
          <ArticleText>
            Before buying several inexpensive items, estimate the profit per item and think about the time needed to clean, photograph, list, pack, and ship them. A small profit may still make sense for a quick, repeatable workflow, but it may not work if each item requires extensive testing or preparation.
          </ArticleText>
          <ArticleSubheading title="$50–$200: compare margin with cash tied up" />
          <ArticleText>
            This band may be a useful place for some resellers to test a niche: the sale price can leave room for expenses, while the cost of a single item may still be manageable. It is not automatically the best range. Compare expected net, competition, sell-through evidence, and likely holding time for the item you are considering.
          </ArticleText>
          <ArticleText>
            Items such as recognizable-brand clothing, tools, or tested audio gear can be worth researching, but the item-specific comps matter more than the category label.
          </ArticleText>
          <ArticleSubheading title="$200+: verify the item and the market carefully" />
          <ArticleText>
            A higher-priced item can tie up more cash and expose you to a larger loss if the item is misidentified, incomplete, damaged, or hard to sell. Check the exact model and condition, compare multiple recent sales, and understand how you will document and ship it.
          </ArticleText>
          <ArticleText>
            eBay’s Authenticity Guarantee applies only to eligible listings. Eligibility depends on the category and item requirements, and the listing should show the program’s badge. Check eBay’s <WebTextLink href="https://www.ebay.com/authenticity-guarantee" label="Authenticity Guarantee information" /> rather than assuming every sneaker, watch, handbag, or collectible qualifies.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="first-niche" title="Choosing a first niche with limited capital">
          <ArticleText>
            Start with items you can inspect and verify. Depending on your knowledge and local sourcing options, that might include selected used clothing, books or media, small electronics you can test, or tools with identifiable model numbers.
          </ArticleText>
          <ArticleText>A few habits can reduce avoidable surprises:</ArticleText>
          <ArticleList items={[
            'Check several recent sold listings for the same brand, model, size, condition, and included parts.',
            'Inspect for damage and test the item when possible.',
            'Record measurements, model numbers, accessories, and condition notes while sourcing.',
            'Estimate shipping using the packed dimensions and weight, not just the item’s size in your hand.',
            'Avoid buying an item you cannot identify or describe accurately.',
            'Keep the first purchase small enough that a slow sale will not disrupt your other plans.',
          ]} />
          <ArticleText>
            For higher-risk items, verify authenticity, condition, and any category-specific requirements before buying. Authentication programs do not remove the need to source carefully, and not every listing in a category is eligible.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="test-niche" title="Test a niche before committing more money">
          <ArticleText>
            A small test batch can help you learn about a niche without committing a large share of your sourcing budget. Ten items can be a convenient test size, but it is only a rule of thumb. Choose a quantity and spending limit that fit your cash flow and the time you have to list and manage the items.
          </ArticleText>
          <ArticleText>A simple test:</ArticleText>
          <ArticleList ordered items={[
            'Research the item. Compare recent sold listings with current competition. Match condition and shipping as closely as possible.',
            'Estimate the full cost. Include eBay fees, shipping, packing, acquisition cost, and any promotion you expect to use.',
            'Set a limit. Decide how much money and time you are comfortable committing before buying.',
            'List consistently. Use accurate titles, photos, item specifics, and condition notes.',
            'Review the results. Record how many sold, how long they took, and the realized net after expenses.',
            'Decide what to change. If the items are not moving, review pricing, listing quality, competition, and sourcing cost before buying more.',
          ]} />
          <ArticleText>
            A handful of sales is not enough to prove that a niche will always perform the same way. Treat the test as evidence for your next decision, then keep tracking results as you gain more experience.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="after-sale" title="What to do when an item sells">
          <ArticleText>
            Ship within the handling time stated in your listing, use the delivery service selected by the buyer, and upload tracking promptly when available. eBay measures seller performance using defined criteria; for example, its policy says a high late-shipment rate by itself will not make an account Below Standard, though a low rate is part of Top Rated requirements. Read eBay’s <WebTextLink href="https://www.ebay.com/help/policies/selling-policies/seller-standards-policy?id=4347" label="seller standards policy" /> for the current details.
          </ArticleText>
          <ArticleText>
            After the transaction, record the sale price, marketplace fees, shipping label, packing cost, any promotion fee, and the original buy cost. If a refund or return changes the result, update the record. That gives you a realized profit figure to compare with the estimate you made when sourcing.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="tracking" title="How to track what is working">
          <ArticleText>A tracking system should make it easy to record:</ArticleText>
          <ArticleList items={[
            'What you bought, when, and for how much',
            'The item’s condition, SKU, storage location, and listing status',
            'Expected sale price, fees, shipping, and estimated net',
            'Listing and sale dates',
            'Actual sale price, fees, shipping, refunds, and realized net',
          ]} />
          <ArticleText>
            A spreadsheet can work if you update it consistently. The value comes from the record, not the software: over time, you can see which kinds of items meet your goals and how long your money is typically tied up.
          </ArticleText>
          <ArticleText>
            KeepFlip is designed to help resellers evaluate items, manage inventory, and follow a flip through its outcome. The goal is to connect the sourcing decision with what happened after the sale, so future decisions can use your own results alongside market comps. <WebTextLink href="/welcome" label="Learn about KeepFlip" /> or <WebTextLink href="/pricing" label="view pricing" />.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="faq" title="Frequently asked questions">
          <ArticleSubheading title="What sells best on eBay for beginners?" />
          <ArticleText>
            There is no single best category for every beginner. Start with items you can identify, inspect, source at a manageable cost, and ship confidently. Check recent sold listings for the exact item before you buy.
          </ArticleText>
          <ArticleSubheading title="What sells on eBay for the most profit after fees?" />
          <ArticleText>
            No category guarantees the most profit. A higher sale price can still produce a poor result if the item costs a lot to source, has high fees, needs expensive shipping, or sits for a long time. Estimate the full cost and compare the realized result after the sale.
          </ArticleText>
          <ArticleSubheading title="Is it worth selling items under $50 on eBay?" />
          <ArticleText>
            It can be, if the margin and time involved make sense for your workflow. Estimate the selling fees, shipping, packing, and acquisition cost for each item. For low-priced items, those costs can take a larger share of the sale.
          </ArticleText>
          <ArticleSubheading title="What sells well on eBay from thrift stores?" />
          <ArticleText>
            Some resellers research used clothing, books and media, tested small electronics, tools, and selected collectibles. Results depend on the exact item, its condition, the price you pay, and the cost to ship it. Use recent sold listings to check demand before buying.
          </ArticleText>
          <ArticleSubheading title="How can I tell whether a niche is worth testing?" />
          <ArticleText>
            Compare recent sold listings with current competition, estimate your full costs, and test a small number of items within a defined spending limit. Track how long they take to sell and the net you actually realize. Use that evidence to decide whether to continue, adjust, or stop sourcing that niche.
          </ArticleText>
        </ArticleSection>

        <ArticleSection id="sources" title="Sources">
          <View style={styles.sourceLinks}>
            <WebTextLink href="https://www.ebay.com/help/selling/fees-credits-invoices/x?id=4822" label="eBay selling fees" />
            <WebTextLink href="https://www.ebay.com/help/policies/selling-policies/seller-standards-policy?id=4347" label="eBay seller standards policy" />
            <WebTextLink href="https://www.ebay.com/authenticity-guarantee" label="eBay Authenticity Guarantee" />
          </View>
        </ArticleSection>
      </View>
    </WebMarketingPage>
  );
}

function ArticleSection({ children, id, title }: { children: ReactNode; id: string; title: string }) {
  return (
    <View nativeID={id} style={[styles.section, { borderTopColor: colors.divider }]}>
      <SemanticHeading level={2} style={styles.sectionTitle}>{title}</SemanticHeading>
      {children}
    </View>
  );
}

function ArticleSubheading({ title }: { title: string }) {
  return <SemanticHeading level={3} style={styles.subheading}>{title}</SemanticHeading>;
}

function ArticleText({ children }: { children: ReactNode }) {
  return <Text style={styles.copy}>{children}</Text>;
}

function ArticleList({ items, ordered = false }: { items: readonly string[]; ordered?: boolean }) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={item} style={styles.listItem}>
          <Text style={styles.listMarker}>{ordered ? `${index + 1}.` : '•'}</Text>
          <Text style={styles.listCopy}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  byline: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 13 },
  metaDot: { color: colors.goldBright, fontSize: 12 },
  updated: { color: colors.textMuted, fontFamily: theme.fonts.body, fontSize: 13 },
  article: { gap: 32, maxWidth: 860, width: '100%' },
  copy: { color: colors.text, fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 27 },
  contents: { borderRadius: 18, borderWidth: 1, gap: 13, padding: 18 },
  contentsLabel: { color: colors.goldBright, fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.1 },
  contentsLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 10 },
  contentsLink: { color: colors.goldBright, fontFamily: theme.fonts.semibold, fontSize: 13 },
  section: { borderTopWidth: 1, gap: 16, paddingTop: 28 },
  sectionTitle: { color: colors.text, fontFamily: theme.fonts.bold, fontSize: 27, lineHeight: 36 },
  subheading: { color: colors.goldBright, fontFamily: theme.fonts.semibold, fontSize: 20, lineHeight: 28, marginTop: 8 },
  list: { gap: 10, paddingLeft: 2 },
  listItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  listMarker: { color: colors.goldBright, fontFamily: theme.fonts.bold, fontSize: 16, lineHeight: 27, minWidth: 18 },
  listCopy: { color: colors.text, flex: 1, fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 27 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryCard: { borderRadius: 16, borderWidth: 1, flexGrow: 1, gap: 8, minWidth: 250, padding: 18, width: '48%' },
  categoryTitle: { color: colors.text, fontFamily: theme.fonts.bold, fontSize: 17, lineHeight: 24 },
  cardLabel: { color: colors.goldBright, fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1, marginTop: 8 },
  formula: { borderRadius: 16, borderWidth: 1, gap: 8, padding: 18 },
  formulaLabel: { color: colors.goldBright, fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1 },
  formulaText: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 16, lineHeight: 25 },
  sourceLinks: { alignItems: 'flex-start', gap: 10 },
});
