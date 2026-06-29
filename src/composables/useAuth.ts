import { computed, readonly, ref } from 'vue';
import { User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Preferences } from '@capacitor/preferences';
import {
  authService,
  FIREBASE_TOKEN_PREFS_KEY,
  LaravelSyncError,
  laravelUser,
} from '@/services/auth.service';
import { auth } from '@/services/firebase';
import { scheduleMirrorService } from '@/services/schedule-mirror.service';
import { scheduleNotificationService } from '@/services/schedule-notification.service';
import { pushTokenService } from '@/services/push-token.service';

const currentUser = ref<User | null>(authService.getCurrentUser());
const loading = ref(false);
const error = ref<string | null>(null);

// Guards against registering the same device more than once per authenticated
// session. Reset to null on logout so the next login triggers registration again.
// Also used to skip the onAuthStateChanged callback when the login functions
// already awaited registration (prevents duplicate calls on fresh login).
let _lastPushRegistrationUid: string | null = null;

async function registerPushTokenAfterAuth(): Promise<void> {
  try {
    await pushTokenService.registerCurrentDevicePushToken();
  } catch {
    // non-fatal — push registration must never block or fail authentication
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser.value = user;

  if (!user) {
    _lastPushRegistrationUid = null;
    return;
  }

  // Session restore (cold start / reload): login functions set the uid guard
  // before calling registerPushTokenAfterAuth, so this branch only fires when
  // the session is already authenticated but no registration has occurred yet
  // (e.g. after a hard reload where onAuthStateChanged is the only auth event).
  if (user.uid !== _lastPushRegistrationUid) {
    _lastPushRegistrationUid = user.uid;
    void registerPushTokenAfterAuth();
  }
});

async function persistToken(token: string | null): Promise<void> {
  if (!token) {
    await Preferences.remove({ key: FIREBASE_TOKEN_PREFS_KEY });
    return;
  }

  await Preferences.set({ key: FIREBASE_TOKEN_PREFS_KEY, value: token });
}

function toFriendlyAuthError(err: unknown): string {
  if (err instanceof LaravelSyncError) {
    return err.message;
  }

  if (err instanceof Error) {
    const msg = err.message ?? '';
    if (
      msg.includes('SIGN_IN_CANCELLED') ||
      msg.includes('12501') ||
      msg.includes('canceled') ||
      msg.includes('cancelled')
    ) {
      return 'Sign-in was cancelled.';
    }
    if (msg.includes('NETWORK_ERROR') || msg.includes('7:')) {
      return 'Network error. Check your connection and try again.';
    }
    if (msg.includes('ID token')) {
      return 'Google Sign-In configuration error. Please contact support.';
    }
  }

  if (!(err instanceof FirebaseError)) {
    return 'Something went wrong. Please try again.';
  }

  switch (err.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'This email is already in use.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Unable to complete authentication. Please try again.';
  }
}

async function loginWithGoogle(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const credential = await authService.loginWithGoogle();
    currentUser.value = credential.user;
    const token = await authService.getIdToken(credential.user);
    await persistToken(token);
    // Set the guard before awaiting so onAuthStateChanged (which may fire
    // concurrently) does not issue a duplicate registration for the same uid.
    _lastPushRegistrationUid = credential.user.uid;
    await registerPushTokenAfterAuth();
  } catch (err) {
    error.value = toFriendlyAuthError(err);
    throw err;
  } finally {
    loading.value = false;
  }
}

async function loginWithEmail(email: string, password: string): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const credential = await authService.loginWithEmail(email, password);
    currentUser.value = credential.user;
    const token = await authService.getIdToken(credential.user);
    await persistToken(token);
    _lastPushRegistrationUid = credential.user.uid;
    await registerPushTokenAfterAuth();
  } catch (err) {
    error.value = toFriendlyAuthError(err);
    throw err;
  } finally {
    loading.value = false;
  }
}

async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const credential = await authService.signUpWithEmail(email, password, displayName);
    currentUser.value = credential.user;
    const token = await authService.getIdToken(credential.user);
    await persistToken(token);
    _lastPushRegistrationUid = credential.user.uid;
    await registerPushTokenAfterAuth();
  } catch (err) {
    error.value = toFriendlyAuthError(err);
    throw err;
  } finally {
    loading.value = false;
  }
}

async function requestPasswordReset(email: string): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    await authService.requestPasswordReset(email);
  } catch (err) {
    error.value = toFriendlyAuthError(err);
    throw err;
  } finally {
    loading.value = false;
  }
}

async function getIdToken(): Promise<string | null> {
  return authService.getIdToken(currentUser.value);
}

async function logout(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    await authService.logout();
    currentUser.value = null;
    _lastPushRegistrationUid = null;
    try {
      await pushTokenService.deactivateCurrentDevicePushToken();
    } catch {
      /* non-fatal — avoid blocking logout */
    }
    try {
      await scheduleMirrorService.clearMirror();
    } catch {
      /* non-fatal — avoid blocking logout */
    }
    try {
      await scheduleNotificationService.cancelAll();
    } catch {
      /* non-fatal — avoid blocking logout */
    }
  } catch (err) {
    error.value = toFriendlyAuthError(err);
    throw err;
  } finally {
    loading.value = false;
  }
}

function getCurrentUser(): User | null {
  return currentUser.value;
}

const isAuthenticated = computed(() => Boolean(currentUser.value));

/** Vitest only — reset the push registration uid guard between tests. */
export function _resetPushRegistrationForTest(): void {
  _lastPushRegistrationUid = null;
}

export function useAuth() {
  return {
    currentUser,
    laravelUser: readonly(laravelUser),
    isAuthenticated,
    loading,
    error,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    requestPasswordReset,
    logout,
    getCurrentUser,
    getIdToken,
  };
}
