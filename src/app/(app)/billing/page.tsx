import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { entitlements, FREE_LIMITS, loadSprintUser, type Allowance } from '@/lib/entitlements'
import SprintButton from '@/components/SprintButton'
import '@/app/warm.css'
import './billing.css'

// "Your Sprint": days left, what's included, Extend. Sprints are one-time and never renew.

const INCLUDED = [
  'Unlimited tailored resumes (fair use 100 per 30 days)',
  'Live editing and fit on every resume',
  'Unlimited documents: reviews, brag docs (fair use 30 a month)',
  'Interview practice for every round (fair use 60 graded answers a month)',
  'Outreach drafts',
  'Application insights',
]
const FREE_INCLUDED = [
  'Your module library and confirmations',
  `${FREE_LIMITS.resumes} resume and ${FREE_LIMITS.otherDocuments} other documents imported`,
  `${FREE_LIMITS.tailored} tailored resumes`,
  'Every export format',
  `${FREE_LIMITS.practiceRounds} practice round`,
]

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - new Date().getTime()) / 86_400_000))
}

function Usage({ label, a }: { label: string; a: Allowance }) {
  const pct = a.limit ? Math.min(100, Math.round((a.used / a.limit) * 100)) : 0
  return (
    <div className="bl-usage">
      <div className="bl-usage-row"><span>{label}</span><span className="bl-usage-num">{a.used}{a.limit !== null ? ` of ${a.limit}` : ''}</span></div>
      {a.limit !== null && <div className="bl-bar"><span style={{ width: `${pct}%` }} /></div>}
    </div>
  )
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const { sprint } = await searchParams

  const u = await loadSprintUser(supabase, user.id)
  const ent = await entitlements(supabase, user.id, new Date(), u)
  const { data: purchases } = await supabase
    .from('sprint_purchases')
    .select('id, sku, amount_cents, starts_at, ends_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const daysLeft = ent.endsAt ? daysUntil(ent.endsAt) : null
  const sourceNote = ent.source === 'beta_pro' ? 'Complimentary beta access' : ent.source === 'legacy_pro' ? 'From your Pro plan' : null

  return (
    <div className="warm">
      <div className="warm-inner warm-narrow">
        <header>
          <div className="warm-eyebrow">Your Sprint</div>
          {ent.active ? (
            <>
              <h1 className="warm-h1">{daysLeft !== null ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : 'Your Sprint is active'}</h1>
              <p className="warm-sub">
                {ent.endsAt ? `Your Sprint ends ${fmt(ent.endsAt)}. ` : ''}It never renews on its own. When it ends you keep everything and drop to Free limits.
                {sourceNote ? ` ${sourceNote}.` : ''}
              </p>
            </>
          ) : (
            <>
              <h1 className="warm-h1">You&apos;re on Free</h1>
              <p className="warm-sub">Start a Sprint when you&apos;re actively applying. One payment, and we never charge you again unless you choose to.</p>
            </>
          )}
        </header>

        {sprint === 'started' && (
          <div className="warm-card bl-thanks" role="status">
            Thanks. {ent.active ? 'Your Sprint is active.' : 'Your payment went through; your Sprint will show here in a moment. Refresh if it doesn’t.'}
          </div>
        )}

        <section className="warm-card">
          <h2 className="warm-h2">{ent.active ? 'Included in your Sprint' : 'Included in Free'}</h2>
          <ul className="bl-list">
            {(ent.active ? INCLUDED : FREE_INCLUDED).map(f => <li key={f}>{f}</li>)}
          </ul>
          <div className="bl-usages">
            <Usage label="Tailored resumes" a={ent.tailored} />
            <Usage label={ent.active ? 'Documents imported' : 'Other documents imported'} a={ent.documents} />
            {ent.active && <Usage label="Graded practice answers" a={ent.graded} />}
          </div>
          {ent.active && ent.tailored.since && (
            <p className="warm-sub bl-fine">Fair-use counts since {fmt(ent.tailored.since)}{ent.source === 'sprint' ? '' : ' (last 30 days)'}.</p>
          )}
        </section>

        <section className="warm-card">
          <h2 className="warm-h2">{ent.active ? 'Extend' : 'Start a Sprint'}</h2>
          {ent.active && ent.endsAt && <p className="warm-sub" style={{ marginBottom: 14 }}>Extending adds days after {fmt(ent.endsAt)}, so you never lose time you paid for.</p>}
          <div className="bl-skus">
            <div className="bl-sku">
              <div className="bl-sku-name">30-day Sprint</div>
              <div className="bl-sku-price">$19 <span>one time</span></div>
              <SprintButton sku="sprint_30" label={ent.active ? 'Add 30 days' : 'Start a 30-day Sprint'} className="warm-btn" returnUrl="/billing" />
            </div>
            <div className="bl-sku">
              <div className="bl-sku-name">90-day Sprint</div>
              <div className="bl-sku-price">$45 <span>one time</span></div>
              <SprintButton sku="sprint_90" label={ent.active ? 'Add 90 days' : 'Start a 90-day Sprint'} className="warm-btn warm-btn-ghost" returnUrl="/billing" />
            </div>
          </div>
          <p className="warm-sub bl-fine">No auto-renew. Your data stays yours: download or delete anything from <Link href="/files" className="warm-link">Files</Link>.</p>
        </section>

        {(purchases ?? []).length > 0 && (
          <section className="warm-card">
            <h2 className="warm-h2">Purchases</h2>
            <ul className="bl-history">
              {(purchases ?? []).map(p => (
                <li key={p.id}>
                  <span>{p.sku === 'sprint_90' ? '90-day Sprint' : '30-day Sprint'} · ${(p.amount_cents / 100).toFixed(2)}</span>
                  <span className="warm-muted">{fmt(p.starts_at)} to {fmt(p.ends_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
