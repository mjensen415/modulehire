// Public press kit (/press): approved copy, facts, founder bio, logos, colors, product images and
// the demo video. Everything is on this page and in public/press/; the zip holds the same logos,
// images and text, so rebuild it when they change (see public/press/README.md).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'
import CopyButton from '../mcp/CopyButton'
import s from './press.module.css'

export const metadata: Metadata = {
  title: 'Press kit | ModuleHire',
  description:
    'Approved descriptions, facts, logos, product images and a demo video for writing about ModuleHire. Press contact: info@modulehire.com.',
}

const PRESS_EMAIL = 'info@modulehire.com'
const KIT_HREF = '/press/modulehire-press-kit.zip'

const FACTS: { label: string; value: ReactNode }[] = [
  { label: 'Product', value: 'ModuleHire, a modular resume builder' },
  { label: 'Company', value: 'ModuleHire Labs' },
  { label: 'Founded', value: '2026' },
  { label: 'Founder', value: 'Matt Jensen' },
  { label: 'Stage', value: 'Public beta' },
  { label: 'For', value: 'Job seekers, with a separate version for hiring teams' },
  { label: 'Connects to', value: 'AI assistants that support remote MCP servers with sign-in, including Claude, ChatGPT and Cursor' },
  { label: 'Pricing', value: <>Free plan available. Pro is $19 a month or $99 a year. <Link href="/pricing">Current pricing</Link></> },
  { label: 'Website', value: <Link href="/">modulehire.com</Link> },
]

const DESCRIPTIONS: { label: string; text: string }[] = [
  {
    label: 'One sentence',
    text: "ModuleHire turns one resume into a library of reusable modules, then builds a tailored resume for each job from what you've actually done.",
  },
  {
    label: 'Short',
    text: "ModuleHire is a resume builder based on a simple idea: your experience should be reusable. Upload a resume once and ModuleHire breaks it into skill and experience modules. Paste a job posting and it builds a tailored resume from those modules, shows how well it covers the job, and lets you edit it line by line. It also connects to AI assistants such as Claude and ChatGPT, so you can do the same work from a chat.",
  },
  {
    label: 'Long',
    text: "ModuleHire is a resume builder from ModuleHire Labs, a company founded in 2026 to help people present themselves better with AI. Instead of rewriting a resume for every application, users upload it once and ModuleHire breaks it into a library of reusable skill and experience modules. Paste a job posting or a link, and ModuleHire picks the relevant modules, writes a tailored draft, and scores how well it covers each requirement. The draft opens as an editable document. Those modules are the source of facts: if an edit adds a number or a name its module doesn't contain, ModuleHire flags it for review. ModuleHire also connects to AI assistants through the Model Context Protocol, so users can save a new win, tailor a resume, or edit a line from a chat. A separate version helps hiring teams rank applicants against a job description. ModuleHire is in public beta, with a free plan available.",
  },
]

const DIFFERENCES: { title: string; body: string }[] = [
  {
    title: 'It starts with your experience, not the job posting.',
    body: 'Your history lives in modules you can review and edit. A tailored resume is assembled from them, so each new application builds on the same record instead of starting from a blank prompt.',
  },
  {
    title: 'It checks for details you never gave it.',
    body: "When a line gains a number or a name its source module doesn't contain, ModuleHire flags it. The same check runs in the web editor and when an AI assistant makes the edit.",
  },
  {
    title: 'It works inside the AI assistant you already use.',
    body: 'People sign in on modulehire.com and approve the connection. The assistant can then read their library and resumes when asked, and they can disconnect it at any time.',
  },
]

const LOGOS: { name: string; file: string; tone: 'dark' | 'light'; width: number; height: number }[] = [
  { name: 'Wordmark for dark backgrounds', file: 'modulehire-wordmark-on-dark', tone: 'dark', width: 200, height: 45 },
  { name: 'Wordmark for light backgrounds', file: 'modulehire-wordmark-on-light', tone: 'light', width: 200, height: 45 },
  { name: 'Mark on dark backgrounds', file: 'modulehire-mark', tone: 'dark', width: 76, height: 76 },
  { name: 'Mark on light backgrounds', file: 'modulehire-mark', tone: 'light', width: 76, height: 76 },
]

const COLORS: { name: string; hex: string; use: string }[] = [
  { name: 'Hire Green', hex: '#1D9E75', use: 'Logo' },
  { name: 'Signal Teal', hex: '#00B1B5', use: 'Links and buttons' },
  { name: 'Ink', hex: '#080D1A', use: 'Dark background' },
  { name: 'Paper', hex: '#E8EDF8', use: 'Text on dark' },
]

const IMAGES: { file: string; width: number; height: number; caption: string }[] = [
  { file: 'modulehire-tailored-resume-dark', width: 1280, height: 778, caption: 'A tailored resume with its fit score, shown in an AI assistant.' },
  { file: 'modulehire-edit-and-recheck-fit', width: 1280, height: 830, caption: 'A line rewritten from chat, with the fit score updated.' },
  { file: 'modulehire-tailored-resume-light', width: 1280, height: 778, caption: 'The same resume preview in light mode.' },
  { file: 'modulehire-from-a-posting-link', width: 1280, height: 650, caption: 'A resume built from a link to a job posting.' },
]

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Row({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.row} id={id} aria-labelledby={`${id}-title`}>
      <header className={s.rowHead}>
        <h2 className={s.rowTitle} id={`${id}-title`}>{title}</h2>
        {note && <p className={s.rowNote}>{note}</p>}
      </header>
      <div className={s.rowBody}>{children}</div>
    </section>
  )
}

export default function PressPage() {
  return (
    <>
      <PublicNav />
      <main className={s.page}>
        <section className={s.hero}>
          <div className={s.heroText}>
            <h1 className={s.headline}>ModuleHire press kit.</h1>
            <p className={s.sub}>
              Descriptions, facts, logos and product images for writing about ModuleHire. Everything here is
              cleared to use in coverage.
            </p>
            <div className={s.heroActions}>
              <a href={KIT_HREF} download className={s.primary}>
                <DownloadIcon />
                Download the kit (ZIP, 700 KB)
              </a>
              <a href={`mailto:${PRESS_EMAIL}?subject=Press%20inquiry`} className={s.secondary}>
                Email {PRESS_EMAIL}
              </a>
            </div>
          </div>
          <figure className={s.heroVideo}>
            <video
              className={s.video}
              controls
              playsInline
              preload="none"
              poster="/press/modulehire-demo-poster.jpg"
              aria-label="Silent demo: saving a win, tailoring a resume, and editing a line from an AI assistant"
            >
              <source src="/press/modulehire-demo.mp4" type="video/mp4" />
              <a href="/press/modulehire-demo.mp4">Download the demo video</a>
            </video>
            <figcaption className={s.caption}>
              <span>Illustrative demo with made-up names and numbers. 31 seconds, no sound.</span>
              <a href="/press/modulehire-demo.mp4" download className={s.fileLink}>
                <DownloadIcon />
                MP4, 4 MB
              </a>
            </figcaption>
          </figure>
        </section>

        <Row id="facts" title="Fact sheet">
          <dl className={s.facts}>
            {FACTS.map((f) => (
              <div key={f.label} className={s.fact}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </Row>

        <Row id="descriptions" title="Descriptions" note="Use these as written, or edit them to fit.">
          <div className={s.descriptions}>
            {DESCRIPTIONS.map((d) => (
              <article key={d.label} className={s.description}>
                <div className={s.descriptionHead}>
                  <h3>{d.label}</h3>
                  <CopyButton text={d.text} label={`Copy the ${d.label.toLowerCase()} description`} />
                </div>
                <p>{d.text}</p>
              </article>
            ))}
          </div>
        </Row>

        <Row id="story" title="What makes it different">
          <div className={s.differences}>
            {DIFFERENCES.map((d) => (
              <article key={d.title} className={s.difference}>
                <h3>{d.title}</h3>
                <p>{d.body}</p>
              </article>
            ))}
          </div>
        </Row>

        <Row id="founder" title="Founder">
          <div className={s.founder}>
            <blockquote className={s.quote}>
              <p>
                &ldquo;Most resume tools start with the job and work backward. We start with what you&apos;ve actually
                done, and make it easy to tell the right part of that story for each role.&rdquo;
              </p>
              <cite className={s.quoteBy}>Matt Jensen, founder of ModuleHire Labs</cite>
            </blockquote>
            <p className={s.bio}>
              Matt Jensen founded ModuleHire Labs in 2026. Matt&apos;s career has focused on developer relations and
              community leadership, with roles at Docker, GitLab, Fiverr and HashiCorp, where Matt served as VP of
              Developer Relations.
            </p>
          </div>
        </Row>

        <Row id="logos" title="Logos" note="SVG for anything that scales. PNG files have transparent backgrounds.">
          <div className={s.logos}>
            {LOGOS.map((l) => (
              <figure key={l.name} className={s.logo}>
                <div className={`${s.logoStage} ${l.tone === 'dark' ? s.stageDark : s.stageLight}`}>
                  <Image src={`/press/logos/${l.file}.svg`} alt={l.name} width={l.width} height={l.height} unoptimized />
                </div>
                <figcaption className={s.caption}>
                  <span>{l.name}</span>
                  <span className={s.fileLinks}>
                    <a href={`/press/logos/${l.file}.svg`} download className={s.fileLink}><DownloadIcon />SVG</a>
                    <a href={`/press/logos/${l.file}.png`} download className={s.fileLink}><DownloadIcon />PNG</a>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className={s.colors}>
            {COLORS.map((c) => (
              <div key={c.hex} className={s.color}>
                <span className={s.swatch} style={{ background: c.hex }} aria-hidden />
                <div className={s.colorText}>
                  <strong>{c.name}</strong>
                  <span>{c.use}</span>
                </div>
                <span className={s.hex}>
                  <code>{c.hex}</code>
                  <CopyButton text={c.hex} label={`Copy ${c.name} ${c.hex}`} compact />
                </span>
              </div>
            ))}
          </div>
        </Row>

        <Row id="images" title="Product images" note="The people, employers and numbers shown are made up.">
          <div className={s.gallery}>
            {IMAGES.map((img) => (
              <figure key={img.file} className={s.shot}>
                <a href={`/press/images/${img.file}.png`} className={s.shotLink} aria-label={`Open full size: ${img.caption}`}>
                  <Image src={`/press/images/${img.file}.png`} alt={img.caption} width={img.width} height={img.height} unoptimized loading="lazy" />
                </a>
                <figcaption className={s.caption}>
                  <span>{img.caption}</span>
                  <a href={`/press/images/${img.file}.png`} download className={s.fileLink}><DownloadIcon />PNG</a>
                </figcaption>
              </figure>
            ))}
          </div>
        </Row>

        <Row id="usage" title="Using the name and logo">
          <ul className={s.usage}>
            <li><strong>Write it as ModuleHire.</strong> One word, with a capital M and H.</li>
            <li><strong>Name the company as ModuleHire Labs.</strong> ModuleHire is the product.</li>
            <li><strong>Leave the logo as it is.</strong> Don&apos;t recolor, stretch or add effects to it.</li>
            <li><strong>Pick the right wordmark.</strong> Use the version made for your background.</li>
          </ul>
        </Row>

        <Row id="contact" title="Press contact">
          <div className={s.contact}>
            <a href={`mailto:${PRESS_EMAIL}?subject=Press%20inquiry`} className={s.contactEmail}>{PRESS_EMAIL}</a>
            <p>For interviews, product access or anything else you need for a story. We reply within one business day.</p>
          </div>
        </Row>
      </main>
      <PublicFooter />
    </>
  )
}
