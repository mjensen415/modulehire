import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

type RouteContext = { params: Promise<{ userId: string }> }

const OPS = new Set(['link', 'hide', 'positioning', 'job_dates'])
const DATE = /^(\d{4}-\d{2}-\d{2})?$/

// POST { ops } — applies a previewed plan in one transaction (apply_library_repair) and returns
// the audit row id, which /api/admin/library-repairs/[id]/undo reverses. The SQL function
// re-checks that every row belongs to this user.
export async function POST(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const ops = Array.isArray(body?.ops) ? body.ops : []
  const valid = ops.length > 0 && ops.length <= 2000 && ops.every((op: Record<string, unknown>) =>
    op && OPS.has(String(op.op)) &&
    (op.module_id === undefined || isUuid(op.module_id)) &&
    (op.job_id === undefined || isUuid(op.job_id)) &&
    (op.op !== 'link' || (isUuid(op.module_id) && isUuid(op.job_id))) &&
    (op.op !== 'job_dates' || (isUuid(op.job_id) && DATE.test(String(op.start_date ?? '')) && DATE.test(String(op.end_date ?? '')))))
  if (!valid) return NextResponse.json({ error: 'That plan is not valid. Preview again.' }, { status: 400 })

  const admin = await createAdminClient()
  const { data, error } = await admin.rpc('apply_library_repair', { p_user_id: userId, p_plan: ops, p_applied_by: guard.user.id })
  if (error) {
    console.error('[admin/library-health apply]', error)
    return NextResponse.json({ error: error.message.includes('function') ? 'The library_repairs migration is not applied yet.' : error.message }, { status: 500 })
  }
  return NextResponse.json({ repair_id: data })
}
