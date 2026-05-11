import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Switch } from '@/components/ui/Switch'
import { Label } from '@/components/ui/Label'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'

export function Settings() {
  const { theme, setTheme } = useUIStore()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">Manage appearance, notifications, and account.</p>
      </div>

      <GlassCard padding="lg">
        <h2 className="font-display text-sm font-semibold mb-4">Appearance</h2>
        <Row label="Dark mode" hint="Uses deep indigo base with color-rich glass surfaces.">
          <Switch checked={theme === 'dark'} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} />
        </Row>
        <Row label="Reduced motion" hint="Respects system preference automatically.">
          <Switch defaultChecked />
        </Row>
      </GlassCard>

      <GlassCard padding="lg">
        <h2 className="font-display text-sm font-semibold mb-4">Notifications</h2>
        <Row label="Announcements" hint="Pinned posts from teachers."><Switch defaultChecked /></Row>
        <Row label="Graded assignments" hint="Alert when grades are released."><Switch defaultChecked /></Row>
        <Row label="Forum mentions" hint="@mentions across all your courses."><Switch defaultChecked /></Row>
        <Row label="Quiz reminders" hint="24h before a quiz opens."><Switch /></Row>
      </GlassCard>

      <GlassCard padding="lg">
        <h2 className="font-display text-sm font-semibold mb-4">Account</h2>
        <div className="flex flex-wrap items-center gap-2">
          <GlassButton variant="glass">Change password</GlassButton>
          <GlassButton variant="glass">Export data</GlassButton>
          <GlassButton
            variant="destructive"
            className="ml-auto"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sign out
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0 border-white/5">
      <div>
        <Label className="text-sm text-foreground font-medium">{label}</Label>
        <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
      </div>
      {children}
    </div>
  )
}
