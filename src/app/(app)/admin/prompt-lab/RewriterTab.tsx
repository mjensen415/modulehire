'use client'

import { useEffect, useState } from 'react';
import { PromptOverridePanel, RawOutputDrawer, RunButton, Spinner, ResultsHeader, SaveFeedbackBar, EmptyState, ModelSelect } from './shared';

type JdOption = { id: string; extracted_job_title: string | null; extracted_company: string | null };
type ModuleOption = { id: string; title: string };

type RewriteResult = {
  suggestion: string;
  original: string;
  raw_ai_response: string;
  prompt_used: string;
  model_used?: string;
};

const ISSUE_OPTIONS = ['Too wordy', 'Wrong tone', 'Missing keywords', 'Over-engineered', 'Lost my voice', 'Inaccurate claim'];

function wordDiff(a: string, b: string) {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  // Simple LCS-based word diff
  const m = aw.length, n = bw.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const removed: string[] = [];
  const added: { text: string; add: boolean }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (aw[i] === bw[j]) {
      added.push({ text: bw[j], add: false });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed.push(aw[i]);
      i++;
    } else {
      added.push({ text: bw[j], add: true });
      j++;
    }
  }
  while (i < m) { removed.push(aw[i]); i++; }
  while (j < n) { added.push({ text: bw[j], add: true }); j++; }
  return added;
}

export default function RewriterTab() {
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [jds, setJds] = useState<JdOption[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [jdId, setJdId] = useState('');
  const [promptOverride, setPromptOverride] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [overall, setOverall] = useState<'good' | 'partial' | 'bad' | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    fetch('/api/my-modules').then((r) => r.json()).then((d) => setModules(d.modules ?? [])).catch(() => {});
    fetch('/api/job-descriptions').then((r) => r.json()).then((d) => setJds(d.job_descriptions ?? [])).catch(() => {});
  }, []);

  async function run() {
    if (!moduleId || !jdId || loading) return;
    setLoading(true);
    setError('');
    setEditing(false);
    setOverall(null);
    setIssues([]);
    setNotes('');
    setSaved(false);
    try {
      const res = await fetch('/api/admin/prompt-lab/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_id: moduleId, jd_id: jdId, prompt_override: promptOverride || undefined, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
      setEditedText(data.suggestion);
      if (!defaultPrompt) setDefaultPrompt(data.prompt_used);
      setRanAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggleIssue(issue: string) {
    setIssues(issues.includes(issue) ? issues.filter((i) => i !== issue) : [...issues, issue]);
  }

  async function saveFeedback() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/prompt-lab/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_type: 'module_rewrite',
          input_snapshot: { module_id: moduleId, jd_id: jdId, prompt_used: result.prompt_used, model_used: result.model_used },
          output_snapshot: { original: result.original, suggestion: result.suggestion, raw_ai_response: result.raw_ai_response },
          feedback: { overall, issues, edited_text: editedText !== result.suggestion ? editedText : undefined },
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

  const diff = result ? wordDiff(result.original, result.suggestion) : [];
  const overallOptions: { v: 'good' | 'partial' | 'bad'; label: string }[] = [
    { v: 'good', label: '✓ Good suggestion' },
    { v: 'partial', label: '⚠ Partially right' },
    { v: 'bad', label: '✗ Off the mark' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="prompt-lab-split">
      <div>
        <div className="form-label">Module</div>
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="form-input" style={{ marginBottom: 16 }}>
          <option value="">Select a module…</option>
          {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>

        <div className="form-label">Job Description</div>
        <select value={jdId} onChange={(e) => setJdId(e.target.value)} className="form-input" style={{ marginBottom: 16 }}>
          <option value="">Select a job description…</option>
          {jds.map((jd) => (
            <option key={jd.id} value={jd.id}>
              {(jd.extracted_company || 'Unknown company')} · {(jd.extracted_job_title || 'Untitled role')}
            </option>
          ))}
        </select>

        <ModelSelect value={model} onChange={setModel} />
        {result && <PromptOverridePanel defaultPrompt={defaultPrompt} value={promptOverride} onChange={setPromptOverride} />}
        {error && <div style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {modules.length === 0 ? (
          <EmptyState>You don&apos;t have any modules yet. Upload a resume first.</EmptyState>
        ) : (
          <RunButton label="Run Rewriter" loading={loading} onClick={run} disabled={!moduleId || !jdId} />
        )}
      </div>

      <div>
        {loading && <Spinner label="Asking the AI..." />}
        {!loading && !result && <EmptyState>Select a job description above to get started.</EmptyState>}
        {!loading && result && (
          <>
            {ranAt && <ResultsHeader ranAt={ranAt} onRerun={run} model={result.model_used} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Original</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{result.original}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI Suggestion</div>
                  {!editing && (
                    <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Edit</button>
                  )}
                </div>
                {editing ? (
                  <>
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      style={{ width: '100%', minHeight: 140, fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font)', color: 'var(--text)', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: 10, resize: 'vertical', outline: 'none' }}
                    />
                    <button type="button" onClick={() => setEditing(false)} className="btn-ghost" style={{ fontSize: 11.5, marginTop: 8, padding: '4px 10px' }}>Save edit</button>
                  </>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {diff.map((part, i) => (
                      <span
                        key={i}
                        style={part.add
                          ? { color: 'var(--teal)', background: 'var(--teal-dim)' }
                          : undefined}
                      >
                        {part.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 8 }}>Overall:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {overallOptions.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setOverall(overall === o.v ? null : o.v)}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
                      border: `1px solid ${overall === o.v ? 'var(--teal)' : 'var(--border2)'}`,
                      background: overall === o.v ? 'var(--teal-dim)' : 'transparent',
                      color: overall === o.v ? 'var(--teal)' : 'var(--text2)',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {(overall === 'partial' || overall === 'bad') && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Specific issues (check all that apply):</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {ISSUE_OPTIONS.map((issue) => (
                    <label key={issue} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={issues.includes(issue)} onChange={() => toggleIssue(issue)} />
                      {issue}
                    </label>
                  ))}
                </div>
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
