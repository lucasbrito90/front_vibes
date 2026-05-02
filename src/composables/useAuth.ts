import { computed, ref } from 'vue';
import { User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Preferences } from '@capacitor/preferences';
import { authService } from '@/services/auth.service';
import { auth } from '@/services/firebase';

const TOKEN_KEY = 'firebase_id_token';

const currentUser = ref<User | null>(authService.getCurrentUser());
const loading = ref(false);
const error = ref<string | null>(null);

onAuthStateChanged(auth, (user) => {
  currentUser.value = user;
});

async function persistToken(token: string | null): Promise<void> {
  if (!token) {
    await Preferences.remove({ key: TOKEN_KEY });
    return;
  }

  await Preferences.set({ key: TOKEN_KEY, value: token });
}

function toFriendlyAuthError(err: unknown): string {
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
      return 'Login popup was closed before finishing.';
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

async function signUpWithEmail(email: string, password: string): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const credential = await authService.signUpWithEmail(email, password);
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
    await persistToken(null);
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
