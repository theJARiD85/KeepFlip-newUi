import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
export type LegalSection = {
  body: string[];
  title: string;
};

type LegalDocumentScreenProps = {
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
  title: string;
};

export function LegalDocumentScreen({
  effectiveDate,
  intro,
  sections,
  title,
}: LegalDocumentScreenProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <KeepFlipBackground>
      <View pointerEvents="none" style={styles.glow} />

      <ScrollView
        contentContainerStyle={[styles.content,
        {
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 36,
        }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Return to account creation"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
        >
          <View style={styles.backButtonContent}>
            <Ionicons name="caret-back-sharp" size={20} color={theme.colors.goldBright} />
            <Text style={[styles.backButtonText, { fontSize: responsiveFont(11) }]}>BACK</Text>
          </View>
        </Pressable>

        <View style={styles.header}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>KEEPFLIP / LEGAL</Text>
          <Text selectable style={[styles.title, { fontSize: responsiveFont(34) }]}>
            {title}
          </Text>
          <Text style={[styles.effectiveDate, { fontSize: responsiveFont(10) }]}>
            Effective {effectiveDate}
          </Text>
          <Text selectable style={styles.intro}>
            {intro}
          </Text>
        </View>

        <View style={[styles.document, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>
          {sections.map((section, sectionIndex) => (
            <View
              key={`${section.title}-${sectionIndex}`}
              style={styles.section}
            >
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionNumber}>
                  {String(sectionIndex + 1).padStart(2, "0")}
                </Text>
                <Text selectable style={[styles.sectionTitle, { fontSize: responsiveFont(19) }]}>
                  {section.title}
                </Text>
              </View>

              <View style={styles.sectionBody}>
                {section.body.map((paragraph, paragraphIndex) => (
                  <Text
                    key={`${section.title}-${paragraphIndex}`}
                    selectable
                    style={styles.paragraph}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.contactBlock}>
          <Text style={[styles.contactLabel, { fontSize: responsiveFont(9) }]}>QUESTIONS</Text>
          <Text selectable style={[styles.contactText, { fontSize: responsiveFont(13) }]}>
            Contact KeepFlip at support@keep-flip.com.
          </Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    glow: {
      ...StyleSheet.absoluteFill,
      experimental_backgroundImage: `
      radial-gradient(circle at 82% 8%, rgba(215, 168, 74, 0.12) 0%, transparent 30%),
      radial-gradient(circle at 12% 64%, rgba(88, 223, 232, 0.06) 0%, transparent 34%)
    `,
    },
    content: {
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
      gap: 24,
      paddingHorizontal: 20,
    },
    backButton: {
      alignSelf: "flex-start",
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    backButtonPressed: {
      opacity: 0.62,
      transform: [{ translateX: -2 }],
    },
    backButtonText: {
      color: theme.colors.goldBright,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      textAlign: "center",
      textAlignVertical: 'center',
    },
    backButtonContent: {
      flexDirection: "row",
      justifyContent: 'center',
      alignItems: 'center',
      columnGap: 5,
    },
    header: {
      gap: 9,
      paddingBottom: 23,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(242, 211, 138, 0.24)",
    },
    eyebrow: {
      color: theme.colors.gold,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2,
    },
    title: {
      color: theme.colors.cream,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: "900",
      letterSpacing: -0.65,
    },
    effectiveDate: {
      color: theme.colors.scannerCyan,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.85,
    },
    intro: {
      maxWidth: 650,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: "500",
    },
    document: {
      gap: 29,
    },
    section: {
      gap: 13,
    },
    sectionHeading: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 12,
    },
    sectionNumber: {
      color: theme.colors.gold,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    sectionTitle: {
      flex: 1,
      color: theme.colors.cream,
      fontSize: 19,
      lineHeight: 24,
      fontWeight: "800",
    },
    sectionBody: {
      gap: 12,
      paddingLeft: 34,
    },
    paragraph: {
      color: "rgba(247, 242, 232, 0.82)",
      fontSize: 13,
      lineHeight: 21,
      fontWeight: "500",
    },
    contactBlock: {
      gap: 6,
      marginTop: 3,
      paddingTop: 19,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(88, 223, 232, 0.22)",
    },
    contactLabel: {
      color: theme.colors.scannerCyan,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    contactText: {
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "600",
    },
  });
  return {
    ...staticStyles,
    backButtonText: [
      staticStyles.backButtonText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(10),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(34),
      },
    ],
    effectiveDate: [
      staticStyles.effectiveDate,
      {
        fontSize: responsiveFont(10),
      },
    ],
    intro: [
      staticStyles.intro,
      {
        fontSize: responsiveFont(14),
      },
    ],
    sectionNumber: [
      staticStyles.sectionNumber,
      {
        fontSize: responsiveFont(10),
      },
    ],
    sectionTitle: [
      staticStyles.sectionTitle,
      {
        fontSize: responsiveFont(19),
      },
    ],
    paragraph: [
      staticStyles.paragraph,
      {
        fontSize: responsiveFont(13),
      },
    ],
    contactLabel: [
      staticStyles.contactLabel,
      {
        fontSize: responsiveFont(9),
      },
    ],
    contactText: [
      staticStyles.contactText,
      {
        fontSize: responsiveFont(13),
      },
    ],
  };
}
