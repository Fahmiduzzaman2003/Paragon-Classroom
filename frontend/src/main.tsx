import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { Toaster } from 'sonner'
import './styles/globals.css'
import App from './App'
import { queryClient } from './lib/queryClient'
import { MeshGradient } from './components/background/MeshGradient'
import { envError, env, firebaseEnabled, firebaseConfig } from './lib/env'

// Diagnostic (open DevTools → Console): shows which auth mode the built bundle
// is in. "firebase" means VITE_FIREBASE_* baked in; "legacy" means they didn't.
console.info(
  `%c[Paragon] auth mode: ${firebaseEnabled ? 'firebase ✅' : 'legacy (VITE_FIREBASE_* not set in this build) ⚠️'}`,
  'font-weight:bold',
  { api: env.API_URL, firebaseProject: firebaseConfig.projectId || '(none)' },
)

const rootEl = document.getElementById('root')!

// If the app is misconfigured (e.g. VITE_API_URL missing on a Vercel deploy),
// show a readable message instead of a blank screen.
if (envError) {
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
                font-family:system-ui,sans-serif;color:#e6e6f0;background:#0b0a1a;text-align:center">
      <div style="max-width:560px">
        <h1 style="font-size:20px;margin:0 0 12px">Configuration needed</h1>
        <p style="opacity:.8;line-height:1.5;margin:0">${envError}</p>
      </div>
    </div>`
  throw new Error(envError) // stop here; nothing else to render
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <MeshGradient />
        <App />
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast:
                'glass-strong !bg-[rgba(20,16,44,0.75)] !border-white/10 !text-foreground !rounded-2xl !shadow-glass',
              description: '!text-muted-foreground',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
