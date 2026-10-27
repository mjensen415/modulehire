import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

type RouteContext = { params: Promise<{ id: string }> }

// POST — restores the before-state saved in a library_repairs row (one transaction).
export async function POST(_req: Request, { params }: RouteContext) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const admin = await createAdminClient()
  const { error } = await admin.rpc('undo_library_repair', { p_repair_id: id })
  if (error) {
    console.error('[admin/library-repairs undo]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
