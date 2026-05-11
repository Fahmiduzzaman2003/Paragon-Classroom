import { motion } from 'framer-motion'
import { BellRing, Check, Loader2 } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications'
import { cn, formatRelative } from '@/lib/utils'
import { toast } from 'sonner'

export function Inbox() {
  const { data = [], isLoading } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const unread = data.filter((n) => !n.read).length

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inbox</h1>
          <p className="text-xs text-muted-foreground">
            {unread > 0 ? `${unread} unread` : 'All caught up'} · across all your courses.
          </p>
        </div>
        <GlassButton
          variant="glass"
          size="sm"
          disabled={markAll.isPending || unread === 0}
          onClick={() =>
            markAll
              .mutateAsync()
              .then(() => toast.success('Marked all as read'))
              .catch(() => toast.error('Failed to mark all read'))
          }
        >
          {markAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Mark all read
        </GlassButton>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : data.length === 0 ? (
        <GlassCard padding="lg" className="text-center border-dashed border-white/10">
          <p className="text-sm text-muted-foreground">
            Nothing here yet — graded work, mentions, and announcements will land here.
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding="none" className="overflow-hidden">
          <ul className="divide-y divide-white/5">
            {data.map((n, i) => (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'flex items-start gap-3 p-4 transition cursor-pointer',
                  !n.read && 'bg-[linear-gradient(90deg,rgba(129,90,255,0.08),transparent)]',
                  'hover:bg-white/5',
                )}
                onClick={() => !n.read && markRead.mutate(n.id)}
              >
                <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-[#FF46BE]" />}
                    <span className="text-sm font-medium">{n.title}</span>
                    {n.courseName && <Badge variant="default">{n.courseName}</Badge>}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  )
}
