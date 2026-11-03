// Public page for the ModuleHire MCP server (/api/mcp): what it does, how to connect it in
// Claude, ChatGPT, Cursor and Claude Code, what to ask, the tools, plan limits, and FAQs.
// The demo at the top is an animated mock chat (McpDemo), not a video file.
import type { Metadata } from 'next'
import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'
import FaqItem from '@/components/ui/FaqItem'
import { FREE_MONTHLY_GENERATIONS, moduleLimit } from '@/lib/plan'
import McpDemo from './McpDemo'
import SetupTabs from './SetupTabs'
import CopyButton from './CopyButton'
import s from './mcp.module.css'

export const metadata: Metadata = {
  title: 'ModuleHire in Claude, ChatGPT and Cursor | ModuleHire',
  description:
    'Connect ModuleHire to your AI assistant. Save wins to your career library, tailor resumes to a job, edit them line by line, and track applications, all from chat.',
}

// www is the canonical host (the apex redirects there), and OAuth clients check that this
// URL matches the `resource` in /.well-known/oauth-protected-resource/api/mcp.
const SERVER_URL = 'https://www.modulehire.com/api/mcp'

const PROMPTS: { group: string; color: string; items: string[] }[] = [
  {
    group: 'Build your library',
    color: 'teal',
    items: [
      'I just led our move to a new billing system. It cut invoice errors by half. Save that to my ModuleHire library.',
      'What does my career library look like? Where is it thin?',
    ],
  },
  {
    group: 'Tailor a resume',
    color: 'amber',
    items: [
      'Make me a resume for this job: [paste the posting or a link]',
      'How well does my latest resume fit its job? What is missing?',
    ],
  },
  {
    group: 'Edit line by line',
    color: 'indigo',
    items: [
      'Rewrite the second bullet under my current job so it leads with the result.',
      'Hide the awards section and give me a PDF.',
    ],
  },
  {
    group: 'Track the search',
    color: 'rose',
    items: [
      'I applied to the Northwind role today. Add it to my tracker.',
      'Prep me for my interview for the Northwind job. (Pro)',
    ],
  },
]

const TOOLS: { name: string; does: string; kind: 'read' | 'write' | 'ai' }[] = [
  { name: 'get_career_library', does: 'Your profile, plan, work history, and module counts', kind: 'read' },
  { name: 'search_modules', does: 'Find skill modules by words, company, or dimension', kind: 'read' },
  { name: 'list_jobs / get_job', does: 'Job postings you analyzed, with requirements and match scores', kind: 'read' },
  { name: 'list_resumes / get_resume', does: 'Your tailored resumes, line by line', kind: 'read' },
  { name: 'check_fit', does: 'How well a resume covers its job, per requirement', kind: 'read' },
  { name: 'list_applications', does: 'Your job tracker', kind: 'read' },
  { name: 'add_module', does: 'Save a new win to your library under one of your jobs', kind: 'write' },
  { name: 'update_block', does: 'Rewrite one line of a resume, with a fact check', kind: 'write' },
  { name: 'reorder_blocks', does: 'Reorder the bullets under a job', kind: 'write' },
  { name: 'set_section_visibility', does: 'Show or hide summary, skills, education, or awards', kind: 'write' },
  { name: 'track_application', does: 'Add an application to your tracker', kind: 'write' },
  { name: 'update_application_status', does: 'Move an application to applied, interviewing, offered, and so on', kind: 'write' },
  { name: 'export_resume', does: 'A PDF or Word download link, good for 10 minutes', kind: 'write' },
  { name: 'get_editor_link', does: 'A one-time link that opens the resume in the editor, signed in', kind: 'write' },
  { name: 'generate_resume', does: 'Build a tailored resume for a job (counts toward your monthly limit)', kind: 'ai' },
  { name: 'interview_prep', does: 'Talking points, questions to ask, and gaps to prepare for (Pro)', kind: 'ai' },
]

const KIND_LABEL = { read: 'Reads', write: 'Changes', ai: 'Uses AI' } as const

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Which AI apps does this work with?',
    a: 'Any app that supports remote MCP servers with sign-in: Claude (web and desktop), ChatGPT, Cursor, Claude Code, and others. Use the server URL above and follow the steps for your app.',
  },
  {
    q: 'Does the AI app see my ModuleHire password?',
    a: 'No. You sign in on modulehire.com and approve the app there. The app gets a token that lets it call ModuleHire tools as you; it never sees your password.',
  },
  {
    q: 'What can the app see, and when?',
    a: 'Your skill modules, work history, analyzed jobs, resumes, and job tracker. It only reads them when it calls a ModuleHire tool, which happens when you ask for something that needs them.',
  },
  {
    q: 'Will the AI make things up on my resume?',
    a: 'ModuleHire hands the AI your modules as the only source of facts. If an edit adds a number or a name that the line\'s source module does not contain, the edit is saved and flagged, and the AI is told to check it with you. The same check runs in the web editor.',
  },
  {
    q: 'Does it cost extra?',
    a: 'No. It uses your ModuleHire plan. Reading, editing, exporting, and tracking are free on every plan. Generating a new resume counts toward your monthly limit, the same as on the website.',
  },
  {
    q: 'What if I edit in the browser while the AI is editing too?',
    a: 'Every edit is checked against the version the AI last read. If you changed the resume in the browser since then, the AI\'s edit is refused, it reads the latest version, and tries again. Your browser edits are never overwritten.',
  },
  {
    q: 'How do I disconnect?',
    a: 'Go to Account, then Connected accounts, and choose Disconnect next to the app under AI apps. Its access ends right away, even if the app still lists ModuleHire. You can also remove ModuleHire from the app\'s own connector settings. Questions? Email info@modulehire.com.',
  },
]

export default function McpPage() {
  const cursorConfig = Buffer.from(JSON.stringify({ url: SERVER_URL })).toString('base64')
  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=modulehire&config=${cursorConfig}`
  const freeModules = moduleLimit('free')

  return (
    <>
      <PublicNav />

      <section className={`page-hero ${s.hero}`}>
        <div className="hero-glow" />
        <div className="eyebrow">ModuleHire for AI assistants</div>
        <h1 className={`page-headline ${s.headline}`}>
          Your career library,
          <br />
          <span className={s.headlineAccent}>inside your AI assistant.</span>
        </h1>
        <p className={`page-sub ${s.sub}`}>
          Connect ModuleHire to Claude, ChatGPT, or Cursor. Save wins as you remember them, tailor a resume to a job, and
          polish it line by line, without leaving the chat.
        </p>
        <div className={s.heroActions}>
          <a href="#setup" className={`btn-primary ${s.ctaBtn}`}>
            Connect in 2 minutes
          </a>
          <div className={s.urlPill}>
            <code>{SERVER_URL}</code>
            <CopyButton text={SERVER_URL} label="Copy server URL" />
          </div>
        </div>
      </section>

      <section className={s.demoWrap} aria-label="Demo">
        <McpDemo />
      </section>

      <section className={s.section} id="prompts">
        <div className={s.sectionHead}>
          <div className={s.kicker}>What to ask</div>
          <h2 className={s.h2}>Talk to it like a career coach who knows your history.</h2>
          <p className={s.lede}>No special commands. These are the kinds of things people ask; copy one to try it.</p>
        </div>
        <div className={s.promptGrid}>
          {PROMPTS.map((g) => (
            <div key={g.group} className={`${s.promptGroup} ${s[g.color]}`}>
              <div className={s.promptGroupLabel}>{g.group}</div>
              {g.items.map((p) => (
                <div key={p} className={s.prompt}>
                  <span>{p}</span>
                  <CopyButton text={p} label="Copy prompt" compact />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={s.section} id="setup">
        <div className={s.sectionHead}>
          <div className={s.kicker}>Install</div>
          <h2 className={s.h2}>Connect your app.</h2>
          <p className={s.lede}>
            You need a ModuleHire account with a resume uploaded.{' '}
            <Link href="/signin?signup=1">Start free</Link> if you don&apos;t have one yet.
          </p>
        </div>
        <SetupTabs serverUrl={SERVER_URL} cursorDeeplink={cursorDeeplink} />
      </section>

      <section className={s.section} id="tools">
        <div className={s.sectionHead}>
          <div className={s.kicker}>Tools</div>
          <h2 className={s.h2}>What your assistant can do.</h2>
          <p className={s.lede}>
            Your AI app picks the right tool for what you ask. Only two of them run ModuleHire&apos;s own AI; everything else
            reads or saves your data.
          </p>
        </div>
        <div className={s.toolList}>
          {TOOLS.map((t) => (
            <div key={t.name} className={s.toolRow}>
              <code className={s.toolName}>{t.name}</code>
              <span className={s.toolDoes}>{t.does}</span>
              <span className={`${s.badge} ${s[`badge_${t.kind}`]}`}>{KIND_LABEL[t.kind]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={s.section} id="limits">
        <div className={s.sectionHead}>
          <div className={s.kicker}>Plans</div>
          <h2 className={s.h2}>Same plan, same limits.</h2>
          <p className={s.lede}>Chat and the website share one account. Nothing about the connection costs extra.</p>
        </div>
        <div className={s.planGrid}>
          <div className={s.planCard}>
            <div className={s.planName}>Free</div>
            <ul className={s.planList}>
              <li>{FREE_MONTHLY_GENERATIONS} tailored resumes a month</li>
              <li>Up to {freeModules} skill modules</li>
              <li>Unlimited reading, editing, exports, and tracking</li>
              <li className={s.planNo}>Interview prep</li>
            </ul>
          </div>
          <div className={`${s.planCard} ${s.planPro}`}>
            <div className={s.planName}>Pro</div>
            <ul className={s.planList}>
              <li>Unlimited tailored resumes</li>
              <li>Unlimited skill modules</li>
              <li>Unlimited reading, editing, exports, and tracking</li>
              <li>Interview prep</li>
            </ul>
            <Link href="/pricing" className={s.planLink}>
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <h2 className="section-headline">Common questions</h2>
        {FAQS.map((f) => (
          <FaqItem key={f.q} question={f.q} answer={f.a} />
        ))}
      </section>

      <section className="bottom-cta">
        <div className="bottom-cta-bg" />
        <div className="cta-label">Need a hand?</div>
        <h2 className="cta-title">Your library, wherever you work.</h2>
        <p className="cta-sub">
          Stuck connecting, or have an idea for a tool? Email{' '}
          <a href="mailto:info@modulehire.com" style={{ color: 'var(--teal)' }}>
            info@modulehire.com
          </a>
          .
        </p>
        <div className={s.ctaRow}>
          <a href="#setup" className={`btn-primary ${s.ctaBtn}`}>
            Connect now
          </a>
          <Link href="/privacy" className={`btn-ghost ${s.ctaBtn}`}>
            Privacy
          </Link>
        </div>
      </section>

      <PublicFooter />
    </>
  )
}
