import { Bell, Search, Command, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GlassInput } from '@/components/glass/GlassInput'
import { ThemeToggle } from './ThemeToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import { formatRelative } from '@/lib/utils'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/hooks/useNotifications'

export function Topbar() {
  const [q, setQ] = useState('')
  const { data: notifications = [], isLoading } = useNotifications()
  const { data: unreadCount = 0 } = useUnreadCount()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  return (
    <header className="sticky top-0 z-30 px-4 pt-4 pb-2">
      <div className="glass rounded-2xl px-3 py-2 flex items-center gap-3">
        <div className="flex-1 relative">
          <GlassInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses, materials, threads…"
            leadingIcon={<Search className="h-4 w-4" />}
            trailingIcon={
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Command className="h-3 w-3" />K
              </span>
            }
            className="h-10 border-transparent !bg-transparent"
          />
        </div>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-9 w-9 rounded-full glass glass-hover flex items-center justify-center"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <motion.span
                  layoutId="notif-dot"
                  className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-1 rounded-full bg-rose-500 text-[9px] font-semibold text-white flex items-center justify-center"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <button
                onClick={() => markAll.mutate()}
                className="text-muted-foreground normal-case tracking-normal text-[10px] hover:text-foreground disabled:opacity-50"
                disabled={unreadCount === 0 || markAll.isPending}
              >
                {markAll.isPending ? 'marking…' : `${unreadCount} new`}
              </button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center text-[11px] text-muted-foreground py-6 px-3">
                No notifications yet — graded work and announcements will land here.
              </div>
            ) : (
              <AnimatePresence>
                {notifications.slice(0, 6).map((n, i) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <DropdownMenuItem
                      className="flex-col items-start py-2 gap-0.5"
                      onClick={() => !n.read && markRead.mutate(n.id)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#FF46BE] shrink-0" />
                        )}
                        <span className="text-xs font-medium flex-1 truncate">{n.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatRelative(n.createdAt)}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">
                        {n.body}
                      </span>
                    </DropdownMenuItem>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/app/inbox"
                className="text-[11px] text-muted-foreground hover:text-foreground py-1.5 justify-center"
              >
                View all
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
