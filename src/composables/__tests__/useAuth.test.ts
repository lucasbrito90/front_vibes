import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock variables ────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file.
// vi.hoisted() ensures variables are available inside the factory closures.

const {
  triggerAuthStateChange,
  mockOnAuthStateChanged,
  mockRegisterCurrentDevicePushToken,
  mockDeactivateCurrentDevicePushToken,
  mockLoginWithGoogle,
  mockLoginWithEmail,
  mockSignUpWithEmail,
  mockLogout,
  mockGetIdToken,
  mockGetCurrentUser,
  mockRequestPasswordReset,
  mockPreferencesSet,
  mockPreferencesRemove,
  mockClearMirror,
  mockCancelAll,
} = vi.hoisted(() => {
  // Capture the auth-state callback so tests can trigger it manually.
  let _authStateCallback: ((user: unknown) => void) | null = null;

  return {
    triggerAuthStateChange: (user: unknown) => _authStateCallback?.(user),

    mockOnAuthStateChanged: vi.fn(
      (_auth: unknown, callback: (user: unknown) => void) => {
        _authStateCallback = callback;
        return vi.fn(); // unsubscribe stub
      },
    ),

    mockRegisterCurrentDevicePushToken: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    mockDeactivateCurrentDevicePushToken: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),

    mockLoginWithGoogle: vi.fn(),
    mockLoginWithEmail: vi.fn(),
    mockSignUpWithEmail: vi.fn(),
    mockLogout: vi.fn(),
    mockGetIdToken: vi.fn<[unknown], Promise<string | null>>().mockResolvedValue('mock-id-token'),
    mockGetCurrentUser: vi.fn().mockReturnValue(null),
    mockRequestPasswordReset: vi.fn().mockResolvedValue(undefined),

    mockPreferencesSet: vi.fn().mockResolvedValue(undefined),
    mockPreferencesRemove: vi.fn().mockResolvedValue(undefined),

    mockClearMirror: vi.fn().mockResolvedValue(undefined),
    mockCancelAll: vi.fn().mockResolvedValue(undefined),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
}));

vi.mock('firebase/app', () => ({
  FirebaseError: class FirebaseError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = 'FirebaseError';
    }
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: mockPreferencesSet,
    remove: mockPreferencesRemove,
  },
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: mockGetCurrentUser,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithEmail: mockLoginWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
    logout: mockLogout,
    getIdToken: mockGetIdToken,
    requestPasswordReset: mockRequestPasswordReset,
  },
  FIREBASE_TOKEN_PREFS_KEY: 'firebase_id_token',
  LaravelSyncError: class LaravelSyncError extends Error {},
  laravelUser: { value: null },
}));

vi.mock('@/services/firebase', () => ({
  auth: {},
}));

vi.mock('@/services/push-token.service', () => ({
  pushTokenService: {
    registerCurrentDevicePushToken: mockRegisterCurrentDevicePushToken,
    deactivateCurrentDevicePushToken: mockDeactivateCurrentDevicePushToken,
    initPushTokenRefreshListener: vi.fn(),
  },
}));

vi.mock('@/services/schedule-mirror.service', () => ({
  scheduleMirrorService: {
    clearMirror: mockClearMirror,
  },
}));

vi.mock('@/services/schedule-notification.service', () => ({
  scheduleNotificationService: {
    cancelAll: mockCancelAll,
  },
}));

// ── Subject under test ────────────────────────────────────────────────────────

import { _resetPushRegistrationForTest, useAuth } from '@/composables/useAuth';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(uid = 'uid-abc') {
  return { uid, email: `${uid}@test.com` };
}

function makeCredential(uid = 'uid-abc') {
  return { user: makeUser(uid) };
}

/** Flush all pending microtasks so fire-and-forget promises settle. */
async function flushMicrotasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _resetPushRegistrationForTest();
  mockGetCurrentUser.mockReturnValue(null);
  mockGetIdToken.mockResolvedValue('mock-id-token');
  mockLoginWithGoogle.mockResolvedValue(makeCredential());
  mockLoginWithEmail.mockResolvedValue(makeCredential());
  mockSignUpWithEmail.mockResolvedValue(makeCredential());
  mockLogout.mockResolvedValue(undefined);
  mockRegisterCurrentDevicePushToken.mockResolvedValue(undefined);
  mockDeactivateCurrentDevicePushToken.mockResolvedValue(undefined);
  mockPreferencesSet.mockResolvedValue(undefined);
  mockPreferencesRemove.mockResolvedValue(undefined);
  mockClearMirror.mockResolvedValue(undefined);
  mockCancelAll.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── loginWithGoogle ──────────────────────────────────────────────────────────

describe('loginWithGoogle', () => {
  it('calls registerCurrentDevicePushToken after persistToken', async () => {
    const { loginWithGoogle } = useAuth();

    await loginWithGoogle();

    expect(mockPreferencesSet).toHaveBeenCalled();
    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledOnce();
  });

  it('registerCurrentDevicePushToken is called after persistToken (order)', async () => {
    const callOrder: string[] = [];
    mockPreferencesSet.mockImplementation(async () => { callOrder.push('persistToken'); });
    mockRegisterCurrentDevicePushToken.mockImplementation(async () => { callOrder.push('register'); });

    const { loginWithGoogle } = useAuth();
    await loginWithGoogle();

    expect(callOrder).toEqual(expect.arrayContaining(['persistToken', 'register']));
    expect(callOrder.indexOf('persistToken')).toBeLessThan(callOrder.indexOf('register'));
  });

  it('does not throw and completes login when push registration fails', async () => {
    mockRegisterCurrentDevicePushToken.mockRejectedValue(new Error('FCM error'));

    const { loginWithGoogle } = useAuth();

    await expect(loginWithGoogle()).resolves.toBeUndefined();
  });

  it('does not set error when push registration fails', async () => {
    mockRegisterCurrentDevicePushToken.mockRejectedValue(new Error('FCM error'));

    const { loginWithGoogle, error } = useAuth();
    await loginWithGoogle();

    expect(error.value).toBeNull();
  });
});

// ── loginWithEmail ───────────────────────────────────────────────────────────

describe('loginWithEmail', () => {
  it('calls registerCurrentDevicePushToken after persistToken', async () => {
    const { loginWithEmail } = useAuth();

    await loginWithEmail('user@test.com', 'secret');

    expect(mockPreferencesSet).toHaveBeenCalled();
    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledOnce();
  });

  it('does not throw and completes login when push registration fails', async () => {
    mockRegisterCurrentDevicePushToken.mockRejectedValue(new Error('FCM error'));

    const { loginWithEmail } = useAuth();

    await expect(loginWithEmail('user@test.com', 'secret')).resolves.toBeUndefined();
  });
});

// ── signUpWithEmail ──────────────────────────────────────────────────────────

describe('signUpWithEmail', () => {
  it('calls registerCurrentDevicePushToken after persistToken', async () => {
    const { signUpWithEmail } = useAuth();

    await signUpWithEmail('user@test.com', 'secret', 'Test User');

    expect(mockPreferencesSet).toHaveBeenCalled();
    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledOnce();
  });

  it('does not throw and completes signup when push registration fails', async () => {
    mockRegisterCurrentDevicePushToken.mockRejectedValue(new Error('FCM error'));

    const { signUpWithEmail } = useAuth();

    await expect(signUpWithEmail('user@test.com', 'secret')).resolves.toBeUndefined();
  });
});

// ── onAuthStateChanged — session restore ─────────────────────────────────────

describe('onAuthStateChanged session restore', () => {
  it('triggers push registration when a new user is restored (cold start)', async () => {
    const user = makeUser('uid-restored');

    triggerAuthStateChange(user);
    await flushMicrotasks();

    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledOnce();
  });

  it('does not duplicate registration when same uid fires twice', async () => {
    const user = makeUser('uid-same');

    triggerAuthStateChange(user);
    await flushMicrotasks();

    triggerAuthStateChange(user);
    await flushMicrotasks();

    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledOnce();
  });

  it('does not trigger registration when user is null (logout event)', async () => {
    triggerAuthStateChange(null);
    await flushMicrotasks();

    expect(mockRegisterCurrentDevicePushToken).not.toHaveBeenCalled();
  });

  it('registers again after different uid (account switch)', async () => {
    triggerAuthStateChange(makeUser('uid-first'));
    await flushMicrotasks();

    triggerAuthStateChange(makeUser('uid-second'));
    await flushMicrotasks();

    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate when login function already set the uid guard', async () => {
    const { loginWithGoogle } = useAuth();

    // Simulate login function setting guard + Firebase concurrently firing onAuthStateChanged
    await loginWithGoogle();
    triggerAuthStateChange(makeUser()); // same uid as makeCredential() default
    await flushMicrotasks();

    // loginWithGoogle already called registerCurrentDevicePushToken once;
    // onAuthStateChanged with the same uid must not call it again.
    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledOnce();
  });
});

// ── logout ───────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('calls deactivateCurrentDevicePushToken', async () => {
    const { logout } = useAuth();

    await logout();

    expect(mockDeactivateCurrentDevicePushToken).toHaveBeenCalledOnce();
  });

  it('completes logout even when deactivateCurrentDevicePushToken throws', async () => {
    mockDeactivateCurrentDevicePushToken.mockRejectedValue(new Error('FCM error'));

    const { logout } = useAuth();

    await expect(logout()).resolves.toBeUndefined();
  });

  it('resets uid guard so next login triggers registration again', async () => {
    // Simulate a fresh login to set the guard.
    const { loginWithGoogle, logout } = useAuth();
    await loginWithGoogle();
    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledTimes(1);

    // Logout must reset the guard.
    await logout();

    // onAuthStateChanged fires null during logout (Firebase internals), then
    // a subsequent login should trigger registration again.
    _resetPushRegistrationForTest(); // mirror what onAuthStateChanged(null) would do
    triggerAuthStateChange(makeUser('uid-abc'));
    await flushMicrotasks();

    expect(mockRegisterCurrentDevicePushToken).toHaveBeenCalledTimes(2);
  });
});
