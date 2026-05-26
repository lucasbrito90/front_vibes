import {
  GoogleAuthProvider,
  User,
  UserCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { shallowRef } from 'vue';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { auth } from './firebase';

/** Stored Firebase ID token for native/offline-adjacent flows (mirrored by useAuth). */
export const FIREBASE_TOKEN_PREFS_KEY = 'firebase_id_token';

export type LaravelUser = {
  id: number;
  firebase_uid: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  admin_access_status: string;
};

export const LARAVEL_SYNC_FAILURE_MESSAGE =
  'We could not finish setting up your account. Please try again.';

export class LaravelSyncError extends Error {
  constructor(
    message: string,
    public readonly causeDetail?: unknown,
  ) {
    super(message);
    this.name = 'LaravelSyncError';
  }
}

/** Laravel profile returned by the last successful `/api/auth/sync`. */
export const laravelUser = shallowRef<LaravelUser | null>(null);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

/** Firebase UID for which `laravelUser` was populated this session. */
let syncedFirebaseUid: string | null = null;

const DEFAULT_FIREBASE_AUTH_WAIT_MS = 15_000;

/** Thrown when a protected API call cannot obtain a Firebase ID token (signed out or auth not restored in time). */
export class FirebaseAuthNotReadyError extends Error {
  constructor(message = 'Not signed in. Sign in again to continue.') {
    super(message);
    this.name = 'FirebaseAuthNotReadyError';
  }
}

let firebaseUserWaitInflight: Promise<User | null> | null = null;

/**
 * Resolves once Firebase has finished restoring auth state (`auth.authStateReady()`),
 * capped by `timeoutMs`. Afterwards reads `auth.currentUser` so protected callers avoid
 * sending requests without a Bearer token immediately after reload / navigation.
 *
 * Dedupes concurrent waiters onto a single pending promise.
 */
export async function waitForFirebaseUser(
  timeoutMs: number = DEFAULT_FIREBASE_AUTH_WAIT_MS,
): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!firebaseUserWaitInflight) {
    firebaseUserWaitInflight = (async (): Promise<User | null> => {
      await Promise.race([
        auth.authStateReady(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, timeoutMs);
        }),
      ]);
      return auth.currentUser;
    })().finally(() => {
      firebaseUserWaitInflight = null;
    });
  }

  return firebaseUserWaitInflight;
}

/**
 * Ensures Firebase has restored `currentUser`, then returns a Firebase ID token.
 * Use for protected Laravel routes so requests never omit `Authorization`.
 */
export async function getRequiredIdToken(
  timeoutMs: number = DEFAULT_FIREBASE_AUTH_WAIT_MS,
): Promise<string> {
  const user = await waitForFirebaseUser(timeoutMs);
  if (!user) {
    throw new FirebaseAuthNotReadyError();
  }
  const token = await user.getIdToken();
  if (!token) {
    throw new FirebaseAuthNotReadyError('No Firebase ID token available.');
  }
  return token;
}

function clearBackendSession(): void {
  syncedFirebaseUid = null;
  laravelUser.value = null;
}

function logDev(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn('[auth]', ...args);
  }
}

async function abortFirebaseSessionAfterFailedSync(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await GoogleAuth.signOut();
    } catch {
      // Ignore — GoogleAuth may not be initialised if user never signed in with Google.
    }
  }
  await signOut(auth);
}

async function syncUserWithBackend(idToken: string, firebaseUid: string): Promise<LaravelUser> {
  const base = API_BASE_URL?.trim();
  if (!base) {
    logDev('Laravel sync: VITE_API_BASE_URL is not set');
    throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, new Error('VITE_API_BASE_URL missing'));
  }

  const url = `${base.replace(/\/$/, '')}/api/auth/sync`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    logDev('Laravel sync network error', err);
    throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, err);
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* ignore */
    }
    logDev('Laravel sync HTTP error', response.status, body);
    throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, { status: response.status, body });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    logDev('Laravel sync invalid JSON', err);
    throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, err);
  }

  const data = (json as { data?: LaravelUser }).data;
  if (!data || typeof data.id !== 'number' || typeof data.firebase_uid !== 'string') {
    logDev('Laravel sync unexpected payload', json);
    throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, json);
  }

  laravelUser.value = data;
  syncedFirebaseUid = firebaseUid;
  return data;
}

/**
 * Ensures the Laravel user row exists for the signed-in Firebase user (cached per UID).
 * Used by the router before protected routes and after cold start.
 */
export async function ensureLaravelUserSynced(user: User): Promise<LaravelUser> {
  if (syncedFirebaseUid === user.uid && laravelUser.value) {
    return laravelUser.value;
  }

  const idToken = await user.getIdToken();
  if (!idToken) {
    throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, new Error('No ID token'));
  }

  return syncUserWithBackend(idToken, user.uid);
}

async function getIdToken(user?: User | null): Promise<string | null> {
  const currentUser = user ?? auth.currentUser;
  if (!currentUser) return null;
  return currentUser.getIdToken();
}

async function finalizeFirebaseLogin(credential: UserCredential): Promise<UserCredential> {
  try {
    const idToken = await getIdToken(credential.user);
    if (!idToken) {
      throw new LaravelSyncError(LARAVEL_SYNC_FAILURE_MESSAGE, new Error('No ID token'));
    }
    await syncUserWithBackend(idToken, credential.user.uid);
    return credential;
  } catch (err) {
    await abortFirebaseSessionAfterFailedSync();
    throw err;
  }
}

async function loginWithGoogle(): Promise<UserCredential> {
  let credential: UserCredential;

  if (Capacitor.isNativePlatform()) {
    const googleUser = await GoogleAuth.signIn();
    const idToken = googleUser.authentication?.idToken;

    if (!idToken) {
      throw new Error(
        'Google Sign-In succeeded but did not return an ID token. ' +
          'Verify that VITE_GOOGLE_WEB_CLIENT_ID is set to the correct Web Client ID.',
      );
    }

    const googleCredential = GoogleAuthProvider.credential(idToken);
    credential = await signInWithCredential(auth, googleCredential);
  } else {
    const provider = new GoogleAuthProvider();
    credential = await signInWithPopup(auth, provider);
  }

  return finalizeFirebaseLogin(credential);
}

async function loginWithEmail(email: string, password: string): Promise<UserCredential> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return finalizeFirebaseLogin(credential);
}

async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName?.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  await credential.user.getIdToken(true);

  return finalizeFirebaseLogin(credential);
}

async function logout(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await GoogleAuth.signOut();
    } catch {
      // Ignore — GoogleAuth may not be initialised if user never signed in with Google.
    }
  }

  clearBackendSession();

  try {
    await Preferences.remove({ key: FIREBASE_TOKEN_PREFS_KEY });
  } catch {
    /* Preferences unavailable — non-fatal */
  }

  return signOut(auth);
}

function getCurrentUser(): User | null {
  return auth.currentUser;
}

async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export const authService = {
  loginWithGoogle,
  loginWithEmail,
  signUpWithEmail,
  logout,
  getCurrentUser,
  getIdToken,
  requestPasswordReset,
  ensureLaravelUserSynced,
  waitForFirebaseUser,
  getRequiredIdToken,
};
