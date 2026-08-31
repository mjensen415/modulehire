import type { SupabaseClient } from '@supabase/supabase-js'

export interface UserPreferences {
  writing_style?: 'concise' | 'detailed'          // bullet length / depth
  tone?: 'professional' | 'technical' | 'executive' | 'startup'
  career_level?: 'mid' | 'senior' | 'executive'
  target_roles?: string[]                          // e.g. ["Product Manager", "Senior PM"]
  target_industries?: string[]                     // e.g. ["SaaS", "FinTech"]
  always_include_keywords?: string[]               // always weave into rewrites
  avoid_phrases?: string[]                         // never use these
}

/** Fetch user preferences. Returns empty object if none set. */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPreferences> {
  const { data } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single()
  return (data?.preferences ?? {}) as UserPreferences
}

/** Build a preference context block to inject into AI prompts. Returns '' if no prefs set. */
export function buildPreferenceContext(prefs: UserPreferences): string {
  const lines: string[] = []

  if (prefs.writing_style)
    lines.push(`Writing style: ${prefs.writing_style === 'concise' ? 'Use tight, concise bullets (max ~12 words). Cut filler.' : 'Use detailed bullets with context and supporting data.'}`)
  if (prefs.tone)
    lines.push(`Tone: ${prefs.tone}`)
  if (prefs.career_level)
    lines.push(`Career level: ${prefs.career_level} — frame impact and scope accordingly`)
  if (prefs.target_roles?.length)
    lines.push(`Target roles: ${prefs.target_roles.join(', ')}`)
  if (prefs.target_industries?.length)
    lines.push(`Target industries: ${prefs.target_industries.join(', ')}`)
  if (prefs.always_include_keywords?.length)
    lines.push(`Always weave in these keywords when relevant: ${prefs.always_include_keywords.join(', ')}`)
  if (prefs.avoid_phrases?.length)
    lines.push(`Never use these phrases: ${prefs.avoid_phrases.join(', ')}`)

  if (lines.length === 0) return ''

  return `USER PREFERENCES (apply to all output):
${lines.map(l => `- ${l}`).join('\n')}`
}
