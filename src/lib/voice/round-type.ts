// Pure (client-safe). Picks the voice mock interview type that best fits a tracked round,
// so "Practice out loud" from /interviews/[id] opens with the right interviewer.
// Keys match TYPES in src/app/(app)/interview-prep/voice/VoiceInterview.tsx.
export type VoiceType = 'recruiter_screen' | 'behavioral' | 'deep_dive'

export function voiceTypeForRound(roundName: string | null | undefined): VoiceType {
  const r = (roundName ?? '').toLowerCase()
  if (/recruit|screen|talent|intro|phone/.test(r)) return 'recruiter_screen'
  if (/technical|deep|case|panel|onsite|on-site|loop|presentation|work ?sample|exercise|final/.test(r)) return 'deep_dive'
  return 'behavioral'
}

export function voiceHref(jdId: string | null | undefined, roundName?: string | null): string {
  const q = new URLSearchParams()
  if (jdId) q.set('jd', jdId)
  if (roundName !== undefined) q.set('type', voiceTypeForRound(roundName))
  const s = q.toString()
  return `/interview-prep/voice${s ? `?${s}` : ''}`
}
