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
  ID,
  type Models,
} from 'react-native-appwrite';
import { AppState } from 'react-native';

import {
  AppwriteSetupError,
  type AppwriteCoreRequiredEnvironmentVariable,
  getAppwriteCoreConfigurationStatus,
  getAppwriteCoreServices,
} from '@/lib/appwrite';

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
  | 'AUTH_NETWORK'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_REQUEST_FAILED'
  | 'AUTH_SESSION_UNVERIFIED'
  | 'AUTH_SETUP_REQUIRED';

export class KeepFlipAuthError extends Error {
  constructor(
    message: string,
    public readonly code: KeepFlipAuthErrorCode,
  ) {
    super(message);
    this.name = 'KeepFlipAuthError';
  }
}

export type KeepFlipAuthContextValue = {
  status: KeepFlipAuthStatus;
  user: Models.User | null;
  errorMessage: string | null;
  missingKeys: AppwriteCoreRequiredEnvironmentVariable[];
  isBusy: boolean;
  signIn: (email: string, password: string) => Promise<void>;
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

function errorTextForClassification(error: unknown) {
  if (!(error instanceof Error)) return '';
  return error.message.toLowerCase();
}

function isSignedOutResponse(error: unknown) {
  const code = appwriteErrorCode(error);
  return code === 401 || code === 403;
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

  // Appwrite may report an existing email/password session as a 401. Handle
  // the specific response before the generic invalid-credentials branch so a
  // retry can recover the already-valid session.
  if (code === 409 || type.includes('already_exists')) {
    return new KeepFlipAuthError(
      operation === 'sign-up'
        ? 'An account already exists for this email. Sign in instead.'
        : 'A session is already active. Retry the session check.',
      'AUTH_ACCOUNT_EXISTS',
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

async function getVerifiedNonAnonymousUser(): Promise<Models.User | null> {
  const { account } = getAppwriteCoreServices();

  let session: Models.Session;
  try {
    session = await account.getSession({ sessionId: 'current' });
  } catch (error) {
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
    if (isSignedOutResponse(error)) return null;
    throw error;
  }

  if (!user.status || user.$id !== session.userId) {
    throw new SessionVerificationError();
  }

  return user;
}

export function KeepFlipAuthProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(INITIAL_AUTH_SNAPSHOT);
  const [isBusy, setIsBusy] = useState(true);
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

      const user = await getVerifiedNonAnonymousUser();
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
      if (isSignedOutResponse(error)) {
        commit(signedOutSnapshot());
      } else if (error instanceof AppwriteSetupError) {
        commit(setupSnapshot(coreMissingKeys(error.missingKeys)));
      } else {
        commit(errorSnapshot(safeAuthError(error, 'refresh').message));
      }
    } finally {
      finishOperation();
    }
  }, [beginOperation, commit, finishOperation]);

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
        const { account } = getAppwriteCoreServices();
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
      } catch (error) {
        const safeError = safeAuthError(error, 'sign-in');
        if (safeError.code === 'AUTH_ACCOUNT_EXISTS') {
          try {
            const user = await getVerifiedNonAnonymousUser();
            if (!user) throw new SessionVerificationError();
            commit({
              status: 'signed-in',
              user,
              errorMessage: null,
              missingKeys: [],
            });
            return;
          } catch (verificationError) {
            const verificationAuthError = safeAuthError(
              verificationError,
              'refresh',
            );
            commit(errorSnapshot(verificationAuthError.message));
            throw verificationAuthError;
          }
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
    try {
      const configurationStatus = getAppwriteCoreConfigurationStatus();
      if (!configurationStatus.configured) {
        commit(setupSnapshot(configurationStatus.missingKeys));
        throw new KeepFlipAuthError(
          'KeepFlip sign-in has not been configured yet.',
          'AUTH_SETUP_REQUIRED',
        );
      }

      const { account } = getAppwriteCoreServices();
      try {
        await account.deleteSession({ sessionId: 'current' });
      } catch (error) {
        if (!isSignedOutResponse(error)) throw error;
      }
      commit(signedOutSnapshot());
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
      signIn,
      signUp,
      signOut,
      refresh,
      retry: refresh,
    }),
    [isBusy, refresh, signIn, signOut, signUp, snapshot],
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
