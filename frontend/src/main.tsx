import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { Toaster } from 'sonner'
import './styles/globals.css'
import App from './App'
import { queryClient } from './lib/queryClient'
import { MeshGradient } from './components/background/MeshGradient'

createRoot(document.getElementById('root')!).render(
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
