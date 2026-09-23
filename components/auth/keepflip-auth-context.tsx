import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppwriteException,
  AuthenticationFactor,
  ID,
  type Models,
} from 'react-native-appwrite';
import { AppState } from 'react-native';

import {
  AppwriteSetupError,
  type AppwriteCoreRequiredEnvironmentVariable,
  getAppwriteCoreConfigurationStatus,
  getAppwriteCoreServices,
  realtime,
} from '@/lib/appwrite';
import { ensureUserProfile } from '@/services/user-profile-onboarding-service';
import {
  identifyKeepFlipUser,
  KEEPFLIP_ANALYTICS_EVENTS,
  resetKeepFlipAnalyticsIdentity,
  trackKeepFlipEvent,
} from '@/services/keepflip-analytics';
import {
  areKeepFlipSubscriptionsEnforced,
  loadKeepFlipSubscription,
} from '@/services/keepflip-subscription-service';
import { trackTenjinEvent } from '@/services/tenjin-attribution-service';

export type KeepFlipAuthStatus =
  | 'checking'
  | 'signed-out'
  | 'signed-in'
  | 'setup'
  | 'error';

export type KeepFlipAuthErrorCode =
  | 'AUTH_ACCOUNT_EXISTS'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_INVALID_INPUT'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_MFA_VERIFICATION'
  | 'AUTH_NETWORK'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_REQUEST_FAILED'
  | 'AUTH_SESSION_UNVERIFIED'
  | 'AUTH_SUBSCRIPTION_REQUIRED'
  | 'AUTH_SUBSCRIPTION_UNVERIFIED'
  | 'AUTH_SETUP_REQUIRED';

export class KeepFlipAuthError extends Error {
  constructor(
    message: string,
    public readonly code: KeepFlipAuthErrorCode,
    public readonly userId?: string,
  ) {
    super(message);
    this.name = 'KeepFlipAuthError';
  }
}

type PendingMfaSignIn = {
  availableFactors: Models.MfaFactors;
  challengeId: string;
  factor: AuthenticationFactor;
};

export type KeepFlipMfaSignInState = Pick<
  PendingMfaSignIn,
  'availableFactors' | 'factor'
>;

export type KeepFlipAuthContextValue = {
  status: KeepFlipAuthStatus;
  user: Models.User | null;
  errorMessage: string | null;
  missingKeys: AppwriteCoreRequiredEnvironmentVariable[];
  isBusy: boolean;
  pendingMfaSignIn: KeepFlipMfaSignInState | null;
  signIn: (email: string, password: string) => Promise<void>;
  changeMfaSignInFactor: (factor: AuthenticationFactor) => Promise<void>;
  completeMfaSignIn: (otp: string) => Promise<void>;
  cancelMfaSignIn: () => Promise<void>;
  /**
   * Create the Appwrite account without creating an authenticated session.
   * Callers must complete the subscription-first checkout before invoking it.
   */
  createAccount: (
    name: string,
    email: string,
    password: string,
  ) => Promise<Models.User>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
};

type AuthSnapshot = Pick<
  KeepFlipAuthContextValue,
  'errorMessage' | 'missingKeys' | 'status' | 'user'
>;

type AuthOperation = 'refresh' | 'sign-in' | 'sign-out' | 'sign-up';

class SessionVerificationError extends Error {
  constructor() {
    super('The Appwrite session could not be verified.');
    this.name = 'SessionVerificationError';
  }
}

class SessionVerificationTimeoutError extends Error {
  constructor() {
    super('The Appwrite session check timed out.');
    this.name = 'SessionVerificationTimeoutError';
  }
}

class MfaRequiredError extends Error {
  constructor() {
    super('Additional authentication is required.');
    this.name = 'MfaRequiredError';
  }
}

async function requireActiveSubscription(user: Models.User) {
  if (!areKeepFlipSubscriptionsEnforced()) return;

  const subscription = await loadKeepFlipSubscription(user.$id, {
    reconcileServerStatus: true,
  });
  if (!subscription.serverRecordAvailable) {
    throw new KeepFlipAuthError(
      'KeepFlip could not verify your subscription right now. Check your connection and try again.',
      'AUTH_SUBSCRIPTION_UNVERIFIED',
      user.$id,
    );
  }
  if (!subscription.access.active) {
    throw new KeepFlipAuthError(
      'An active KeepFlip subscription is required to sign in.',
      'AUTH_SUBSCRIPTION_REQUIRED',
      user.$id,
    );
  }
}

// A healthy no-session request returns immediately. Never let a stalled browser
// request prevent a first-time visitor from reaching the sign-in screen.
const SESSION_VERIFICATION_TIMEOUT_MS = 5_000;

const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
  status: 'checking',
  user: null,
  errorMessage: null,
  missingKeys: [],
};

const KeepFlipAuthContext = createContext<KeepFlipAuthContextValue | null>(null);

function appwriteErrorCode(error: unknown) {
  if (error instanceof AppwriteException) return error.code;
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : null;
}

function appwriteErrorType(error: unknown) {
  if (error instanceof AppwriteException) return error.type.toLowerCase();
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return '';
  }

  const type = (error as { type?: unknown }).type;
  return typeof type === 'string' ? type.toLowerCase() : '';
}

function isMfaRequiredResponse(error: unknown) {
  return appwriteErrorType(error) === 'user_more_factors_required';
}

function defaultMfaFactor(factors: Models.MfaFactors) {
  if (factors.totp) return AuthenticationFactor.Totp;
  if (factors.email) return AuthenticationFactor.Email;
  if (factors.phone) return AuthenticationFactor.Phone;
  if (factors.recoveryCode) return AuthenticationFactor.Recoverycode;
  return null;
}

function errorTextForClassification(error: unknown) {
  if (!(error instanceof Error)) return '';
  return error.message.toLowerCase();
}

function isSignedOutResponse(error: unknown) {
  const code = appwriteErrorCode(error);
  return code === 401 || code === 403;
}

function areKeepFlipSubscriptionsEnforced() {
  // Keep the auth boundary fail-closed even when a production build omitted
  // the public flag. The Subscription Police Function uses the same default.
  return process.env.EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED !== 'false';
}

function isNetworkFailure(error: unknown) {
  const message = errorTextForClassification(error);
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('could not connect') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('timed out') ||
    message.includes('timeout')
  );
}

function safeAuthError(
  error: unknown,
  operation: AuthOperation,
): KeepFlipAuthError {
  if (error instanceof KeepFlipAuthError) return error;

  if (error instanceof AppwriteSetupError) {
    return new KeepFlipAuthError(
      'KeepFlip sign-in has not been configured yet.',
      'AUTH_SETUP_REQUIRED',
    );
  }

  if (error instanceof SessionVerificationError) {
    return new KeepFlipAuthError(
      'KeepFlip could not verify that session. Please retry sign-in.',
      'AUTH_SESSION_UNVERIFIED',
    );
  }

  const code = appwriteErrorCode(error);
  const type = appwriteErrorType(error);

  if (code === 409 || type.includes('already_exists')) {
    const signingUp = operation === 'sign-up';
    return new KeepFlipAuthError(
      signingUp
        ? 'An account already exists for this email. Sign in instead.'
        : 'KeepFlip could not start a new session. Please try again.',
      signingUp ? 'AUTH_ACCOUNT_EXISTS' : 'AUTH_REQUEST_FAILED',
    );
  }

  if (
    code === 401 ||
    type.includes('invalid_credentials') ||
    type.includes('user_invalid_token')
  ) {
    return new KeepFlipAuthError(
      operation === 'sign-in'
        ? 'The email or password is incorrect.'
        : 'Your session has expired. Sign in again.',
      'AUTH_INVALID_CREDENTIALS',
    );
  }

  if (code === 403) {
    return new KeepFlipAuthError(
      'This account cannot sign in right now. Contact support if this continues.',
      'AUTH_FORBIDDEN',
    );
  }

  if (code === 429) {
    return new KeepFlipAuthError(
      'Too many attempts. Wait a moment and try again.',
      'AUTH_RATE_LIMITED',
    );
  }

  if (
    code === 400 ||
    type.includes('argument_invalid') ||
    type.includes('password') ||
    type.includes('email')
  ) {
    return new KeepFlipAuthError(
      operation === 'sign-up'
        ? 'Use a valid email and a password with at least 8 characters.'
        : 'Enter a valid email and password.',
      'AUTH_INVALID_INPUT',
    );
  }

  if (isNetworkFailure(error)) {
    return new KeepFlipAuthError(
      "KeepFlip can't reach Appwrite right now. Check your connection and try again.",
      'AUTH_NETWORK',
    );
  }

  return new KeepFlipAuthError(
    operation === 'refresh'
      ? 'KeepFlip could not verify your session. Please try again.'
      : 'KeepFlip could not complete that request. Please try again.',
    'AUTH_REQUEST_FAILED',
  );
}

function safeMfaError(error: unknown) {
  if (error instanceof KeepFlipAuthError) return error;
  const code = appwriteErrorCode(error);
  if (code === 401 || code === 400) {
    return new KeepFlipAuthError(
      'That verification code is incorrect or expired. Try again.',
      'AUTH_MFA_VERIFICATION',
    );
  }
  if (code === 429) {
    return new KeepFlipAuthError(
      'Too many verification attempts. Wait a moment and try again.',
      'AUTH_RATE_LIMITED',
    );
  }
  if (isNetworkFailure(error)) {
    return new KeepFlipAuthError(
      "KeepFlip can't reach Appwrite right now. Check your connection and try again.",
      'AUTH_NETWORK',
    );
  }
  return new KeepFlipAuthError(
    'KeepFlip could not verify that code. Request a new code and try again.',
    'AUTH_MFA_VERIFICATION',
  );
}

function signedOutSnapshot(errorMessage: string | null = null): AuthSnapshot {
  return {
    status: 'signed-out',
    user: null,
    errorMessage,
    missingKeys: [],
  };
}

function setupSnapshot(
  missingKeys: AppwriteCoreRequiredEnvironmentVariable[],
): AuthSnapshot {
  return {
    status: 'setup',
    user: null,
    errorMessage: 'KeepFlip sign-in has not been configured yet.',
    missingKeys,
  };
}

function coreMissingKeys(
  missingKeys: readonly string[],
): AppwriteCoreRequiredEnvironmentVariable[] {
  return missingKeys.filter(
    (key): key is AppwriteCoreRequiredEnvironmentVariable =>
      key === 'EXPO_PUBLIC_APPWRITE_ENDPOINT' ||
      key === 'EXPO_PUBLIC_APPWRITE_PROJECT_ID',
  );
}

function errorSnapshot(errorMessage: string): AuthSnapshot {
  return {
    status: 'error',
    user: null,
    errorMessage,
    missingKeys: [],
  };
}

async function withSessionVerificationTimeout<T>(request: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new SessionVerificationTimeoutError());
        }, SESSION_VERIFICATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function initializeUserProfileInBackground(user: Models.User) {
  /*
   * A profile is KeepFlip application data, not proof of an authenticated
   * Appwrite session. Starting this independently means a temporarily
   * unavailable table, schema migration, or row-permission problem cannot
   * strand a real account on the credentials screen after sign-up.
   */
  void ensureUserProfile({
    displayName: user.name,
    userId: user.$id,
  }).catch((error: unknown) => {
    if (__DEV__) {
      console.warn(
        '[KeepFlip][Auth] User profile setup failed after a valid session. It will retry when the profile is needed:',
        error,
      );
    }
  });
}

async function getVerifiedNonAnonymousUser(): Promise<Models.User | null> {
  const { account } = getAppwriteCoreServices();

  let session: Models.Session;
  try {
    session = await account.getSession({ sessionId: 'current' });
  } catch (error) {
    if (isMfaRequiredResponse(error)) throw new MfaRequiredError();
    if (isSignedOutResponse(error)) return null;
    throw error;
  }

  const provider = session.provider?.trim().toLowerCase();
  if (provider === 'anonymous') {
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch (error) {
      // A rejected/expired anonymous session is already unusable. Any other
      // cleanup failure remains a locked error state so it can be retried.
      if (!isSignedOutResponse(error)) throw error;
    }
    return null;
  }

  if (!provider || !session.userId) throw new SessionVerificationError();

  let user: Models.User;
  try {
    user = await account.get();
  } catch (error) {
    if (isMfaRequiredResponse(error)) throw new MfaRequiredError();
    if (isSignedOutResponse(error)) return null;
    throw error;
  }

  if (!user.status || user.$id !== session.userId) {
    throw new SessionVerificationError();
  }

  identifyKeepFlipUser(
    user.$id,
    { email: user.email, name: user.name },
    { signup_date: user.$createdAt },
  );
  initializeUserProfileInBackground(user);

  return user;
}

async function clearCurrentAppwriteSession({
  resetIdentity = true,
}: { resetIdentity?: boolean } = {}) {
  const { account } = getAppwriteCoreServices();

  // Realtime subscriptions are authenticated separately from the HTTP
  // request that deletes the session. Drop them first so a later sign-in
  // cannot reuse a socket associated with the previous user.
  await realtime.disconnect().catch(() => undefined);

  try {
    await account.deleteSession({ sessionId: 'current' });
  } catch (error) {
    if (!isSignedOutResponse(error)) throw error;
  }
  if (resetIdentity) resetKeepFlipAnalyticsIdentity();
}

export function KeepFlipAuthProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(INITIAL_AUTH_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(true);
  const [pendingMfa, setPendingMfa] = useState<PendingMfaSignIn | null>(null);
  const mountedRef = useRef(true);
  const operationInFlightRef = useRef(false);
  const lastAppStateRef = useRef(AppState.currentState);

  const commit = useCallback((nextSnapshot: AuthSnapshot) => {
    if (mountedRef.current) setSnapshot(nextSnapshot);
  }, []);

  const beginOperation = useCallback(() => {
    if (operationInFlightRef.current) return false;
    operationInFlightRef.current = true;
    if (mountedRef.current) setIsBusy(true);
    return true;
  }, []);

  const finishOperation = useCallback(() => {
    operationInFlightRef.current = false;
    if (mountedRef.current) setIsBusy(false);
  }, []);

  const verifySession = useCallback(async (
    showCheckingState: boolean,
    rejectIfBusy = false,
  ) => {
    // Returning from an authenticator app is common during MFA. Keep the
    // incomplete sign-in session alive until the code is submitted or canceled.
    if (pendingMfa) return;

    if (!beginOperation()) {
      if (rejectIfBusy) {
        throw new KeepFlipAuthError(
          'KeepFlip is already processing an authentication request.',
          'AUTH_REQUEST_FAILED',
        );
      }
      return;
    }

    // Foreground revalidation should not tear down the private route tree while
    // an Appwrite analysis is still running. We keep the verified signed-in UI
    // mounted until the fresh session check resolves, then fail closed if the
    // session is no longer valid.
    if (showCheckingState) commit(INITIAL_AUTH_SNAPSHOT);
    try {
      const configurationStatus = getAppwriteCoreConfigurationStatus();
      if (!configurationStatus.configured) {
        commit(setupSnapshot(configurationStatus.missingKeys));
        return;
      }

      const user = await withSessionVerificationTimeout(
        getVerifiedNonAnonymousUser(),
      );
      if (!user) resetKeepFlipAnalyticsIdentity();
      commit(
        user
          ? {
              status: 'signed-in',
              user,
              errorMessage: null,
              missingKeys: [],
            }
          : signedOutSnapshot(),
      );
    } catch (error) {
      if (error instanceof MfaRequiredError) {
        setPendingMfa(null);
        await clearCurrentAppwriteSession().catch(() => undefined);
        commit(signedOutSnapshot());
      } else if (isSignedOutResponse(error)) {
        commit(signedOutSnapshot());
      } else if (
        error instanceof SessionVerificationTimeoutError &&
        showCheckingState
      ) {
        // Do not grant access without verification, but do let a new visitor
        // reach the credentials screen instead of spinning indefinitely.
        commit(signedOutSnapshot(safeAuthError(error, 'refresh').message));
      } else if (error instanceof AppwriteSetupError) {
        commit(setupSnapshot(coreMissingKeys(error.missingKeys)));
      } else {
        commit(errorSnapshot(safeAuthError(error, 'refresh').message));
      }
    } finally {
      finishOperation();
    }
  }, [beginOperation, commit, finishOperation, pendingMfa]);

  const refresh = useCallback(async () => {
    await verifySession(true, true);
  }, [verifySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!beginOperation()) {
        throw new KeepFlipAuthError(
          'KeepFlip is already processing an authentication request.',
          'AUTH_REQUEST_FAILED',
        );
      }

      let sessionRequestStarted = false;
      try {
        const configurationStatus = getAppwriteCoreConfigurationStatus();
        if (!configurationStatus.configured) {
          commit(setupSnapshot(configurationStatus.missingKeys));
          throw new KeepFlipAuthError(
            'KeepFlip sign-in has not been configured yet.',
            'AUTH_SETUP_REQUIRED',
          );
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !password) {
          throw new KeepFlipAuthError(
            'Enter a valid email and password.',
            'AUTH_INVALID_INPUT',
          );
        }

        commit(signedOutSnapshot());
        setPendingMfa(null);
        await clearCurrentAppwriteSession();
        const { account } = getAppwriteCoreServices();
        sessionRequestStarted = true;
        await account.createEmailPasswordSession({
          email: normalizedEmail,
          password,
        });

        let user: Models.User | null;
        try {
          user = await getVerifiedNonAnonymousUser();
        } catch (error) {
          if (!(error instanceof MfaRequiredError)) throw error;

          const availableFactors = await account.listMFAFactors();
          const factor = defaultMfaFactor(availableFactors);
          if (!factor) throw new SessionVerificationError();
          const challenge = await account.createMFAChallenge({ factor });
          setPendingMfa({
            availableFactors,
            challengeId: challenge.$id,
            factor,
          });
          commit(signedOutSnapshot());
          throw new KeepFlipAuthError(
            'Enter your verification code to finish signing in.',
            'AUTH_MFA_REQUIRED',
          );
        }
        if (!user) throw new SessionVerificationError();

        await requireActiveSubscription(user);

        setPendingMfa(null);
        commit({
          status: 'signed-in',
          user,
          errorMessage: null,
          missingKeys: [],
        });
      } catch (error) {
        const safeError = safeAuthError(error, 'sign-in');
        if (safeError.code === 'AUTH_SETUP_REQUIRED') {
          const configurationStatus = getAppwriteCoreConfigurationStatus();
          commit(
            setupSnapshot(
              configurationStatus.configured
                ? []
                : configurationStatus.missingKeys,
            ),
          );
        } else if (safeError.code === 'AUTH_MFA_REQUIRED') {
          commit(signedOutSnapshot());
        } else if (
          safeError.code === 'AUTH_SUBSCRIPTION_REQUIRED' ||
          safeError.code === 'AUTH_SUBSCRIPTION_UNVERIFIED'
        ) {
          try {
            // Appwrite creates a temporary session to validate a password.
            // Revoke it before the caller can display a paywall or return an
            // inactive-subscription result to the signed-out UI.
            await clearCurrentAppwriteSession();
            commit(
              signedOutSnapshot(
                safeError.code === 'AUTH_SUBSCRIPTION_UNVERIFIED'
                  ? safeError.message
                  : null,
              ),
            );
          } catch {
            commit(errorSnapshot(safeError.message));
          }
        } else if (
          isSignedOutResponse(error) ||
          safeError.code === 'AUTH_INVALID_CREDENTIALS' ||
          safeError.code === 'AUTH_INVALID_INPUT' ||
          safeError.code === 'AUTH_RATE_LIMITED'
        ) {
          commit(signedOutSnapshot(safeError.message));
        } else {
          // A network/unknown failure after asking Appwrite to create a session
          // leaves session state uncertain, so access stays fail-closed.
          commit(
            sessionRequestStarted
              ? errorSnapshot(safeError.message)
              : signedOutSnapshot(safeError.message),
          );
        }
        throw safeError;
      } finally {
        finishOperation();
      }
    },
    [beginOperation, commit, finishOperation],
  );

  const changeMfaSignInFactor = useCallback(
    async (factor: AuthenticationFactor) => {
      if (!beginOperation()) {
        throw new KeepFlipAuthError(
          'KeepFlip is already processing an authentication request.',
          'AUTH_REQUEST_FAILED',
        );
      }
      try {
        const current = pendingMfa;
        if (!current) {
          throw new KeepFlipAuthError(
            'Sign in again to request a new verification code.',
            'AUTH_MFA_VERIFICATION',
          );
        }
        const isAvailable =
          (factor === AuthenticationFactor.Totp && current.availableFactors.totp) ||
          (factor === AuthenticationFactor.Email && current.availableFactors.email) ||
          (factor === AuthenticationFactor.Phone && current.availableFactors.phone) ||
          (factor === AuthenticationFactor.Recoverycode && current.availableFactors.recoveryCode);
        if (!isAvailable) {
          throw new KeepFlipAuthError(
            'That verification method is not available for this account.',
            'AUTH_MFA_VERIFICATION',
          );
        }
        const { account } = getAppwriteCoreServices();
        const challenge = await account.createMFAChallenge({ factor });
        setPendingMfa({ ...current, challengeId: challenge.$id, factor });
      } catch (error) {
        if (error instanceof KeepFlipAuthError) throw error;
        throw safeMfaError(error);
      } finally {
        finishOperation();
      }
    },
    [beginOperation, finishOperation, pendingMfa],
  );

  const completeMfaSignIn = useCallback(
    async (otp: string) => {
      if (!beginOperation()) {
        throw new KeepFlipAuthError(
          'KeepFlip is already processing an authentication request.',
          'AUTH_REQUEST_FAILED',
        );
      }
      try {
        const current = pendingMfa;
        const cleanOtp = otp.trim();
        if (!current) {
          throw new KeepFlipAuthError(
            'Sign in again to request a new verification code.',
            'AUTH_MFA_VERIFICATION',
          );
        }
        if (!cleanOtp) {
          throw new KeepFlipAuthError(
            'Enter your verification code.',
            'AUTH_MFA_VERIFICATION',
          );
        }

        const { account } = getAppwriteCoreServices();
        await account.updateMFAChallenge({
          challengeId: current.challengeId,
          otp: cleanOtp,
        });
        const user = await getVerifiedNonAnonymousUser();
        if (!user) throw new SessionVerificationError();

        await requireActiveSubscription(user);

        setPendingMfa(null);
        commit({
          status: 'signed-in',
          user,
          errorMessage: null,
          missingKeys: [],
        });
      } catch (error) {
        const safeError = safeMfaError(error);
        if (
          safeError instanceof KeepFlipAuthError &&
          (safeError.code === 'AUTH_SUBSCRIPTION_REQUIRED' ||
            safeError.code === 'AUTH_SUBSCRIPTION_UNVERIFIED')
        ) {
          setPendingMfa(null);
          try {
            await clearCurrentAppwriteSession();
            commit(
              signedOutSnapshot(
                safeError.code === 'AUTH_SUBSCRIPTION_UNVERIFIED'
                  ? safeError.message
                  : null,
              ),
            );
          } catch {
            commit(errorSnapshot(safeError.message));
          }
        } else {
          commit(signedOutSnapshot());
        }
        throw safeError;
      } finally {
        finishOperation();
      }
    },
    [beginOperation, commit, finishOperation, pendingMfa],
  );

  const cancelMfaSignIn = useCallback(async () => {
    if (!beginOperation()) {
      throw new KeepFlipAuthError(
        'KeepFlip is already processing an authentication request.',
        'AUTH_REQUEST_FAILED',
      );
    }
    try {
      setPendingMfa(null);
      await clearCurrentAppwriteSession();
      commit(signedOutSnapshot());
    } catch (error) {
      throw safeAuthError(error, 'sign-out');
    } finally {
      finishOperation();
    }
  }, [beginOperation, commit, finishOperation]);

  const createAccount = useCallback(
    async (name: string, email: string, password: string) => {
      if (!beginOperation()) {
        throw new KeepFlipAuthError(
          'KeepFlip is already processing an authentication request.',
          'AUTH_REQUEST_FAILED',
        );
      }

      try {
        const configurationStatus = getAppwriteCoreConfigurationStatus();
        if (!configurationStatus.configured) {
          commit(setupSnapshot(configurationStatus.missingKeys));
          throw new KeepFlipAuthError(
            'KeepFlip sign-in has not been configured yet.',
            'AUTH_SETUP_REQUIRED',
          );
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedName = name.trim();
        if (!normalizedEmail || password.length < 8) {
          throw new KeepFlipAuthError(
            'Use a valid email and a password with at least 8 characters.',
            'AUTH_INVALID_INPUT',
          );
        }

        // Account creation is intentionally sessionless. The subscription-first
        // onboarding flow links the completed store purchase before it calls
        // signIn(), so canceling checkout cannot leave a reusable session.
        commit(signedOutSnapshot());
        await clearCurrentAppwriteSession();
        const { account } = getAppwriteCoreServices();
        const user = await account.create({
          userId: ID.unique(),
          email: normalizedEmail,
          password,
          name: normalizedName || undefined,
        });

        commit(signedOutSnapshot());
        return user;
      } catch (error) {
        const safeError = safeAuthError(error, 'sign-up');
        if (safeError.code === 'AUTH_SETUP_REQUIRED') {
          const configurationStatus = getAppwriteCoreConfigurationStatus();
          commit(
            setupSnapshot(
              configurationStatus.configured
                ? []
                : configurationStatus.missingKeys,
            ),
          );
        } else {
          commit(signedOutSnapshot(safeError.message));
        }
        throw safeError;
      } finally {
        finishOperation();
      }
    },
    [beginOperation, commit, finishOperation],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      if (!beginOperation()) {
        throw new KeepFlipAuthError(
          'KeepFlip is already processing an authentication request.',
          'AUTH_REQUEST_FAILED',
        );
      }

      let sessionRequestStarted = false;
      try {
        if (areKeepFlipSubscriptionsEnforced()) {
          throw new KeepFlipAuthError(
            'Start a KeepFlip subscription before creating an account.',
            'AUTH_SUBSCRIPTION_REQUIRED',
          );
        }

        const configurationStatus = getAppwriteCoreConfigurationStatus();
        if (!configurationStatus.configured) {
          commit(setupSnapshot(configurationStatus.missingKeys));
          throw new KeepFlipAuthError(
            'KeepFlip sign-in has not been configured yet.',
            'AUTH_SETUP_REQUIRED',
          );
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedName = name.trim();
        if (!normalizedEmail || password.length < 8) {
          throw new KeepFlipAuthError(
            'Use a valid email and a password with at least 8 characters.',
            'AUTH_INVALID_INPUT',
          );
        }

        commit(signedOutSnapshot());
        await clearCurrentAppwriteSession();
        const { account } = getAppwriteCoreServices();
        await account.create({
          userId: ID.unique(),
          email: normalizedEmail,
          password,
          name: normalizedName || undefined,
        });

        sessionRequestStarted = true;
        await account.createEmailPasswordSession({
          email: normalizedEmail,
          password,
        });

        const user = await getVerifiedNonAnonymousUser();
        if (!user) throw new SessionVerificationError();

        commit({
          status: 'signed-in',
          user,
          errorMessage: null,
          missingKeys: [],
        });
        trackTenjinEvent('registration_completed');
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.signupCompleted, {
          method: 'email',
          flow: 'standard',
        });
      } catch (error) {
        const safeError = safeAuthError(error, 'sign-up');
        if (safeError.code === 'AUTH_SETUP_REQUIRED') {
          const configurationStatus = getAppwriteCoreConfigurationStatus();
          commit(
            setupSnapshot(
              configurationStatus.configured
                ? []
                : configurationStatus.missingKeys,
            ),
          );
        } else if (
          isSignedOutResponse(error) ||
          safeError.code === 'AUTH_ACCOUNT_EXISTS' ||
          safeError.code === 'AUTH_INVALID_INPUT' ||
          safeError.code === 'AUTH_RATE_LIMITED'
        ) {
          commit(signedOutSnapshot(safeError.message));
        } else {
          commit(
            sessionRequestStarted
              ? errorSnapshot(safeError.message)
              : signedOutSnapshot(safeError.message),
          );
        }
        throw safeError;
      } finally {
        finishOperation();
      }
    },
    [beginOperation, commit, finishOperation],
  );

  const signOut = useCallback(async () => {
    if (!beginOperation()) {
      throw new KeepFlipAuthError(
        'KeepFlip is already processing an authentication request.',
        'AUTH_REQUEST_FAILED',
      );
    }

    commit(INITIAL_AUTH_SNAPSHOT);
    setPendingMfa(null);
    try {
      const configurationStatus = getAppwriteCoreConfigurationStatus();
      if (!configurationStatus.configured) {
        commit(setupSnapshot(configurationStatus.missingKeys));
        throw new KeepFlipAuthError(
          'KeepFlip sign-in has not been configured yet.',
          'AUTH_SETUP_REQUIRED',
        );
      }

      try {
        await clearCurrentAppwriteSession({ resetIdentity: false });
      } catch (error) {
        if (!isSignedOutResponse(error)) throw error;
      }
      commit(signedOutSnapshot());
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.logoutCompleted);
      resetKeepFlipAnalyticsIdentity();
    } catch (error) {
      const safeError = safeAuthError(error, 'sign-out');
      if (isSignedOutResponse(error)) {
        commit(signedOutSnapshot());
        return;
      }
      if (safeError.code === 'AUTH_SETUP_REQUIRED') {
        const configurationStatus = getAppwriteCoreConfigurationStatus();
        commit(
          setupSnapshot(
            configurationStatus.configured
              ? []
              : configurationStatus.missingKeys,
          ),
        );
      } else {
        commit(errorSnapshot(safeError.message));
      }
      throw safeError;
    } finally {
      finishOperation();
    }
  }, [beginOperation, commit, finishOperation]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const becameActive =
        nextState === 'active' && lastAppStateRef.current !== 'active';
      lastAppStateRef.current = nextState;
      if (becameActive) void verifySession(false);
    });

    return () => subscription.remove();
  }, [verifySession]);

  const value = useMemo<KeepFlipAuthContextValue>(
    () => ({
      ...snapshot,
      isBusy,
      pendingMfaSignIn: pendingMfa
        ? {
            availableFactors: pendingMfa.availableFactors,
            factor: pendingMfa.factor,
          }
        : null,
      createAccount,
      signIn,
      changeMfaSignInFactor,
      completeMfaSignIn,
      cancelMfaSignIn,
      signUp,
      signOut,
      refresh,
      retry: refresh,
    }),
    [
      cancelMfaSignIn,
      changeMfaSignInFactor,
      completeMfaSignIn,
      createAccount,
      isBusy,
      pendingMfa,
      refresh,
      signIn,
      signOut,
      signUp,
      snapshot,
    ],
  );

  return <KeepFlipAuthContext value={value}>{children}</KeepFlipAuthContext>;
}

export function useKeepFlipAuth() {
  const context = use(KeepFlipAuthContext);
  if (!context) {
    throw new Error('useKeepFlipAuth must be used inside KeepFlipAuthProvider');
  }
  return context;
}
