import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgRole } from '@/lib/business/org-access'

const WEIGHTS = new Set(['dealbreaker', 'must_have', 'nice_to_have'])
const CRITERION_TYPES = new Set(['experience', 'skill'])

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('org_id')
      .eq('id', jobId)
      .single()
    if (jobError || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = await getOrgRole(supabase, job.org_id, user.id)
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const criteria = body.criteria
    if (!Array.isArray(criteria)) {
      return NextResponse.json({ error: 'criteria must be an array' }, { status: 400 })
    }
    if (criteria.length > 20) {
      return NextResponse.json({ error: 'criteria has too many items (max 20)' }, { status: 400 })
    }

    const rows = criteria.map((c, i) => {
      if (typeof c?.label !== 'string' || !c.label.trim()) {
        throw new Error(`criteria[${i}].label is required`)
      }
      if (c.label.trim().length > 100) {
        throw new Error(`criteria[${i}].label is too long (max 100)`)
      }
      if (!WEIGHTS.has(c.weight)) {
        throw new Error(`criteria[${i}].weight must be one of: dealbreaker, must_have, nice_to_have`)
      }
      const criterionType = CRITERION_TYPES.has(c.criterion_type) ? c.criterion_type : 'skill'
      const minYears = criterionType === 'experience' && typeof c.min_years === 'number' && c.min_years > 0
        ? Math.min(Math.floor(c.min_years), 50)
        : null
      return {
        job_id: jobId,
        label: c.label.trim(),
        weight: c.weight,
        description: typeof c.description === 'string' ? c.description.trim().slice(0, 500) || null : null,
        sort_order: i,
        criterion_type: criterionType,
        min_years: minYears,
      }
    })

    const { error: deleteError } = await supabase
      .from('scoring_criteria')
      .delete()
      .eq('job_id', jobId)
    if (deleteError) throw deleteError

    if (rows.length === 0) {
      return NextResponse.json({ criteria: [] })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('scoring_criteria')
      .insert(rows)
      .select('id, label, weight, description, sort_order, criterion_type, min_years')
      .order('sort_order', { ascending: true })
    if (insertError) throw insertError

    return NextResponse.json({ criteria: inserted ?? [] })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('criteria[')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[business/job-postings/[id]/criteria PUT]', error)
    return NextResponse.json({ error: 'Could not save criteria.' }, { status: 500 })
  }
}
