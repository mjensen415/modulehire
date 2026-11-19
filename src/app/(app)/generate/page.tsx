'use client'

import { useSearchParams } from 'next/navigation'
import GenerateV2 from './GenerateV2'

// /generate is the paste-to-resume flow. The old four-step wizard (/generate?classic=1) was
// removed on 2026-11-18 after 45 days with no ev_classic_open; old ?classic=1 and &step=
// links land here too.
export default function GeneratePage() {
  const searchParams = useSearchParams()
  return <GenerateV2 initialJdId={searchParams.get('jd_id')} />
}
