import React, { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { MarketplaceAuthModal } from '@/components/connections/marketplace-auth-modal';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  createCrosslistingPayload,
  CROSSLISTING_DESTINATIONS,
  type CrosslistingMarketplace,
  type CrosslistingPayload,
} from '@/services/crosslisting-service';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type ListingData = {
  title: string;
  description: string;
  price: string;
  category?: string;
  condition?: string;
  brand?: string;
  size?: string;
  color?: string;
  photoCount?: number;
  photoFileIds?: string[];
  photoBucketId?: string;
};

interface CrosslistActionProps {
  userId: string;
  listing: ListingData;
  platform: CrosslistingMarketplace;
}

export const CrosslistActionButton: React.FC<CrosslistActionProps> = ({
  userId,
  listing,
  platform,
}) => {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const [sessionPayload, setSessionPayload] = useState<CrosslistingPayload | null>(null);
  const [notice, setNotice] = useState('');

  const handleCrosslistExecution = async () => {
    const payload = createCrosslistingPayload({
      marketplace: platform,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      category: listing.category ?? '',
      condition: listing.condition ?? '',
      brand: listing.brand ?? '',
      size: listing.size ?? '',
      color: listing.color ?? '',
      photoCount: listing.photoCount ?? 0,
    });

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !navigator.clipboard?.writeText) {
        setNotice('This browser cannot copy the listing data.');
        return;
      }

      const clipboardWrite = navigator.clipboard.writeText(JSON.stringify(payload));
      window.open(
        CROSSLISTING_DESTINATIONS[platform].createUrl,
        '_blank',
        'noopener,noreferrer',
      );
      try {
        await clipboardWrite;
        setNotice(`${CROSSLISTING_DESTINATIONS[platform].label} listing data copied.`);
      } catch {
        setNotice('KeepFlip could not copy listing data. Allow clipboard access and try again.');
      }
      return;
    }

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      if (!userId.trim()) {
        setNotice('Sign in to KeepFlip before preparing a marketplace listing.');
        return;
      }
      setNotice('Log in if needed, then choose Save & prepare.');
      setSessionPayload(payload);
      return;
    }

    await Share.share({
      message: `${listing.title}\n\n${listing.description}\n\nPrice: ${listing.price}`,
    });
  };

  return (
    <View style={responsiveStyles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={() => void handleCrosslistExecution()}
        style={responsiveStyles.button}
      >
        <Text style={responsiveStyles.buttonText}>
          List to {CROSSLISTING_DESTINATIONS[platform].label}
        </Text>
      </Pressable>
      {notice ? <Text selectable style={responsiveStyles.notice}>{notice}</Text> : null}
      {sessionPayload ? (
        <MarketplaceAuthModal
          onClose={() => setSessionPayload(null)}
          payload={sessionPayload}
          photoFileIds={listing.photoFileIds ?? []}
          photoBucketId={listing.photoBucketId}
          platform={platform}
          userId={userId}
          visible
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
  },
  buttonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: '900',
  },
  notice: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    container: {
      ...styles["container"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    button: {
      ...styles["button"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(44) : 44,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
    },
    buttonText: {
      ...styles["buttonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    notice: {
      ...styles["notice"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
  });
}
