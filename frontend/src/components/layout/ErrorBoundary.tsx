import { Component, type ErrorInfo, type ReactNode } from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Logo } from './Logo'

interface State {
  error: Error | null
}

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to console for Sentry-style hooks later. Don't crash the app.
    // eslint-disable-next-line no-console
    console.error('Paragon ErrorBoundary caught:', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <GlassCard strong padding="lg" className="max-w-md text-center">
            <Logo className="justify-center mb-4" showWord={false} size={36} />
            <h1 className="font-display text-2xl font-semibold text-gradient">
              Something went sideways
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              The UI hit an unexpected error. Reloading the view usually fixes it.
            </p>
            <pre className="mt-4 text-[10px] text-left text-muted-foreground bg-white/5 rounded-lg p-2 overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
            <div className="flex items-center justify-center gap-2 mt-4">
              <GlassButton variant="glass" onClick={() => location.reload()}>
                Reload
              </GlassButton>
              <GlassButton onClick={this.reset}>Try again</GlassButton>
            </div>
          </GlassCard>
        </div>
      )
    }
    return this.props.children
  }
}
