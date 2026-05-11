import { useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

export function useTheme() {
  const { theme, toggleTheme, setTheme } = useUIStore()

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  return { theme, toggleTheme, setTheme }
}
