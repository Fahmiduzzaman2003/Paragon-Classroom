import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { GlassCard } from '@/components/glass/GlassCard'

/** Centered glass-card shell shared by the standalone auth screens
 * (forgot password, reset password, verify email). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col p-6">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <GlassCard strong padding="lg" className="relative overflow-hidden hairline-gradient">
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(124,96,240,0.40)_0%,transparent_70%)]" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(192,60,220,0.30)_0%,transparent_70%)]" />
            <div className="relative">{children}</div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  )
}
