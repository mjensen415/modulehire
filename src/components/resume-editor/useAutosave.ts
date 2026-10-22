'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResumeDoc } from '@/lib/resume-doc'

export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

const DEBOUNCE_MS = 800

/**
 * Debounced autosave: PATCH the whole document with the version it was edited from. A 409
 * (saved elsewhere since — another tab) calls `onConflict` with the server's latest doc and
 * version so the editor reloads instead of overwriting.
 */
export function useAutosave(
  docId: string,
  doc: ResumeDoc,
  initialVersion: number,
  onConflict: (latest: { doc: ResumeDoc; version: number }) => void,
) {
  const [state, setState] = useState<SaveState>('saved')
  const versionRef = useRef(initialVersion)
  const savedDocRef = useRef<ResumeDoc>(doc)
  const latestDocRef = useRef<ResumeDoc>(doc)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const conflictRef = useRef(onConflict)
  useEffect(() => { conflictRef.current = onConflict })

  const save = useCallback(async (): Promise<void> => {
    if (inFlight.current) await inFlight.current
    const sending = latestDocRef.current
    if (sending === savedDocRef.current) { setState('saved'); return }
    setState('saving')
    const run = (async () => {
      try {
        const res = await fetch(`/api/resume-docs/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc: sending, version: versionRef.current }),
        })
        if (res.status === 409) {
          const latest = await fetch(`/api/resume-docs/${docId}`).then(r => r.json())
          versionRef.current = latest.version
          savedDocRef.current = latest.doc
          latestDocRef.current = latest.doc
          setState('saved')
          conflictRef.current({ doc: latest.doc, version: latest.version })
          return
        }
        if (!res.ok) throw new Error('save failed')
        const data = await res.json()
        versionRef.current = data.version
        savedDocRef.current = sending
        setState(latestDocRef.current === sending ? 'saved' : 'pending')
      } catch {
        setState('error')
      }
    })()
    inFlight.current = run
    await run
    inFlight.current = null
  }, [docId])

  useEffect(() => {
    latestDocRef.current = doc
    if (doc === savedDocRef.current) return
    setState(s => (s === 'saving' ? s : 'pending'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, DEBOUNCE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [doc, save])

  // A save that finished while more edits arrived leaves 'pending' — schedule the follow-up.
  useEffect(() => {
    if (state !== 'pending' || inFlight.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, DEBOUNCE_MS)
  }, [state, save])

  /** Save now (before a download) and wait for it. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    await save()
  }, [save])

  /** After a reload from the server: treat `next` as saved at `version`. */
  const markSaved = useCallback((next: ResumeDoc, version: number) => {
    versionRef.current = version
    savedDocRef.current = next
    latestDocRef.current = next
    setState('saved')
  }, [])

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (latestDocRef.current !== savedDocRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return { state, flush, markSaved, versionRef }
}
