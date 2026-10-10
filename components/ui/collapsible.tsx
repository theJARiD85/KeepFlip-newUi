import { PropsWithChildren, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const [isOpen, setIsOpen] = useState(false);
  const theme = useColorScheme() ?? 'light';

  return (
    <ThemedView>
      <TouchableOpacity
        style={responsiveStyles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}>
        <Ionicons
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />

        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && <ThemedView style={responsiveStyles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    heading: {
      ...styles["heading"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    content: {
      ...styles["content"],
      marginTop: layout.isWeb ? layout.webResponsiveHeight(6) : 6,
      marginLeft: layout.isWeb ? layout.webResponsiveWidth(24) : 24,
    },
  });
}
