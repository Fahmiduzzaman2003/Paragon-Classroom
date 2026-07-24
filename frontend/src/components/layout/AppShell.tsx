import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar, MobileBottomNav } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * Authenticated app chrome: persistent side rail on lg+, mobile bottom nav on
 * small screens. Page transitions fade-and-rise. Respects prefers-reduced-motion
 * via globals.css.
 */
export function AppShell() {
  const location = useLocation()
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-28 lg:pb-12 pt-2 max-w-[1400px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  )
}
