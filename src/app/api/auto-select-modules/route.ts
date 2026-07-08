import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/validate'

// Fast-track module picker: scores the user's modules against the JD's themes
// and returns the top matches, ordered. No AI call — a cheap deterministic
// heuristic so the fast-track path can pick modules in ~1s.
const MAX_MODULES = 12

export async function POST(req: Request) {
  try {
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const authedClient = createAnonClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const { data } = await authedClient.auth.getUser()
        user = data.user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (user) supabase = authedClient as any
      }
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { jd_id } = await req.json()
    if (!isUuid(jd_id)) return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })

    // 1. Fetch the JD, scoped to this user.
    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('extracted_themes')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    // 2. Fetch the user's live modules.
    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('id, themes, type, content')
      .eq('user_id', user.id)
      .is('deleted_at', null)
    if (modError) throw modError

    const themes: string[] = (jd.extracted_themes ?? [])
      .map((t: string) => String(t).toLowerCase().trim())
      .filter(Boolean)

    // Score = number of JD themes present in the module's themes array or content.
    const scored = (modules ?? []).map(m => {
      const modThemes = ((m.themes as string[] | null) ?? []).map(t => String(t).toLowerCase())
      const content = String(m.content ?? '').toLowerCase()
      let score = 0
      for (const t of themes) {
        if (modThemes.some(mt => mt.includes(t) || t.includes(mt)) || content.includes(t)) score++
      }
      return { id: m.id as string, type: m.type as string | null, score }
    })

    // 3. Sort by score desc and take the top N.
    scored.sort((a, b) => b.score - a.score)
    const selected = scored.slice(0, MAX_MODULES)

    // Always include at least one positioning module if one scored > 0.
    if (!selected.some(s => s.type === 'positioning')) {
      const bestPositioning = scored.find(s => s.type === 'positioning' && s.score > 0)
      if (bestPositioning) {
        if (selected.length >= MAX_MODULES) selected[selected.length - 1] = bestPositioning
        else selected.push(bestPositioning)
      }
    }

    return NextResponse.json({ module_ids: selected.map(s => s.id) })
  } catch (error) {
    console.error('[auto-select-modules]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
