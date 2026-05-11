import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquareText,
  CalendarDays,
  Trophy,
  User2,
  Settings2,
  Sparkles,
  LogOut,
  Palette,
  BookOpen,
  KeyRound,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn, initials } from '@/lib/utils'
import { Logo } from './Logo'
import { useAuthStore } from '@/stores/authStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { useCourses } from '@/hooks/useCourses'

const primaryNav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/inbox', label: 'Messages', icon: MessageSquareText },
  { to: '/app/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/app/exam/join', label: 'Join exam', icon: KeyRound },
]

const secondaryNav = [
  { to: '/app/profile', label: 'Profile', icon: User2 },
  { to: '/app/design-system', label: 'Design system', icon: Palette },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
]

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const { data: courses = [] } = useCourses()

  return (
    <aside className="hidden lg:flex flex-col h-screen sticky top-0 w-[252px] shrink-0 p-4">
      <div className="glass glass-hover rounded-3xl h-full flex flex-col p-3 overflow-hidden">
        {/* Brand */}
        <div className="px-2 py-2">
          <NavLink to="/app" className="inline-flex">
            <Logo />
          </NavLink>
        </div>

        {/* Primary nav */}
        <nav className="mt-4 flex flex-col gap-0.5">
          {primaryNav.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        {/* My Courses */}
        <div className="mt-5 px-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              My Courses
            </span>
            <span className="text-[10px] text-muted-foreground">{courses.length}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {courses.slice(0, 4).map((c) => (
              <NavLink
                key={c.id}
                to={`/app/courses/${c.id}`}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-xs transition-colors',
                    isActive
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                  )
                }
              >
                <span
                  className="h-6 w-6 rounded-lg ring-1 ring-white/10 shrink-0 flex items-center justify-center text-[10px] font-semibold text-white shadow-[0_2px_10px_-2px_rgba(0,0,0,0.35)]"
                  style={{
                    background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
                  }}
                >
                  {c.aiName.split(' ')[0]?.[0]}
                </span>
                <span className="truncate flex-1">{c.name}</span>
                {c.unread > 0 && (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-rose-400/90 text-[9px] font-semibold flex items-center justify-center text-white">
                    {c.unread}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* AI Upsell chip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative mx-1 mb-3 rounded-2xl p-3 overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, rgba(129,90,255,0.18), rgba(255,70,190,0.18) 50%, rgba(0,200,255,0.18))',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-white" />
            <span className="text-[11px] font-semibold">Dedicated course AIs</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Every classroom has its own assistant trained on that course's materials.
          </p>
        </motion.div>

        {/* Secondary nav */}
        <nav className="flex flex-col gap-0.5 border-t border-white/5 pt-2">
          {secondaryNav.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        {/* User */}
        <div className="mt-2 flex items-center gap-2 p-2 rounded-2xl glass">
          <Avatar className="h-8 w-8">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
            <AvatarFallback>{initials(user?.name ?? 'U')}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{user?.name}</div>
            <div className="text-[10px] text-muted-foreground capitalize">{user?.role}</div>
          </div>
          <button
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors',
          isActive
            ? 'text-foreground bg-white/10'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-white/8"
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            />
          )}
          <Icon className="relative h-4 w-4" />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Mobile nav shown at the bottom of the viewport on small screens. */
export function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-3 left-3 right-3 z-40 glass-strong rounded-2xl px-2 py-2 flex items-center justify-around">
      {[
        { to: '/app', icon: LayoutDashboard, end: true, label: 'Home' },
        { to: '/app/calendar', icon: CalendarDays, label: 'Calendar' },
        { to: '/app/inbox', icon: BookOpen, label: 'Inbox' },
        { to: '/app/leaderboard', icon: Trophy, label: 'Ranks' },
        { to: '/app/profile', icon: User2, label: 'Me' },
      ].map(({ to, icon: Icon, end, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px]',
              isActive ? 'text-foreground' : 'text-muted-foreground',
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
