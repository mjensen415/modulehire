import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the active profile_id for the given user.
 * If none is set (new user, no modules yet), creates a Default profile,
 * sets it active, and returns its id.
 */
export async function getActiveProfileId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: userRow } = await supabase
    .from('users')
    .select('active_profile_id')
    .eq('id', userId)
    .single()

  if (userRow?.active_profile_id) return userRow.active_profile_id

  const { data: newProfile, error } = await supabase
    .from('user_profiles')
    .insert({ user_id: userId, name: 'Default' })
    .select('id')
    .single()

  if (error || !newProfile) throw new Error('Could not create default profile')

  await supabase
    .from('users')
    .update({ active_profile_id: newProfile.id })
    .eq('id', userId)

  return newProfile.id
}
