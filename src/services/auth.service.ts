import {
  GoogleAuthProvider,
  User,
  UserCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function syncUserWithBackend(idToken: string): Promise<void> {
  if (!API_BASE_URL) {
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/firebase`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to validate Firebase token on backend');
  }
}

async function getIdToken(user?: User | null): Promise<string | null> {
  const currentUser = user ?? auth.currentUser;

  if (!currentUser) {
    return null;
  }

  return currentUser.getIdToken();
}

async function loginWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  const idToken = await getIdToken(credential.user);

  if (idToken) {
    await syncUserWithBackend(idToken);
  }

  return credential;
}

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

function logout(): Promise<void> {
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
};
