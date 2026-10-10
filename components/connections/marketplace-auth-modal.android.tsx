import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, type WebView as WebViewInstance } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import type { MarketplaceAuthModalProps } from '@/components/connections/marketplace-auth-modal.types';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { APPWRITE, ImageFormat, storage } from '@/lib/appwrite';
import {
  buildWebViewAutofillScript,
  buildWebViewSubmitScript,
  CROSSLISTING_DESTINATIONS,
  type CrosslistingPhotoAsset,
  type CrosslistingMarketplace,
} from '@/services/crosslisting-service';
import { getCrosslistingFormConfig } from '@/services/crosslisting-form-config-service';
import { deleteMarketplaceSession } from '@/services/marketplace-session-service';
import {
  forgetMarketplaceWebViewSession,
  hasMarketplaceWebViewSession,
  rememberMarketplaceWebViewSession,
} from '@/services/marketplace-webview-session';

const WEBVIEW_LOAD_STALL_TIMEOUT_MS = 45_000;
const MAX_WEBVIEW_PHOTOS = 8;
const MAX_WEBVIEW_PHOTO_BYTES = 2_000_000;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    encoded += BASE64_ALPHABET[first >> 2];
    encoded += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)];
    encoded += index + 1 < bytes.length
      ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)]
      : '=';
    encoded += index + 2 < bytes.length
      ? BASE64_ALPHABET[third & 63]
      : '=';
  }
  return encoded;
}

async function loadMarketplacePhotoAssets(
  photoFileIds: string[],
  photoBucketId?: string,
) {
  const assets: CrosslistingPhotoAsset[] = [];
  const candidates = photoFileIds
    .filter((fileId) => typeof fileId === 'string' && fileId.trim())
    .slice(0, MAX_WEBVIEW_PHOTOS);
  let unavailable = Math.max(0, photoFileIds.length - candidates.length);
  let totalBytes = 0;

  const bucketId = photoBucketId?.trim() || APPWRITE.itemImagesBucketId;
  if (!bucketId) {
    return { assets, unavailable: Math.max(unavailable, candidates.length) };
  }

  for (const [index, fileId] of candidates.entries()) {
    try {
      const preview = await storage.getFilePreview({
        bucketId,
        fileId,
        width: 1200,
        height: 1200,
        quality: 70,
        output: ImageFormat.Jpeg,
      });
      if (preview.byteLength + totalBytes > MAX_WEBVIEW_PHOTO_BYTES) {
        unavailable += candidates.length - index;
        break;
      }
      totalBytes += preview.byteLength;
      assets.push({
        name: `keepflip-item-photo-${index + 1}.jpg`,
        dataUrl: `data:image/jpeg;base64,${arrayBufferToBase64(preview)}`,
      });
    } catch {
      unavailable += 1;
    }
  }

  return { assets, unavailable };
}

function isMarketplaceHost(url: string, platform: CrosslistingMarketplace) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    const marketplaceHost = new URL(
      CROSSLISTING_DESTINATIONS[platform].origin,
    ).hostname.replace(/^www\./, '');
    return (
      hostname === marketplaceHost || hostname.endsWith(`.${marketplaceHost}`)
    );
  } catch {
    return false;
  }
}

function isListingFormUrl(url: string, platform: CrosslistingMarketplace) {
  if (!isMarketplaceHost(url, platform)) return false;
  // OfferUp opens its posting form in a modal on the home page, so its URL
  // does not change when the user taps Post.
  if (platform === 'offerUp') return true;
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
    const message = parsed as {
      kind?: unknown;
      requestId?: unknown;
      filled?: unknown;
      fields?: unknown;
      photoCount?: unknown;
      uploadedPhotoCount?: unknown;
      photoError?: unknown;
      unavailablePhotoCount?: unknown;
      missingFields?: unknown;
      error?: unknown;
    };
    if (message.kind !== 'keepflip-crosslisting-result') return null;
    return {
      requestId: typeof message.requestId === 'number' ? message.requestId : -1,
      filled: typeof message.filled === 'number' ? message.filled : 0,
      fields: Array.isArray(message.fields)
        ? message.fields.filter((field): field is string => typeof field === 'string')
        : [],
      photoCount: typeof message.photoCount === 'number' ? message.photoCount : 0,
      uploadedPhotoCount:
        typeof message.uploadedPhotoCount === 'number'
          ? message.uploadedPhotoCount
          : 0,
      photoError: typeof message.photoError === 'string' ? message.photoError : null,
      unavailablePhotoCount:
        typeof message.unavailablePhotoCount === 'number'
          ? message.unavailablePhotoCount
          : 0,
      missingFields: Array.isArray(message.missingFields)
        ? message.missingFields.filter((field): field is string => typeof field === 'string')
        : [],
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
  onPrepared,
  onSubmitPressed,
  onConfirmed,
  onNext,
  nextLabel,
  progressLabel,
  userId,
  platform,
  payload,
  photoFileIds,
  photoBucketId,
}: MarketplaceAuthModalProps) {
  const webViewRef = useRef<WebViewInstance>(null);
  const fillRequestRef = useRef(0);
  const [sourceUrl, setSourceUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [restoringSession, setRestoringSession] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [savingSession, setSavingSession] = useState(false);
  const [forgettingSession, setForgettingSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Opening your marketplace sign-in…');
  const destination = useMemo(
    () => CROSSLISTING_DESTINATIONS[platform],
    [platform],
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    void (async () => {
      try {
        const remembered = await hasMarketplaceWebViewSession(userId, platform);
        if (cancelled) return;
        const nextUrl = remembered ? destination.createUrl : destination.loginUrl;
        setSessionSaved(remembered);
        setSourceUrl(nextUrl);
        setCurrentUrl(nextUrl);
        setStatus(remembered
          ? `Opening ${destination.label} with the login saved on this device. KeepFlip will look for the listing form.`
          : `Log in to ${destination.label} here, then tap Continue to listing.`);
      } catch {
        if (!cancelled) {
          setError(`KeepFlip could not open a private ${destination.label} session on this device. Close and reopen this screen to try again.`);
          setWebViewLoading(false);
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
      await rememberMarketplaceWebViewSession(userId, platform);
      setSessionSaved(true);
      setStatus(`Opening the ${destination.label} listing form. Your login stays in this device's WebView.`);
      setSourceUrl(destination.createUrl);
      setCurrentUrl(destination.createUrl);
      onSaved?.();
    } catch {
      setError(`KeepFlip could not remember this ${destination.label} login on this device. Try again.`);
    } finally {
      setSavingSession(false);
    }
  }, [currentUrl, destination, onSaved, platform, savingSession, userId]);

  const handleForgetSession = useCallback(async () => {
    if (forgettingSession) return;
    setForgettingSession(true);
    setError(null);
    try {
      await forgetMarketplaceWebViewSession(userId, platform);
      if (APPWRITE.databaseId && APPWRITE.marketplaceSessionsTableId) {
        try {
          await deleteMarketplaceSession(userId, platform);
        } catch {
          setError(`The ${destination.label} login was removed from this device, but KeepFlip could not remove an older saved cloud session. Try Forget again after checking your connection.`);
        }
      }
      setSessionSaved(false);
      setSourceUrl(destination.loginUrl);
      setCurrentUrl(destination.loginUrl);
      setStatus(`${destination.label} login removed from this device. Log in again when you want to prepare another listing.`);
    } catch {
      setError(`KeepFlip could not remove the ${destination.label} login from this device.`);
    } finally {
      setForgettingSession(false);
    }
  }, [destination, forgettingSession, platform, userId]);

  const prepareAndFillCurrentPage = useCallback(async (pageUrl: string) => {
    if (!isListingFormUrl(pageUrl, platform)) return;
    const requestId = ++fillRequestRef.current;
    setError(null);
    setReadyToSubmit(false);
    setStatus('KeepFlip is loading saved photos and checking this page for listing fields…');
    const formConfig = await getCrosslistingFormConfig(platform);
    if (!formConfig.enabled) {
      setStatus(
        `${destination.label} form filling is paused in KeepFlip. Complete the listing manually on the marketplace page.`,
      );
      return;
    }
    const photoResult = await loadMarketplacePhotoAssets(photoFileIds, photoBucketId);
    if (!webViewRef.current || requestId !== fillRequestRef.current) return;
    webViewRef.current.injectJavaScript(
      buildWebViewAutofillScript(
        payload,
        formConfig.selectors,
        photoResult.assets,
        photoResult.unavailable,
        requestId,
      ),
    );
    if (photoResult.unavailable > 0) {
      setStatus(
        `KeepFlip could not load ${photoResult.unavailable} saved photo${photoResult.unavailable === 1 ? '' : 's'}. It will still fill supported text fields; add any missing photos on the marketplace page.`,
      );
    }
  }, [destination.label, payload, photoBucketId, photoFileIds, platform]);

  const handleFillCurrentPage = useCallback(() => {
    if (!isMarketplaceHost(currentUrl, platform)) {
      setError(`Open a ${destination.label} page before filling the listing draft.`);
      return;
    }
    void prepareAndFillCurrentPage(currentUrl);
  }, [currentUrl, destination.label, platform, prepareAndFillCurrentPage]);

  const submitReviewedListing = useCallback(async () => {
    if (!isMarketplaceHost(currentUrl, platform)) {
      setError(`Open a ${destination.label} page before submitting this listing.`);
      return;
    }
    const formConfig = await getCrosslistingFormConfig(platform);
    if (!formConfig.enabled) {
      setReadyToSubmit(false);
      setStatus(`${destination.label} form submission is paused in KeepFlip. Use the marketplace page to continue manually.`);
      return;
    }
    if (!webViewRef.current) {
      setError(`KeepFlip could not reach the ${destination.label} listing page.`);
      return;
    }
    setSubmitting(true);
    setStatus(`KeepFlip is asking ${destination.label} to submit the reviewed listing…`);
    webViewRef.current?.injectJavaScript(
      buildWebViewSubmitScript(platform, formConfig.selectors),
    );
  }, [currentUrl, destination.label, platform]);

  const handleSubmitReviewedListing = useCallback(() => {
    if (!readyToSubmit || submitting) return;
    Alert.alert(
      `Continue on ${destination.label}?`,
      'Review the title, price, listing details, and every photo on the marketplace page. KeepFlip will press the next listing step or the final submit button shown there.',
      [
        { text: 'Keep reviewing', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => { void submitReviewedListing(); },
        },
      ],
    );
  }, [destination.label, readyToSubmit, submitReviewedListing, submitting]);

  const handleLoadEnd = useCallback(
    (event: { nativeEvent: { url?: string } }) => {
      setWebViewLoading(false);
      const loadedUrl = event.nativeEvent.url ?? currentUrl;
      if (sessionSaved && isMarketplaceHost(loadedUrl, platform) &&
        /\/(login|signin|sign-in)(\/|$)/i.test(new URL(loadedUrl).pathname)) {
        setSessionSaved(false);
        setReadyToSubmit(false);
        setStatus(`${destination.label} needs you to log in again. Continue to listing after signing in.`);
        return;
      }
      if (!sessionSaved || !isListingFormUrl(loadedUrl, platform)) return;
      void prepareAndFillCurrentPage(loadedUrl);
    },
    [currentUrl, destination.label, platform, prepareAndFillCurrentPage, sessionSaved],
  );

  const handleMessage = useCallback((message: string, pageUrl: string) => {
    if (!isMarketplaceHost(pageUrl, platform)) return;
    try {
      const parsed: unknown = JSON.parse(message);
      if (
        parsed &&
        typeof parsed === 'object' &&
        'kind' in parsed &&
        parsed.kind === 'keepflip-crosslisting-submit-result'
      ) {
        const status = 'status' in parsed && typeof parsed.status === 'string'
          ? parsed.status
          : '';
        setSubmitting(false);
        if (status === 'clicked') {
          setReadyToSubmit(false);
          setStatus(`KeepFlip pressed ${destination.label}'s submit button. Confirm the marketplace's own success message; KeepFlip has not verified that the listing is live.`);
          onSubmitPressed?.();
        } else if (status === 'next_clicked') {
          setStatus(`KeepFlip moved to the next ${destination.label} listing step. Check the details there, then continue when ready.`);
        } else if (status === 'submit_button_not_found') {
          setStatus(`KeepFlip could not identify ${destination.label}'s next or submit button. Continue on the marketplace page when ready.`);
        } else {
          setStatus(`KeepFlip could not submit because this page is not on ${destination.label}.`);
        }
        return;
      }
    } catch {
      // Ignore non-JSON messages from the marketplace page.
    }
    const result = readFillResult(message);
    if (!result) return;
    if (result.requestId !== fillRequestRef.current) return;
    if (result.error) {
      setStatus(`KeepFlip could not match this page to the selected marketplace.`);
      return;
    }
    if (result.filled > 0 || result.uploadedPhotoCount > 0) {
      const coreFilled = ['title', 'description', 'price'].every((field) => result.fields.includes(field));
      if (coreFilled) onPrepared?.();
      const fieldLabels: Record<string, string> = {
        title: 'title',
        description: 'description',
        price: 'price',
        category: 'category',
        condition: 'condition',
        brand: 'brand',
        size: 'size',
        color: 'color',
      };
      const filledLabels = result.fields
        .map((field) => fieldLabels[field])
        .filter((field): field is string => Boolean(field));
      const filledSummary = filledLabels.length > 0
        ? filledLabels.join(', ')
        : `${result.filled} fields`;
      const photoInstruction = result.uploadedPhotoCount > 0
        ? `KeepFlip passed ${result.uploadedPhotoCount} photo${result.uploadedPhotoCount === 1 ? '' : 's'} to the photo control. Check that their previews appear${result.unavailablePhotoCount > 0 || result.uploadedPhotoCount < result.photoCount ? ', then add any missing photos' : ''}.`
        : result.photoCount > 0
          ? `KeepFlip could not attach the saved photos${result.photoError ? ' here' : ''}; add them using the marketplace photo picker.`
          : 'Add item photos using the marketplace photo picker.';
      const textInstruction = result.filled > 0
        ? `KeepFlip filled ${filledSummary}.`
        : 'KeepFlip did not find supported text fields.';
      const missingInstruction = result.missingFields.length > 0
        ? ` Fill or confirm these remaining fields: ${result.missingFields.join(', ')}.`
        : '';
      const ready = coreFilled;
      setReadyToSubmit(ready);
      setStatus(`${textInstruction}${missingInstruction} ${photoInstruction} Review the listing; ${ready ? 'finish any remaining fields, then use Submit on this page when ready.' : 'finish the missing fields on the marketplace page.'}`);
    } else {
      setReadyToSubmit(false);
      setStatus('No supported listing fields are visible yet. Open the marketplace listing form, then tap Fill draft on this page.');
    }
  }, [destination.label, onPrepared, onSubmitPressed, platform]);

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
          <Text style={styles.title}>{progressLabel ? `${progressLabel} · ` : ''}{destination.label} listing</Text>
          <Pressable
            accessibilityRole="button"
            disabled={savingSession || restoringSession || forgettingSession}
            onPress={() => void handleSaveSession()}
            style={[styles.headerAction, (savingSession || restoringSession || forgettingSession) && styles.disabled]}
          >
            <Text style={styles.headerActionText}>
              {savingSession ? 'Opening…' : sessionSaved ? 'Open listing form' : 'Continue to listing'}
            </Text>
          </Pressable>
        </View>
        <Text selectable style={styles.status}>{status}</Text>
        {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        {onNext ? (
          <Pressable accessibilityRole="button" onPress={onNext} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>{nextLabel === 'Finish run' ? 'Finish run' : `Next: ${nextLabel ?? 'marketplace'}`} <Ionicons color={theme.colors.textOnAccent} name="arrow-forward" size={14} /></Text>
          </Pressable>
        ) : null}
        {onConfirmed && sessionSaved ? (
          <Pressable accessibilityRole="button" onPress={() => Alert.alert(
            `Is your ${destination.label} listing live?`,
            'Confirm only after the marketplace shows that your listing was posted. KeepFlip will then move this item to Listed.',
            [
              { text: 'Keep checking', style: 'cancel' },
              { text: 'Yes, it is live', onPress: () => onConfirmed(isMarketplaceHost(currentUrl, platform) ? currentUrl : undefined) },
            ],
          )} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>I SEE MY LIVE LISTING <Ionicons color={theme.colors.textOnAccent} name="checkmark-circle" size={14} /></Text>
          </Pressable>
        ) : null}
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
        {readyToSubmit ? (
          <View style={styles.submitPanel}>
            <Text style={styles.submitNotice}>
              Review the listing and confirm its photos are attached before submitting.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={handleSubmitReviewedListing}
              style={[styles.submitButton, submitting && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
              ) : null}
              <Text style={styles.submitButtonText}>
                {submitting ? 'Continuing…' : `Continue listing on ${destination.label}`}
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
                fillRequestRef.current += 1;
                setWebViewLoading(true);
                setReadyToSubmit(false);
                setSubmitting(false);
                setError(null);
              }}
              onMessage={(event) => handleMessage(event.nativeEvent.data, event.nativeEvent.url)}
              onNavigationStateChange={(state) => setCurrentUrl(state.url)}
              onError={() => {
                setWebViewLoading(false);
                setError(`KeepFlip could not load ${destination.label}. Check your connection and try again.`);
              }}
              onHttpError={(event) => {
                setWebViewLoading(false);
                if (event.nativeEvent.statusCode >= 400) {
                  setError(`${destination.label} returned HTTP ${event.nativeEvent.statusCode}. The marketplace page may need a fresh login or may not support this in-app browser.`);
                }
              }}
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
  nextButton: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: 16 },
  nextButtonText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 10, fontWeight: '900' },
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
  submitPanel: {
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.card,
  },
  submitNotice: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  submitButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.scannerCyan,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: theme.colors.textOnAccent,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: '900',
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
