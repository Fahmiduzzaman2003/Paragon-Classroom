import { useState } from 'react'
import { toast } from 'sonner'
import { env } from '@/lib/env'

/**
 * Direct-to-Cloudinary unsigned upload. The browser POSTs the picked file to
 * Cloudinary's `/v1_1/<cloud>/image/upload` endpoint using an unsigned preset;
 * the response contains a `secure_url` we can persist on the user.
 *
 * Required env vars (add to `.env.local` AND Vercel/Render env):
 *   VITE_CLOUDINARY_CLOUD_NAME    e.g. "paragon"
 *   VITE_CLOUDINARY_UPLOAD_PRESET e.g. "paragon_profile"  (unsigned)
 *
 * How to create the unsigned preset (one-time setup, free):
 *   1. cloudinary.com → Media Library → Settings → Upload → Upload presets
 *   2. Add preset → Signing Mode = "Unsigned"
 *   3. Folder = "paragon/profile_pictures" (keeps the dashboard clean)
 *   4. Transformations: e_guetzli is OFF. Add a sane cap (max 8 MB,
 *      max 2000x2000) and an eager transformation for AVIF/WebP if you want.
 */
export function useCloudinaryUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const cloud = env.CLOUDINARY_CLOUD_NAME || undefined
  const preset = env.CLOUDINARY_UPLOAD_PRESET || undefined

  /**
   * Upload a single file. Returns the secure_url on success, or throws.
   * Validates type & size before posting so we don't waste bandwidth.
   */
  async function upload(file: File): Promise<string> {
    if (!cloud || !preset) {
      throw new Error(
        'Cloudinary env vars missing. Set VITE_CLOUDINARY_CLOUD_NAME and ' +
          'VITE_CLOUDINARY_UPLOAD_PRESET in .env.local.',
      )
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose an image file (PNG, JPEG, WebP, GIF).')
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Image is too large — please keep it under 8 MB.')
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('upload_preset', preset)
    // An optional public id keeps the URL predictable — uncomment if you want
    // every user to overwrite their old picture deterministically:
    // fd.append('public_id', `paragon/profile_pictures/${userId}`)

    setUploading(true)
    setProgress(0)
    try {
      // XHR (not fetch) so we can show a real upload progress %.
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud}/image/upload`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const body = JSON.parse(xhr.responseText) as { secure_url?: string; url?: string }
              resolve(body.secure_url ?? body.url ?? '')
            } catch {
              reject(new Error('Cloudinary returned an unparseable response.'))
            }
          } else {
            // Surface the actual error so misconfigured presets are obvious.
            try {
              const body = JSON.parse(xhr.responseText) as { error?: { message?: string } }
              reject(new Error(body.error?.message ?? `Upload failed (${xhr.status})`))
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`))
            }
          }
        }
        xhr.onerror = () => reject(new Error('Network error talking to Cloudinary.'))
        xhr.send(fd)
      })
      if (!url) throw new Error('Cloudinary returned no URL.')
      return url
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  /**
   * Helper that surfaces failures via Sonner toasts and returns the URL or null.
   */
  async function uploadWithToast(file: File): Promise<string | null> {
    try {
      const url = await upload(file)
      return url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.')
      return null
    }
  }

  return { upload, uploadWithToast, uploading, progress, cloud, preset }
}
