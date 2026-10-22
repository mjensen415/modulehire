'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import BlockEditor from './BlockEditor'
import { useDocHistory } from './useDocHistory'
import { useAutosave, type SaveState } from './useAutosave'
import {
  RESUME_FORMATS, contactLine, makeBlock, mapBlocks, modulesOnResume, updateBlockText,
  type Block, type ResumeDoc, type ResumeDocFormat,
} from '@/lib/resume-doc'
import { groupExperienceByCompany, normalizeCompany } from '@/lib/resume-dates'
import { splitSentences } from '@/lib/fact-check'
import type { JdCriterion } from '@/lib/dimensions'

export type EditorModule = {
  id: string
  title: string
  content: string
  source_company: string | null
  /** job_experiences this module is assigned to. */
  job_ids: string[]
}

export type EditorJd = { id: string; title: string; company: string | null; criteria: JdCriterion[] } | null

type Props = {
  docId: string
  initialDoc: ResumeDoc
  initialVersion: number
  modules: EditorModule[]
  jd: EditorJd
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

export default function ResumeEditor({ docId, initialDoc, initialVersion, modules, jd }: Props) {
  const history = useDocHistory(initialDoc)
  const { doc, commit, setLive, beginEdit, endEdit, undo, redo, reset } = history
  const [activeId, setActiveId] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [addOpenFor, setAddOpenFor] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Line-level AI: which line is being rewritten, and the last message per line.
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiMessage, setAiMessage] = useState<{ blockId: string; text: string } | null>(null)
  const [askFor, setAskFor] = useState<string | null>(null)
  const [askText, setAskText] = useState('')
  const toolbarRef = useRef<HTMLDivElement>(null)

  const onConflict = useCallback((latest: { doc: ResumeDoc; version: number }) => {
    setActiveId(null)
    reset(latest.doc)
    setNotice('This resume was changed in another tab, so we loaded the latest version. Your last edit here wasn\'t saved.')
  }, [reset])
  // On a 409 the autosave hook has already marked the server's doc as saved, so reset() to that
  // same object doesn't trigger another save.
  const autosave = useAutosave(docId, doc, initialVersion, onConflict)

  const onResume = useMemo(() => modulesOnResume(doc), [doc])

  // Modules that belong to a job (by assignment, else by company) and aren't on the resume yet.
  const availableFor = useCallback((entryIndex: number): EditorModule[] => {
    const entry = doc.experience[entryIndex]
    if (!entry) return []
    const company = normalizeCompany(entry.company)
    return modules.filter(m => {
      if (onResume.has(m.id)) return false
      if (m.job_ids.includes(entry.job_id)) return true
      return m.job_ids.length === 0 && !!company && normalizeCompany(m.source_company) === company
    })
  }, [doc.experience, modules, onResume])

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
    // Contact line: normalize the display string to the parsed fields once editing ends.
    if (activeId === CONTACT_ID) setLive(d => ({ ...d, header: { ...d.header, contact: contactLine(d.header.contact_fields) } }))
    endEdit()
    setActiveId(null)
    setSwapOpen(false)
  }, [activeId, endEdit, setLive])

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

  const download = async (type: 'pdf' | 'docx') => {
    finish()
    await autosave.flush()
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
      <div className={`rd-line${active ? ' rd-line-active' : ''}`} style={{ position: 'relative' }}>
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
    <div className="rd-root">
      <style>{EDITOR_CSS}</style>

      <div className="rd-bar">
        <div className="rd-bar-left">
          <span className={`rd-save rd-save-${autosave.state}`} aria-live="polite">{saveLabel(autosave.state)}</span>
          <button type="button" className="btn-ghost rd-small" onClick={undo} disabled={!history.canUndo || !!activeId} title="Undo (⌘Z)">↶</button>
          <button type="button" className="btn-ghost rd-small" onClick={redo} disabled={!history.canRedo || !!activeId} title="Redo (⌘⇧Z)">↷</button>
          <label className="rd-format">
            Template
            <select
              value={doc.format}
              onChange={e => commit(d => ({ ...d, format: e.target.value as ResumeDocFormat }))}
            >
              {RESUME_FORMATS.filter(f => f !== 'combination' || doc.format === 'combination').map(f => (
                <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rd-bar-right">
          <button type="button" className="btn-primary rd-small" onClick={() => download('pdf')}>Download PDF</button>
          <button type="button" className="btn-ghost rd-small" onClick={() => download('docx')}>Word</button>
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

        {(doc.summary.text || activeId === doc.summary.id) && (
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

        {(doc.skills.length > 0 || activeId === SKILLS_ID) && (
          <section>
            <h2 className="rd-h2">Skills</h2>
            {line(SKILLS_ID, { placeholder: 'Comma-separated skills' })}
          </section>
        )}

        {doc.education.length > 0 && (
          <section>
            <h2 className="rd-h2">Education</h2>
            {doc.education.map(b => <div key={b.id}>{line(b.id, { removable: true, ai: false })}</div>)}
          </section>
        )}

        {(doc.awards || activeId === AWARDS_ID) && (
          <section>
            <h2 className="rd-h2">Awards &amp; certifications</h2>
            {line(AWARDS_ID)}
          </section>
        )}
      </div>

      <p className="rd-help">
        Click any line to edit it. Enter or Esc finishes. Drag ⋮⋮ to reorder within a job. Downloads use exactly what you see here.
      </p>
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
.rd-root { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.rd-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.rd-bar-left, .rd-bar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
.rd-note-warn { background: #fdf3e1; color: #7a4b07; }
@media (max-width: 640px) { .rd-paper { padding: 28px 22px 32px; } .rd-handle { display: none; } }
`
