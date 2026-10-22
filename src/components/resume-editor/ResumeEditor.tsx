'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import BlockEditor from './BlockEditor'
import FitPanel, { fitColor, useAnimatedNumber } from './FitPanel'
import SuggestionsPanel from './SuggestionsPanel'
import LibraryRail, { type LibraryGroup } from './LibraryRail'
import UnsupportedPhrases from '@/components/UnsupportedPhrases'
import Link from 'next/link'
import { useDocHistory } from './useDocHistory'
import { useAutosave, type SaveState } from './useAutosave'
import {
  RESUME_FORMATS, allBlocks, contactLine, docPlainText, docText, isHidden, makeBlock, mapBlocks, modulesOnResume, updateBlockText,
  type Block, type BlockSuggestion, type ResumeDoc, type ResumeDocFormat, type ToggleableSection,
} from '@/lib/resume-doc'
import { groupExperienceByCompany, normalizeCompany } from '@/lib/resume-dates'
import { splitSentences, unsupportedTerms, type UnsupportedTerm } from '@/lib/fact-check'
import { phraseCoverage, scoreLiveFit } from '@/lib/live-fit'
import type { JdCriterion } from '@/lib/dimensions'

export type EditorModule = {
  id: string
  title: string
  content: string
  source_company: string | null
  /** job_experiences this module is assigned to. */
  job_ids: string[]
}

export type EditorJd = { id: string; title: string; company: string | null; criteria: JdCriterion[]; phrases?: string[] } | null

type Props = {
  docId: string
  initialDoc: ResumeDoc
  initialVersion: number
  modules: EditorModule[]
  jd: EditorJd
  /** The stored server fit, if it was scored for this version. */
  initialFit?: { overall: number; doc_version: number } | null
  /** Posting phrases generation left off because no module supports them. */
  unsupportedPhrases?: string[]
}

const FORMAT_LABELS: Record<ResumeDocFormat, string> = {
  classic: 'Classic', tech: 'Tech', combination: 'Combination', executive: 'Executive', minimal: 'Minimal', 'two-column': 'Two-column',
}

// Header/skills/awards lines are edited with the same block editor under synthetic ids.
const NAME_ID = '__name'
const TITLE_ID = '__title'
const CONTACT_ID = '__contact'
const SKILLS_ID = '__skills'
const AWARDS_ID = '__awards'

/** The plain line a module contributes when added by hand: its first sentence, capped. */
export function moduleResumeLine(content: string): string {
  const first = splitSentences(content)[0] ?? content.trim()
  const words = first.split(/\s+/)
  return words.length > 30 ? words.slice(0, 30).join(' ').replace(/[,;:]$/, '') + '.' : first
}

// "a@b.com · 555 · Austin, TX · linkedin.com/in/a" back into fields.
function parseContactLine(line: string): ResumeDoc['header']['contact_fields'] {
  const fields = { email: '', phone: '', location: '', linkedin: '' }
  for (const part of line.split(/\s*[·|•]\s*/).map(p => p.trim()).filter(Boolean)) {
    if (!fields.email && part.includes('@')) fields.email = part
    else if (!fields.linkedin && /linkedin|https?:|www\./i.test(part)) fields.linkedin = part
    else if (!fields.phone && /\d{3}/.test(part) && !/[a-z]{3,}/i.test(part)) fields.phone = part
    else fields.location = fields.location ? `${fields.location}, ${part}` : part
  }
  return fields
}

function saveLabel(state: SaveState): string {
  if (state === 'saving' || state === 'pending') return 'Saving…'
  if (state === 'error') return 'Not saved — retrying when you edit'
  return 'Saved'
}

export default function ResumeEditor({ docId, initialDoc, initialVersion, modules, jd, initialFit, unsupportedPhrases = [] }: Props) {
  const history = useDocHistory(initialDoc)
  const { doc, docRef, commit, setLive, beginEdit, endEdit, undo, redo, reset, canUndo, canRedo } = history
  const [activeId, setActiveId] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [addOpenFor, setAddOpenFor] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Line-level AI: which line is being rewritten, and the last message per line.
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiMessage, setAiMessage] = useState<{ blockId: string; text: string } | null>(null)
  const [askFor, setAskFor] = useState<string | null>(null)
  const [askText, setAskText] = useState('')
  // Library write-back: offered under the last line you finished changing; never automatic.
  const [suggestions, setSuggestions] = useState<BlockSuggestion[] | null>(null)
  const [sugLoading, setSugLoading] = useState(false)
  const [sugError, setSugError] = useState<string | null>(null)
  const [writeBack, setWriteBack] = useState<{ blockId: string; state: 'offer' | 'saving' | 'saved' } | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  // The rail: Fit (requirements), Changes (suggested edits + gaps), Library (modules by job).
  const [railTab, setRailTab] = useState<'fit' | 'changes' | 'library'>(jd && jd.criteria.length > 0 ? 'fit' : 'library')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  // Header menus.
  const [menu, setMenu] = useState<'design' | 'export' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coverLetterDefault, setCoverLetterDefault] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  const onConflict = useCallback((latest: { doc: ResumeDoc; version: number }) => {
    setActiveId(null)
    reset(latest.doc)
    setNotice('This resume was changed in another tab, so we loaded the latest version. Your last edit here wasn\'t saved.')
  }, [reset])
  // On a 409 the autosave hook has already marked the server's doc as saved, so reset() to that
  // same object doesn't trigger another save.
  const { state: saveState, flush: flushSave } = useAutosave(docId, doc, initialVersion, onConflict)

  const onResume = useMemo(() => modulesOnResume(doc), [doc])

  // Library modules as state: "Add it to the module" / "Save to your library" update them here.
  const [library, setLibrary] = useState(modules)
  const moduleById = useMemo(() => new Map(library.map(m => [m.id, m])), [library])

  // ── Fact guard ────────────────────────────────────────────────────────────
  // 200ms after typing stops, every line's numbers and capitalized terms are checked against
  // its source module (the same check generation uses). New facts are flagged, never blocked.
  const [guardDoc, setGuardDoc] = useState(doc)
  useEffect(() => {
    const t = setTimeout(() => setGuardDoc(doc), 200)
    return () => clearTimeout(t)
  }, [doc])
  const warnings = useMemo(() => {
    const context = [
      guardDoc.header.name, guardDoc.header.title, jd?.company ?? '', jd?.title ?? '',
      ...guardDoc.experience.flatMap(e => [e.company, e.title]),
    ]
    const out = new Map<string, { terms: UnsupportedTerm[]; module: EditorModule }>()
    const check = (b: Block) => {
      const m = b.module_id ? moduleById.get(b.module_id) : undefined
      if (!m || !b.text.trim()) return
      const terms = unsupportedTerms(b.text, [m.content, m.title], context)
      if (terms.length > 0) out.set(b.id, { terms, module: m })
    }
    guardDoc.experience.forEach(e => e.bullets.forEach(check))
    guardDoc.skill_sections.forEach(sec => sec.bullets.forEach(check))
    return out
  }, [guardDoc, moduleById, jd])
  // The last text of each line that had no warning, for the warning's "Undo".
  const lastClean = useRef(new Map<string, string>())
  useEffect(() => {
    const visit = (b: Block) => { if (!warnings.has(b.id)) lastClean.current.set(b.id, b.text) }
    guardDoc.experience.forEach(e => e.bullets.forEach(visit))
    guardDoc.skill_sections.forEach(sec => sec.bullets.forEach(visit))
  }, [guardDoc, warnings])

  // ── Live fit ──────────────────────────────────────────────────────────────
  // The client score updates on every keystroke; after 10s idle the server scores the saved
  // doc (same scorer as the match report) and the shown number is re-anchored to it: shown =
  // live + (server − live-at-the-time), so later keystrokes still move it from there.
  const criteria = useMemo(() => jd?.criteria ?? [], [jd])
  const live = useMemo(() => scoreLiveFit(docText(doc), criteria), [doc, criteria])
  const [serverFit, setServerFit] = useState<{ overall: number; clientAt: number } | null>(() =>
    initialFit && initialFit.doc_version === initialVersion
      ? { overall: initialFit.overall, clientAt: scoreLiveFit(docText(initialDoc), jd?.criteria ?? []).score }
      : null)
  const [fitChecking, setFitChecking] = useState(false)
  const shownScore = serverFit
    ? Math.max(0, Math.min(100, live.score + serverFit.overall - serverFit.clientAt))
    : live.score
  const headerScore = useAnimatedNumber(shownScore)

  // Modules that belong to a job (by assignment, else by company) and aren't on the resume yet.
  const availableFor = useCallback((entryIndex: number): EditorModule[] => {
    const entry = doc.experience[entryIndex]
    if (!entry) return []
    const company = normalizeCompany(entry.company)
    return library.filter(m => {
      if (onResume.has(m.id)) return false
      if (m.job_ids.includes(entry.job_id)) return true
      return m.job_ids.length === 0 && !!company && normalizeCompany(m.source_company) === company
    })
  }, [doc.experience, library, onResume])

  // ── Rail data ─────────────────────────────────────────────────────────────
  // Which lines cover which requirement (scored per line with the same live-fit rules).
  const coverage = useMemo(() => {
    const map = new Map<string, string[]>()
    if (criteria.length === 0) return map
    for (const { block } of allBlocks(doc)) {
      if (!block.text.trim()) continue
      for (const c of scoreLiveFit(block.text, criteria).criteria) {
        if (c.covered) map.set(c.label, [...(map.get(c.label) ?? []), block.id])
      }
    }
    return map
  }, [doc, criteria])
  const highlightIds = useMemo(() => new Set(highlight ? coverage.get(highlight) ?? [] : []), [highlight, coverage])
  const keywords = useMemo(() => {
    const phrases = jd?.phrases ?? []
    return { found: phraseCoverage(docText(doc), phrases).found.length, total: phrases.length }
  }, [doc, jd])
  // "Not on your resume" gaps that the user hasn't since covered by editing.
  const openGaps = useMemo(() => phraseCoverage(docText(doc), unsupportedPhrases).missing, [doc, unsupportedPhrases])

  const libraryGroups: LibraryGroup[] = useMemo(() => doc.experience.map((e, i) => {
    const onResume: LibraryGroup['onResume'] = []
    for (const b of e.bullets) {
      const m = b.module_id ? moduleById.get(b.module_id) : undefined
      if (m && !onResume.some(x => x.module.id === m.id)) onResume.push({ module: m, blockId: b.id })
    }
    return { entryIndex: i, heading: [e.title, e.company].filter(Boolean).join(', ') || 'Experience', onResume, available: availableFor(i) }
  }), [doc.experience, moduleById, availableFor])

  // ── Block lookups and edits ───────────────────────────────────────────────
  const locate = useCallback((id: string): { entry: number; index: number } | null => {
    for (let e = 0; e < doc.experience.length; e++) {
      const index = doc.experience[e].bullets.findIndex(b => b.id === id)
      if (index >= 0) return { entry: e, index }
    }
    return null
  }, [doc.experience])

  const syntheticBlock = useCallback((id: string): Block | null => {
    const h = doc.header
    if (id === NAME_ID) return { id, text: h.name, module_id: null, original: initialDoc.header.name }
    if (id === TITLE_ID) return { id, text: h.title, module_id: null, original: initialDoc.header.title }
    if (id === CONTACT_ID) return { id, text: h.contact, module_id: null, original: initialDoc.header.contact }
    if (id === SKILLS_ID) return { id, text: doc.skills.join(', '), module_id: null, original: initialDoc.skills.join(', ') }
    if (id === AWARDS_ID) return { id, text: doc.awards, module_id: null, original: initialDoc.awards }
    return null
  }, [doc.header, doc.skills, doc.awards, initialDoc])

  const blockById = useCallback((id: string): Block | null => {
    const synthetic = syntheticBlock(id)
    if (synthetic) return synthetic
    if (doc.summary.id === id) return doc.summary
    for (const e of doc.experience) { const b = e.bullets.find(x => x.id === id); if (b) return b }
    for (const s of doc.skill_sections) { const b = s.bullets.find(x => x.id === id); if (b) return b }
    return doc.education.find(b => b.id === id) ?? null
  }, [doc, syntheticBlock])

  const withText = useCallback((d: ResumeDoc, id: string, text: string): ResumeDoc => {
    if (id === NAME_ID) return { ...d, header: { ...d.header, name: text } }
    if (id === TITLE_ID) return { ...d, header: { ...d.header, title: text } }
    if (id === CONTACT_ID) {
      const fields = parseContactLine(text)
      return { ...d, header: { ...d.header, contact: text, contact_fields: fields } }
    }
    if (id === SKILLS_ID) return { ...d, skills: text.split(',').map(s => s.trim()).filter(Boolean) }
    if (id === AWARDS_ID) return { ...d, awards: text }
    return updateBlockText(d, id, text)
  }, [])

  const activate = (id: string) => {
    setSwapOpen(false)
    setAddOpenFor(null)
    setActiveId(id)
  }

  const finish = useCallback(() => {
    if (!activeId) return
    const finished = blockById(activeId)
    if (finished?.module_id && finished.text.trim() && finished.text !== finished.original) {
      setWriteBack({ blockId: finished.id, state: 'offer' })
    }
    // Contact line: normalize the display string to the parsed fields once editing ends.
    if (activeId === CONTACT_ID) setLive(d => ({ ...d, header: { ...d.header, contact: contactLine(d.header.contact_fields) } }))
    endEdit()
    setActiveId(null)
    setSwapOpen(false)
  }, [activeId, endEdit, setLive, blockById])

  const onType = useCallback((block: Block) => {
    beginEdit()
    setLive(d => withText(d, block.id, block.text))
  }, [beginEdit, setLive, withText])

  const removeBlock = (id: string) => {
    if (id === doc.summary.id) { commit(d => ({ ...d, summary: { ...d.summary, text: '' } })); finish(); return }
    commit(d => ({
      ...d,
      experience: d.experience.map(e => ({ ...e, bullets: e.bullets.filter(b => b.id !== id) })),
      skill_sections: d.skill_sections.map(s => ({ ...s, bullets: s.bullets.filter(b => b.id !== id) })),
      education: d.education.filter(b => b.id !== id),
    }))
    setActiveId(null)
  }

  const restoreOriginal = (id: string) => {
    const block = blockById(id)
    if (!block) return
    commit(d => withText(d, id, block.original))
  }

  const insertModule = (entryIndex: number, m: EditorModule) => {
    const block = makeBlock(moduleResumeLine(m.content), m.id)
    commit(d => ({ ...d, experience: d.experience.map((e, i) => (i === entryIndex ? { ...e, bullets: [...e.bullets, block] } : e)) }))
    setAddOpenFor(null)
  }

  const insertBlank = (entryIndex: number) => {
    const block = makeBlock('', null)
    commit(d => ({ ...d, experience: d.experience.map((e, i) => (i === entryIndex ? { ...e, bullets: [...e.bullets, block] } : e)) }))
    setAddOpenFor(null)
    setActiveId(block.id)
  }

  // Streams a rewrite of one line into place, then keeps it only if the server's fact check
  // passed; otherwise the line goes back to what it was. One undo step either way.
  const runAi = async (id: string, action: 'shorter' | 'stronger' | 'their_words' | 'custom', instruction?: string) => {
    const block = blockById(id)
    if (!block || aiBusy) return
    const at = locate(id)
    const section = doc.skill_sections.find(sec => sec.bullets.some(b => b.id === id))
    const siblings = at ? doc.experience[at.entry].bullets : section ? section.bullets : []
    const before = block.text
    setAiBusy(id)
    setAiMessage(null)
    setAskFor(null)
    try {
      const res = await fetch(`/api/resume-docs/${docId}/rewrite-block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_id: id,
          action,
          instruction,
          text: before,
          module_id: block.module_id,
          job_id: !block.module_id && at ? doc.experience[at.entry].job_id : undefined,
          neighbors: siblings.filter(b => b.id !== id).map(b => b.text),
        }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'The rewrite failed. Try again.')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let streamed = ''
      let outcome: { type: string; text?: string; module_id?: string | null; message?: string } | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, nl))
          buf = buf.slice(nl + 1)
          if (msg.type === 'delta') {
            streamed += msg.text
            setLive(d => withText(d, id, streamed.trimStart()))
          } else {
            outcome = msg
          }
        }
      }
      setLive(d => withText(d, id, before))
      if (outcome?.type === 'done' && outcome.text) {
        const text = outcome.text
        const moduleId = outcome.module_id ?? null
        commit(d => mapBlocks(d, b => (b.id === id ? { ...b, text, module_id: b.module_id ?? moduleId } : b)))
      } else {
        setAiMessage({ blockId: id, text: outcome?.message ?? 'The rewrite failed. Try again.' })
      }
    } catch (e) {
      setLive(d => withText(d, id, before))
      setAiMessage({ blockId: id, text: (e as Error).message })
    } finally {
      setAiBusy(null)
    }
  }

  const swapWith = (id: string, m: EditorModule) => {
    const at = locate(id)
    if (!at) return
    const block = makeBlock(moduleResumeLine(m.content), m.id)
    commit(d => ({
      ...d,
      experience: d.experience.map((e, i) => (i === at.entry ? { ...e, bullets: e.bullets.map(b => (b.id === id ? block : b)) } : e)),
    }))
    setSwapOpen(false)
    setActiveId(block.id)
  }

  const reorder = (entryIndex: number, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commit(d => ({
      ...d,
      experience: d.experience.map((e, i) => {
        if (i !== entryIndex) return e
        const from = e.bullets.findIndex(b => b.id === active.id)
        const to = e.bullets.findIndex(b => b.id === over.id)
        return from < 0 || to < 0 ? e : { ...e, bullets: arrayMove(e.bullets, from, to) }
      }),
    }))
  }

  const reorderSkillSection = (sectionIndex: number, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commit(d => ({
      ...d,
      skill_sections: d.skill_sections.map((s, i) => {
        if (i !== sectionIndex) return s
        const from = s.bullets.findIndex(b => b.id === active.id)
        const to = s.bullets.findIndex(b => b.id === over.id)
        return from < 0 || to < 0 ? s : { ...s, bullets: arrayMove(s.bullets, from, to) }
      }),
    }))
  }

  // ⌘Z / ⌘⇧Z for document-level history when no line is open (an open line has its own).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (activeId || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeId, undo, redo])

  useEffect(() => {
    if (criteria.length === 0) return
    const timer = setTimeout(async () => {
      setFitChecking(true)
      try {
        await flushSave()
        const res = await fetch(`/api/resume-docs/${docId}/fit`, { method: 'POST' })
        if (!res.ok) return
        const fit = await res.json()
        if (typeof fit.overall === 'number') {
          setServerFit({ overall: fit.overall, clientAt: scoreLiveFit(docText(docRef.current), criteria).score })
        }
      } catch {
        // The live preview stays; the next idle period tries again.
      } finally {
        setFitChecking(false)
      }
    }, 10_000)
    return () => clearTimeout(timer)
  // docRef is a stable ref; it's read when the timer fires, not during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, criteria, docId, flushSave])

  const addFactToModule = async (blockId: string) => {
    const w = warnings.get(blockId)
    const block = blockById(blockId)
    if (!w || !block) return
    if (!window.confirm('This becomes part of your library and can appear on future resumes.')) return
    const sentence = /[.!?]$/.test(block.text.trim()) ? block.text.trim() : `${block.text.trim()}.`
    const content = `${w.module.content.trim()} ${sentence}`.trim()
    const res = await fetch(`/api/modules/${w.module.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) { setNotice("Couldn't update that module. Try again."); return }
    setLibrary(prev => prev.map(m => (m.id === w.module.id ? { ...m, content } : m)))
  }

  // Replace the line's original wording inside the module if it's there verbatim; otherwise add
  // the new line to the module, so the improved wording carries forward to future resumes.
  const saveToLibrary = async (blockId: string) => {
    const block = blockById(blockId)
    const m = block?.module_id ? moduleById.get(block.module_id) : undefined
    if (!block || !m) return
    setWriteBack({ blockId, state: 'saving' })
    const text = block.text.trim()
    const sentence = /[.!?]$/.test(text) ? text : `${text}.`
    const original = block.original.trim()
    const content = original && m.content.includes(original)
      ? m.content.replace(original, text)
      : `${m.content.trim()} ${sentence}`.trim()
    const res = await fetch(`/api/modules/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) { setWriteBack({ blockId, state: 'offer' }); setNotice("Couldn't update your library. Try again."); return }
    setLibrary(prev => prev.map(x => (x.id === m.id ? { ...x, content } : x)))
    setWriteBack({ blockId, state: 'saved' })
  }

  const findSuggestions = async () => {
    setSugLoading(true)
    setSugError(null)
    try {
      const res = await fetch(`/api/resume-docs/${docId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: docRef.current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not find suggestions.')
      setSuggestions(data.suggestions ?? [])
    } catch (e) {
      setSugError((e as Error).message)
    } finally {
      setSugLoading(false)
    }
  }

  // A suggestion is an operation on one block; accepting it is a normal commit, so undo,
  // autosave and history treat it exactly like typing.
  const acceptSuggestion = (sug: BlockSuggestion) => {
    commit(d => mapBlocks(d, b => (b.id === sug.block_id ? { ...b, text: sug.new_text } : b)))
    setSuggestions(prev => (prev ?? []).filter(x => x.block_id !== sug.block_id))
  }

  const showBlock = (blockId: string) => {
    document.querySelector(`[data-block-anchor="${blockId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(blockId)
    setTimeout(() => setFlashId(f => (f === blockId ? null : f)), 1400)
  }

  const selectRequirement = (label: string | null) => {
    setHighlight(label)
    const first = label ? coverage.get(label)?.[0] : undefined
    if (first) document.querySelector(`[data-block-anchor="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // For a requirement no line covers: a library module (not on the resume) that could, with a
  // one-click add to its job, or plainly "Not in your library".
  const renderGap = (label: string) => {
    const criterion = criteria.find(c => c.label === label)
    if (!criterion) return null
    const candidates: { m: EditorModule; entry: number }[] = []
    doc.experience.forEach((_, i) => {
      for (const m of availableFor(i)) {
        if (candidates.some(c => c.m.id === m.id)) continue
        if (scoreLiveFit(`${m.title}. ${m.content}`, [criterion]).criteria[0]?.covered) candidates.push({ m, entry: i })
      }
    })
    if (candidates.length === 0) {
      return (
        <span>
          Not in your library.{' '}
          <Link href={`/library/new?title=${encodeURIComponent(label)}`}>Add a module</Link> if you&apos;ve done this.
        </span>
      )
    }
    return (
      <div className="rd-gap-list">
        <span>Your library has this, but it&apos;s not on the page:</span>
        {candidates.slice(0, 2).map(({ m, entry }) => (
          <div key={m.id} className="rd-gap-item">
            <span><strong>{m.title}</strong> · {doc.experience[entry].company}</span>
            <button type="button" onClick={() => addFromRail(entry, m, 'fit')}>+ Add</button>
          </div>
        ))}
      </div>
    )
  }

  const addFromRail = (entryIndex: number, m: EditorModule, from: 'library' | 'fit' = 'library') => {
    insertModule(entryIndex, m)
    track('library_add', { from })
  }

  const openTab = (tab: 'fit' | 'changes' | 'library') => {
    if (tab !== railTab) track('rail_tab', { tab })
    setRailTab(tab)
    if (tab === 'changes' && suggestions === null && !sugLoading && criteria.length > 0) void findSuggestions()
  }

  const undoFact = (blockId: string) => {
    const clean = lastClean.current.get(blockId)
    const block = blockById(blockId)
    commit(d => withText(d, blockId, clean ?? block?.original ?? ''))
  }

  // ── Design & Export ───────────────────────────────────────────────────────
  // Design changes apply to this resume and become the defaults for new drafts.
  const track = (name: 'export_text' | 'library_add' | 'rail_tab', metadata: Record<string, string | number | boolean> = {}) => {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, metadata: { resume_doc_id: docId, ...metadata } }),
    }).catch(() => {})
  }

  const saveDefaults = (patch: Record<string, unknown>) => {
    fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_defaults: patch }),
    }).catch(() => {})
  }
  const setTemplate = (format: ResumeDocFormat) => {
    commit(d => ({ ...d, format }))
    saveDefaults({ format })
  }
  const toggleSection = (section: ToggleableSection) => {
    const hidden = isHidden(doc, section)
    commit(d => ({
      ...d,
      hidden_sections: hidden ? (d.hidden_sections ?? []).filter(x => x !== section) : [...(d.hidden_sections ?? []), section],
    }))
    saveDefaults({ [`include_${section}`]: hidden })
  }
  const toggleCoverLetter = () => {
    const next = !coverLetterDefault
    setCoverLetterDefault(next)
    saveDefaults({ include_cover_letter: next })
  }
  const openMenu = (which: 'design' | 'export') => {
    setMenu(m => (m === which ? null : which))
    if (which === 'design' && coverLetterDefault === null) {
      fetch('/api/preferences').then(r => r.json())
        .then(({ preferences }) => setCoverLetterDefault(!!preferences?.resume_defaults?.include_cover_letter))
        .catch(() => setCoverLetterDefault(false))
    }
  }
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [menu])

  const copyText = async () => {
    finish()
    try {
      await navigator.clipboard.writeText(docPlainText(docRef.current))
      track('export_text')
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setNotice("Couldn't copy to the clipboard. Download a file instead.")
    }
  }

  const download = async (type: 'pdf' | 'docx') => {
    finish()
    if (warnings.size > 0) {
      const n = warnings.size
      if (!window.confirm(`${n} ${n === 1 ? 'line has' : 'lines have'} facts that aren't in your library. Download anyway?`)) return
    }
    await flushSave()
    window.location.href = `/api/resume-docs/${docId}/download?type=${type}`
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Rendering ─────────────────────────────────────────────────────────────
  const line = (id: string, opts: { placeholder?: string; style?: React.CSSProperties; removable?: boolean; swapEntry?: number; ai?: boolean } = {}) => {
    const block = blockById(id)
    if (!block) return null
    const active = activeId === id
    const isSynthetic = id.startsWith('__')
    return (
      <div data-block-anchor={id} className={`rd-line${active ? ' rd-line-active' : ''}${warnings.has(id) ? ' rd-line-warn' : ''}${highlightIds.has(id) ? ' rd-line-hl' : ''}${flashId === id ? ' rd-line-flash' : ''}`} style={{ position: 'relative' }}>
        {active && (
          <div
            ref={toolbarRef}
            data-resume-toolbar
            role="toolbar"
            aria-label="Line actions"
            className="rd-toolbar"
            onMouseDown={e => { if ((e.target as HTMLElement).tagName !== 'BUTTON') e.preventDefault() }}
          >
            {!isSynthetic && opts.ai !== false && (
              <>
                <button type="button" disabled={!!aiBusy || !block.text.trim()} onClick={() => runAi(id, 'shorter')}>✦ Shorter</button>
                <button type="button" disabled={!!aiBusy || !block.text.trim()} onClick={() => runAi(id, 'stronger')}>✦ Stronger</button>
                {jd && jd.criteria.length > 0 && (
                  <button type="button" disabled={!!aiBusy || !block.text.trim()} onClick={() => runAi(id, 'their_words')} title="Use the posting's wording where your module supports it">✦ Their words</button>
                )}
              </>
            )}
            {aiBusy === id && <span className="rd-toolbar-hint">Writing…</span>}
            {opts.swapEntry !== undefined && availableFor(opts.swapEntry).length > 0 && (
              <button type="button" onClick={() => setSwapOpen(v => !v)} title="Replace with another module from this job">⇄ Swap</button>
            )}
            {block.text !== block.original && block.original && (
              <button type="button" onClick={() => restoreOriginal(id)} title="Back to what generation wrote">↺ Original</button>
            )}
            {opts.removable && <button type="button" onClick={() => removeBlock(id)} title="Remove this line">✕</button>}
            {isSynthetic && <span className="rd-toolbar-hint">Enter to finish</span>}
            {askFor === id && (
              <form
                className="rd-ask"
                onSubmit={e => { e.preventDefault(); if (askText.trim()) void runAi(id, 'custom', askText.trim()) }}
              >
                <span aria-hidden>✦</span>
                <input
                  autoFocus
                  value={askText}
                  onChange={e => setAskText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setAskFor(null); setActiveId(id) } }}
                  placeholder="Ask AI: make this about enterprise expansion"
                  maxLength={200}
                  aria-label="Ask AI to write this line"
                />
              </form>
            )}
            {swapOpen && opts.swapEntry !== undefined && (
              <div className="rd-popover" role="listbox" aria-label="Swap with">
                {availableFor(opts.swapEntry).map(m => (
                  <button key={m.id} type="button" className="rd-popover-item" onClick={() => swapWith(id, m)}>
                    <strong>{m.title}</strong>
                    <span>{moduleResumeLine(m.content)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {active ? (
          <BlockEditor
            key={block.id}
            block={block}
            placeholder={opts.placeholder}
            style={opts.style}
            onChange={onType}
            onFinish={finish}
            onOpenToolbar={() => toolbarRef.current?.querySelector('button')?.focus()}
            onSlash={isSynthetic || opts.ai === false ? undefined : () => { setAskText(''); setAskFor(id) }}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            className="rd-static"
            style={opts.style}
            onClick={() => activate(id)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); activate(id) } }}
          >
            {block.text || <span className="rd-placeholder">{opts.placeholder ?? 'Click to add'}</span>}
          </div>
        )}
        {warnings.has(id) && aiBusy !== id && (() => {
          const w = warnings.get(id)!
          const terms = w.terms.map(t => `“${t.term}”`)
          const named = terms.length === 1 ? terms[0] : `${terms.slice(0, -1).join(', ')} and ${terms.at(-1)}`
          const label = [w.module.source_company, w.module.title].filter(Boolean).join(' · ')
          return (
            <div className="rd-note rd-note-warn" role="status">
              <span>⚠ {named} {terms.length === 1 ? "isn't" : "aren't"} in your “{label}” module.</span>
              <span className="rd-note-actions">
                <button type="button" onClick={() => addFactToModule(id)}>Add it to the module</button>
                <span aria-hidden>·</span>
                <button type="button" onClick={() => undoFact(id)}>Undo</button>
              </span>
            </div>
          )
        })()}
        {writeBack?.blockId === id && !active && !warnings.has(id) && (
          <div className="rd-writeback">
            {writeBack.state === 'saved' ? (
              <span>Saved to your library ✓</span>
            ) : (
              <>
                <button type="button" disabled={writeBack.state === 'saving'} onClick={() => saveToLibrary(id)}>
                  {writeBack.state === 'saving' ? 'Saving…' : 'Save to your library too?'}
                </button>
                <button type="button" aria-label="No thanks" onClick={() => setWriteBack(null)}>×</button>
              </>
            )}
          </div>
        )}
        {aiMessage?.blockId === id && (
          <div className="rd-note rd-note-warn" role="status">
            {aiMessage.text}
            <button type="button" onClick={() => setAiMessage(null)} aria-label="Dismiss">×</button>
          </div>
        )}
      </div>
    )
  }

  const experienceGroups = useMemo(
    () => groupExperienceByCompany(doc.experience.map((e, index) => ({ ...e, index }))),
    [doc.experience],
  )

  const bulletList = (entryIndex: number) => {
    const entry = doc.experience[entryIndex]
    const available = availableFor(entryIndex)
    return (
      <>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => reorder(entryIndex, e)}>
          <SortableContext items={entry.bullets.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <ul className="rd-bullets">
              {entry.bullets.map(b => (
                <SortableBullet key={b.id} id={b.id} glyph={doc.bullet_style}>
                  {line(b.id, { removable: true, swapEntry: entryIndex, placeholder: 'Type a line, or / to ask AI' })}
                </SortableBullet>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <div className="rd-add">
          <button type="button" className="rd-add-toggle" onClick={() => setAddOpenFor(v => (v === entryIndex ? null : entryIndex))}>
            + Add from your library{available.length > 0 ? ` (${available.length})` : ''}
          </button>
          {addOpenFor === entryIndex && (
            <div className="rd-add-list">
              <button type="button" className="rd-popover-item" onClick={() => insertBlank(entryIndex)}>
                <strong>Blank line</strong>
                <span>Write it yourself, or type / to ask AI to write it from this job&apos;s modules.</span>
              </button>
              {available.map(m => (
                <button key={m.id} type="button" className="rd-popover-item" onClick={() => insertModule(entryIndex, m)}>
                  <strong>{m.title}</strong>
                  <span>{moduleResumeLine(m.content)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="rd-layout">
    <div className="rd-root">
      <style>{EDITOR_CSS}</style>

      <div className="rd-head" ref={menuRef}>
        <div className="rd-head-main">
          <div className="rd-head-title">{jd?.title || doc.header.title || 'Your resume'}</div>
          <div className="rd-head-sub">
            {jd?.company && <span>{jd.company}</span>}
            <span className={`rd-save rd-save-${saveState}`} aria-live="polite">{saveLabel(saveState)}</span>
          </div>
        </div>
        {criteria.length > 0 && (
          <button type="button" className="rd-head-fit" onClick={() => openTab('fit')} title="Fit for this job">
            <span style={{ color: fitColor(headerScore) }}>{headerScore}</span> fit
          </button>
        )}
        <div className="rd-head-actions">
          <button type="button" className="btn-ghost rd-small" onClick={undo} disabled={!canUndo || !!activeId} title="Undo (⌘Z)" aria-label="Undo">↶</button>
          <button type="button" className="btn-ghost rd-small" onClick={redo} disabled={!canRedo || !!activeId} title="Redo (⌘⇧Z)" aria-label="Redo">↷</button>
          <div className="rd-menu-wrap">
            <button type="button" className="btn-ghost rd-small" aria-expanded={menu === 'design'} onClick={() => openMenu('design')}>Design ▾</button>
            {menu === 'design' && (
              <div className="rd-menu" role="dialog" aria-label="Design">
                <div className="rd-menu-label">Template</div>
                {RESUME_FORMATS.filter(f => f !== 'combination' || doc.format === 'combination').map(f => (
                  <label key={f} className="rd-menu-row">
                    <input type="radio" name="rd-template" checked={doc.format === f} onChange={() => setTemplate(f)} />
                    {FORMAT_LABELS[f]}
                  </label>
                ))}
                <div className="rd-menu-label">Sections</div>
                {([
                  ['summary', 'Summary', !!doc.summary.text.trim()],
                  ['skills', 'Skills', doc.skills.length > 0],
                  ['education', 'Education', doc.education.length > 0],
                  ['awards', 'Awards & certifications', !!doc.awards.trim()],
                ] as const).filter(([, , has]) => has).map(([key, label]) => (
                  <label key={key} className="rd-menu-row">
                    <input type="checkbox" checked={!isHidden(doc, key)} onChange={() => toggleSection(key)} />
                    {label}
                  </label>
                ))}
                <div className="rd-menu-label">Cover letter</div>
                <label className="rd-menu-row">
                  <input type="checkbox" checked={!!coverLetterDefault} disabled={coverLetterDefault === null} onChange={toggleCoverLetter} />
                  Write one with new drafts
                </label>
                <div className="rd-menu-foot">Saved as your defaults for new drafts.</div>
              </div>
            )}
          </div>
          <div className="rd-menu-wrap">
            <button type="button" className="btn-primary rd-small" aria-expanded={menu === 'export'} onClick={() => openMenu('export')}>Export ▾</button>
            {menu === 'export' && (
              <div className="rd-menu rd-menu-right" role="menu" aria-label="Export">
                <button type="button" role="menuitem" className="rd-menu-item" onClick={() => { setMenu(null); void download('pdf') }}>PDF</button>
                <button type="button" role="menuitem" className="rd-menu-item" onClick={() => { setMenu(null); void download('docx') }}>Word (.docx)</button>
                <button type="button" role="menuitem" className="rd-menu-item" onClick={() => void copyText()}>{copied ? 'Copied ✓' : 'Copy text'}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div className="rd-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="rd-paper" aria-label={jd ? `Resume for ${jd.title}` : 'Resume'}>
        <header className="rd-header">
          {line(NAME_ID, { placeholder: 'Your name', style: { fontSize: 24, fontWeight: 700, textAlign: 'center', letterSpacing: '0.02em' } })}
          {line(TITLE_ID, { placeholder: 'Target title', style: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', color: '#555' } })}
          {line(CONTACT_ID, { placeholder: 'email · phone · city · LinkedIn', style: { fontSize: 11.5, textAlign: 'center', color: '#666' } })}
        </header>

        {(doc.summary.text || activeId === doc.summary.id) && !isHidden(doc, 'summary') && (
          <section>
            <h2 className="rd-h2">Summary</h2>
            {line(doc.summary.id, { removable: true, placeholder: 'A 2–3 sentence summary' })}
          </section>
        )}

        {doc.skill_sections.length > 0 && (
          <section>
            <h2 className="rd-h2">Relevant skills</h2>
            {doc.skill_sections.map((s, i) => (
              <div key={s.id} className="rd-job">
                <div className="rd-role-title">{s.category}</div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => reorderSkillSection(i, e)}>
                  <SortableContext items={s.bullets.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    <ul className="rd-bullets">
                      {s.bullets.map(b => (
                        <SortableBullet key={b.id} id={b.id} glyph={doc.bullet_style}>
                          {line(b.id, { removable: true })}
                        </SortableBullet>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              </div>
            ))}
          </section>
        )}

        {doc.experience.length > 0 && (
          <section>
            <h2 className="rd-h2">Experience</h2>
            {experienceGroups.map(group => (
              <div key={group.roles[0].job_id} className="rd-job">
                {group.roles.length === 1 ? (
                  <>
                    <div className="rd-job-head">
                      <span><span className="rd-role-title">{group.roles[0].title}</span>{group.roles[0].title && group.company ? ', ' : ''}<span className="rd-company">{group.company}</span></span>
                      <span className="rd-dates">{group.roles[0].dates}</span>
                    </div>
                    {bulletList(group.roles[0].index)}
                  </>
                ) : (
                  <>
                    <div className="rd-job-head">
                      <span className="rd-company rd-company-strong">{group.company}</span>
                      <span className="rd-dates">{group.tenure}</span>
                    </div>
                    {group.roles.map(role => (
                      <div key={role.job_id} className="rd-nested-role">
                        <div className="rd-job-head">
                          <span className="rd-role-title">{role.title}</span>
                          <span className="rd-dates">{role.dates}</span>
                        </div>
                        {bulletList(role.index)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </section>
        )}

        {(doc.skills.length > 0 || activeId === SKILLS_ID) && !isHidden(doc, 'skills') && (
          <section>
            <h2 className="rd-h2">Skills</h2>
            {line(SKILLS_ID, { placeholder: 'Comma-separated skills' })}
          </section>
        )}

        {doc.education.length > 0 && !isHidden(doc, 'education') && (
          <section>
            <h2 className="rd-h2">Education</h2>
            {doc.education.map(b => <div key={b.id}>{line(b.id, { removable: true, ai: false })}</div>)}
          </section>
        )}

        {(doc.awards || activeId === AWARDS_ID) && !isHidden(doc, 'awards') && (
          <section>
            <h2 className="rd-h2">Awards &amp; certifications</h2>
            {line(AWARDS_ID)}
          </section>
        )}
      </div>

      <p className="rd-help">
        Click any line to edit it. Enter or Esc finishes. Drag ⋮⋮ to reorder within a job. Exports use exactly what you see here.
      </p>
    </div>
    <aside className="rd-aside">
      <div className="rd-rail">
        <div className="rd-tabs" role="tablist" aria-label="Resume tools">
          {criteria.length > 0 && (
            <button type="button" role="tab" aria-selected={railTab === 'fit'} className={railTab === 'fit' ? 'on' : ''} onClick={() => openTab('fit')}>Fit</button>
          )}
          <button type="button" role="tab" aria-selected={railTab === 'changes'} className={railTab === 'changes' ? 'on' : ''} onClick={() => openTab('changes')}>
            Changes{openGaps.length + (suggestions?.length ?? 0) > 0 ? ` (${openGaps.length + (suggestions?.length ?? 0)})` : ''}
          </button>
          <button type="button" role="tab" aria-selected={railTab === 'library'} className={railTab === 'library' ? 'on' : ''} onClick={() => openTab('library')}>Library</button>
        </div>
        {railTab === 'fit' && criteria.length > 0 && (
          <FitPanel
            live={live}
            score={shownScore}
            checking={fitChecking}
            serverChecked={!!serverFit && serverFit.clientAt === live.score}
            selected={highlight}
            onSelect={selectRequirement}
            coverCount={label => coverage.get(label)?.length ?? 0}
            renderGap={renderGap}
            keywords={keywords}
          />
        )}
        {railTab === 'changes' && (
          <div className="rd-rail-body">
            {criteria.length > 0 ? (
              <SuggestionsPanel
                suggestions={suggestions}
                loading={sugLoading}
                error={sugError}
                isStale={sug => blockById(sug.block_id)?.text !== sug.based_on}
                onFind={findSuggestions}
                onAccept={acceptSuggestion}
                onDismiss={sug => setSuggestions(prev => (prev ?? []).filter(x => x.block_id !== sug.block_id))}
                onShow={sug => showBlock(sug.block_id)}
              />
            ) : (
              <div className="rd-fit-sub">Suggested edits need the job&apos;s requirements, and this resume has none.</div>
            )}
            {openGaps.length > 0 && <div style={{ marginTop: 16 }}><UnsupportedPhrases phrases={openGaps} /></div>}
          </div>
        )}
        {railTab === 'library' && (
          <LibraryRail groups={libraryGroups} preview={m => moduleResumeLine(m.content)} onShow={showBlock} onAdd={addFromRail} />
        )}
      </div>
    </aside>
    </div>
  )
}

function SortableBullet({ id, glyph, children }: { id: string; glyph: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      className={`rd-bullet${isDragging ? ' rd-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="rd-handle"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      {glyph && <span className="rd-glyph" aria-hidden>{glyph}</span>}
      <div className="rd-bullet-body">{children}</div>
    </li>
  )
}

const EDITOR_CSS = `
.rd-layout { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
.rd-root { display: flex; flex-direction: column; gap: 14px; min-width: 0; flex: 1 1 560px; max-width: 780px; }
.rd-aside { flex: 0 1 300px; position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; min-width: 260px; }
.rd-rail { background: var(--surface); border: 1px solid var(--border2); border-radius: 10px; overflow: hidden; }
.rd-tabs { display: flex; border-bottom: 1px solid var(--border2); }
.rd-tabs button { flex: 1; background: none; border: none; border-bottom: 2px solid transparent; padding: 10px 8px; font: 600 12.5px var(--font); color: var(--text3); cursor: pointer; margin-bottom: -1px; }
.rd-tabs button.on { color: var(--teal); border-bottom-color: var(--teal); }
.rd-tabs button:focus-visible { outline: 2px solid var(--teal); outline-offset: -2px; }
.rd-rail-body { padding: 16px; max-height: calc(100vh - 140px); overflow-y: auto; }
.rd-reqs { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rd-req { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: 8px; padding: 7px 8px; cursor: pointer; font: 13px var(--font); color: var(--text2); }
.rd-req:hover { background: var(--bg3); }
.rd-req.selected { border-color: var(--teal-glow, var(--teal)); background: var(--teal-dim); }
.rd-req.pop { animation: rd-pop 0.6s ease; }
.rd-req-mark { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--border2); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.rd-req.covered .rd-req-mark { background: var(--teal); border-color: var(--teal); color: #fff; }
.rd-req-label { flex: 1; min-width: 0; }
.rd-req-meta { font-size: 11px; color: var(--text3); white-space: nowrap; }
.rd-req-gap { font-size: 12.5px; color: var(--text2); padding: 6px 10px 8px 34px; line-height: 1.45; }
.rd-req-gap a { color: var(--teal); }
.rd-gap-list { display: flex; flex-direction: column; gap: 6px; }
.rd-gap-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.rd-gap-item button, .rd-lib-add { background: none; border: 1px solid var(--teal); color: var(--teal); border-radius: 6px; padding: 2px 8px; font: 600 11.5px var(--font); cursor: pointer; white-space: nowrap; }
.rd-lib-group { margin-bottom: 16px; }
.rd-lib-heading { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.rd-lib-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; text-align: left; background: none; border: none; border-radius: 6px; padding: 6px 6px; font: 12.5px var(--font); color: var(--text2); cursor: pointer; }
.rd-lib-item:hover { background: var(--bg3); }
.rd-lib-avail { cursor: default; }
.rd-lib-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rd-lib-title { color: var(--text); }
.rd-lib-preview { font-size: 11.5px; color: var(--text3); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.rd-lib-state.on { font-size: 11px; color: var(--teal); white-space: nowrap; }
.rd-line.rd-line-hl { background: rgba(29,158,117,0.12); box-shadow: inset 3px 0 0 #1d9e75; }
.rd-line.rd-line-flash { animation: rd-flash 1.4s ease; }
@keyframes rd-flash { 0%, 60% { background: rgba(29,158,117,0.22); } 100% { background: transparent; } }
.rd-fit-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.rd-fit-label { font-size: 13px; font-weight: 700; color: var(--text); }
.rd-fit-sub { font-size: 12px; color: var(--text3); margin-top: 2px; }
.rd-fit-score { position: relative; font-size: 34px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.rd-fit-delta { position: absolute; right: 0; top: -14px; font-size: 12px; font-weight: 700; animation: rd-rise 1.6s ease forwards; }
.rd-fit-delta.up { color: var(--teal); }
.rd-fit-delta.down { color: var(--rose); }
@keyframes rd-rise { 0% { opacity: 0; transform: translateY(4px); } 15% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-4px); } }
.rd-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.rd-chip { font-size: 11.5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border2); color: var(--text3); transition: background 0.2s, color 0.2s, border-color 0.2s; }
.rd-chip.covered { background: var(--teal-dim); border-color: var(--teal-glow, var(--teal)); color: var(--teal); }
.rd-chip.pop { animation: rd-pop 0.6s ease; }
@keyframes rd-pop { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
.rd-fit-foot { font-size: 11px; color: var(--text3); margin-top: 12px; }
.rd-sugs { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.rd-sug { border-top: 1px solid var(--border2); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.rd-sug-reason { font-size: 11.5px; color: var(--teal); font-weight: 600; }
.rd-sug-text { text-align: left; background: none; border: none; padding: 0; cursor: pointer; font: 13px/1.45 Georgia, 'Times New Roman', serif; color: var(--text); }
.rd-sug-actions { display: flex; gap: 6px; }
@media (prefers-reduced-motion: reduce) { .rd-chip.pop, .rd-fit-delta { animation: none; } }
@media (max-width: 900px) { .rd-aside { position: static; flex-basis: 100%; } }
.rd-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.rd-head-main { flex: 1; min-width: 200px; }
.rd-head-title { font-size: 17px; font-weight: 700; color: var(--text); line-height: 1.25; }
.rd-head-sub { display: flex; gap: 10px; align-items: center; font-size: 12.5px; color: var(--text3); margin-top: 2px; flex-wrap: wrap; }
.rd-head-fit { background: var(--surface); border: 1px solid var(--border2); border-radius: 999px; padding: 4px 12px; font: 600 12.5px var(--font); color: var(--text2); cursor: pointer; }
.rd-head-fit span { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.rd-head-actions { display: flex; align-items: center; gap: 6px; }
.rd-menu-wrap { position: relative; }
.rd-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; min-width: 230px; padding: 8px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border2); box-shadow: 0 8px 28px rgba(0,0,0,0.22); display: flex; flex-direction: column; gap: 2px; }
.rd-menu-right { left: auto; right: 0; min-width: 170px; }
.rd-menu-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text3); padding: 8px 6px 4px; }
.rd-menu-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); padding: 5px 6px; border-radius: 6px; cursor: pointer; }
.rd-menu-row:hover { background: var(--bg3); }
.rd-menu-row input { accent-color: var(--teal); }
.rd-menu-foot { font-size: 11.5px; color: var(--text3); padding: 8px 6px 2px; border-top: 1px solid var(--border2); margin-top: 6px; }
.rd-menu-item { text-align: left; background: none; border: none; border-radius: 6px; padding: 8px 10px; font: 13px var(--font); color: var(--text); cursor: pointer; }
.rd-menu-item:hover, .rd-menu-item:focus-visible { background: var(--bg3); outline: none; }
.rd-small { font-size: 12.5px; }
.rd-save { font-size: 12px; color: var(--text3); min-width: 70px; }
.rd-save-error { color: var(--rose); }
.rd-format { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text3); }
.rd-format select { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border2); border-radius: 6px; padding: 3px 6px; }
.rd-notice { display: flex; justify-content: space-between; gap: 12px; align-items: center; font-size: 13px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--amber, #b7791f); background: var(--surface); color: var(--text); }
.rd-notice button { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--text3); }
.rd-paper { background: #fff; color: #1a1a1a; font-family: Georgia, 'Times New Roman', serif; font-size: 12.5px; line-height: 1.5; padding: 44px 56px 52px; border-radius: 4px; box-shadow: 0 2px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06); max-width: 780px; width: 100%; }
.rd-header { margin-bottom: 14px; }
.rd-h2 { font-size: 12px; font-weight: 700; font-variant: small-caps; letter-spacing: 0.08em; border-bottom: 1px solid #555; padding-bottom: 2px; margin: 16px 0 8px; color: #222; }
.rd-job { margin-bottom: 10px; }
.rd-job-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.rd-role-title { font-weight: 700; }
.rd-company { font-style: italic; }
.rd-company-strong { font-weight: 700; font-style: normal; }
.rd-dates { font-size: 11.5px; color: #666; white-space: nowrap; }
.rd-nested-role { margin: 4px 0 0 12px; }
.rd-bullets { list-style: none; margin: 3px 0 0; padding: 0; }
.rd-bullet { display: flex; align-items: flex-start; gap: 6px; position: relative; }
.rd-bullet-body { flex: 1; min-width: 0; }
.rd-glyph { flex-shrink: 0; padding-top: 2px; }
.rd-handle { position: absolute; left: -26px; top: 2px; width: 20px; border: none; background: none; color: #aaa; cursor: grab; font-size: 11px; letter-spacing: -2px; opacity: 0; padding: 2px 0; touch-action: none; }
.rd-bullet:hover .rd-handle, .rd-handle:focus-visible { opacity: 1; }
.rd-dragging { opacity: 0.6; z-index: 2; background: #fff; }
.rd-line { border-radius: 3px; margin: 0 -4px; padding: 1px 4px; }
.rd-static { cursor: text; outline: none; border-radius: 3px; min-height: 1.5em; }
.rd-line:not(.rd-line-active):hover { background: #f4f4f1; }
.rd-static:focus-visible { box-shadow: 0 0 0 2px rgba(29,158,117,0.5); }
.rd-line-active { background: rgba(29,158,117,0.07); box-shadow: 0 0 0 1px rgba(29,158,117,0.45); }
.rd-placeholder { color: #aaa; font-style: italic; }
.resume-block-editor { outline: none; min-height: 1.5em; }
.resume-block-editor p { margin: 0; }
.resume-block-editor p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #aaa; font-style: italic; float: left; height: 0; pointer-events: none; }
.rd-toolbar { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 20; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 8px; background: var(--surface, #fff); border: 1px solid var(--border2, #ddd); box-shadow: 0 4px 16px rgba(0,0,0,0.18); font-family: var(--font, system-ui); white-space: nowrap; }
.rd-toolbar button { font: 600 12px var(--font, system-ui); color: var(--text, #222); background: none; border: none; border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.rd-toolbar button:hover, .rd-toolbar button:focus-visible { background: var(--bg3, #f0f0f0); outline: none; }
.rd-toolbar button:disabled { opacity: 0.5; cursor: default; }
.rd-toolbar-hint { font-size: 11px; color: var(--text3, #888); padding: 0 8px; }
.rd-popover, .rd-add-list { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; padding: 4px; border-radius: 8px; background: var(--surface, #fff); border: 1px solid var(--border2, #ddd); box-shadow: 0 6px 20px rgba(0,0,0,0.18); font-family: var(--font, system-ui); }
.rd-popover { position: absolute; top: calc(100% + 4px); left: 0; width: min(420px, 80vw); white-space: normal; }
.rd-popover-item { display: flex; flex-direction: column; gap: 2px; text-align: left; background: none; border: none; border-radius: 6px; padding: 7px 9px; cursor: pointer; font: 12.5px var(--font, system-ui); color: var(--text, #222); }
.rd-popover-item span { color: var(--text3, #777); font-size: 12px; line-height: 1.4; }
.rd-popover-item:hover, .rd-popover-item:focus-visible { background: var(--bg3, #f0f0f0); outline: none; }
.rd-add { margin: 4px 0 0 12px; font-family: var(--font, system-ui); }
.rd-add-toggle { background: none; border: none; padding: 2px 0; cursor: pointer; font-size: 12px; color: #0F6E56; }
.rd-add-list { margin-top: 4px; }
.rd-help { font-size: 12px; color: var(--text3); margin: 0; }
.rd-ask { display: flex; align-items: center; gap: 6px; padding: 0 6px 0 8px; border-left: 1px solid var(--border2, #ddd); color: #0F6E56; }
.rd-ask input { font: 12.5px var(--font, system-ui); border: none; outline: none; background: transparent; color: var(--text, #222); width: 260px; padding: 5px 0; }
.rd-note { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; padding: 4px 8px; border-radius: 4px; font: 12px var(--font, system-ui); }
.rd-note button { background: none; border: none; cursor: pointer; color: inherit; font-size: 14px; padding: 0 2px; }
.rd-note-warn { background: #fdf3e1; color: #7a4b07; flex-wrap: wrap; }
.rd-note-actions { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.rd-note-actions button { font: 600 12px var(--font, system-ui); text-decoration: underline; padding: 0; }
.rd-line.rd-line-warn, .rd-line.rd-line-warn:hover { background: #fdf0d5; }
.rd-writeback { display: flex; align-items: center; gap: 6px; margin-top: 2px; font: 12px var(--font, system-ui); color: #0F6E56; }
.rd-writeback button { background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: inherit; }
.rd-writeback button:first-child { text-decoration: underline; }
.rd-writeback button[aria-label] { color: #999; font-size: 14px; }
@media (max-width: 640px) { .rd-paper { padding: 28px 22px 32px; } .rd-handle { display: none; } }
`
