import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';

// Import our platform-specific handlers
import { MarketplaceAuthModal } from '@/components/connections/marketplace-auth-modal.native'; // The mobile WebView code we built earlier

interface ListingData {
  title: string;
  description: string;
  price: string;
}

interface CrosslistActionProps {
  userId: string;
  listing: ListingData;
  platform: 'poshmark' | 'mercari' | 'fbMarketplace' | 'offerUp';
}

export const CrosslistActionButton: React.FC<CrosslistActionProps> = ({ userId, listing, platform }) => {
  const [mobileModalVisible, setMobileModalVisible] = useState(false);

  const handleCrosslistExecution = () => {
    // ---- BRANCH A: WEB APPLICATION ROUTE ----
    if (Platform.OS === 'web') {
      const targetUrls = {
        poshmark: 'https://poshmark.com/login',
        mercari: 'https://mercari.com/login',
        fbMarketplace: 'https://www.facebook.com/marketplace',
        offerUp: 'https://offerup.com/login',
      };

      // 1. Copy the text payload to clipboard automatically so the bookmarklet can read it
      if (navigator.clipboard) {
        const payload = JSON.stringify({ ...listing, platform });
        navigator.clipboard.writeText(payload);
      }

      // 2. Open marketplace listing view in a new browser tab
      window.open(targetUrls[platform], '_blank');
      return;
    }

    // ---- BRANCH B: ANDROID MOBILE APPLICATION ROUTE ----
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      setMobileModalVisible(true);
    }
  };

  return (
    <View>
      <TouchableOpacity style={styles.button} onPress={handleCrosslistExecution}>
        <Text style={styles.buttonText}>List to {platform.toUpperCase()}</Text>
      </TouchableOpacity>

      {/* Render the mobile WebView modal only on mobile engines */}
      {Platform.OS !== 'web' && (
        <MarketplaceAuthModal
          visible={mobileModalVisible}
          onClose={() => setMobileModalVisible(false)}
          userId={userId}
          platform={platform}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
