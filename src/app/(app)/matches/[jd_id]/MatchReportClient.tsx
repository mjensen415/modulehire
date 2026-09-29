'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MatchReport, { type MatchReportData } from '@/components/MatchReport'

export default function MatchReportClient({
  jdId,
  jd,
  initialReport,
}: {
  jdId: string
  jd: { title: string; company: string | null; source_url: string | null }
  initialReport: MatchReportData | null
}) {
  const router = useRouter()
  const [report, setReport] = useState<MatchReportData | null>(initialReport)
  const [loading, setLoading] = useState(!initialReport)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialReport) return
    setLoading(true)
    fetch('/api/match-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd_id: jdId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setReport(data)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId])

  if (error) {
    return (
      <div style={{ background: 'var(--rose-dim, oklch(0.4 0.18 10 / 0.15))', border: '1px solid var(--rose)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--rose)' }}>
        {error}
      </div>
    )
  }

  return (
    <MatchReport
      report={report}
      jd={jd}
      variant="full"
      loading={loading}
      onBuildResume={() => router.push(`/generate?jd_id=${jdId}`)}
    />
  )
}
