'use client'

import { useState, useEffect } from 'react'
import { BetaCodeGenerator } from './BetaCodeGenerator'
import { BetaRequestsPanel } from './BetaRequestsPanel'

type BetaRequest = {
  id: string
  email: string
  context: string | null
  marketing_opt_in: boolean
  created_at: string
  status: string
  beta_code: string | null
  invited_at: string | null
}

export function BetaAdminWrapper({
  initialRequests,
  initialAvailableCodes,
}: {
  initialRequests: BetaRequest[]
  initialAvailableCodes: number
}) {
  const [codesLeft, setCodesLeft] = useState(initialAvailableCodes)

  return (
    <>
      <BetaRequestsPanel
        initialRequests={initialRequests}
        codesLeft={codesLeft}
        onCodeUsed={() => setCodesLeft(n => Math.max(0, n - 1))}
      />
      <BetaCodeGenerator
        onCodesGenerated={(n) => setCodesLeft(prev => prev + n)}
      />
    </>
  )
}
