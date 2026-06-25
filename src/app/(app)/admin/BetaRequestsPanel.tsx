'use client'

// Beta invites were retired when open signup launched. This panel is now a
// no-op stub: it no longer renders the waitlist or calls the (deleted)
// /api/admin/send-beta-invite route. It is kept as an export so BetaAdminWrapper
// keeps compiling — safe to remove entirely, along with its BetaAdminWrapper
// usage, in a later cleanup.
export function BetaRequestsPanel(_props: {
  initialRequests: unknown[]
  codesLeft: number
  onCodeUsed: () => void
}) {
  return null
}
