import { z } from 'zod'

/**
 * Typed, validated frontend environment.
 *
 * All client-visible vars use Vite's `VITE_` prefix (they end up in the built
 * bundle — never put secrets here; the Firebase web config is public by design).
 *
 * This module must NOT throw at import time (that happens before React mounts,
 * so the ErrorBoundary can't catch it and the page goes blank). It validates
 * leniently and exposes `envError`, which main.tsx renders as a message.
 */

const DEV = import.meta.env.DEV

const schema = z.object({
  VITE_API_URL: z.string().url().optional(),
  VITE_CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  VITE_CLOUDINARY_UPLOAD_PRESET: z.string().optional().default(''),
  // Firebase Auth (public web config). All optional — absence ⇒ legacy auth.
  VITE_FIREBASE_API_KEY: z.string().optional().default(''),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().optional().default(''),
  VITE_FIREBASE_PROJECT_ID: z.string().optional().default(''),
  VITE_FIREBASE_APP_ID: z.string().optional().default(''),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().optional().default(''),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().optional().default(''),
})

const parsed = schema.safeParse(import.meta.env)
const data = parsed.success
  ? parsed.data
  : {
      VITE_API_URL: undefined,
      VITE_CLOUDINARY_CLOUD_NAME: '',
      VITE_CLOUDINARY_UPLOAD_PRESET: '',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '',
      VITE_FIREBASE_STORAGE_BUCKET: '',
    }

const apiUrl = (data.VITE_API_URL || (DEV ? 'http://localhost:8000' : '')).replace(/\/$/, '')

/** Non-null when the app is misconfigured — main.tsx shows this instead of a blank screen. */
export const envError: string | null = apiUrl
  ? null
  : 'VITE_API_URL is not set. In Vercel → Project → Settings → Environment Variables, ' +
    'add VITE_API_URL set to your Render backend URL (e.g. https://your-api.onrender.com), ' +
    'then Redeploy.'

export const env = {
  API_URL: apiUrl,
  CLOUDINARY_CLOUD_NAME: data.VITE_CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET: data.VITE_CLOUDINARY_UPLOAD_PRESET,
} as const

/** True when direct-to-Cloudinary uploads are configured on the client. */
export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET,
)

export const firebaseConfig = {
  apiKey: data.VITE_FIREBASE_API_KEY,
  authDomain: data.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: data.VITE_FIREBASE_PROJECT_ID,
  appId: data.VITE_FIREBASE_APP_ID,
  messagingSenderId: data.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  storageBucket: data.VITE_FIREBASE_STORAGE_BUCKET || undefined,
} as const

/** Firebase Auth is used when the core web-config values are present. */
export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)
