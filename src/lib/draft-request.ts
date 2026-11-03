// The generate-resume request for a draft nobody configured by hand: the user's saved contact
// details, summary and education, and their Design defaults. Shared by /api/jobs/start (new
// drafts) and /api/resume-docs/from-generated (making an older resume editable).
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { UserPreferences } from './preferences'
import { jobLevelForSeniority, pickPositioningVariant } from './resume-options'

export type DraftJd = {
  jd_id: string
  extracted_role_type: string | null
  extracted_seniority: string | null
  extracted_themes: string[]
  extracted_phrases: string[]
}

export async function draftGenerateBody(
  supabase: SupabaseClient,
  user: User,
  jd: DraftJd,
  moduleIds: string[],
  skillTitles: string[],
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const [{ data: profile }, { data: education }] = await Promise.all([
    supabase.from('users').select('name, email, phone, linkedin_url, location, summary, preferences').eq('id', user.id).single(),
    supabase.from('education').select('school, degree, field, year').eq('user_id', user.id).order('sort_order'),
  ])
  const defaults = (profile?.preferences as UserPreferences | null)?.resume_defaults ?? {}
  const educationRows = (education ?? []).filter(e => e.school || e.degree)
  const skills = skillTitles.map(s => s.trim()).filter(Boolean)
  const includeSummary = defaults.include_summary ?? true
  const includeSkills = (defaults.include_skills ?? true) && skills.length > 0
  const includeEducation = (defaults.include_education ?? true) && educationRows.length > 0

  return {
    module_ids: moduleIds,
    module_order: moduleIds,
    jd_id: jd.jd_id,
    positioning_variant: pickPositioningVariant(jd),
    contact: {
      name: profile?.name || user.email || '',
      email: profile?.email || user.email || '',
      phone: profile?.phone ?? '',
      linkedin: profile?.linkedin_url ?? '',
      location: profile?.location ?? '',
    },
    // Their own saved summary, verbatim, when they have one.
    summary_override: includeSummary && profile?.summary ? profile.summary : undefined,
    education: includeEducation ? educationRows : [],
    skills: includeSkills ? skills : [],
    awards_text: '',
    include_skills_section: includeSkills,
    include_education_section: includeEducation,
    include_awards_section: false,
    include_summary: includeSummary,
    cover_letter: { include: !!defaults.include_cover_letter, tone: defaults.cover_letter_tone ?? 'professional' },
    job_level: jobLevelForSeniority(jd.extracted_seniority),
    format: defaults.format ?? 'classic',
    bullet_style: defaults.bullet_style ?? '•',
    confirmed_phrases: jd.extracted_phrases,
    confirmed_themes: jd.extracted_themes,
    ...extra,
  }
}
