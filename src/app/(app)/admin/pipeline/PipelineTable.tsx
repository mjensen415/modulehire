'use client'

import { Fragment, useMemo, useState } from 'react';
import type { JdRow } from './page';

function statusStyle(status: string) {
  if (status === 'complete' || status === 'ready') return { background: 'var(--teal-dim)', color: 'var(--teal)' };
  if (status === 'failed' || status === 'error') return { background: 'var(--rose-dim)', color: 'var(--rose)' };
  return { background: 'var(--surface2)', color: 'var(--text3)' };
}

function scoreColor(score: number | null) {
  if (score == null) return 'var(--text3)';
  if (score >= 80) return 'var(--green)';
  if (score >= 50) return 'var(--amber)';
  return 'var(--rose)';
}

export default function PipelineTable({ rows }: { rows: JdRow[] }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportFilter, setExportFilter] = useState<'all' | 'exported' | 'not_exported'>('all');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (exportFilter === 'exported' && r.resumes.length === 0) return false;
      if (exportFilter === 'not_exported' && r.resumes.length > 0) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.user_email.toLowerCase().includes(q) ||
        (r.extracted_company ?? '').toLowerCase().includes(q) ||
        (r.extracted_job_title ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, exportFilter]);

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, color: 'var(--text3)', fontSize: 13.5 }}>
        No job descriptions have come in yet.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="search-input"
          placeholder="Search by user, company, title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <select value={exportFilter} onChange={(e) => setExportFilter(e.target.value as typeof exportFilter)} className="form-input" style={{ width: 180 }}>
          <option value="all">All JDs</option>
          <option value="exported">Exported a resume</option>
          <option value="not_exported">No resume yet</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>{filtered.length} of {rows.length} on this page</span>
      </div>

      <div className="section-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Company / Title</th>
                <th>Role</th>
                <th>Seniority</th>
                <th>Source</th>
                <th>Exports</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.user_email}</td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.extracted_company || '—'}</div>
                      <div style={{ color: 'var(--text3)' }}>{r.extracted_job_title || 'Untitled'}</div>
                    </td>
                    <td style={{ fontSize: 11.5, color: 'var(--text3)' }}>{r.extracted_role_type || '—'}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text3)' }}>{r.extracted_seniority || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{r.source_type}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.resumes.length > 0 ? (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)', background: 'var(--teal-dim)', padding: '2px 8px', borderRadius: 4 }}>
                          {r.resumes.length} resume{r.resumes.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>none yet</span>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg3)', padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                              Raw JD {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', marginLeft: 6 }}>source ↗</a>}
                            </div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                              {r.raw_text}
                            </div>

                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                                Extracted themes ({r.extracted_themes.length})
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {r.extracted_themes.map((t) => (
                                  <span key={t} className="theme-chip">{t}</span>
                                ))}
                                {r.extracted_themes.length === 0 && <span style={{ fontSize: 12, color: 'var(--text3)' }}>none</span>}
                              </div>
                            </div>

                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                                ATS phrases ({r.extracted_phrases.length})
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {r.extracted_phrases.map((p) => (
                                  <span key={p} className="theme-chip">{p}</span>
                                ))}
                                {r.extracted_phrases.length === 0 && <span style={{ fontSize: 12, color: 'var(--text3)' }}>none</span>}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                              Exported resumes ({r.resumes.length})
                            </div>
                            {r.resumes.length === 0 && (
                              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>This user hasn&apos;t generated a resume from this JD yet.</div>
                            )}
                            {r.resumes.map((res) => (
                              <div key={res.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                  <div>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{res.title}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                                      {new Date(res.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                                      {res.positioning_variant ? ` · ${res.positioning_variant}` : ''}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, ...statusStyle(res.status) }}>{res.status}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: scoreColor(res.ats_score) }}>
                                    {res.ats_score != null ? `ATS ${res.ats_score}` : 'No ATS score'}
                                  </span>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    {res.expired ? (
                                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>Files expired</span>
                                    ) : (
                                      <>
                                        {res.docx_signed && <a href={res.docx_signed} target="_blank" rel="noreferrer" className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>DOCX</a>}
                                        {res.pdf_signed && <a href={res.pdf_signed} target="_blank" rel="noreferrer" className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>PDF</a>}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '24px 0' }}>No JDs match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
