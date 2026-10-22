'use client'

import { useSearchParams } from 'next/navigation'
import ClassicGenerate from './ClassicGenerate'
import GenerateV2 from './GenerateV2'

// /generate is the v2 paste-to-resume flow. The old four-step wizard stays reachable for one
// release at /generate?classic=1 (its own step URLs keep classic=1; older &step= links too).
export default function GeneratePage() {
  const searchParams = useSearchParams()
  if (searchParams.get('classic') === '1' || searchParams.get('step')) return <ClassicGenerate />
  return <GenerateV2 initialJdId={searchParams.get('jd_id')} />
}
