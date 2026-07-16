import { Account, Client, Functions, Storage } from 'react-native-appwrite';

export const APPWRITE_CORE_REQUIRED_ENVIRONMENT_VARIABLES = [
  'EXPO_PUBLIC_APPWRITE_ENDPOINT',
  'EXPO_PUBLIC_APPWRITE_PROJECT_ID',
] as const;

export const APPWRITE_ANALYSIS_REQUIRED_ENVIRONMENT_VARIABLES = [
  'EXPO_PUBLIC_APPWRITE_SCAN_BUCKET_ID',
  'EXPO_PUBLIC_APPWRITE_ANALYZE_FUNCTION_ID',
] as const;

export const APPWRITE_REQUIRED_ENVIRONMENT_VARIABLES = [
  ...APPWRITE_CORE_REQUIRED_ENVIRONMENT_VARIABLES,
  ...APPWRITE_ANALYSIS_REQUIRED_ENVIRONMENT_VARIABLES,
] as const;

export type AppwriteCoreRequiredEnvironmentVariable =
  (typeof APPWRITE_CORE_REQUIRED_ENVIRONMENT_VARIABLES)[number];

export type AppwriteRequiredEnvironmentVariable =
  (typeof APPWRITE_REQUIRED_ENVIRONMENT_VARIABLES)[number];

export type AppwriteCoreConfiguration = {
  endpoint: string;
  projectId: string;
  platform: string;
};

export type AppwriteConfiguration = AppwriteCoreConfiguration & {
  scanBucketId: string;
  analyzeFunctionId: string;
  ebaySoldCompsFunctionId?: string;
};

export type AppwriteCoreConfigurationStatus =
  | {
      configured: true;
      configuration: AppwriteCoreConfiguration;
      missingKeys: [];
    }
  | {
      configured: false;
      configuration: null;
      missingKeys: AppwriteCoreRequiredEnvironmentVariable[];
    };

export type AppwriteConfigurationStatus =
  | { configured: true; configuration: AppwriteConfiguration; missingKeys: [] }
  | {
      configured: false;
      configuration: null;
      missingKeys: AppwriteRequiredEnvironmentVariable[];
    };

export class AppwriteSetupError extends Error {
  readonly code = 'APPWRITE_NOT_CONFIGURED';

  constructor(
    public readonly missingKeys: AppwriteRequiredEnvironmentVariable[],
  ) {
    super(
      `KeepFlip needs Appwrite configuration: ${missingKeys.join(', ')}`,
    );
    this.name = 'AppwriteSetupError';
  }
}

function cleanEnvironmentValue(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

export function getAppwriteCoreConfigurationStatus(): AppwriteCoreConfigurationStatus {
  // Expo statically replaces EXPO_PUBLIC_ access, so keep these reads explicit.
  const endpoint = cleanEnvironmentValue(
    process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT,
  );
  const projectId = cleanEnvironmentValue(
    process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID,
  );
  const platform =
    cleanEnvironmentValue(process.env.EXPO_PUBLIC_APPWRITE_PLATFORM) ??
    'com.keepflip.app';

  const missingKeys: AppwriteCoreRequiredEnvironmentVariable[] = [];
  if (!endpoint) missingKeys.push('EXPO_PUBLIC_APPWRITE_ENDPOINT');
  if (!projectId) missingKeys.push('EXPO_PUBLIC_APPWRITE_PROJECT_ID');

  if (!endpoint || !projectId) {
    return { configured: false, configuration: null, missingKeys };
  }

  return {
    configured: true,
    configuration: {
      endpoint: endpoint.replace(/\/+$/, ''),
      projectId,
      platform,
    },
    missingKeys: [],
  };
}

export function getAppwriteConfigurationStatus(): AppwriteConfigurationStatus {
  const coreStatus = getAppwriteCoreConfigurationStatus();
  // Keep these reads explicit so Expo can statically replace them as well.
  const scanBucketId = cleanEnvironmentValue(
    process.env.EXPO_PUBLIC_APPWRITE_SCAN_BUCKET_ID,
  );
  const analyzeFunctionId = cleanEnvironmentValue(
    process.env.EXPO_PUBLIC_APPWRITE_ANALYZE_FUNCTION_ID,
  );
  const ebaySoldCompsFunctionId = cleanEnvironmentValue(
    process.env.EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID,
  );

  const missingKeys: AppwriteRequiredEnvironmentVariable[] = [
    ...coreStatus.missingKeys,
  ];
  if (!scanBucketId) missingKeys.push('EXPO_PUBLIC_APPWRITE_SCAN_BUCKET_ID');
  if (!analyzeFunctionId) {
    missingKeys.push('EXPO_PUBLIC_APPWRITE_ANALYZE_FUNCTION_ID');
  }

  if (!coreStatus.configured || !scanBucketId || !analyzeFunctionId) {
    return { configured: false, configuration: null, missingKeys };
  }

  return {
    configured: true,
    configuration: {
      ...coreStatus.configuration,
      scanBucketId,
      analyzeFunctionId,
      ...(ebaySoldCompsFunctionId ? { ebaySoldCompsFunctionId } : {}),
    },
    missingKeys: [],
  };
}

export function getAppwriteCoreConfiguration(): AppwriteCoreConfiguration {
  const status = getAppwriteCoreConfigurationStatus();
  if (!status.configured) throw new AppwriteSetupError(status.missingKeys);
  return status.configuration;
}

export function getAppwriteConfiguration(): AppwriteConfiguration {
  const status = getAppwriteConfigurationStatus();
  if (!status.configured) throw new AppwriteSetupError(status.missingKeys);
  return status.configuration;
}

export type AppwriteCoreServices = {
  client: Client;
  account: Account;
  configuration: AppwriteCoreConfiguration;
};

export type AppwriteServices = {
  client: Client;
  account: Account;
  storage: Storage;
  functions: Functions;
  configuration: AppwriteConfiguration;
};

let cachedCoreServices: AppwriteCoreServices | null = null;
let cachedCoreSignature: string | null = null;
let cachedServices: AppwriteServices | null = null;
let cachedSignature: string | null = null;

export function getAppwriteCoreServices(): AppwriteCoreServices {
  const configuration = getAppwriteCoreConfiguration();
  const signature = JSON.stringify(configuration);

  if (cachedCoreServices && cachedCoreSignature === signature) {
    return cachedCoreServices;
  }

  const client = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setPlatform(configuration.platform);

  cachedCoreServices = {
    client,
    account: new Account(client),
    configuration,
  };
  cachedCoreSignature = signature;

  return cachedCoreServices;
}

export function getAppwriteServices(): AppwriteServices {
  const configuration = getAppwriteConfiguration();
  const signature = JSON.stringify(configuration);

  if (cachedServices && cachedSignature === signature) return cachedServices;

  const coreServices = getAppwriteCoreServices();

  cachedServices = {
    client: coreServices.client,
    account: coreServices.account,
    storage: new Storage(coreServices.client),
    functions: new Functions(coreServices.client),
    configuration,
  };
  cachedSignature = signature;

  return cachedServices;
}
