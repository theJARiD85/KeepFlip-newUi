import React, { useRef, useState } from 'react';
import { StyleSheet, View, Button, Modal, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';
import { ID, Permission, Role } from 'react-native-appwrite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tablesDB } from '@/lib/appwrite';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string; // The active Appwrite user account ID
  platform: 'poshmark' | 'mercari' | 'fbMarketplace' | 'offerUp';
}

export const MarketplaceAuthModal: React.FC<Props> = ({ visible, onClose, userId, platform }) => {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  // Target login endpoints per platform
  const targetUrls = {
    poshmark: 'https://poshmark.com/login',
    mercari: 'https://mercari.com/login',
    fbMarketplace: 'https://www.facebook.com/marketplace',
    offerUp: 'https://offerup.com/login',
  };

  const handleNavigationStateChange = async (navState: any) => {
    const url = navState.url;

    // Detect successful authentication landing zones
    const isSuccessPage = 
      (platform === 'poshmark' && (url.includes('/feed') || url.includes('/mapp/'))) ||
      (platform === 'mercari' && url.includes('/mypage/')) ||
      (platform === 'fbMarketplace' && url.includes('/marketplace/')) ||
      (platform === 'offerUp' && url.includes('/listings'));

    if (isSuccessPage) {
      try {
        // Extract native HTTP-Only cookies directly from the operating system network jar
        const cookieJar = await CookieManager.get(url, true); 
        
        // Serialize the cookie object securely into a JSON string payload
        const serializedSession = JSON.stringify(cookieJar);

        // Upload directly to your new marketplace_sessions collection
        await tablesDB.createRow(
          'keepflip',
          'marketplace_sessions',
          ID.unique(),
          {
            userId: userId,
            platform: platform,
            sessionData: serializedSession,
            isActive: true,
            updatedAt: new Date().toISOString(),
          },
          // Document-Level Permissions: ONLY the user who owns this data can read/write it
          [
            Permission.read(Role.user(userId)),
            Permission.write(Role.user(userId)),
          ]
        );

        console.log(`Successfully stored ${platform} cookies in Appwrite.`);
        onClose(); // Automatically exit the webview window
      } catch (error) {
        console.error('Failed to extract or securely store session cookies:', error);
      }
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Button title="Cancel" onPress={onClose} color="#ff3b30" />
        </View>
        <WebView
          ref={webViewRef}
          source={{ uri: targetUrls[platform] }}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={() => setLoading(false)}
          domStorageEnabled={true}
          sharedCookiesEnabled={true} // Crucial for Android to track cross-domain cookies
        />
        {loading && <ActivityIndicator style={StyleSheet.absoluteFill} size="large" />}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { height: 50, justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#eee' },
});
