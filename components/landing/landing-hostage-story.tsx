import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme } from '@/constants/keepflip-theme';
import { Image } from 'expo-image';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

const colors = keepFlipTheme.colors;

const scenes = [
  {
    number: '01',
    title: 'Cash held in stock.',
    detail: 'Unsold items keep your purchase cash tied up. Save what you own, what it cost, and where it is.',
    image: require('@/assets/images/landing-story-see-the-pile.png'),
    alt: 'Flip confronts a toy bear and denim that have wrapped up bundles of cash.',
  },
  {
    number: '02',
    title: 'Count the cost.',
    detail: 'Check resale estimates against your buy price, fees, and shipping before you put more cash in the pile.',
    image: require('@/assets/images/landing-story-check-the-costs.png'),
    alt: 'Flip signals stop to toys and tangled inventory holding cash on a workbench.',
  },
  {
    number: '03',
    title: 'Choose the next move.',
    detail: 'See which item needs research, a listing, or a price decision. You choose what happens next.',
    image: require('@/assets/images/landing-story-choose-the-next-move.png'),
    alt: 'Flip faces a neutral-faced toy robot clutching cash and holding a toy sword.',
  },
] as const;

export function LandingHostageStory() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const { width } = useWindowDimensions();
  const wide = width >= 960;

  return (
    <View style={responsiveStyles.section}>
      <View style={responsiveStyles.heading}>
        <Text style={responsiveStyles.eyebrow}>THE PILE HAS YOUR CASH.</Text>
        <Text accessibilityRole="header" style={responsiveStyles.title}>Find it. Price it. Move it.</Text>
        <Text style={responsiveStyles.intro}>Flip helps you see what is tied up and decide which item to work on next.</Text>
      </View>
      <View style={[responsiveStyles.cards, !wide && responsiveStyles.cardsStacked]}>
        {scenes.map((scene) => (
          <View key={scene.number} style={[responsiveStyles.card, wide ? responsiveStyles.cardWide : responsiveStyles.cardStacked]}>
            <Image
              accessibilityLabel={scene.alt}
              alt={scene.alt}
              contentFit="cover"
              source={scene.image}
              style={responsiveStyles.image}
            />
            <View style={responsiveStyles.cardCopy}>
              <Text style={responsiveStyles.number}>{scene.number}</Text>
              <Text style={responsiveStyles.cardTitle}>{scene.title}</Text>
              <Text style={responsiveStyles.detail}>{scene.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderBottomColor: '#292C2C',
    borderBottomWidth: 1,
    gap: 20,
    paddingBottom: 38,
    paddingHorizontal: 12,
    paddingTop: 34,
  },
  heading: { gap: 8, maxWidth: 680 },
  eyebrow: { color: colors.campaignGold, fontFamily: keepFlipTheme.fonts.bold, fontSize: 13, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: keepFlipTheme.fonts.bold, fontSize: 30, lineHeight: 36 },
  intro: { color: colors.campaignMuted, fontFamily: keepFlipTheme.fonts.body, fontSize: 15, lineHeight: 22 },
  cards: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  cardsStacked: { flexDirection: 'column' },
  card: { backgroundColor: '#111515', borderColor: '#313635', borderWidth: 1, overflow: 'hidden' },
  cardWide: { width: '32%' },
  cardStacked: { width: '100%' },
  image: { aspectRatio: 16 / 9, width: '100%' },
  cardCopy: { gap: 5, padding: 15 },
  number: { color: colors.scannerCyan, fontFamily: keepFlipTheme.fonts.bold, fontSize: 13 },
  cardTitle: { color: colors.text, fontFamily: keepFlipTheme.fonts.bold, fontSize: 18, lineHeight: 22 },
  detail: { color: colors.campaignMuted, fontFamily: keepFlipTheme.fonts.body, fontSize: 13, lineHeight: 19 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    section: {
      ...styles["section"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(38) : layout.responsiveHeight(38),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(34) : layout.responsiveHeight(34),
    },
    heading: {
      ...styles["heading"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(680) : layout.responsiveWidth(680),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(30) : layout.responsiveFont(30),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(36) : layout.responsiveFont(36),
    },
    intro: {
      ...styles["intro"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
    },
    cards: {
      ...styles["cards"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    cardCopy: {
      ...styles["cardCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
    },
    number: {
      ...styles["number"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    cardTitle: {
      ...styles["cardTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
    },
    detail: {
      ...styles["detail"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
  });
}
