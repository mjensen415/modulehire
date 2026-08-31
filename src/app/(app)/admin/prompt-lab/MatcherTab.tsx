'use client'

import { useEffect, useState } from 'react';
import { PromptOverridePanel, RawOutputDrawer, RunButton, Spinner, ResultsHeader, SaveFeedbackBar, EmptyState, ModelSelect } from './shared';

type JdOption = { id: string; extracted_job_title: string | null; extracted_company: string | null };

type RankedModule = {
  module_id: string;
  match_score: number;
  include_reason: string;
  title: string;
  weight: string;
};

type MatchResult = {
  ranked_modules: RankedModule[];
  recommended_stack: string[];
  raw_ai_response: string;
  prompt_used: string;
  model_used?: string;
};

type ModuleRating = 'keep' | 'too_low' | 'too_high' | 'wrong' | null;

export default function MatcherTab() {
  const [jds, setJds] = useState<JdOption[]>([]);
  const [jdId, setJdId] = useState('');
  const [promptOverride, setPromptOverride] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [order, setOrder] = useState<RankedModule[]>([]);
  const [ratings, setRatings] = useState<Record<string, ModuleRating>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    fetch('/api/job-descriptions')
      .then((r) => r.json())
      .then((d) => setJds(d.job_descriptions ?? []))
      .catch(() => {});
  }, []);

  async function run() {
    if (!jdId || loading) return;
    setLoading(true);
    setError('');
    setRatings({});
    setNotes('');
    setSaved(false);
    try {
      const res = await fetch('/api/admin/prompt-lab/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_id: jdId, prompt_override: promptOverride || undefined, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
      setOrder(data.ranked_modules);
      if (!defaultPrompt) setDefaultPrompt(data.prompt_used);
      setRanAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  function rate(moduleId: string, v: ModuleRating) {
    setRatings({ ...ratings, [moduleId]: ratings[moduleId] === v ? null : v });
  }

  const originalIds = result?.ranked_modules.map((m) => m.module_id) ?? [];
  const currentIds = order.map((m) => m.module_id);
  const reordered = JSON.stringify(originalIds) !== JSON.stringify(currentIds);

  async function saveFeedback() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/prompt-lab/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_type: 'match_modules',
          input_snapshot: { jd_id: jdId, prompt_used: result.prompt_used, model_used: result.model_used },
          output_snapshot: { ranked_modules: result.ranked_modules, recommended_stack: result.recommended_stack, raw_ai_response: result.raw_ai_response },
          feedback: { ratings, ai_order: originalIds, corrected_order: currentIds },
          notes,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save feedback');
    } finally {
      setSaving(false);
    }
  }

  const ratingButtons: { v: ModuleRating; label: string }[] = [
    { v: 'keep', label: '✓ Keep here' },
    { v: 'too_low', label: '↑ Too low' },
    { v: 'too_high', label: '↓ Too high' },
    { v: 'wrong', label: '✗ Wrong' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="prompt-lab-split">
      <div>
        <div className="form-label">Job Description</div>
        <select
          value={jdId}
          onChange={(e) => setJdId(e.target.value)}
          className="form-input"
          style={{ marginBottom: 16 }}
        >
          <option value="">Select a job description…</option>
          {jds.map((jd) => (
            <option key={jd.id} value={jd.id}>
              {(jd.extracted_company || 'Unknown company')} · {(jd.extracted_job_title || 'Untitled role')}
            </option>
          ))}
        </select>

        <ModelSelect value={model} onChange={setModel} />
        {result && (
          <PromptOverridePanel defaultPrompt={defaultPrompt} value={promptOverride} onChange={setPromptOverride} />
        )}
        {error && <div style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <RunButton label="Run Matcher" loading={loading} onClick={run} disabled={!jdId} />
      </div>

      <div>
        {loading && <Spinner label="Asking the AI..." />}
        {!loading && !result && (
          <EmptyState>{jds.length === 0 ? 'Select a job description above to get started.' : 'Select a job description above to get started.'}</EmptyState>
        )}
        {!loading && result && (
          <>
            {ranAt && <ResultsHeader ranAt={ranAt} onRerun={run} model={result.model_used} />}
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
              AI Ranking · {order.length} modules · Recommended stack: top {result.recommended_stack.length}
            </div>

            {order.map((m, i) => {
              const rating = ratings[m.module_id] ?? null;
              const originalIndex = originalIds.indexOf(m.module_id);
              const moved = originalIndex !== -1 && originalIndex !== i;
              return (
                <div key={m.module_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? 'var(--border2)' : 'var(--text3)', cursor: i === 0 ? 'default' : 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>▲</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} style={{ background: 'none', border: 'none', color: i === order.length - 1 ? 'var(--border2)' : 'var(--text3)', cursor: i === order.length - 1 ? 'default' : 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>▼</button>
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>#{i + 1} {m.title}</span>
                      {moved && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--amber)', background: 'var(--amber-dim)', padding: '1px 6px', borderRadius: 4 }}>
                          Moved from #{originalIndex + 1} → #{i + 1}
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>Score: {m.match_score}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${m.match_score}%`, background: 'var(--teal)' }} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10, fontStyle: 'italic' }}>&quot;{m.include_reason}&quot;</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ratingButtons.map((rb) => (
                      <button
                        key={rb.v}
                        type="button"
                        onClick={() => rate(m.module_id, rb.v)}
                        style={{
                          fontSize: 11.5, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
                          border: `1px solid ${rating === rb.v ? 'var(--teal)' : 'var(--border2)'}`,
                          background: rating === rb.v ? 'var(--teal-dim)' : 'transparent',
                          color: rating === rb.v ? 'var(--teal)' : 'var(--text2)',
                        }}
                      >
                        {rb.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {reordered && (
              <div style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontFamily: 'var(--mono)' }}>
                AI order: {originalIds.map((_, i) => i + 1).join(', ')} → You reordered {order.length} module{order.length === 1 ? '' : 's'}
              </div>
            )}

            <SaveFeedbackBar notes={notes} onNotesChange={setNotes} onSave={saveFeedback} saving={saving} saved={saved} onShowRaw={() => setShowRaw(true)} />
          </>
        )}
      </div>

      {showRaw && result && <RawOutputDrawer raw={result.raw_ai_response} onClose={() => setShowRaw(false)} />}
    </div>
  );
}
