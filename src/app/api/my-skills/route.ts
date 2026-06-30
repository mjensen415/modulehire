import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Skills match data for the generate building step.
 * GET ?jd_id=<id> → { jd_skills, user_skills }
 *
 * jd_skills comes from the JD's extracted_themes (the analyzed skill/competency
 * array written by analyze-jd — there is no separate extracted_skills column).
 * user_skills are the user's CONFIRMED job_skills (source = 'user') only.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const jdId = searchParams.get('jd_id')
    if (!jdId) return NextResponse.json({ error: 'jd_id required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // JD skills — scoped to this user. Missing/null → empty array, not an error.
    const { data: jd } = await supabase
      .from('job_descriptions')
      .select('extracted_themes')
      .eq('id', jdId)
      .eq('user_id', user.id)
      .single()

    const jdSkills = Array.isArray(jd?.extracted_themes) ? jd!.extracted_themes : []

    // Confirmed skills, joined through job_experiences to enforce ownership.
    const { data: skillRows, error: skillsError } = await supabase
      .from('job_skills')
      .select('name, category, job_id, job_experiences!inner(user_id)')
      .eq('source', 'user')
      .eq('job_experiences.user_id', user.id)
    if (skillsError) throw skillsError

    const userSkills = (skillRows ?? []).map(r => ({
      name: r.name as string,
      category: (r.category ?? null) as string | null,
      job_id: r.job_id as string,
    }))

    return NextResponse.json({ jd_skills: jdSkills, user_skills: userSkills })
  } catch (e) {
    console.error('[my-skills GET]', e)
    return NextResponse.json({ error: 'Could not load skills.' }, { status: 500 })
  }
}
