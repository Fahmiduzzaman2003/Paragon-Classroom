import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { ColdStartBanner } from './components/layout/ColdStartBanner'
import { warmUpBackend } from './lib/api'

export default function App() {
  // Prewarm the Render dyno on load so it's likely awake by the time the user acts.
  useEffect(() => {
    void warmUpBackend()
  }, [])

  return (
    <ErrorBoundary>
      <ColdStartBanner />
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
