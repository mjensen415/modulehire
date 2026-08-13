import type { SupabaseClient } from '@supabase/supabase-js'

// Creates a job_descriptions row from raw pasted text so the job tracker's
// "Prep for interview" flow has a job_description_id to hand off to
// /interview-prep. No AI extraction here — kept fast/cheap; extracted_*
// fields stay null and /interview-prep falls back to "this role"/"this company".
export async function ensureJobDescription(supabase: SupabaseClient, userId: string, jdText: string): Promise<string> {
  const { data, error } = await supabase
    .from('job_descriptions')
    .insert({ user_id: userId, raw_text: jdText, source_type: 'paste' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}
