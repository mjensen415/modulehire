import { NextResponse } from 'next/server'
import { aiComplete, aiStream } from '@/lib/ai'
import { sanitizeCriteria } from '@/lib/dimensions'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { getActiveProfileId } from '@/lib/profile'
import { compareResumeRanges, formatResumeRange, normalizeCompany } from '@/lib/resume-dates'
import { jobResolver, type JobRow } from '@/lib/job-grouping'
import type { UserPreferences } from '@/lib/preferences'
import { factCheckBullets, stripUnsupportedSentences, type FactFlag, type SourceModule } from '@/lib/fact-check'
// canGenerate removed — generation is always allowed; download is gated client-side via canDownload.
import { FREE_MONTHLY_GENERATIONS, isProTier } from '@/lib/plan'
import { nanoid } from 'nanoid'
import { createResumeStreamReader } from '@/lib/stream-json'
import { contactLine, makeBlock, type ResumeDoc } from '@/lib/resume-doc'
import { docToRenderInput, renderResume, type CombinationData, type Contact, type CoverLetterConfig, type EducationEntry, type ResumeFormat, type StructuredData } from '@/lib/resume-render'

export const maxDuration = 60

// ─── HANDLER ──────────────────────────────────────────────────────────────────

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

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = await checkAndLog(supabase, user.id, 'rl_generate_resume', 20, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    // Email verification gate: block generation for unconfirmed accounts when
    // REQUIRE_EMAIL_VERIFICATION is enabled. Users can still sign in, browse, and
    // build their library — only the expensive AI generate action is gated.
    const { needsEmailVerification } = await import('@/lib/email-verification')
    if (needsEmailVerification(user)) {
      return NextResponse.json(
        { error: 'Please verify your email before generating resumes. Check your inbox or request a new link.' },
        { status: 403 }
      )
    }

    // ── Plan gate: monthly generation limit ──────────────────────────────────
    const now = new Date()
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    const [usageRes, profileRes] = await Promise.all([
      supabase
        .from('resume_generation_counts')
        .select('count, overage_credits')
        .eq('user_id', user.id)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('users')
        .select('resume_credits, tier')
        .eq('id', user.id)
        .single(),
    ])

    const usageRow = usageRes.data as { count?: number; overage_credits?: number } | null
    const profileRow = profileRes.data as { resume_credits?: number; tier?: string } | null

    const resumeCredits = profileRow?.resume_credits ?? 0
    const tier = (profileRow?.tier ?? 'free') as string
    void usageRow

    // Free-tier monthly generation cap (Pro / beta_pro: unlimited).
    if (!isProTier(tier)) {
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
      const { count: monthlyCount } = await supabase
        .from('generated_resumes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth)
      if ((monthlyCount ?? 0) >= FREE_MONTHLY_GENERATIONS) {
        return NextResponse.json({
          error: "You've used your 25 free resumes this month. Upgrade to Pro for unlimited generations.",
          code: 'monthly_generation_limit',
        }, { status: 402 })
      }
    }

    const {
      module_ids,
      jd_id,
      positioning_variant,
      contact,
      summary_override,
      education,
      skills,
      awards_text,
      include_skills_section,
      include_education_section,
      include_awards_section,
      include_summary,
      cover_letter,
      job_level,
      format = 'classic',
      bullet_style = '•',
      confirmed_phrases,
      confirmed_themes,
      module_augmentations,
      bullets_per_role,
      stream = false,
    }: {
      module_ids: string[]
      jd_id: string
      positioning_variant: string
      contact: Contact
      summary_override?: string
      education?: EducationEntry[]
      skills?: string[]
      awards_text?: string
      include_skills_section: boolean
      include_education_section: boolean
      include_awards_section?: boolean
      include_summary: boolean
      cover_letter?: CoverLetterConfig
      job_level?: string
      format?: ResumeFormat
      bullet_style?: string
      confirmed_phrases?: string[]
      confirmed_themes?: string[]
      module_augmentations?: Record<string, string>
      /** Auto-picked drafts: max bullets for the two most recent roles and for older ones. */
      bullets_per_role?: { recent: number; older: number }
      /** NDJSON: summary and each job as written, then `document`, then `done` (v2 Building screen). */
      stream?: boolean
    } = await req.json()

    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }
    if (!Array.isArray(module_ids) || module_ids.length === 0 || module_ids.length > 100 || !module_ids.every(isUuid)) {
      return NextResponse.json({ error: 'Invalid module_ids' }, { status: 400 })
    }

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const profileId = await getActiveProfileId(supabase, user.id)
    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('*')
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .in('id', module_ids)
    if (modError) throw modError

    // Build ordered modules (preserving user's selection order) with augmentations applied
    const orderedModules = module_ids
      .map((id: string) => modules.find(m => m.id === id))
      .filter((m): m is Record<string, unknown> => Boolean(m))
      .map((m) => {
        const augmented = module_augmentations?.[String(m.id)]
        return augmented ? { ...m, content: augmented } : m
      })

    // ── Experience groups from real job records ─────────────────────────────
    // Group by the job a module is assigned to (module_job_assignments → job_experiences),
    // never by raw module strings: those split one employer into several entries ("Fiverr" vs
    // "Fiverr International") and invent employers ("Multiple", "Career narrative"). Modules
    // with no job go to one only if their normalized company matches it; otherwise, and for
    // positioning modules, they are career-level — summary/skills material, never an entry.
    const [{ data: assignmentRows }, { data: jobRows }] = await Promise.all([
      supabase.from('module_job_assignments').select('module_id, job_id').in('module_id', module_ids),
      supabase.from('job_experiences').select('id, company, title, start_date, end_date').eq('user_id', user.id),
    ])
    const jobs: JobRow[] = (jobRows ?? []) as JobRow[]
    const resolveJob = jobResolver(jobs, assignmentRows ?? [])
    const jobForModule = (m: Record<string, unknown>) => resolveJob({ id: String(m.id), type: m.type, source_company: m.source_company, source_role_title: m.source_role_title })

    type GroupDraft = { key: string; company: string; role: string; start: unknown; end: unknown; modules: Record<string, unknown>[] }
    const groupMap = new Map<string, GroupDraft>()
    const careerModules: Record<string, unknown>[] = []
    // Strings that name no single employer: never an experience heading.
    const notAnEmployer = (company: string) =>
      !company || /[,;]/.test(company) || /^(multiple|various|career narrative|professional profile|summary|unknown|n\/a|none|self)$/i.test(company.trim())
    for (const m of orderedModules) {
      const job = jobForModule(m)
      if (job) {
        if (!groupMap.has(job.id)) groupMap.set(job.id, { key: job.id, company: job.company, role: job.title ?? '', start: job.start_date, end: job.end_date, modules: [] })
        groupMap.get(job.id)!.modules.push(m)
        continue
      }
      // No job records at all (older accounts): fall back to the module's own strings,
      // normalized, so one employer still gets one entry.
      const company = String(m.source_company ?? '').trim()
      if (jobs.length === 0 && m.type !== 'positioning' && !notAnEmployer(company)) {
        const key = `${normalizeCompany(company)}||${String(m.source_role_title ?? '').trim().toLowerCase()}`
        if (!groupMap.has(key)) groupMap.set(key, { key, company, role: String(m.source_role_title ?? ''), start: m.date_start, end: m.date_end, modules: [] })
        groupMap.get(key)!.modules.push(m)
        continue
      }
      careerModules.push(m)
    }

    const groupDrafts = [...groupMap.values()].sort((a, b) => compareResumeRanges(a.start, a.end, b.start, b.end))
    const sortedModules = [...groupDrafts.flatMap(g => g.modules), ...careerModules]

    // Pre-structured experience groups, so the AI never decides which module belongs to which
    // job or what the dates are — company, role and dates are used verbatim (and re-applied
    // after generation in checkExperience).
    type ExperienceGroup = {
      job_id: string
      company: string
      role: string
      dates: string
      max_bullets?: number
      modules: SourceModule[]
    }
    const toSource = (m: Record<string, unknown>): SourceModule => ({ id: String(m.id), title: String(m.title ?? ''), content: String(m.content ?? '') })
    const bulletCap = (index: number): number | undefined => {
      if (!bullets_per_role) return undefined
      const cap = index < 2 ? bullets_per_role.recent : bullets_per_role.older
      return Number.isInteger(cap) && cap > 0 && cap <= 8 ? cap : undefined
    }
    const experienceGroups: ExperienceGroup[] = groupDrafts.map((g, i) => ({
      job_id: g.key,
      company: g.company,
      role: g.role,
      dates: formatResumeRange(g.start, g.end),
      ...(bulletCap(i) ? { max_bullets: bulletCap(i) } : {}),
      modules: g.modules.map(toSource),
    }))
    const careerBlock = careerModules.length > 0
      ? `\ncareer_modules (career-level material: use only in the summary and skills — never as an experience entry):\n${JSON.stringify(careerModules.map(toSource))}\n`
      : ''

    const variantFraming: Record<string, string> = {
      A: 'Lead with community impact and grassroots momentum',
      B: 'Lead with leadership scale and organizational growth',
      C: 'Lead with cross-functional influence and stakeholder alignment',
      D: 'Lead with technical depth and product partnership',
    }

    const summaryInstruction = summary_override
      ? `Use this summary verbatim (do not change it): "${summary_override}"`
      : `Write a 3-4 sentence professional summary that applies this framing: ${variantFraming[positioning_variant] ?? variantFraming.A}`

    const educationText = (education as EducationEntry[] | undefined)?.length
      ? (education as EducationEntry[]).map(e => `${e.degree} in ${e.field}, ${e.school} (${e.year})`).join('\n')
      : ''

    const skillsText = (skills as string[] | undefined)?.length
      ? (skills as string[]).join(', ')
      : ''

    const awardsSection = include_awards_section && awards_text?.trim()
      ? awards_text.trim()
      : ''

    const levelFraming: Record<string, string> = {
      Associate: 'execution, task delivery, and team contribution',
      Manager: 'team leadership, project delivery, and operational excellence',
      'Senior Manager': 'cross-functional leadership, team scaling, and program ownership',
      Director: 'strategy, organizational impact, and cross-functional leadership',
      VP: 'executive strategy, business outcomes, and organizational transformation',
      Executive: 'vision, transformation, business outcomes, and board-level impact',
    }
    const levelInstruction = job_level && levelFraming[job_level]
      ? `Frame experience for a ${job_level}-level role. Emphasize ${levelFraming[job_level]}.`
      : ''

    const phrasesToUse: string[] = confirmed_phrases?.length ? confirmed_phrases : (jd.extracted_phrases || [])
    const themesToUse: string[] = confirmed_themes?.length ? confirmed_themes : (jd.extracted_themes || [])

    // The resume describes the candidate, not the posting. JD wording is only allowed where a
    // module already shows the candidate did that thing; everything else is reported back as
    // unsupported_phrases (shown to the user as a gap to fill) instead of being written in.
    const atsInstruction = phrasesToUse.length > 0
      ? `KEYWORD RULES:
- Here are the posting's key phrases: ${phrasesToUse.join(', ')}
- Use a phrase only when a module's content shows the candidate actually did that thing. Then prefer the posting's exact wording over a synonym.
- If no module supports a phrase, leave it out. Never add a skill, tool, scope, number, company, or outcome that is not in the modules.
- Return the phrases you did NOT use in "unsupported_phrases".
${themesToUse.length > 0 ? `- The posting's themes, for framing only where the modules support them: ${themesToUse.join(', ')}` : ''}`
      : (themesToUse.length > 0 ? `- Mirror these JD themes only where the modules support them: ${themesToUse.join(', ')}` : '')

    // Repetition signal: the competencies a posting asks for in several places are the ones a
    // screener (human or ATS) is actually looking for. Pass criteria most-mentioned first and
    // require the top 3's own phrasings to appear once each where truthful.
    const criteriaByMentions = sanitizeCriteria(jd.extracted_criteria)
      .sort((a, b) => (b.mentions ?? 1) - (a.mentions ?? 1) || b.weight - a.weight)
    const topRepeated = criteriaByMentions.slice(0, 3).filter(c => (c.also_called ?? []).length > 0)
    const repetitionInstruction = criteriaByMentions.length > 0
      ? `JOB REQUIREMENTS (most-repeated in the posting first):
${criteriaByMentions.map(c => `- ${c.label} (asked for ${c.mentions ?? 1}×, weight ${c.weight}/5): ${c.description}`).join('\n')}
${topRepeated.length > 0 ? `
The posting's own wording for its most-repeated asks: ${topRepeated.map(c => `${c.label} → ${(c.also_called ?? []).map(p => `"${p}"`).join(' / ')}`).join('; ')}.
- Use one of each of these phrasings verbatim${include_summary ? ' in the summary and' : ''} in the bullets of the first (most recent) experience entry — but ONLY where the candidate's module content truthfully supports it.
- One natural use each. Do not stuff, repeat, or force a phrase into a bullet it doesn't fit.` : ''}`
      : ''

    const compactInstruction = ''

    // Prefer the literal job title (e.g. "Head of People") over the role-type
    // category slug ("vp-community"). Fall back to role_type → "Resume".
    const roleTitle = (jd.extracted_job_title && String(jd.extracted_job_title).trim())
      || jd.extracted_role_type
      || 'Resume'
    const resumeTitle = `${roleTitle} - ${contact.name}`
    const docxFilename = `${resumeTitle}.docx`

    // ── Fact check ────────────────────────────────────────────────────────────
    // Every generated bullet is checked against the module it came from (numbers and proper
    // nouns must appear there); a failing bullet becomes a plain sentence from that module.
    // Names may also come from the target role, the candidate's own profile, and the jobs the
    // selected modules came from.
    const allSourceModules: SourceModule[] = sortedModules.map(toSource)
    const factContext: string[] = [
      String(jd.extracted_company ?? ''), String(jd.extracted_job_title ?? ''), job_level ?? '',
      contact.name ?? '', contact.location ?? '', skillsText, educationText, awardsSection,
      ...sortedModules.flatMap(m => [String(m.source_company ?? ''), String(m.source_role_title ?? '')]),
      ...experienceGroups.flatMap(g => [g.company, g.role]),
    ]
    const generationFlags: FactFlag[] = []
    let modelUnsupported: string[] = []
    const sameText = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
    type CheckedEntry = { job_id: string; title: string; company: string; dates: string; bullets: string[]; sources: (string | null)[] }
    type RawEntry = { title: string; company: string; dates: string; bullets: string[]; bullet_sources?: string[] }
    function checkExperience(entries: RawEntry[] | undefined): CheckedEntry[] {
      return (entries ?? []).map((e, i) => checkEntry(e, i, true))
    }
    // `record` false = a streamed preview: same check, flags not logged twice.
    function checkEntry(e: RawEntry, i: number, record: boolean): CheckedEntry {
      {
        const group = experienceGroups.find(g => sameText(g.company, e.company) && sameText(g.role, e.title))
          ?? experienceGroups[i]
        const { bullets, sources, flags } = factCheckBullets(
          Array.isArray(e.bullets) ? e.bullets : [],
          group?.modules ?? allSourceModules,
          [...factContext, group?.company ?? '', group?.role ?? ''],
          Array.isArray(e.bullet_sources) ? e.bullet_sources : [],
        )
        if (record) generationFlags.push(...flags)
        const cap = group?.max_bullets ?? bullets.length
        return group
          ? { job_id: group.job_id, company: group.company, title: group.role, dates: group.dates, bullets: bullets.slice(0, cap), sources: sources.slice(0, cap) }
          : { job_id: `entry-${i}`, company: e.company ?? '', title: e.title ?? '', dates: e.dates ?? '', bullets, sources }
      }
    }
    function checkSummary(summary: string | undefined, record = true): string | undefined {
      if (!summary || summary_override) return summary
      const { text, removed } = stripUnsupportedSentences(summary, allSourceModules.flatMap(m => [m.content, m.title]), factContext)
      if (record) generationFlags.push(...removed.map(r => ({ module_id: null, bullet: r.sentence, reason: r.reason, replacement: null })))
      return text
    }

    // Streaming: the summary and each job go out as soon as the model has written them (same
    // fact check as the final doc), so the Building screen shows the resume filling in. The
    // final doc is still built from the complete response.
    let emit: (obj: Record<string, unknown>) => void = () => {}
    const writeResume = async (prompt: string, arrayKey: string): Promise<string> => {
      const opts = { tier: 'quality' as const, action: 'ai_generate_resume', userId: user.id }
      if (!stream) return aiComplete([{ role: 'user', content: prompt }], 4096, opts)
      const read = createResumeStreamReader(arrayKey)
      let text = ''
      let index = 0
      for await (const delta of aiStream([{ role: 'user', content: prompt }], 4096, opts)) {
        text += delta
        const pieces = read(delta)
        if (pieces.summary !== undefined && include_summary) {
          emit({ type: 'summary', text: summary_override || checkSummary(pieces.summary, false) || '' })
        }
        for (const item of pieces.items) {
          const entry = checkEntry(item as RawEntry, index, false)
          emit({ type: 'job', index, entry: { company: entry.company, title: entry.title, dates: entry.dates, bullets: entry.bullets } })
          index++
        }
      }
      return text
    }

    const finishGeneration = async () => {
      // ── Generate → resume document ───────────────────────────────────────────
      // The model's JSON is fact-checked, then turned into a ResumeDoc (src/lib/resume-doc.ts):
      // the editable source of truth on /resumes/[id]. Every file — now and on later downloads —
      // is rendered from that document, so the editor and the files always match.
      const docContact = {
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        location: contact.location ?? '',
        linkedin: contact.linkedin ?? '',
      }
      const toBlocks = (entry: CheckedEntry) => entry.bullets.map((t, j) => makeBlock(t, entry.sources[j] ?? null))
      let resumeDoc: ResumeDoc

      if (format === 'combination') {
        const comboPrompt = `Assemble a tailored resume in structured JSON for: ${jd.extracted_role_type} at ${jd.extracted_company}.

  Rules:
  - Write punchy bullet points that start with a strong verb, using only the metrics the modules state
  ${atsInstruction}
  ${repetitionInstruction}
  ${levelInstruction ? `- ${levelInstruction}` : ''}
  - Summary: ${summaryInstruction}

  Respond with JSON ONLY matching this exact structure:
  {
    "job_title": "inferred target job title",
    "summary": "3–4 sentence professional summary",
    "skill_sections": [
      { "category": "Skill Domain Name", "bullets": ["Achievement or responsibility...", "..."] }
    ],
    "work_experience": [
      { "title": "Job Title", "company": "Company · City, State", "dates": "Mon YYYY to Mon YYYY", "bullets": ["...", "..."], "bullet_sources": ["<id of the module bullet 1 came from>", "..."] }
    ],
    "unsupported_phrases": ["posting phrases you did not use because no module supports them"],
    "education": [
      { "degree": "Degree and Major", "school": "University Name", "year": "YYYY" }
    ],
    "skills_list": ["skill1", "skill2"],
    "awards": "award or certification text, or empty string if none"
  }

  - skill_sections: one entry per module in skill_modules below (use module title as category, convert content to 2–4 bullets)
  - work_experience: use EXACTLY the pre-built experience_groups below — one experience entry per group, in order. Do NOT merge groups, split groups, or move any module to a different group. The company, role, and dates are pre-set — copy them verbatim (dates may be empty; leave them empty). Convert each module's content into 2–4 bullets (when a group has "max_bullets", at most that many for the whole entry). bullet_sources lists, for each bullet in order, the id of the module it came from.
  - education: ${include_education_section && educationText ? educationText : 'leave as empty array []'}
  - skills_list: ${include_skills_section && skillsText ? skillsText : 'leave as empty array []'}
  - awards: ${awardsSection ? `include this verbatim: ${awardsSection}` : 'set to empty string ""'}
  ${!include_summary ? '- summary: set to empty string ""' : ''}

  skill_modules (one skill_section entry per module):
  ${JSON.stringify(sortedModules.map((m: Record<string, unknown>) => ({ title: m.title, content: m.content })))}

  experience_groups (one work_experience entry per group — do not reorder or reassign):
  ${JSON.stringify(experienceGroups)}
  ${careerBlock}`

        const rawCombo = await writeResume(comboPrompt, 'work_experience')
        const strippedCombo = rawCombo.replace(/```json/g, '').replace(/```/g, '')
        const cs = strippedCombo.indexOf('{'), ce = strippedCombo.lastIndexOf('}')
        if (cs === -1 || ce === -1) throw new Error(`Combination template: model did not return JSON. Got: ${strippedCombo.slice(0, 200)}`)
        const parsedCombo: CombinationData & { unsupported_phrases?: string[] } = JSON.parse(strippedCombo.slice(cs, ce + 1).replace(/,(\s*[}\]])/g, '$1'))
        modelUnsupported = Array.isArray(parsedCombo.unsupported_phrases) ? parsedCombo.unsupported_phrases : []

        resumeDoc = {
          header: { name: contact.name, title: String(parsedCombo.job_title ?? roleTitle), contact: contactLine(docContact), contact_fields: docContact },
          summary: makeBlock(include_summary ? (checkSummary(parsedCombo.summary) ?? '') : ''),
          experience: checkExperience(parsedCombo.work_experience).map(e => ({ job_id: e.job_id, company: e.company, title: e.title, dates: e.dates, bullets: toBlocks(e) })),
          // One skill section per module, in sortedModules order.
          skill_sections: (parsedCombo.skill_sections ?? []).map((sec, i) => {
            const source = allSourceModules[i]
            const { bullets, flags } = factCheckBullets(
              Array.isArray(sec.bullets) ? sec.bullets : [],
              source ? [source] : allSourceModules,
              factContext,
            )
            generationFlags.push(...flags)
            return { id: nanoid(10), category: String(sec.category ?? ''), module_id: source?.id ?? null, bullets: bullets.map(t => makeBlock(t, source?.id ?? null)) }
          }),
          skills: include_skills_section && Array.isArray(parsedCombo.skills_list) ? parsedCombo.skills_list.map(String).filter(Boolean) : [],
          education: include_education_section && Array.isArray(parsedCombo.education)
            ? parsedCombo.education.map(e => makeBlock([e.degree, e.school].filter(Boolean).join(', ') + (e.year ? ` (${e.year})` : ''))).filter(b => b.text.trim())
            : [],
          awards: awardsSection,
          format: 'combination',
          bullet_style,
        }

      } else {
        const prompt = `You are a resume writer. Convert the provided modules into a polished resume for: ${jd.extracted_role_type} at ${jd.extracted_company}.

  CRITICAL BULLET RULES — follow exactly:
  - Every experience entry MUST have a "bullets" array of 2–4 short bullet strings
  - Each bullet MUST be under 20 words
  - Each bullet MUST start with a past-tense action verb (Built, Led, Grew, Launched, Managed, Drove, Scaled, etc.)
  - Use only the metrics and outcomes the module content states — never add a number that isn't there. Do NOT copy the paragraph verbatim
  - Do NOT put paragraph text as a single bullet — always decompose into multiple short bullets
  ${atsInstruction}
  ${repetitionInstruction}
  ${levelInstruction ? `- ${levelInstruction}` : ''}

  Summary: ${summaryInstruction}

  For the experience array: use EXACTLY the pre-built experience_groups below — produce one experience entry per group, in order. Do NOT merge groups, split groups, or reassign any module to a different group. The company, role, and dates for each entry are pre-set — copy them verbatim (dates may be empty; leave them empty). Convert each module's content into 2–4 bullets as described above. When a group has "max_bullets", write at most that many bullets for the whole entry, choosing the strongest.
  ${include_skills_section && skillsText ? `Skills: list these as a comma-separated string: ${skillsText}` : ''}
  ${include_education_section && educationText ? `Education: use this verbatim: ${educationText}` : ''}
  ${awardsSection ? `Awards & Certifications: include this section verbatim: ${awardsSection}` : ''}
  ${compactInstruction}

  Respond with ONLY this JSON structure — no markdown, no explanation:
  {
    "job_title": "the exact job title from the job description",
    "summary": "3-4 sentence professional summary",
    "experience": [
      { "title": "Job Title", "company": "Company Name", "dates": "Jan 2020 to Present", "bullets": ["<bullet from a module>", "<bullet from a module>"], "bullet_sources": ["<id of the module bullet 1 came from>", "<id of the module bullet 2 came from>"] }
    ],
    "unsupported_phrases": ["posting phrases you did not use because no module supports them"],
    "skills": "skill1, skill2, skill3",
    "education": "B.S. Communications, UC Berkeley (2017)",
    "awards": "award or certification text, or empty string if none"
  }

  experience_groups (one experience entry per group — do not reorder or reassign):
  ${JSON.stringify(experienceGroups)}
  ${careerBlock}`

        const rawResponseText = await writeResume(prompt, 'experience')
        const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
        const jsonStart = stripped.indexOf('{'), jsonEnd = stripped.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`)
        const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
          .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1')
        const resumeData: StructuredData & { unsupported_phrases?: string[] } = JSON.parse(cleanJson)
        modelUnsupported = Array.isArray(resumeData.unsupported_phrases) ? resumeData.unsupported_phrases : []

        resumeDoc = {
          header: { name: contact.name, title: String(resumeData.job_title ?? roleTitle), contact: contactLine(docContact), contact_fields: docContact },
          summary: makeBlock(include_summary ? (checkSummary(resumeData.summary) ?? '') : ''),
          experience: checkExperience(resumeData.experience).map(e => ({ job_id: e.job_id, company: e.company, title: e.title, dates: e.dates, bullets: toBlocks(e) })),
          skill_sections: [],
          skills: include_skills_section && resumeData.skills ? String(resumeData.skills).split(',').map(x => x.trim()).filter(Boolean) : [],
          education: include_education_section && resumeData.education
            ? String(resumeData.education).split(/\n+/).map(x => x.trim()).filter(Boolean).map(t => makeBlock(t))
            : [],
          awards: awardsSection,
          format: format as Exclude<ResumeFormat, 'combination'>,
          bullet_style,
        }
      }

      const rendered = await renderResume(docToRenderInput(resumeDoc))
      const resumeHtml = rendered.html
      const docxBuffer = rendered.docx
      const pdfBuffer = rendered.pdf

      const resumeId = crypto.randomUUID()
      const docxPath = `${user.id}/${resumeId}.docx`
      const pdfPath = `${user.id}/${resumeId}.pdf`

      const { error: docxUploadErr } = await supabase.storage
        .from('temp')
        .upload(docxPath, docxBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      if (docxUploadErr) throw docxUploadErr

      const { error: pdfUploadErr } = await supabase.storage
        .from('temp')
        .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf' })
      if (pdfUploadErr) throw pdfUploadErr

      // This route is authenticated-only (401 above if no user), so every resume
      // belongs to a logged-in user and is saved permanently. Never expire it.
      const { data: savedResume, error: saveError } = await supabase
        .from('generated_resumes')
        .insert({
          id: resumeId,
          user_id: user.id,
          profile_id: profileId,
          job_description_id: jd_id,
          title: resumeTitle,
          module_ids_used: module_ids,
          positioning_variant,
          docx_url: docxPath,
          pdf_url: pdfPath,
          is_temp: false,
          expires_at: null,
        })
        .select()
        .single()
      if (saveError) throw saveError

      // The editable document behind this resume (/resumes/[id] edits it; downloads render it).
      // A failure here leaves a normal file-only resume rather than failing the generation.
      const { data: docRow, error: docError } = await supabase
        .from('resume_documents')
        .insert({ user_id: user.id, job_description_id: jd_id, generated_resume_id: resumeId, doc: resumeDoc })
        .select('id')
        .single()
      if (docError) console.error('[generate-resume] resume_documents insert failed:', docError)
      // The editor can open now; keyword analysis and the cover letter finish behind it.
      emit({ type: 'document', resume_id: resumeId, resume_doc_id: docRow?.id ?? null })

      const { data: docxSigned } = await supabase.storage.from('temp').createSignedUrl(docxPath, 3600)
      const { data: pdfSigned } = await supabase.storage.from('temp').createSignedUrl(pdfPath, 3600)

      // ── Keyword matching analysis ─────────────────────────────────────────────
      // Strip HTML tags first so angle brackets don't interfere with text matching.
      // Then use word-level fuzzy matching: a keyword is "matched" if ≥50% of its
      // meaningful words (len > 2, not stopwords) appear anywhere in the resume text.
      // This handles paraphrasing — the AI rarely echoes JD phrases verbatim but
      // will use the same key words.
      const KW_STOPWORDS = new Set(['and','or','the','a','an','to','of','in','for','on','with','at','by','from','as','into','that','this','be','is','are','was','were','will','can','may','has','have','had','not','but','it','its','who','how','what','when','where','which','you','your','we','our','their','they','them','these','those'])
      const cleanResumeText = resumeHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()

      // Score against the confirmed keyword lists (what the user reviewed), not raw JD fields
      const jdKeywords = [...themesToUse, ...phrasesToUse]
        .map((k: string) => k.toLowerCase().trim())
        .filter((k: string, i: number, arr: string[]) => k.length > 1 && arr.indexOf(k) === i)
      const matchedKeywords: string[] = []
      const missingKeywords: string[] = []
      for (const kw of jdKeywords) {
        // 1) Exact phrase match (most reliable)
        if (cleanResumeText.includes(kw)) {
          matchedKeywords.push(kw)
          continue
        }
        // 2) Word-level fuzzy: extract meaningful words (len > 2, not stopwords)
        const kwWords = kw.split(/\W+/).filter(w => w.length > 2 && !KW_STOPWORDS.has(w))
        if (kwWords.length === 0) {
          // Very short keyword — do whole-word check
          const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
          if (re.test(cleanResumeText)) matchedKeywords.push(kw)
          else missingKeywords.push(kw)
          continue
        }
        const hitCount = kwWords.filter(w => cleanResumeText.includes(w)).length
        if (hitCount / kwWords.length >= 0.5) matchedKeywords.push(kw)
        else missingKeywords.push(kw)
      }

      // ── ATS score (composite 0–100) ───────────────────────────────────────────
      // 60% keyword coverage · 20% contact completeness · 10% module count · 10% summary
      const kwScore = jdKeywords.length > 0
        ? Math.round((matchedKeywords.length / jdKeywords.length) * 100)
        : 75 // no keywords to check — give benefit of the doubt
      const contactFields = [contact.name, contact.email, contact.phone, contact.linkedin, contact.location]
      const contactScore = Math.round((contactFields.filter(Boolean).length / 5) * 100)
      const moduleScore = Math.min(module_ids.length, 8) / 8 * 100
      const summaryScore = include_summary ? 100 : 0
      const atsScore = Math.round(kwScore * 0.6 + contactScore * 0.2 + moduleScore * 0.1 + summaryScore * 0.1)

      // Save score back to the DB record
      await supabase
        .from('generated_resumes')
        .update({ ats_score: atsScore })
        .eq('id', resumeId)

      // Posting phrases left off because no module supports them — shown to the user as gaps
      // to fill, not hidden. A phrase the model says it skipped counts unless it's literally on
      // the page (the fuzzy keyword match above is too lenient to overrule the model there).
      const unsupportedPhrases = phrasesToUse.filter(p => {
        const lower = p.toLowerCase().trim()
        if (missingKeywords.includes(lower)) return true
        return modelUnsupported.some(u => sameText(u, p)) && !cleanResumeText.includes(lower)
      })
      // Separate update so a missing column (migration not yet applied) can't lose the score.
      const { error: flagsError } = await supabase
        .from('generated_resumes')
        .update({ generation_flags: generationFlags, unsupported_phrases: unsupportedPhrases })
        .eq('id', resumeId)
      if (flagsError) console.error('[generate-resume] saving generation_flags failed:', flagsError)

      let coverLetterText: string | null = null
      let coverLetterUrl: string | null = null

      // Cover letter generates for all tiers as a teaser; the .txt download is
      // gated to Pro in the UI.
      if (cover_letter?.include) {
        const toneDesc: Record<string, string> = {
          professional: 'Professional and concise — clear, direct, no fluff',
          warm: 'Warm and conversational — personable, human, enthusiastic',
          direct: 'Direct and confident — bold, assured, no hedging',
        }
        const topModules = sortedModules.slice(0, 4) as Array<Record<string, unknown>>
        const clPrompt = `Write a cover letter for this candidate applying to ${jd.extracted_role_type} at ${jd.extracted_company}.

  Tone: ${toneDesc[cover_letter.tone] ?? toneDesc.professional}
  Candidate experience (top modules):
  ${topModules.map(m => `- ${m.title}: ${String(m.content).slice(0, 200)}`).join('\n')}
  JD themes: ${(jd.extracted_themes || []).join(', ')}
  ${cover_letter.notes ? `Additional context: ${cover_letter.notes}` : ''}

  Rules:
  - 3 paragraphs max
  - Do NOT open with "I am writing to apply" — start with something specific and compelling
  - Mirror 1-2 phrases from the JD naturally
  - Close with a clear call to action
  - Plain text output only — no JSON, no markdown, no headers`

        coverLetterText = await aiComplete([{ role: 'user', content: clPrompt }], 1024, { tier: 'quality', action: 'ai_cover_letter', userId: user.id })

        const coverPath = `${user.id}/${resumeId}-cover.txt`
        await supabase.storage.from('temp').upload(
          coverPath,
          Buffer.from(coverLetterText, 'utf-8'),
          { contentType: 'text/plain' }
        )
        const { data: coverSigned } = await supabase.storage.from('temp').createSignedUrl(coverPath, 3600)
        coverLetterUrl = coverSigned?.signedUrl ?? null
      }

      await supabase.from('usage_events').insert({ user_id: user.id, action: 'generate_resume' })

      // Remember these options so the next resume's confirm step is pre-filled with them.
      const { data: prefsRow } = await supabase.from('users').select('preferences').eq('id', user.id).single()
      const resumeDefaults: UserPreferences['resume_defaults'] = {
        format,
        bullet_style,
        include_summary,
        include_skills: include_skills_section,
        include_education: include_education_section,
        include_awards: !!include_awards_section,
        include_cover_letter: !!cover_letter?.include,
        cover_letter_tone: cover_letter?.tone,
      }
      const { error: prefsError } = await supabase
        .from('users')
        .update({ preferences: { ...((prefsRow?.preferences as UserPreferences | null) ?? {}), resume_defaults: resumeDefaults } })
        .eq('id', user.id)
      if (prefsError) console.error('[generate-resume] saving resume_defaults failed:', prefsError)

      // Consume one resume credit per generation for non-pro users with credits.
      // Free users with 0 credits still generate within their monthly quota.
      if (!isProTier(tier) && resumeCredits > 0) {
        const { error: creditError } = await supabase.rpc('increment_resume_credits', {
          p_user_id: user.id,
          p_amount: -1,
        })
        if (creditError) {
          console.error('[generate-resume] decrement resume_credits failed:', creditError)
        }
      }

      // Increment monthly resume count (atomic via RPC). Generation already succeeded —
      // log on failure but don't fail the request.
      const { error: incError } = await supabase.rpc('increment_resume_count', {
        p_user_id: user.id,
        p_month: month,
      })
      if (incError) {
        console.error('[generate-resume] increment_resume_count failed:', incError)
      }

      // Full keyword breakdown is a Pro-only feature. Free tiers get the score only.
      const proBreakdown = isProTier(tier)

      return {
        resume_id: savedResume.id,
        resume_doc_id: docRow?.id ?? null,
        docx_url: docxSigned?.signedUrl,
        pdf_url: pdfSigned?.signedUrl,
        docx_filename: docxFilename,
        resume_html: resumeHtml,
        cover_letter_text: coverLetterText,
        cover_letter_url: coverLetterUrl,
        matched_keywords: proBreakdown ? matchedKeywords : [],
        missing_keywords: proBreakdown ? missingKeywords : [],
        ats_score: atsScore,
        unsupported_phrases: unsupportedPhrases,
        fact_check_rewrites: generationFlags.length,
      }
    }

    if (!stream) return NextResponse.json(await finishGeneration())
    return new Response(new ReadableStream({
      async start(controller) {
        emit = obj => {
          try { controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n')) } catch { /* client gone */ }
        }
        try {
          emit({ type: 'done', ...(await finishGeneration()) })
        } catch (error) {
          console.error('[generate-resume] stream', error)
          emit({ type: 'error', message: 'We couldn\'t write the draft. Try again.' })
        } finally {
          controller.close()
        }
      },
    }), { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
