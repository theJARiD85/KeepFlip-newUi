import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import NitroCookies from 'react-native-nitro-cookies';
import { WebView, type WebView as WebViewInstance } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import type { MarketplaceAuthModalProps } from '@/components/connections/marketplace-auth-modal.types';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  buildWebViewAutofillScript,
  CROSSLISTING_DESTINATIONS,
  type CrosslistingMarketplace,
} from '@/services/crosslisting-service';
import {
  deleteMarketplaceSession,
  getMarketplaceSession,
  parseMarketplaceCookies,
  saveMarketplaceSession,
} from '@/services/marketplace-session-service';

const WEBVIEW_LOAD_STALL_TIMEOUT_MS = 45_000;

function isMarketplaceHost(url: string, platform: CrosslistingMarketplace) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const marketplaceHost = new URL(
      CROSSLISTING_DESTINATIONS[platform].origin,
    ).hostname;
    return (
      hostname === marketplaceHost || hostname.endsWith(`.${marketplaceHost}`)
    );
  } catch {
    return false;
  }
}

function isListingFormUrl(url: string, platform: CrosslistingMarketplace) {
  if (!isMarketplaceHost(url, platform)) return false;
  try {
    return /sell|list|create/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function readFillResult(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const message = parsed as { kind?: unknown; filled?: unknown; photoCount?: unknown; error?: unknown };
    if (message.kind !== 'keepflip-crosslisting-result') return null;
    return {
      filled: typeof message.filled === 'number' ? message.filled : 0,
      photoCount: typeof message.photoCount === 'number' ? message.photoCount : 0,
      error: typeof message.error === 'string' ? message.error : null,
    };
  } catch {
    return null;
  }
}

export function MarketplaceAuthModal({
  visible,
  onClose,
  onSaved,
  userId,
  platform,
  payload,
}: MarketplaceAuthModalProps) {
  const webViewRef = useRef<WebViewInstance>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [restoringSession, setRestoringSession] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [savingSession, setSavingSession] = useState(false);
  const [forgettingSession, setForgettingSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Log in to your marketplace account, then save the session to prepare this draft.');
  const destination = useMemo(
    () => CROSSLISTING_DESTINATIONS[platform],
    [platform],
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    void (async () => {
      try {
        const savedSession = await getMarketplaceSession(userId, platform);
        if (!savedSession) {
          if (!cancelled) {
            setSourceUrl(destination.loginUrl);
            setCurrentUrl(destination.loginUrl);
            setStatus(`Log in to ${destination.label}, then save the session to prepare this draft.`);
          }
          return;
        }

        const cookies = parseMarketplaceCookies(savedSession.cookiesJson);
        if (!cookies) throw new Error('The saved marketplace session could not be read.');

        let restoredCookieCount = 0;
        for (const cookie of Object.values(cookies)) {
          if (cookie.expires && Date.parse(cookie.expires) <= Date.now()) continue;
          try {
            if (await NitroCookies.set(destination.origin, cookie)) {
              restoredCookieCount += 1;
            }
          } catch {
            // A marketplace may expire or reject individual cookies. Keep
            // restoring the remaining cookies and let its login page decide.
          }
        }
        await NitroCookies.flush();

        if (!cancelled && restoredCookieCount > 0) {
          setSessionSaved(true);
          setSourceUrl(destination.createUrl);
          setCurrentUrl(destination.createUrl);
          setStatus(`Saved ${destination.label} session restored. KeepFlip will fill supported fields when the listing form is ready.`);
        } else if (!cancelled) {
          setSourceUrl(destination.loginUrl);
          setCurrentUrl(destination.loginUrl);
          setStatus(`Log in to ${destination.label}, then save the session to prepare this draft.`);
        }
      } catch {
        if (!cancelled) {
          setError('KeepFlip could not restore a saved session. You can log in again here.');
          setSourceUrl(destination.loginUrl);
          setCurrentUrl(destination.loginUrl);
          setStatus(`Log in to ${destination.label}, then save the session to prepare this draft.`);
        }
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [destination, platform, userId, visible]);

  useEffect(() => {
    if (!sourceUrl || restoringSession || !webViewLoading) return;
    const timeout = setTimeout(() => {
      setWebViewLoading(false);
      setError(`${destination.label} is taking longer than expected. If the page is blank, close and reopen this screen.`);
    }, WEBVIEW_LOAD_STALL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [destination.label, restoringSession, sourceUrl, webViewLoading]);

  const handleSaveSession = useCallback(async () => {
    if (savingSession) return;
    if (!isMarketplaceHost(currentUrl, platform)) {
      setError(`Return to ${destination.label} after logging in, then save the session.`);
      return;
    }
    if (/\/(login|signin|sign-in)(\/|$)/i.test(new URL(currentUrl).pathname)) {
      setError(`Finish logging in to ${destination.label}, then save the session.`);
      return;
    }

    setSavingSession(true);
    setError(null);
    try {
      const cookies = await NitroCookies.get(destination.origin);
      if (Object.keys(cookies).length === 0) {
        throw new Error('No marketplace cookies were found.');
      }

      await saveMarketplaceSession({ userId, marketplace: platform, cookies });
      await NitroCookies.flush();
      setSessionSaved(true);
      setStatus(`Session saved. Opening the ${destination.label} listing form…`);
      setSourceUrl(destination.createUrl);
      setCurrentUrl(destination.createUrl);
      onSaved?.();
    } catch {
      setError('KeepFlip could not save this marketplace session. Check the marketplace_sessions table setup and try again.');
    } finally {
      setSavingSession(false);
    }
  }, [currentUrl, destination, onSaved, platform, savingSession, userId]);

  const handleForgetSession = useCallback(async () => {
    if (forgettingSession) return;
    setForgettingSession(true);
    setError(null);
    try {
      await deleteMarketplaceSession(userId, platform);
      const cookies = await NitroCookies.get(destination.origin);
      for (const cookieName of Object.keys(cookies)) {
        await NitroCookies.clearByName(destination.origin, cookieName);
      }
      await NitroCookies.flush();
      setSessionSaved(false);
      setSourceUrl(destination.loginUrl);
      setCurrentUrl(destination.loginUrl);
      setStatus(`Saved ${destination.label} session removed. Log in again when you want to prepare another listing.`);
    } catch {
      setError(`KeepFlip could not remove the saved ${destination.label} session.`);
    } finally {
      setForgettingSession(false);
    }
  }, [destination, forgettingSession, platform, userId]);

  const handleFillCurrentPage = useCallback(() => {
    if (!isMarketplaceHost(currentUrl, platform)) {
      setError(`Open a ${destination.label} page before filling the listing draft.`);
      return;
    }
    setError(null);
    setStatus('KeepFlip is checking this page for supported listing fields…');
    webViewRef.current?.injectJavaScript(buildWebViewAutofillScript(payload));
  }, [currentUrl, destination, payload, platform]);

  const handleLoadEnd = useCallback(
    (event: { nativeEvent: { url?: string } }) => {
      setWebViewLoading(false);
      const loadedUrl = event.nativeEvent.url ?? currentUrl;
      if (!sessionSaved || !isListingFormUrl(loadedUrl, platform)) return;
      webViewRef.current?.injectJavaScript(buildWebViewAutofillScript(payload));
    },
    [currentUrl, payload, platform, sessionSaved],
  );

  const handleMessage = useCallback((message: string) => {
    const result = readFillResult(message);
    if (!result) return;
    if (result.error) {
      setStatus(`KeepFlip could not match this page to the selected marketplace.`);
      return;
    }
    if (result.filled > 0) {
      setStatus(`KeepFlip filled ${result.filled} fields. Add ${result.photoCount} item photos, review the listing, and post it when ready.`);
    } else {
      setStatus('The listing form is open. KeepFlip did not find supported fields, so fill the details on the page.');
    }
  }, []);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      visible={visible}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.headerAction}>
            <Text style={styles.headerActionText}>Close</Text>
          </Pressable>
          <Text style={styles.title}>{destination.label} listing</Text>
          <Pressable
            accessibilityRole="button"
            disabled={savingSession || restoringSession || forgettingSession}
            onPress={() => void handleSaveSession()}
            style={[styles.headerAction, (savingSession || restoringSession || forgettingSession) && styles.disabled]}
          >
            <Text style={styles.headerActionText}>
              {savingSession ? 'Saving…' : sessionSaved ? 'Refresh session' : 'Save & prepare'}
            </Text>
          </Pressable>
        </View>
        <Text selectable style={styles.status}>{status}</Text>
        {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        {sessionSaved ? (
          <View style={styles.sessionActions}>
            <Pressable
              accessibilityRole="button"
              onPress={handleFillCurrentPage}
              style={styles.fillButton}
            >
              <Text style={styles.fillButtonText}>Fill draft on this page</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={forgettingSession}
              onPress={() => void handleForgetSession()}
              style={[styles.forgetButton, forgettingSession && styles.disabled]}
            >
              <Text style={styles.forgetButtonText}>
                {forgettingSession ? 'Removing…' : 'Forget saved session'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.webViewContainer}>
          {sourceUrl ? (
            <WebView
              ref={webViewRef}
              allowsBackForwardNavigationGestures
              domStorageEnabled
              javaScriptEnabled
              onLoadEnd={handleLoadEnd}
              onLoadStart={() => {
                setWebViewLoading(true);
                setError(null);
              }}
              onMessage={(event) => handleMessage(event.nativeEvent.data)}
              onNavigationStateChange={(state) => setCurrentUrl(state.url)}
              onError={() => {
                setWebViewLoading(false);
                setError(`KeepFlip could not load ${destination.label}. Check your connection and try again.`);
              }}
              onHttpError={() => setWebViewLoading(false)}
              onRenderProcessGone={() => {
                setWebViewLoading(false);
                setError(`${destination.label} stopped responding. Close and reopen this screen to reload it.`);
              }}
              sharedCookiesEnabled
              source={{ uri: sourceUrl }}
              thirdPartyCookiesEnabled
            />
          ) : null}
          {restoringSession || webViewLoading ? (
            <View pointerEvents="none" style={styles.loadingOverlay}>
              <ActivityIndicator color={theme.colors.scannerCyan} size="large" />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundDeep },
  header: {
    minHeight: 58,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.surfaceInset,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 },
  headerActionText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: '800',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 13,
    fontWeight: '900',
  },
  status: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    color: theme.colors.danger,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  webViewContainer: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  disabled: { opacity: 0.5 },
  sessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  fillButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
  },
  fillButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: '800',
  },
  forgetButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  forgetButtonText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: '800',
  },
});
