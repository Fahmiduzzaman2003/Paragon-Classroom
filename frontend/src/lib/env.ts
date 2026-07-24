import { z } from 'zod'

/**
 * Typed, validated frontend environment.
 *
 * All client-visible vars use Vite's `VITE_` prefix (they end up in the built
 * bundle — never put secrets here).
 *
 * IMPORTANT: this module must NOT throw at import time. A throw here happens
 * before React mounts, so the ErrorBoundary can't catch it and the user just
 * sees a blank page. Instead we validate leniently and expose `envError`, which
 * main.tsx renders as a readable message.
 */

const DEV = import.meta.env.DEV

const schema = z.object({
  VITE_API_URL: z.string().url().optional(),
  VITE_CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  VITE_CLOUDINARY_UPLOAD_PRESET: z.string().optional().default(''),
})

const parsed = schema.safeParse(import.meta.env)
const data = parsed.success
  ? parsed.data
  : { VITE_API_URL: undefined, VITE_CLOUDINARY_CLOUD_NAME: '', VITE_CLOUDINARY_UPLOAD_PRESET: '' }

// Dev defaults to localhost; production requires an explicit backend URL.
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
