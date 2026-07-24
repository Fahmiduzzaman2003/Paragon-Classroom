import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Crown, Medal, Trophy } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { GlassCard } from '@/components/glass/GlassCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCourses } from '@/hooks/useCourses'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { cn, initials } from '@/lib/utils'
import type { LeaderboardRow } from '@/hooks/useQuizzes'

interface AggregatedEntry extends LeaderboardRow {
  courses: number
}

export function GlobalLeaderboard() {
  const me = useAuthStore((s) => s.user)
  const { data: courses = [] } = useCourses()

  const lbQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['leaderboard', c.id],
      queryFn: async () => {
        const { data } = await api.get<LeaderboardRow[]>(`/courses/${c.id}/leaderboard`)
        return data
      },
    })),
  })

  const isLoading = lbQueries.some((q) => q.isLoading)

  const aggregated = useMemo<AggregatedEntry[]>(() => {
    const byUser = new Map<string, AggregatedEntry>()
    for (const q of lbQueries) {
      for (const row of q.data ?? []) {
        const cur = byUser.get(row.user_id)
        if (cur) {
          cur.points += row.points
          cur.quizzes_taken += row.quizzes_taken
          cur.streak = Math.max(cur.streak, row.streak)
          cur.courses += 1
        } else {
          byUser.set(row.user_id, {
            ...row,
            courses: 1,
          })
        }
      }
    }
    const list = Array.from(byUser.values()).sort((a, b) => b.points - a.points)
    list.forEach((e, i) => {
      e.rank = i + 1
    })
    return list
  }, [lbQueries])

  const top3 = aggregated.slice(0, 3)
  const rest = aggregated.slice(3, 30)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-300" /> Global leaderboard
        </h1>
        <p className="text-xs text-muted-foreground">
          Points aggregated across every course you're enrolled in this term.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : aggregated.length === 0 ? (
        <GlassCard padding="lg" className="text-center border-dashed border-white/10">
          <p className="text-sm text-muted-foreground">
            No quiz attempts across any of your courses yet.
          </p>
        </GlassCard>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-3 items-end">
            {top3[1] && <Podium entry={top3[1]} rank={2} delay={0.05} />}
            {top3[0] && <Podium entry={top3[0]} rank={1} delay={0} />}
            {top3[2] && <Podium entry={top3[2]} rank={3} delay={0.1} />}
          </div>

          <GlassCard padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Full ranking</h3>
              <span className="text-[10px] text-muted-foreground">{aggregated.length} students</span>
            </div>
            <ul className="divide-y divide-white/5">
              {rest.map((e, i) => {
                const isMe = e.user_id === me?.id
                return (
                  <motion.li
                    key={e.user_id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 transition',
                      isMe
                        ? 'bg-[linear-gradient(90deg,rgba(129,90,255,0.12),transparent)]'
                        : 'hover:bg-white/5',
                    )}
                  >
                    <span className="w-6 text-xs font-mono text-muted-foreground text-center">
                      {e.rank}
                    </span>
                    <Avatar className="h-8 w-8">
                      {e.avatar_url && <AvatarImage src={e.avatar_url} alt={e.name} />}
                      <AvatarFallback>{initials(e.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {e.name}
                        {isMe && <Badge variant="primary" className="ml-2">you</Badge>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {e.quizzes_taken} quizzes · {e.courses} course{e.courses === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="font-display text-sm font-semibold w-12 text-right">
                      {e.points}
                    </div>
                  </motion.li>
                )
              })}
            </ul>
          </GlassCard>
        </>
      )}
    </div>
  )
}

function Podium({ entry, rank, delay }: { entry: AggregatedEntry; rank: 1 | 2 | 3; delay: number }) {
  const height = rank === 1 ? 'md:h-56' : rank === 2 ? 'md:h-48' : 'md:h-40'
  const Icon = rank === 1 ? Crown : Medal
  const color = rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-slate-200' : 'text-orange-300'
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col items-center"
    >
      <div className="flex flex-col items-center mb-2">
        <Icon className={cn('h-6 w-6 mb-1.5', color)} />
        <Avatar className="h-14 w-14 ring-2 ring-white/20">
          {entry.avatar_url && <AvatarImage src={entry.avatar_url} alt={entry.name} />}
          <AvatarFallback className="text-base">{initials(entry.name)}</AvatarFallback>
        </Avatar>
        <div className="text-sm font-semibold mt-2 text-center">{entry.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {entry.points} pts · {entry.courses} course{entry.courses === 1 ? '' : 's'}
        </div>
      </div>
      <div className={cn('w-full h-24 rounded-2xl flex items-end justify-center pb-2 glass-strong', height)}>
        <span className="font-display text-3xl font-bold text-gradient">#{rank}</span>
      </div>
    </motion.div>
  )
}
