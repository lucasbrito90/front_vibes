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

const currentUser = ref<User | null>(authService.getCurrentUser());
const loading = ref(false);
const error = ref<string | null>(null);

onAuthStateChanged(auth, (user) => {
  currentUser.value = user;
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
