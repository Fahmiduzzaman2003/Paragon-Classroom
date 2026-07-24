import { useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, Medal, Flame, Trophy } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useLeaderboard, type LeaderboardRow } from '@/hooks/useQuizzes'
import { cn, initials } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import type { Course } from '@/types'

export function Leaderboard() {
  const { course } = useOutletContext<{ course: Course }>()
  const me = useAuthStore((s) => s.user)
  const { data: rows = [], isLoading } = useLeaderboard(course.id)
  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3, 20)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-300" /> Leaderboard
        </h2>
        <p className="text-xs text-muted-foreground">
          Points aggregate across every quiz this term. Ties broken by submission count.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : rows.length === 0 ? (
        <GlassCard padding="lg" className="text-center border-dashed border-white/10">
          <p className="text-sm text-muted-foreground">
            No quiz attempts yet — once students submit a quiz, the leaderboard will populate here.
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
              <span className="text-[10px] text-muted-foreground">Top {rows.length}</span>
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
                        {e.quizzes_taken} quizzes
                      </div>
                    </div>
                    {e.streak > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                        <Flame className="h-3 w-3" /> {e.streak}
                      </span>
                    )}
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

function Podium({ entry, rank, delay }: { entry: LeaderboardRow; rank: 1 | 2 | 3; delay: number }) {
  const height = rank === 1 ? 'md:h-56' : rank === 2 ? 'md:h-48' : 'md:h-40'
  const Icon = rank === 1 ? Crown : Medal
  const color =
    rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-slate-200' : 'text-orange-300'
  const glow =
    rank === 1
      ? 'shadow-[0_10px_40px_-8px_rgba(255,193,7,0.45)]'
      : rank === 2
        ? 'shadow-[0_10px_30px_-8px_rgba(180,180,200,0.4)]'
        : 'shadow-[0_10px_30px_-8px_rgba(255,140,60,0.4)]'

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
        <div className="text-[11px] text-muted-foreground">{entry.points} pts</div>
      </div>
      <div
        className={cn(
          'w-full h-24 rounded-2xl flex items-end justify-center pb-2 glass-strong',
          height,
          glow,
        )}
      >
        <span className="font-display text-3xl font-bold text-gradient">#{rank}</span>
      </div>
    </motion.div>
  )
}
