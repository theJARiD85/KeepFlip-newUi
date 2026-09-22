import { Client } from 'appwrite';

import { getAppwriteCoreConfigurationStatus } from '@/lib/appwrite';

const configurationStatus = getAppwriteCoreConfigurationStatus();

/**
 * Browser-only Appwrite SDK client.
 *
 * Keep the endpoint and project ID in the existing EXPO_PUBLIC_APPWRITE_*
 * environment variables so local, Pages, and future hosting builds all use the
 * same public Appwrite configuration.
 */
export const appwriteWebClient = new Client();

const appwriteWebClientConfigured = configurationStatus.configured;

if (configurationStatus.configured) {
  appwriteWebClient
    .setEndpoint(configurationStatus.configuration.endpoint)
    .setProject(configurationStatus.configuration.projectId);
}

let hasPingedAppwriteWebClient = false;

/**
 * Ping Appwrite once after the browser app mounts. The module-scoped guard also
 * prevents React Strict Mode from issuing a second development request.
 */
export function pingAppwriteWebClientOnce() {
  if (hasPingedAppwriteWebClient) return;
  hasPingedAppwriteWebClient = true;

  if (!appwriteWebClientConfigured) {
    console.warn(
      '[KeepFlip][Appwrite] Web SDK ping skipped because endpoint or project ID is not configured.',
    );
    return;
  }

  void appwriteWebClient
    .ping()
    .then(() => {
      console.info('[KeepFlip][Appwrite] Web SDK ping succeeded.');
    })
    .catch((error: unknown) => {
      console.warn('[KeepFlip][Appwrite] Web SDK ping failed.', error);
    });
}
