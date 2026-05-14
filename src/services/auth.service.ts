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
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// ── Backend sync ──────────────────────────────────────────────────────────────

async function syncUserWithBackend(idToken: string): Promise<void> {
  if (!API_BASE_URL) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/firebase`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // Firebase auth succeeded; backend sync is best-effort.
      console.warn('[auth] Backend sync returned', response.status);
    }
  } catch (err) {
    // Network failure — not a reason to abort a successful Firebase login.
    console.warn('[auth] Backend sync failed (network):', err);
  }
}

// ── Token helper ──────────────────────────────────────────────────────────────

async function getIdToken(user?: User | null): Promise<string | null> {
  const currentUser = user ?? auth.currentUser;
  if (!currentUser) return null;
  return currentUser.getIdToken();
}

// ── Google Sign-In ────────────────────────────────────────────────────────────
//
// Strategy:
//   Native (Android / iOS) → @codetrix-studio/capacitor-google-auth
//     Opens the native Google account picker.
//     Returns an ID token which is exchanged for a Firebase credential.
//     Does NOT depend on WebView popups or redirects.
//
//   Web (browser) → Firebase signInWithPopup
//     Standard Firebase popup flow.  Unchanged from before.
//
// Both paths converge on `signInWithCredential` (native) or the credential
// returned by `signInWithPopup` (web), then sync the Firebase ID token with
// the Laravel backend.

async function loginWithGoogle(): Promise<UserCredential> {
  let credential: UserCredential;

  if (Capacitor.isNativePlatform()) {
    // ── Native path ──────────────────────────────────────────────────────────
    // GoogleAuth.signIn() opens the OS-level Google account picker.
    // The returned idToken can be directly exchanged for a Firebase credential.
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
    // ── Web path ─────────────────────────────────────────────────────────────
    const provider = new GoogleAuthProvider();
    credential = await signInWithPopup(auth, provider);
  }

  const idToken = await getIdToken(credential.user);
  if (idToken) {
    await syncUserWithBackend(idToken);
  }

  return credential;
}

// ── Email / Password ──────────────────────────────────────────────────────────

async function loginWithEmail(email: string, password: string): Promise<UserCredential> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await getIdToken(credential.user);

  if (idToken) {
    await syncUserWithBackend(idToken);
  }

  return credential;
}

async function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const idToken = await getIdToken(credential.user);

  if (idToken) {
    await syncUserWithBackend(idToken);
  }

  return credential;
}

// ── Session ───────────────────────────────────────────────────────────────────

async function logout(): Promise<void> {
  // Sign out of Google as well so the next sign-in shows the account picker
  // rather than silently re-using the last account.
  if (Capacitor.isNativePlatform()) {
    try {
      await GoogleAuth.signOut();
    } catch {
      // Ignore — GoogleAuth may not be initialised if user never signed in with Google.
    }
  }
  return signOut(auth);
}

function getCurrentUser(): User | null {
  return auth.currentUser;
}

async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const authService = {
  loginWithGoogle,
  loginWithEmail,
  signUpWithEmail,
  logout,
  getCurrentUser,
  getIdToken,
  requestPasswordReset,
};
