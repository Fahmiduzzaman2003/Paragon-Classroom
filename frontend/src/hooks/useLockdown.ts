import { useEffect, useRef, useState } from 'react'

/**
 * Browser-side lockdown for live exams.
 *
 * Enabled by `proctoringEnabled` on the quiz, this:
 *  - Requests fullscreen on the host element.
 *  - Disables copy/paste/cut, drag, context menu, and selection.
 *  - Blocks the most common cheating shortcuts (Ctrl+C/V/P/S/U, F12, etc).
 *  - Watches for tab switches (visibilitychange + window blur).
 *  - Detects fullscreen exit and DevTools (window-size delta heuristic).
 *
 * Each event is reported via `onViolation`. The caller decides what to do
 * (toast + auto-submit after N strikes, plus the server logs the event).
 *
 * NOTE: nothing here is hard-impenetrable — a determined student can boot a
 * second device or open another physical screen. This is a deterrent stack
 * that surfaces *most* cheating attempts and lets the teacher see them on
 * the review page. Combine with the existing recorded `violations` log on
 * the attempt for a real audit trail.
 */
export interface LockdownEvent {
  type:
    | 'tab_blur'
    | 'tab_focus'
    | 'visibility_hidden'
    | 'fullscreen_exit'
    | 'fullscreen_enter'
    | 'copy_attempt'
    | 'paste_attempt'
    | 'cut_attempt'
    | 'context_menu'
    | 'blocked_shortcut'
    | 'devtools_suspected'
    | 'page_resized'
  extra?: Record<string, unknown>
}

const BLOCKED_SHORTCUTS: Array<{
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  reason: string
}> = [
  { key: 'c', ctrl: true, reason: 'copy' },
  { key: 'v', ctrl: true, reason: 'paste' },
  { key: 'x', ctrl: true, reason: 'cut' },
  { key: 'a', ctrl: true, reason: 'select-all' },
  { key: 'p', ctrl: true, reason: 'print' },
  { key: 's', ctrl: true, reason: 'save' },
  { key: 'u', ctrl: true, reason: 'view-source' },
  // Same set with the ⌘ key for Mac
  { key: 'c', meta: true, reason: 'copy' },
  { key: 'v', meta: true, reason: 'paste' },
  { key: 'x', meta: true, reason: 'cut' },
  { key: 'a', meta: true, reason: 'select-all' },
  { key: 'p', meta: true, reason: 'print' },
  { key: 's', meta: true, reason: 'save' },
  { key: 'u', meta: true, reason: 'view-source' },
  // DevTools toggles
  { key: 'I', ctrl: true, shift: true, reason: 'devtools' },
  { key: 'J', ctrl: true, shift: true, reason: 'devtools-console' },
  { key: 'C', ctrl: true, shift: true, reason: 'devtools-inspect' },
  { key: 'I', meta: true, alt: true, reason: 'devtools' },
  { key: 'F12', reason: 'devtools' },
]

function matchesShortcut(e: KeyboardEvent, sc: (typeof BLOCKED_SHORTCUTS)[number]) {
  if (sc.key.length === 1) {
    if (e.key.toLowerCase() !== sc.key.toLowerCase()) return false
  } else if (e.key !== sc.key) return false
  if (!!sc.ctrl !== e.ctrlKey) return false
  if (!!sc.shift !== e.shiftKey) return false
  if (!!sc.alt !== e.altKey) return false
  if (!!sc.meta !== e.metaKey) return false
  return true
}

export function useLockdown(
  enabled: boolean,
  onViolation: (e: LockdownEvent) => void,
  hostRef?: React.RefObject<HTMLElement | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const violationLatchRef = useRef<Record<string, number>>({})

  // When the student opens a native file picker to attach an answer (photo/PDF),
  // the browser blurs the window — which must NOT count as a tab/screen switch.
  // A file-input click sets this to `now`; while it's "fresh" we suppress the
  // blur/visibility-hidden the dialog causes and the focus we get back when it
  // closes. Bounded lifetime so a browser that never refocuses can't disable
  // switch-detection for the rest of the exam.
  const fileDialogRef = useRef(0)
  const uploadDialogOpen = () =>
    fileDialogRef.current > 0 && Date.now() - fileDialogRef.current < 120_000

  // Throttle each violation type: at most one event per type per 1.2 s, so a
  // student can't spam the log by holding Ctrl+C.
  const fire = (e: LockdownEvent) => {
    const now = Date.now()
    const last = violationLatchRef.current[e.type] || 0
    if (now - last < 1200) return
    violationLatchRef.current[e.type] = now
    onViolation(e)
  }

  // ─── Fullscreen control ────────────────────────────────────────────────
  const requestFullscreen = async () => {
    if (!enabled) return
    try {
      const el = hostRef?.current ?? document.documentElement
      if (document.fullscreenElement) return
      await el.requestFullscreen?.({ navigationUI: 'hide' as FullscreenNavigationUI })
    } catch {
      // Some browsers (Safari iOS, embedded webviews) just won't allow it.
      // We still log every other signal — this is a graceful degradation.
    }
  }

  useEffect(() => {
    if (!enabled) return
    const onChange = () => {
      const fs = !!document.fullscreenElement
      setIsFullscreen(fs)
      if (fs) fire({ type: 'fullscreen_enter' })
      else fire({ type: 'fullscreen_exit' })
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [enabled])

  // ─── Tab/window focus ──────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    // A click on a file input (or an element opting in via [data-proctor-upload])
    // means a native picker is about to steal focus. Capture phase so we see it
    // before anything can stopPropagation, and it also catches the programmatic
    // `inputRef.click()` that hidden upload buttons dispatch.
    const onClickCapture = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return
      const input = el as HTMLInputElement
      const isFileInput = input.tagName === 'INPUT' && input.type === 'file'
      if (isFileInput || el.closest('[data-proctor-upload]')) {
        fileDialogRef.current = Date.now()
      }
    }
    const onVisibility = () => {
      // Opening a file dialog keeps the page "visible" (only blurs), so a hidden
      // state here is a genuine tab switch / minimize even mid-upload — but honor
      // the grace window defensively for browsers that briefly report hidden.
      if (document.visibilityState === 'hidden' && !uploadDialogOpen()) {
        fire({ type: 'visibility_hidden' })
      }
    }
    const onBlur = () => {
      if (uploadDialogOpen()) return // blur caused by our own file picker
      fire({ type: 'tab_blur' })
    }
    const onFocus = () => {
      if (uploadDialogOpen()) {
        // Focus returned because the file dialog closed — consume the grace
        // window so it doesn't shadow a later real switch, and don't log it.
        fileDialogRef.current = 0
        return
      }
      fire({ type: 'tab_focus' })
    }
    document.addEventListener('click', onClickCapture, { capture: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('click', onClickCapture, { capture: true } as never)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled])

  // ─── Copy / cut / paste / context-menu / drag ─────────────────────────
  useEffect(() => {
    if (!enabled) return
    const block =
      (type: LockdownEvent['type']) =>
      (e: Event) => {
        e.preventDefault()
        fire({ type })
      }
    const onCopy = block('copy_attempt')
    const onPaste = block('paste_attempt')
    const onCut = block('cut_attempt')
    const onContext = block('context_menu')
    const onDrag = (e: Event) => e.preventDefault()
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    document.addEventListener('cut', onCut)
    document.addEventListener('contextmenu', onContext)
    document.addEventListener('dragstart', onDrag)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('dragstart', onDrag)
    }
  }, [enabled])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      // Allow typing inside answer textareas — only block the cheaty modifiers.
      const target = e.target as HTMLElement | null
      const isEditable =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT'
      for (const sc of BLOCKED_SHORTCUTS) {
        if (matchesShortcut(e, sc)) {
          // Allow plain typing in editable fields, but still block clipboard/devtools.
          if (
            isEditable &&
            !['copy', 'paste', 'cut', 'select-all'].includes(sc.reason)
          ) {
            // Even in an input, kill devtools/print/save shortcuts.
          }
          e.preventDefault()
          e.stopPropagation()
          fire({ type: 'blocked_shortcut', extra: { reason: sc.reason } })
          return
        }
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true } as never)
  }, [enabled])

  // ─── DevTools heuristic ───────────────────────────────────────────────
  // When DevTools opens docked, the inner viewport shrinks abruptly. The
  // delta between outerWidth/Height and innerWidth/Height jumps above ~160px.
  // Not foolproof (works against undocked DevTools too unreliably), but it's
  // a good additional signal.
  useEffect(() => {
    if (!enabled) return
    const t = window.setInterval(() => {
      const dx = window.outerWidth - window.innerWidth
      const dy = window.outerHeight - window.innerHeight
      if (dx > 200 || dy > 200) {
        fire({ type: 'devtools_suspected', extra: { dx, dy } })
      }
    }, 1500)
    return () => window.clearInterval(t)
  }, [enabled])

  // ─── Page resize / minimize ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    let prev = { w: window.innerWidth, h: window.innerHeight }
    const onResize = () => {
      const next = { w: window.innerWidth, h: window.innerHeight }
      const dropped =
        next.w < prev.w * 0.5 || next.h < prev.h * 0.5 || next.w < 320 || next.h < 240
      prev = next
      if (dropped) fire({ type: 'page_resized', extra: next })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled])

  return {
    isFullscreen,
    requestFullscreen,
  }
}
