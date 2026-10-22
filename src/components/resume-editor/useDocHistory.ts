'use client'

import { useCallback, useRef, useState } from 'react'
import type { ResumeDoc } from '@/lib/resume-doc'

const MAX_UNDO = 100

/**
 * Document-level undo/redo. Every change — a finished edit, a reorder, a swap, an AI rewrite,
 * an accepted suggestion — goes through `commit`, so ⌘Z treats them all the same. Typing inside
 * the open block updates the doc live with `setLive` (live fit, fact guard) and is committed as
 * one step when the edit session began (`beginEdit` snapshots once per session).
 */
export function useDocHistory(initial: ResumeDoc) {
  const [doc, setDoc] = useState(initial)
  const docRef = useRef(initial)
  const undoStack = useRef<ResumeDoc[]>([])
  const redoStack = useRef<ResumeDoc[]>([])
  const editSnapshotTaken = useRef(false)
  // Stack sizes as state, so the undo/redo buttons re-render (refs alone wouldn't).
  const [counts, setCounts] = useState({ undo: 0, redo: 0 })

  const apply = useCallback((next: ResumeDoc) => {
    docRef.current = next
    setDoc(next)
    setCounts({ undo: undoStack.current.length, redo: redoStack.current.length })
  }, [])

  const commit = useCallback((next: ResumeDoc | ((prev: ResumeDoc) => ResumeDoc)) => {
    const prev = docRef.current
    const value = typeof next === 'function' ? next(prev) : next
    if (value === prev) return
    if (!editSnapshotTaken.current) {
      undoStack.current = [...undoStack.current, prev].slice(-MAX_UNDO)
    }
    redoStack.current = []
    editSnapshotTaken.current = false
    apply(value)
  }, [apply])

  const beginEdit = useCallback(() => {
    if (editSnapshotTaken.current) return
    undoStack.current = [...undoStack.current, docRef.current].slice(-MAX_UNDO)
    redoStack.current = []
    editSnapshotTaken.current = true
    setCounts({ undo: undoStack.current.length, redo: 0 })
  }, [])

  const endEdit = useCallback(() => { editSnapshotTaken.current = false }, [])

  const setLive = useCallback((next: ResumeDoc | ((prev: ResumeDoc) => ResumeDoc)) => {
    const value = typeof next === 'function' ? next(docRef.current) : next
    apply(value)
  }, [apply])

  const undo = useCallback(() => {
    const prev = undoStack.current.at(-1)
    if (!prev) return
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current, docRef.current]
    editSnapshotTaken.current = false
    apply(prev)
  }, [apply])

  const redo = useCallback(() => {
    const next = redoStack.current.at(-1)
    if (!next) return
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current, docRef.current]
    editSnapshotTaken.current = false
    apply(next)
  }, [apply])

  /** Replace everything (after a 409 reload) and drop history that no longer applies. */
  const reset = useCallback((next: ResumeDoc) => {
    undoStack.current = []
    redoStack.current = []
    editSnapshotTaken.current = false
    apply(next)
  }, [apply])

  return {
    doc,
    docRef,
    commit,
    setLive,
    beginEdit,
    endEdit,
    undo,
    redo,
    reset,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  }
}
