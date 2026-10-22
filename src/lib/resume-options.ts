// Generation options picked from the posting instead of asked for. Shared by the classic
// /generate flow and /api/jobs/start.

/** Summary framing (A–D in generate-resume) from the JD's role type and seniority. */
export function pickPositioningVariant(jd: { extracted_role_type: string | null; extracted_seniority: string | null } | null): 'A' | 'B' | 'C' | 'D' {
  const role = (jd?.extracted_role_type ?? '').toLowerCase()
  const seniority = (jd?.extracted_seniority ?? '').toLowerCase()
  if (/developer|engineer|technical|devrel|product|data|solutions/.test(role)) return 'D'
  if (/community|social|ambassador|advocacy|creator/.test(role)) return 'A'
  if (['director', 'vp', 'c-suite'].includes(seniority)) return 'B'
  return 'C'
}

const SENIORITY_TO_LEVEL: Record<string, string> = {
  ic: 'Associate',
  manager: 'Manager',
  'senior-manager': 'Senior Manager',
  director: 'Director',
  vp: 'VP',
  'c-suite': 'Executive',
}

/** generate-resume's job_level from the JD's extracted seniority, or undefined. */
export function jobLevelForSeniority(seniority: string | null | undefined): string | undefined {
  return seniority ? SENIORITY_TO_LEVEL[seniority] : undefined
}
