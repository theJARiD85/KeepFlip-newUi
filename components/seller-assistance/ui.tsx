import { keepFlipTheme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';
import { type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();
  return <View style={styles.section}><Text accessibilityRole="header" style={[styles.heading, { fontSize: responsiveFont(22) }]}>{title}</Text>{children}</View>;
}
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={[styles.buttonText, { fontSize: responsiveFont(16) }]}>{title}</Text></Pressable>;
}
export function Field({ label, value, onChangeText, numeric = false, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; numeric?: boolean; multiline?: boolean }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();
  return <View style={styles.field}><Text style={[styles.label, { fontSize: responsiveFont(15) }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} style={[styles.input, multiline && styles.multiline]} placeholderTextColor={keepFlipTheme.colors.textMuted} /></View>;
}
function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    page: { flex: 1, backgroundColor: keepFlipTheme.colors.background }, content: { padding: 20, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16, paddingBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(60) : 60, maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(850) : 850, width: '100%', alignSelf: 'center' },
    section: { backgroundColor: keepFlipTheme.colors.surfaceSoft, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(20) : 20, padding: 18, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12 }, heading: { color: keepFlipTheme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(22) : 22, fontWeight: '700' }, text: { color: keepFlipTheme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(24) : 24 }, muted: { color: keepFlipTheme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(21) : 21 }, label: { color: keepFlipTheme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15 }, field: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6 }, input: { color: keepFlipTheme.colors.text, borderColor: keepFlipTheme.colors.goldMuted, borderWidth: 1, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10, padding: 12, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(48) : 48 }, multiline: { minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(100) : 100, textAlignVertical: 'top' }, button: { borderWidth: 1, borderColor: keepFlipTheme.colors.scannerCyan, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, padding: 13, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(48) : 48 }, buttonText: { color: keepFlipTheme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16, fontWeight: '600' }, disabled: { opacity: 0.4 }, row: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, borderTopWidth: 1, borderTopColor: keepFlipTheme.colors.goldMuted, paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(12) : 12 }, error: { color: keepFlipTheme.colors.danger, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16 },
  });
  return {
    ...staticStyles,
    heading: [
      staticStyles.heading,
      {
        fontSize: responsiveFont(22),
      },
    ],
    text: [
      staticStyles.text,
      {
        fontSize: responsiveFont(16),
      },
    ],
    muted: [
      staticStyles.muted,
      {
        fontSize: responsiveFont(14),
      },
    ],
    label: [
      staticStyles.label,
      {
        fontSize: responsiveFont(15),
      },
    ],
    input: [
      staticStyles.input,
      {
        fontSize: responsiveFont(16),
      },
    ],
    buttonText: [
      staticStyles.buttonText,
      {
        fontSize: responsiveFont(16),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(16),
      },
    ],
  };
}

export function useSellerAssistanceStyles() {
  return useResponsiveStyles(createResponsiveStyles);
}
