import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import PipelineTable from './PipelineTable';

export type GeneratedResumeRow = {
  id: string;
  title: string;
  positioning_variant: string | null;
  ats_score: number | null;
  status: string;
  created_at: string;
  docx_signed: string | null;
  pdf_signed: string | null;
  expired: boolean;
};

export type JdRow = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  raw_text: string;
  source_type: string;
  source_url: string | null;
  extracted_company: string | null;
  extracted_job_title: string | null;
  extracted_role_type: string | null;
  extracted_seniority: string | null;
  extracted_themes: string[];
  extracted_phrases: string[];
  created_at: string;
  resumes: GeneratedResumeRow[];
};

const PAGE_SIZE = 25;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/dashboard');

  const adminClient = await createAdminClient();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const { data: jds, count: jdCount } = await adminClient
    .from('job_descriptions')
    .select('id, user_id, raw_text, source_type, source_url, extracted_company, extracted_job_title, extracted_role_type, extracted_seniority, extracted_themes, extracted_phrases, created_at, users(email, name)', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const jdIds = (jds ?? []).map((jd) => jd.id);

  const { data: resumes } = jdIds.length > 0
    ? await adminClient
        .from('generated_resumes')
        .select('id, job_description_id, title, positioning_variant, ats_score, status, created_at, docx_url, pdf_url, expires_at')
        .in('job_description_id', jdIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
    : { data: [] as never[] };

  const resumesWithUrls = await Promise.all((resumes ?? []).map(async (r) => {
    const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false;
    if (isExpired) return { ...r, docx_signed: null, pdf_signed: null, expired: true };
    const bucket = 'temp';
    const [docxSigned, pdfSigned] = await Promise.all([
      r.docx_url ? adminClient.storage.from(bucket).createSignedUrl(r.docx_url, 3600) : Promise.resolve({ data: null }),
      r.pdf_url ? adminClient.storage.from(bucket).createSignedUrl(r.pdf_url, 3600) : Promise.resolve({ data: null }),
    ]);
    return {
      ...r,
      docx_signed: docxSigned.data?.signedUrl ?? null,
      pdf_signed: pdfSigned.data?.signedUrl ?? null,
      expired: false,
    };
  }));

  const resumesByJd: Record<string, GeneratedResumeRow[]> = {};
  for (const r of resumesWithUrls) {
    if (!r.job_description_id) continue;
    (resumesByJd[r.job_description_id] ??= []).push({
      id: r.id,
      title: r.title,
      positioning_variant: r.positioning_variant,
      ats_score: r.ats_score,
      status: r.status,
      created_at: r.created_at,
      docx_signed: r.docx_signed,
      pdf_signed: r.pdf_signed,
      expired: r.expired,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: JdRow[] = (jds ?? []).map((jd: any) => ({
    id: jd.id,
    user_id: jd.user_id,
    user_email: jd.users?.email ?? '—',
    user_name: jd.users?.name ?? null,
    raw_text: jd.raw_text,
    source_type: jd.source_type,
    source_url: jd.source_url,
    extracted_company: jd.extracted_company,
    extracted_job_title: jd.extracted_job_title,
    extracted_role_type: jd.extracted_role_type,
    extracted_seniority: jd.extracted_seniority,
    extracted_themes: jd.extracted_themes ?? [],
    extracted_phrases: jd.extracted_phrases ?? [],
    created_at: jd.created_at,
    resumes: resumesByJd[jd.id] ?? [],
  }));

  const totalPages = Math.ceil((jdCount ?? 0) / PAGE_SIZE);

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">JD Pipeline</span>
          <span className="topbar-sub">— Every job description in, how it was processed, what came out</span>
        </div>
      </div>

      <div className="dash-content">
        <PipelineTable rows={rows} />

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, padding: '16px 0', justifyContent: 'flex-end' }}>
            {page > 1 && (
              <Link href={`/admin/pipeline?page=${page - 1}`} className="btn-ghost" style={{ fontSize: 12 }}>← Prev</Link>
            )}
            <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>Page {page} of {totalPages} · {jdCount ?? 0} total</span>
            {page < totalPages && (
              <Link href={`/admin/pipeline?page=${page + 1}`} className="btn-ghost" style={{ fontSize: 12 }}>Next →</Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
