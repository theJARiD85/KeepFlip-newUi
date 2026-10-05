import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { brand } from '@/components/crosslisting-lab/brand';
import { channels, type MarketplaceId } from '@/components/crosslisting-lab/types';
import { disconnectMarketplace, listConnections, saveApiConnection, saveBrowserConnection } from '@/services/crosslisting-lab-api';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replaceAll('_', ' ') : 'Could not save this connection.';
}

export function ConnectionDetailScreen({ platform }: { platform: string }) {
  const router = useRouter();
  const { status: authStatus } = useKeepFlipAuth();
  const channel = channels.find((item) => item.id === platform);
  const [accountLabel, setAccountLabel] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [storageState, setStorageState] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!channel || authStatus !== 'signed-in') return;
    let active = true;
    void listConnections().then((statuses) => {
      if (active) setConnected(statuses[channel.id] === 'connected');
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [authStatus, channel]);

  if (!channel) {
    return <SafeAreaView style={styles.safeArea}><Text style={styles.title}>Unknown marketplace</Text></SafeAreaView>;
  }

  const isApi = channel.id === 'ebay' || channel.id === 'shopify';

  async function save(selected: NonNullable<typeof channel>) {
    if (busy || authStatus !== 'signed-in') return;
    setError(null);
    setSuccess(null);
    if (isApi) {
      if (accessToken.trim().length < 8) { setError('Enter a marketplace access token.'); return; }
      if (selected.id === 'shopify' && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(accountLabel.trim())) {
        setError('Enter the full store domain, such as your-store.myshopify.com.');
        return;
      }
    } else {
      try {
        const parsed: unknown = JSON.parse(storageState);
        if (typeof parsed !== 'object' || parsed === null || !('cookies' in parsed) || !('origins' in parsed)) {
          throw new Error('Invalid storage state');
        }
      } catch {
        setError('Paste a complete Playwright storageState JSON object.');
        return;
      }
    }
    setBusy(true);
    try {
      if (selected.id === 'ebay' || selected.id === 'shopify') {
        await saveApiConnection(selected.id, accessToken.trim(), accountLabel);
      } else {
        await saveBrowserConnection(selected.id as Exclude<MarketplaceId, 'ebay' | 'shopify'>, storageState, accountLabel);
      }
      setAccessToken('');
      setStorageState('');
      setConnected(true);
      setSuccess('Access saved encrypted for a test listing. It has not been verified with the marketplace.');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(selected: NonNullable<typeof channel>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectMarketplace(selected.id);
      setConnected(false);
      setSuccess('Saved access removed.');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>← Marketplaces</Text></Pressable>
          <Text style={styles.eyebrow}>KEEPFLIP / CROSSLISTING LAB</Text>
          <Text style={styles.title}>{channel.name}</Text>
          <Text style={styles.subtitle}>{isApi ? 'Save an official API token for a test listing.' : 'Save a signed-in browser storage state for the prototype adapter.'}</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{connected ? 'Replace saved access' : 'Save test access'}</Text>
            <Text style={styles.cardBody}>The API encrypts the value before it reaches the private credentials table. A saved value does not prove that publishing will succeed.</Text>
            <Text style={styles.label}>{channel.id === 'shopify' ? 'STORE DOMAIN' : 'ACCOUNT LABEL (OPTIONAL)'}</Text>
            <TextInput accessibilityLabel={channel.id === 'shopify' ? 'Shopify store domain' : 'Account label'} autoCapitalize="none" autoCorrect={false} onChangeText={setAccountLabel} placeholder={channel.id === 'shopify' ? 'your-store.myshopify.com' : 'Seller account'} placeholderTextColor={brand.colors.textMuted} style={styles.input} value={accountLabel} />
            {isApi ? (
              <>
                <Text style={styles.label}>{channel.id === 'ebay' ? 'EBAY ACCESS TOKEN' : 'SHOPIFY ADMIN API TOKEN'}</Text>
                <TextInput accessibilityLabel="Marketplace access token" autoCapitalize="none" autoCorrect={false} onChangeText={setAccessToken} placeholder="Paste access token" placeholderTextColor={brand.colors.textMuted} secureTextEntry style={styles.input} value={accessToken} />
                <Text style={styles.hint}>The prototype does not refresh OAuth tokens yet. Use a test account and replace expired access here.</Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>PLAYWRIGHT STORAGE STATE JSON</Text>
                <TextInput accessibilityLabel="Browser storage state JSON" autoCapitalize="none" autoCorrect={false} multiline onChangeText={setStorageState} placeholder={'{"cookies":[],"origins":[]}'} placeholderTextColor={brand.colors.textMuted} style={[styles.input, styles.jsonInput]} textAlignVertical="top" value={storageState} />
                <Text style={styles.hint}>Export storageState after signing in to {channel.name} in your own browser. Paste the JSON here, including only this marketplace's cookies and origins. Do not enter a password.</Text>
              </>
            )}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || authStatus !== 'signed-in' }} disabled={busy || authStatus !== 'signed-in'} onPress={() => { void save(channel); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color={brand.colors.background} size="small" /> : null}
              <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save access'}</Text>
            </Pressable>
            {connected ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void disconnect(channel); }} style={styles.disconnectButton}><Text style={styles.disconnectText}>Remove saved access</Text></Pressable> : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.colors.background },
  scroll: { padding: 18, paddingBottom: 40 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 12 },
  backText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: brand.colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: brand.colors.text, fontSize: 29, fontWeight: '900', marginTop: 6 },
  subtitle: { color: brand.colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 22 },
  card: { backgroundColor: brand.colors.card, borderColor: brand.colors.borderStrong, borderWidth: 1, borderRadius: brand.radii.medium, padding: 16, gap: 10 },
  cardTitle: { color: brand.colors.text, fontSize: 17, fontWeight: '900' },
  cardBody: { color: brand.colors.textMuted, fontSize: 12, lineHeight: 18 },
  label: { color: brand.colors.goldBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 8 },
  input: { minHeight: 48, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.border, backgroundColor: brand.colors.inset, color: brand.colors.text, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  jsonInput: { minHeight: 155, fontFamily: 'monospace' },
  hint: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 17 },
  error: { color: brand.colors.danger, fontSize: 12, lineHeight: 18 },
  success: { color: brand.colors.success, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 48, borderRadius: brand.radii.small, backgroundColor: brand.colors.goldBright, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  primaryText: { color: brand.colors.background, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  disconnectButton: { alignSelf: 'center', padding: 10 },
  disconnectText: { color: brand.colors.danger, fontSize: 12, fontWeight: '800' },
});
