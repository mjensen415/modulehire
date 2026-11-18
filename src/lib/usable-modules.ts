import type { SupabaseClient } from '@supabase/supabase-js'

// The one place that decides which modules may be used on a resume, in a match, in outreach or
// in interview prep: confirmed and not deleted. Parsed modules start as 'draft' and only count
// once the user confirms them; 'rejected' ("Not true") modules are also soft-deleted.
// Every route that reads modules to *use* them starts from this query, so none forgets the rule.
export const USABLE_STATUS = 'confirmed'

export function getUsableModules<Q extends string = '*'>(supabase: SupabaseClient, columns?: Q) {
  return supabase
    .from('modules')
    .select((columns ?? '*') as Q)
    .eq('status', USABLE_STATUS)
    .is('deleted_at', null)
}

/** Confirmed vs draft counts for the active profile (drafts wait in the library's review queue). */
export async function libraryCounts(supabase: SupabaseClient, userId: string, profileId: string | null) {
  const base = () => {
    let q = supabase.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null)
    if (profileId) q = q.eq('profile_id', profileId)
    return q
  }
  const [confirmed, drafts] = await Promise.all([
    base().eq('status', 'confirmed'),
    base().eq('status', 'draft'),
  ])
  return { confirmed: confirmed.count ?? 0, drafts: drafts.count ?? 0 }
}

export const CONFIRM_FIRST_CODE = 'confirm_modules_first'
export const CONFIRM_FIRST_MESSAGE = 'Confirm a few modules first. We only build resumes from modules you have checked.'
