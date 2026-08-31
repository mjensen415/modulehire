import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { optionalStringArray, ValidationError } from '@/lib/validate'
import type { UserPreferences } from '@/lib/preferences'

const WRITING_STYLES = new Set(['concise', 'detailed'])
const TONES = new Set(['professional', 'technical', 'executive', 'startup'])
const CAREER_LEVELS = new Set(['mid', 'senior', 'executive'])

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ preferences: data?.preferences ?? {} })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const input = body?.preferences ?? {}

  let preferences: UserPreferences
  try {
    if (input.writing_style !== undefined && input.writing_style !== null && !WRITING_STYLES.has(input.writing_style)) {
      throw new ValidationError('writing_style must be one of: concise, detailed')
    }
    if (input.tone !== undefined && input.tone !== null && !TONES.has(input.tone)) {
      throw new ValidationError('tone must be one of: professional, technical, executive, startup')
    }
    if (input.career_level !== undefined && input.career_level !== null && !CAREER_LEVELS.has(input.career_level)) {
      throw new ValidationError('career_level must be one of: mid, senior, executive')
    }

    preferences = {
      ...(input.writing_style ? { writing_style: input.writing_style } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.career_level ? { career_level: input.career_level } : {}),
      target_roles: optionalStringArray(input.target_roles, 5, 100, 'target_roles'),
      target_industries: optionalStringArray(input.target_industries, 5, 100, 'target_industries'),
      always_include_keywords: optionalStringArray(input.always_include_keywords, 10, 60, 'always_include_keywords'),
      avoid_phrases: optionalStringArray(input.avoid_phrases, 10, 60, 'avoid_phrases'),
    }
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }

  const { error } = await supabase
    .from('users')
    .update({ preferences })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, preferences })
}
