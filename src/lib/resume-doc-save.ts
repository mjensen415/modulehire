// Saving a live resume document, shared by the editor's autosave (PATCH /api/resume-docs/[id])
// and the MCP edit tools, so both get the same version check and history.
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseResumeDoc } from '@/lib/resume-doc'

const HISTORY_KEEP = 50

export type SaveResult =
  | { ok: true; version: number; updated_at: string }
  | { ok: false; reason: 'invalid'; error: string }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'conflict'; current_version: number }

/**
 * Saves the whole document. `version` is the version the caller edited; if someone saved since
 * (another tab, the editor, an AI client), the update matches no row and this returns
 * `conflict` so the caller reloads instead of silently overwriting.
 */
export async function saveResumeDoc(
  supabase: SupabaseClient,
  userId: string,
  docId: string,
  version: number,
  doc: unknown,
): Promise<SaveResult> {
  const parsed = parseResumeDoc(doc)
  if (!parsed.ok) return { ok: false, reason: 'invalid', error: parsed.error }

  const nextVersion = version + 1
  const { data: updated, error } = await supabase
    .from('resume_documents')
    .update({ doc: parsed.doc, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('id', docId)
    .eq('user_id', userId)
    .eq('version', version)
    .select('id, version, updated_at')
    .maybeSingle()
  if (error) throw error
  if (!updated) {
    const { data: current } = await supabase
      .from('resume_documents')
      .select('version')
      .eq('id', docId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!current) return { ok: false, reason: 'not_found' }
    return { ok: false, reason: 'conflict', current_version: current.version }
  }

  // History is a convenience, not the save itself — log failures, don't fail the save.
  const { error: historyError } = await supabase
    .from('resume_document_history')
    .insert({ document_id: docId, version: nextVersion, doc: parsed.doc })
  if (historyError) console.error('[saveResumeDoc] history insert failed:', historyError)
  else {
    await supabase
      .from('resume_document_history')
      .delete()
      .eq('document_id', docId)
      .lte('version', nextVersion - HISTORY_KEEP)
  }

  return { ok: true, version: updated.version, updated_at: updated.updated_at }
}
