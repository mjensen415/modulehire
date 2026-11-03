'use client'

// The /mcp page's "product video": a mock AI chat that plays three short scenes (save a win,
// tailor a resume, edit a line) on a timeline. Plays only while on screen; with reduced motion
// each scene shows its finished state and nothing moves on its own. All names are fictional.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import s from './mcp.module.css'

// `ask` is what the user types: it fills the composer, then lands in the chat as a message.
type Ask = { text: string; start: number; cps: number }
type Scene = { id: string; label: string; duration: number; ask: Ask; render: (t: number) => ReactNode }

/** When the user's message leaves the composer and appears in the chat. */
const sentAt = (a: Ask) => a.start + (a.text.length * 1000) / a.cps + 350

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n))
const progress = (t: number, start: number, end: number) => clamp((t - start) / (end - start))

/** The first characters of `text` typed since `start`, at `cps` characters a second. */
function typed(text: string, t: number, start: number, cps = 42): string {
  if (t < start) return ''
  return text.slice(0, Math.floor(((t - start) * cps) / 1000))
}

function UserMsg({ ask, t }: { ask: Ask; t: number }) {
  if (t < sentAt(ask)) return null
  return <div className={s.msgUser}>{ask.text}</div>
}

function AssistantMsg({ text }: { text: string }) {
  if (!text) return null
  return <div className={s.msgAssistant}>{text}</div>
}

function ToolChip({ title, done, children }: { title: string; done: boolean; children?: ReactNode }) {
  return (
    <div className={`${s.toolChip} ${done ? s.toolChipDone : ''}`}>
      <div className={s.toolChipHead}>
        <span className={s.toolChipMark}>MH</span>
        <span className={s.toolChipName}>
          ModuleHire <span className={s.toolChipSep}>·</span> {title}
        </span>
        {done ? (
          <svg className={s.toolCheck} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-label="done">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className={s.spinner} aria-label="running" />
        )}
      </div>
      {children}
    </div>
  )
}

const WIN_USER = 'Just finished moving our 140 services to Kubernetes with six teams. Deploys went from 40 minutes to 6. Save that to my library?'
const WIN_REPLY = 'Saved under Platform Engineer at Northwind. It is ready for your next resume.'
const TAILOR_USER = 'Tailor my resume for the Lumen Pay infrastructure role I saved.'
const TAILOR_REPLY = 'Here is your draft. Fit is 86 out of 100; the one gap is on-call leadership.'
const EDIT_USER = 'Make the first bullet shorter and lead with the result.'
const EDIT_REPLY = 'Done, saved as version 3. Every number checks out against your module.'
const LONG_BULLET = 'Led the company-wide migration of 140 services to Kubernetes, working with six teams to redesign the deploy pipeline, which reduced deploy time from 40 minutes to 6.'
const SHORT_BULLET = 'Cut deploys from 40 minutes to 6 by moving 140 services to Kubernetes across six teams.'

function ResumeCard({ t, start, firstBullet, highlight, fit, compact = false }: { t: number; start: number; firstBullet: string; highlight?: boolean; fit: number; compact?: boolean }) {
  const lines = [
    firstBullet,
    'Built self-serve preview environments used by 30 engineers a day.',
    'Wrote the incident review process the platform group still runs.',
  ].slice(0, compact ? 2 : 3)
  return (
    <div className={s.resumeCard} style={{ opacity: progress(t, start, start + 300), transform: `translateY(${(1 - progress(t, start, start + 400)) * 10}px)` }}>
      <div className={s.resumeTop}>
        <div>
          <div className={s.resumeName}>Alex Rivera</div>
          <div className={s.resumeTitle}>Senior Platform Engineer</div>
        </div>
        <div className={s.fit} style={{ ['--fit' as string]: `${fit}` }}>
          <svg viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" className={s.fitTrack} />
            <circle cx="18" cy="18" r="15.5" className={s.fitBar} style={{ strokeDashoffset: 97.4 - (97.4 * fit) / 100 }} />
          </svg>
          <span>{fit}</span>
          <small>fit</small>
        </div>
      </div>
      <div className={s.resumeJob}>Platform Engineer, Northwind</div>
      <ul className={s.resumeLines}>
        {lines.map((line, i) => (
          <li
            key={i}
            className={i === 0 && highlight ? s.resumeLineHl : ''}
            style={{ opacity: progress(t, start + 300 + i * 250, start + 600 + i * 250) }}
          >
            {line}
          </li>
        ))}
      </ul>
      {!compact && (
        <div className={s.resumeActions}>
          <span className={s.fakeBtnPrimary}>Download PDF</span>
          <span className={s.fakeBtn}>Open in editor</span>
        </div>
      )}
    </div>
  )
}

const SCENE_ASKS: Record<string, Ask> = {
  win: { text: WIN_USER, start: 200, cps: 48 },
  tailor: { text: TAILOR_USER, start: 200, cps: 48 },
  edit: { text: EDIT_USER, start: 400, cps: 48 },
}

const SCENES: Scene[] = [
  {
    id: 'win',
    label: 'Save a win',
    duration: 9500,
    ask: SCENE_ASKS.win,
    render: (t) => (
      <>
        <UserMsg ask={SCENE_ASKS.win} t={t} />
        {t > 3100 && (
          <ToolChip title="Add skill module" done={t > 4300}>
            {t > 4400 && (
              <div className={s.moduleCard} style={{ opacity: progress(t, 4400, 4800) }}>
                <div className={s.moduleTags}>
                  <span>skill</span>
                  <span>responsibility</span>
                </div>
                <div className={s.moduleTitle}>Kubernetes migration</div>
                <div className={s.moduleBody}>
                  Moved 140 services to Kubernetes with six teams; deploys went from 40 minutes to 6.
                </div>
              </div>
            )}
          </ToolChip>
        )}
        <AssistantMsg text={typed(WIN_REPLY, t, 5200, 55)} />
      </>
    ),
  },
  {
    id: 'tailor',
    label: 'Tailor a resume',
    duration: 12500,
    ask: SCENE_ASKS.tailor,
    render: (t) => {
      const stages = [
        { label: 'Reading the posting', start: 2600, end: 3700 },
        { label: 'Picking your modules', start: 3700, end: 5000 },
        { label: 'Writing the draft', start: 5000, end: 6600 },
      ]
      return (
        <>
          <UserMsg ask={SCENE_ASKS.tailor} t={t} />
          {t > 2400 && (
            <ToolChip title="Generate tailored resume" done={t > 6600}>
              <ul className={s.stages}>
                {stages.map((st) => (
                  <li key={st.label} className={t > st.end ? s.stageDone : t > st.start ? s.stageOn : ''}>
                    <span className={s.stageDot} />
                    {st.label}
                  </li>
                ))}
              </ul>
            </ToolChip>
          )}
          {t > 6700 && <ResumeCard t={t} start={6700} firstBullet={LONG_BULLET} fit={Math.round(86 * progress(t, 7000, 8400))} />}
          <AssistantMsg text={typed(TAILOR_REPLY, t, 8800, 55)} />
        </>
      )
    },
  },
  {
    id: 'edit',
    label: 'Edit a line',
    duration: 9500,
    ask: SCENE_ASKS.edit,
    render: (t) => {
      const swapped = t > 3400
      return (
        <>
          <ResumeCard t={t + 10_000} start={0} firstBullet={swapped ? SHORT_BULLET : LONG_BULLET} highlight={swapped && t < 6500} fit={86} compact />
          <UserMsg ask={SCENE_ASKS.edit} t={t} />
          {t > 2200 && <ToolChip title="Edit resume line" done={t > 3300} />}
          <AssistantMsg text={typed(EDIT_REPLY, t, 4200, 55)} />
        </>
      )
    },
  },
]

export default function McpDemo() {
  const [scene, setScene] = useState(0)
  const [t, setT] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // The playhead lives in a ref so the animation loop never reads a stale value.
  const tRef = useRef(0)
  // Messages stack from the top; once a scene outgrows the window, it scrolls up like a chat.
  const bodyRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = visible && !paused && !reduced
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100)
      last = now
      tRef.current += dt
      if (tRef.current >= SCENES[scene].duration) {
        tRef.current = 0
        setT(0)
        setScene((scene + 1) % SCENES.length)
        return
      }
      setT(tRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, scene])

  const current = SCENES[scene]
  const shownT = reduced ? current.duration : t
  const composerText = shownT < sentAt(current.ask) ? typed(current.ask.text, shownT, current.ask.start, current.ask.cps) : ''

  useLayoutEffect(() => {
    const body = bodyRef.current
    const stream = streamRef.current
    if (!body || !stream) return
    const style = getComputedStyle(body)
    const room = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    const next = Math.max(0, stream.offsetHeight - room)
    setOffset((prev) => (Math.abs(prev - next) > 0.5 ? next : prev))
  }, [shownT, scene])

  return (
    <div className={s.demo} ref={rootRef}>
      <div className={s.demoChrome}>
        <span className={s.dots} aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className={s.demoTitle}>Your AI assistant</span>
        <span className={s.connected}>
          <span className={s.connectedDot} />
          ModuleHire connected
        </span>
      </div>
      <div className={s.demoBody} ref={bodyRef} aria-live="off">
        <div className={s.demoStream} key={current.id} ref={streamRef} style={{ transform: `translateY(${-offset}px)` }}>
          {current.render(shownT)}
        </div>
      </div>
      <div className={s.composer} aria-hidden>
        {composerText ? (
          <span className={s.composerText}>
            {composerText}
            <span className={s.caret} />
          </span>
        ) : (
          <span className={s.composerPlaceholder}>Message your assistant</span>
        )}
        <span className={`${s.sendBtn} ${composerText ? s.sendBtnOn : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className={s.demoControls}>
        <div className={s.sceneTabs} role="tablist" aria-label="Demo scenes">
          {SCENES.map((sc, i) => (
            <button
              key={sc.id}
              type="button"
              role="tab"
              aria-selected={i === scene}
              className={`${s.sceneTab} ${i === scene ? s.sceneTabActive : ''}`}
              onClick={() => {
                tRef.current = 0
                setT(0)
                setScene(i)
              }}
            >
              <span className={s.sceneLabel}>{sc.label}</span>
              <span className={s.sceneBar}>
                <span style={{ transform: `scaleX(${i === scene ? clamp(shownT / sc.duration) : i < scene ? 1 : 0})` }} />
              </span>
            </button>
          ))}
        </div>
        {!reduced && (
          <button type="button" className={s.playPause} onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play demo' : 'Pause demo'}>
            {paused ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <rect x="2" y="1.5" width="2.8" height="9" rx="0.6" fill="currentColor" />
                <rect x="7.2" y="1.5" width="2.8" height="9" rx="0.6" fill="currentColor" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
