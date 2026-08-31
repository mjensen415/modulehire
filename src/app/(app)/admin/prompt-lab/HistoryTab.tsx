'use client'

import { Fragment, useEffect, useMemo, useState } from 'react';
import { JsonTree, EmptyState } from './shared';

type FeedbackRow = {
  id: string;
  lab_type: 'jd_parse' | 'match_modules' | 'module_rewrite';
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
  feedback: Record<string, unknown>;
  notes: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  jd_parse: 'JD Parse',
  match_modules: 'Matcher',
  module_rewrite: 'Rewriter',
};

function subjectFor(row: FeedbackRow): string {
  const input = row.input_snapshot as { raw_text?: string; jd_id?: string; module_id?: string };
  if (row.lab_type === 'jd_parse') {
    const output = row.output_snapshot as { extracted?: { extracted_company?: string; extracted_job_title?: string } };
    const e = output.extracted;
    if (e?.extracted_company || e?.extracted_job_title) return `${e.extracted_company || 'Unknown'} · ${e.extracted_job_title || 'Untitled'}`;
    return 'Untitled JD';
  }
  return input.jd_id ? `JD ${input.jd_id.slice(0, 8)}…` : '—';
}

function ratingSummaryFor(row: FeedbackRow): string {
  const f = row.feedback;
  if (row.lab_type === 'jd_parse') {
    const ratings = (f.field_ratings as Record<string, string | null>) ?? {};
    const rated = Object.values(ratings).filter(Boolean).length;
    const total = Object.keys(ratings).length || 4;
    return `${rated}/${total} ✓`;
  }
  if (row.lab_type === 'match_modules') {
    const ratings = (f.ratings as Record<string, string | null>) ?? {};
    const rated = Object.values(ratings).filter(Boolean).length;
    return rated > 0 ? `${rated} rated` : '—';
  }
  if (row.lab_type === 'module_rewrite') {
    const overall = f.overall as string | undefined;
    if (overall === 'good') return '✓ Good';
    if (overall === 'partial') return '⚠ Partial';
    if (overall === 'bad') return '✗ Off';
    return '—';
  }
  return '—';
}

export default function HistoryTab() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/prompt-lab/feedback')
      .then((r) => r.json())
      .then((d) => setRows(d.feedback ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.lab_type !== typeFilter) return false;
      if (search && !(r.notes ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, typeFilter, search]);

  if (loading) return <EmptyState>Loading…</EmptyState>;
  if (rows.length === 0) return <EmptyState>No feedback saved yet. Run the parser or matcher to get started.</EmptyState>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="form-input" style={{ width: 160 }}>
          <option value="all">All types</option>
          <option value="jd_parse">JD Parser</option>
          <option value="match_modules">Matcher</option>
          <option value="module_rewrite">Rewriter</option>
        </select>
        <input
          className="search-input"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220 }}
        />
      </div>

      <div className="section-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Rating</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <Fragment key={row.id}>
                  <tr onClick={() => setExpanded(expanded === row.id ? null : row.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td style={{ fontSize: 12 }}>{TYPE_LABELS[row.lab_type]}</td>
                    <td style={{ fontSize: 12 }}>{subjectFor(row)}</td>
                    <td style={{ fontSize: 12 }}>{ratingSummaryFor(row)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.notes || '—'}
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg3)', padding: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 12, fontFamily: 'var(--mono)' }}>
                          <div>
                            <div style={{ color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>Input</div>
                            <JsonTree data={row.input_snapshot} />
                          </div>
                          <div>
                            <div style={{ color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>Output</div>
                            <JsonTree data={row.output_snapshot} />
                          </div>
                          <div>
                            <div style={{ color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>Feedback</div>
                            <JsonTree data={row.feedback} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
