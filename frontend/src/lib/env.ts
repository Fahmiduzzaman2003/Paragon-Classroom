import { z } from 'zod'

/**
 * Typed, validated frontend environment.
 *
 * All client-visible vars use Vite's `VITE_` prefix (they end up in the built
 * bundle — never put secrets here). This module fails fast at load with a clear
 * message if a required var is missing in a production build, so a misconfigured
 * Vercel deploy surfaces immediately instead of silently calling localhost.
 */

const DEV = import.meta.env.DEV

const schema = z.object({
  // Backend base URL. Required in production builds; defaults to localhost in dev.
  VITE_API_URL: DEV
    ? z.string().url().default('http://localhost:8000')
    : z.string().url({ message: 'VITE_API_URL must be your Render backend URL' }),
  // Cloudinary public (unsigned) values — optional; uploads fall back to the
  // backend proxy when absent.
  VITE_CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  VITE_CLOUDINARY_UPLOAD_PRESET: z.string().optional().default(''),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  // Thrown at module load; caught by the app's ErrorBoundary with a readable message.
  throw new Error(
    `Invalid frontend environment configuration:\n${issues}\n\n` +
      'Set these in Vercel → Project → Settings → Environment Variables.',
  )
}

export const env = {
  API_URL: parsed.data.VITE_API_URL.replace(/\/$/, ''),
  CLOUDINARY_CLOUD_NAME: parsed.data.VITE_CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET: parsed.data.VITE_CLOUDINARY_UPLOAD_PRESET,
} as const

/** True when direct-to-Cloudinary uploads are configured on the client. */
export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET,
)
