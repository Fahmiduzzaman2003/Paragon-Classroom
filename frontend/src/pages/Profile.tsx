import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Camera,
  Mail,
  Building2,
  Pencil,
  Award,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Label } from '@/components/ui/Label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/authStore'
import { initials } from '@/lib/utils'
import { useCourses } from '@/hooks/useCourses'
import { useCloudinaryUpload } from '@/hooks/useCloudinaryUpload'
import { api } from '@/lib/api'
import { toast } from 'sonner'

/** Subset of fields the user can edit from the Profile page. */
type ProfileUpdate = {
  name?: string
  bio?: string
  institution?: string
  avatar_url?: string
}

export function Profile() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const { data: courses = [] } = useCourses()
  const cloudinary = useCloudinaryUpload()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Local form state mirrors the user record. Keeps the inputs controlled so
  // Save can PATCH only what actually changed.
  const [name, setName] = useState(user?.name ?? '')
  const [institution, setInstitution] = useState(user?.institution ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [saving, setSaving] = useState(false)

  // If the user record is rehydrated after mount (or refreshMe fetches fresh
  // data), resync the local form fields so the inputs don't drift.
  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setInstitution(user.institution ?? '')
      setBio(user.bio ?? '')
    }
  }, [user?.id, user?.name, user?.institution, user?.bio])

  if (!user) return null

  /** Hidden <input type="file"> click helper. */
  const pickFile = () => fileInputRef.current?.click()

  /** Validates, uploads to Cloudinary, and PATCHes the URL onto the user. */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    // Allow re-picking the same file later.
    e.target.value = ''
    if (!file) return

    const url = await cloudinary.uploadWithToast(file)
    if (!url) return

    try {
      const { data } = await api.patch<{ avatar_url: string }>('/auth/me', {
        avatar_url: url,
      })
      // Reflect the new avatar everywhere via the auth store. The Sidebar and
      // Topbar both read from this same store, so the update is global.
      setUser({ ...user, avatarUrl: data.avatar_url })
      toast.success('Profile picture updated.')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save the new picture.',
      )
    }
  }

  /** PATCH /auth/me with whichever fields the user actually changed. */
  const save = async () => {
    const payload: ProfileUpdate = {}
    if (name.trim() && name.trim() !== user.name) payload.name = name.trim()
    if ((institution ?? '') !== (user.institution ?? '')) {
      payload.institution = institution.trim()
    }
    if ((bio ?? '') !== (user.bio ?? '')) payload.bio = bio

    if (Object.keys(payload).length === 0) {
      toast.info('Nothing to save.')
      return
    }

    setSaving(true)
    try {
      const { data } = await api.patch('/auth/me', payload)
      // Backend returns the full updated user — merge into the store.
      setUser({
        ...user,
        name: data.name,
        institution: data.institution,
        bio: data.bio,
        avatarUrl: data.avatar_url ?? user.avatarUrl,
      })
      toast.success('Changes saved.')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save your changes.',
      )
    } finally {
      setSaving(false)
    }
  }

  /** Removes the avatar (sets it to null on the backend). */
  const removeAvatar = async () => {
    try {
      const { data } = await api.patch<{ avatar_url: string | null }>('/auth/me', {
        avatar_url: null,
      })
      setUser({ ...user, avatarUrl: data.avatar_url ?? undefined })
      toast.success('Profile picture removed.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove picture.')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Banner */}
      <GlassCard padding="none" className="relative overflow-hidden">
        <div className="h-36 bg-[linear-gradient(120deg,#815AFF_0%,#FF46BE_55%,#00C8FF_100%)] relative">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>
        <div className="px-5 pb-5 -mt-10 relative">
          <div className="flex items-end gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-4 ring-background">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="text-xl">{initials(user.name)}</AvatarFallback>
              </Avatar>

              {/* Camera button — the only thing that opens the picker. */}
              <button
                type="button"
                onClick={pickFile}
                disabled={cloudinary.uploading}
                className="absolute bottom-0 right-0 h-7 w-7 rounded-full glass-strong flex items-center justify-center hover:scale-105 active:scale-95 transition disabled:opacity-60"
                aria-label="Change profile picture"
                title="Change profile picture"
              >
                {cloudinary.uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Show a small "remove" pill next to the avatar once a picture exists. */}
              {user.avatarUrl && !cloudinary.uploading && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-rose-500/90 text-white flex items-center justify-center hover:bg-rose-500 transition"
                  aria-label="Remove profile picture"
                  title="Remove profile picture"
                >
                  <X className="h-3 w-3" />
                </button>
              )}

              {/* Upload progress strip */}
              {cloudinary.uploading && (
                <div className="absolute -bottom-3 left-0 right-0 h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#815AFF] via-[#FF46BE] to-[#00C8FF]"
                    initial={{ width: 0 }}
                    animate={{ width: `${cloudinary.progress}%` }}
                    transition={{ ease: 'linear' }}
                  />
                </div>
              )}

              {/* Hidden file picker. accept restricts the chooser to images. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl font-semibold">{user.name}</h1>
                <Badge variant="primary" className="capitalize">
                  {user.role}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {user.email}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {user.institution || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        {/* Edit form */}
        <GlassCard padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold">Profile details</h2>
            <GlassButton variant="glass" size="sm" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pencil className="h-3.5 w-3.5" />
              )}
              Save
            </GlassButton>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Full name</Label>
              <GlassInput value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Email</Label>
              <GlassInput value={user.email} type="email" disabled />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Institution</Label>
              <GlassInput
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. University of Dhaka"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Bio</Label>
              <GlassTextarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="Tell classmates a bit about yourself…"
              />
            </div>
          </div>
        </GlassCard>

        {/* Side */}
        <div className="space-y-4">
          <GlassCard padding="md">
            <h3 className="font-display text-sm font-semibold flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4" /> Your courses
            </h3>
            <ul className="space-y-2">
              {courses.slice(0, 4).map((c) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5"
                >
                  <span
                    className="h-7 w-7 rounded-lg text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
                    }}
                  >
                    {c.aiName.split(' ')[0]?.[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.aiName}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard padding="md">
            <h3 className="font-display text-sm font-semibold flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-amber-300" /> Achievements
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {['7-day streak', 'First A', 'Top 5', 'Uploader', 'Forum answer', 'Early bird'].map(
                (a) => (
                  <div
                    key={a}
                    className="aspect-square rounded-xl glass flex flex-col items-center justify-center p-1"
                  >
                    <Award className="h-4 w-4 text-amber-300 mb-0.5" />
                    <span className="text-[9px] text-center leading-tight">{a}</span>
                  </div>
                ),
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
