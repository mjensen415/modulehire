import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MatchReportClient from './MatchReportClient'
import type { MatchReportData } from '@/components/MatchReport'

export default async function MatchReportPage({ params }: { params: Promise<{ jd_id: string }> }) {
  const { jd_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: jd, error } = await supabase
    .from('job_descriptions')
    .select('id, extracted_job_title, extracted_role_type, extracted_company, source_url, match_report')
    .eq('id', jd_id)
    .eq('user_id', user.id)
    .single()

  if (error || !jd) redirect('/matches')

  const jdSummary = {
    title: jd.extracted_job_title || 'Untitled role',
    company: jd.extracted_company ?? null,
    source_url: jd.source_url ?? null,
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <Link href="/matches" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>← All matches</Link>
          <span className="topbar-title" style={{ display: 'block', marginTop: 4 }}>{jdSummary.title}</span>
          <span className="topbar-sub">{jdSummary.company}</span>
        </div>
      </div>

      <div className="dash-content">
        <div style={{ maxWidth: 760 }}>
          <MatchReportClient jdId={jd.id} jd={jdSummary} initialReport={jd.match_report as MatchReportData | null} />
        </div>
      </div>
    </>
  )
}
