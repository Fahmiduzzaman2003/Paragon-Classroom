import { Link } from 'react-router-dom'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Home, Search } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <GlassCard strong padding="lg" className="max-w-md text-center">
        <Logo className="justify-center mb-4" showWord={false} size={40} />
        <h1 className="font-display text-4xl font-semibold text-gradient">404</h1>
        <p className="text-sm text-muted-foreground mt-2">
          That page drifted off into the gradient. Let's get you back.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5">
          <GlassButton asChild>
            <Link to="/app">
              <Home className="h-4 w-4" /> Dashboard
            </Link>
          </GlassButton>
          <GlassButton asChild variant="glass">
            <Link to="/">
              <Search className="h-4 w-4" /> Home
            </Link>
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  )
}
