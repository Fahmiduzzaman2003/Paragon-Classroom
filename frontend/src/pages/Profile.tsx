import { motion } from 'framer-motion'
import { Camera, Mail, Building2, Pencil, Award, Sparkles } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Label } from '@/components/ui/Label'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/authStore'
import { initials } from '@/lib/utils'
import { useCourses } from '@/hooks/useCourses'
import { toast } from 'sonner'

export function Profile() {
  const user = useAuthStore((s) => s.user)
  const { data: courses = [] } = useCourses()
  if (!user) return null

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
                <AvatarFallback className="text-xl">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <button className="absolute bottom-0 right-0 h-7 w-7 rounded-full glass-strong flex items-center justify-center">
                <Camera className="h-3.5 w-3.5" />
              </button>
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
                  <Building2 className="h-3 w-3" /> {user.institution}
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
            <GlassButton
              variant="glass"
              size="sm"
              onClick={() => toast.success('Changes saved')}
            >
              <Pencil className="h-3.5 w-3.5" /> Save
            </GlassButton>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Full name</Label>
              <GlassInput defaultValue={user.name} />
            </div>
            <div>
              <Label className="mb-1.5 block">Email</Label>
              <GlassInput defaultValue={user.email} type="email" />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Institution</Label>
              <GlassInput defaultValue={user.institution} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Bio</Label>
              <GlassTextarea defaultValue={user.bio} rows={4} />
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
