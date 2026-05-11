import { motion } from 'framer-motion'

/**
 * Animated mesh-gradient backdrop: drifting blurred orbs on a deep indigo base.
 * Sits fixed behind all UI. Respects prefers-reduced-motion via globals.css.
 */
export function MeshGradient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base gradient (different for dark vs light) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(32,20,80,1)_0%,_rgba(8,6,22,1)_55%,_rgba(2,2,10,1)_100%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(32,20,80,1)_0%,_rgba(8,6,22,1)_55%,_rgba(2,2,10,1)_100%)]" />
      <div className="absolute inset-0 hidden dark:block opacity-100" />
      <div className="absolute inset-0 block dark:hidden bg-[radial-gradient(ellipse_at_top,_rgba(240,235,255,1)_0%,_rgba(230,225,250,1)_55%,_rgba(220,215,245,1)_100%)]" />

      {/* Drifting orbs */}
      <motion.div
        className="absolute -top-40 -left-40 h-[60vmin] w-[60vmin] rounded-full blur-[110px] opacity-70 dark:opacity-60"
        style={{
          background:
            'radial-gradient(circle, rgba(129,90,255,0.85) 0%, rgba(129,90,255,0) 70%)',
        }}
        animate={{ x: [0, 60, -30, 0], y: [0, -40, 30, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/4 right-[-15vmin] h-[55vmin] w-[55vmin] rounded-full blur-[110px] opacity-65 dark:opacity-55"
        style={{
          background:
            'radial-gradient(circle, rgba(255,70,190,0.75) 0%, rgba(255,70,190,0) 70%)',
        }}
        animate={{ x: [0, -50, 40, 0], y: [0, 30, -30, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-20vmin] left-1/3 h-[60vmin] w-[60vmin] rounded-full blur-[110px] opacity-55 dark:opacity-45"
        style={{
          background:
            'radial-gradient(circle, rgba(0,200,255,0.80) 0%, rgba(0,200,255,0) 70%)',
        }}
        animate={{ x: [0, 40, -40, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-10 right-10 h-[35vmin] w-[35vmin] rounded-full blur-[100px] opacity-50 dark:opacity-40"
        style={{
          background:
            'radial-gradient(circle, rgba(120,255,210,0.7) 0%, rgba(120,255,210,0) 70%)',
        }}
        animate={{ x: [0, -20, 30, 0], y: [0, 25, -15, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.8'/></svg>\")",
        }}
      />

      {/* Bottom fade for readability */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background/60 to-transparent" />
    </div>
  )
}
