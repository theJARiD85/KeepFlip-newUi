import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme } from '@/constants/keepflip-theme';
import { Image } from 'expo-image';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

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
  const { width } = useWindowDimensions();
  const wide = width >= 960;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>THE PILE HAS YOUR CASH.</Text>
        <Text accessibilityRole="header" style={styles.title}>Find it. Price it. Move it.</Text>
        <Text style={styles.intro}>Flip helps you see what is tied up and decide which item to work on next.</Text>
      </View>
      <View style={[styles.cards, !wide && styles.cardsStacked]}>
        {scenes.map((scene) => (
          <View key={scene.number} style={[styles.card, wide ? styles.cardWide : styles.cardStacked]}>
            <Image
              accessibilityLabel={scene.alt}
              alt={scene.alt}
              contentFit="cover"
              source={scene.image}
              style={styles.image}
            />
            <View style={styles.cardCopy}>
              <Text style={styles.number}>{scene.number}</Text>
              <Text style={styles.cardTitle}>{scene.title}</Text>
              <Text style={styles.detail}>{scene.detail}</Text>
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
