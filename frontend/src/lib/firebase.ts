import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { firebaseConfig, firebaseEnabled } from '@/lib/env'

/**
 * Firebase app + auth, initialized only when a web config is present. When it's
 * not, `auth` is null and the app uses the legacy email/password + dev flow —
 * so local dev and CI need zero Firebase setup.
 */
let app: FirebaseApp | null = null
let auth: Auth | null = null

if (firebaseEnabled) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
}

export { auth, firebaseEnabled }

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

/** A fresh Firebase ID token (the SDK caches + auto-refreshes it), or null. */
export async function getFreshIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth?.currentUser) return null
  try {
    return await auth.currentUser.getIdToken(forceRefresh)
  } catch {
    return null
  }
}
