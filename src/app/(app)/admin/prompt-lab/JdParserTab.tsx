'use client'

import { useState } from 'react';
import { PromptOverridePanel, RawOutputDrawer, RatedCard, RunButton, Spinner, ResultsHeader, SaveFeedbackBar, EmptyState, ModelSelect } from './shared';

const DEFAULT_PROMPT_LABEL = '(loaded from route on first expand)';

type Extracted = {
  extracted_company?: string;
  extracted_job_title?: string;
  extracted_role_type?: string;
  extracted_seniority?: string;
  extracted_themes?: string[];
  extracted_phrases?: string[];
};

type FieldRating = 'good' | 'bad' | null;

type TagState = 'neutral' | 'good' | 'bad';

export default function JdParserTab() {
  const [rawText, setRawText] = useState('');
  const [promptOverride, setPromptOverride] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ extracted: Extracted; raw_ai_response: string; prompt_used: string; model_used?: string } | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const [fieldRatings, setFieldRatings] = useState<Record<string, FieldRating>>({});
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [themeStates, setThemeStates] = useState<Record<string, TagState>>({});
  const [phraseStates, setPhraseStates] = useState<Record<string, TagState>>({});
  const [newTheme, setNewTheme] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  async function run() {
    if (!rawText.trim() || loading) return;
    setLoading(true);
    setError('');
    setFieldRatings({});
    setCorrections({});
    setThemeStates({});
    setPhraseStates({});
    setNotes('');
    setSaved(false);
    try {
      const res = await fetch('/api/admin/prompt-lab/jd-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, prompt_override: promptOverride || undefined, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
      if (!defaultPrompt) setDefaultPrompt(data.prompt_used.split('Job Description:')[0].trim() + '\n\nJob Description:\n{{raw_text}}\n\nJSON:');
      setRanAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function cycleTag(map: Record<string, TagState>, setMap: (m: Record<string, TagState>) => void, key: string) {
    const cur = map[key] ?? 'neutral';
    const next: TagState = cur === 'neutral' ? 'good' : cur === 'good' ? 'bad' : 'neutral';
    setMap({ ...map, [key]: next });
  }

  const ratedCount = Object.values(fieldRatings).filter(Boolean).length
    + (Object.values(themeStates).some(v => v !== 'neutral') ? 1 : 0)
    + (Object.values(phraseStates).some(v => v !== 'neutral') ? 1 : 0);
  const totalFields = 4 + (result ? 2 : 0);

  async function saveFeedback() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/prompt-lab/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_type: 'jd_parse',
          input_snapshot: { raw_text: rawText, prompt_used: result.prompt_used, model_used: result.model_used },
          output_snapshot: { extracted: result.extracted, raw_ai_response: result.raw_ai_response },
          feedback: { field_ratings: fieldRatings, corrections, theme_states: themeStates, phrase_states: phraseStates },
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="prompt-lab-split">
      <div>
        <div className="form-label">Job Description</div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste a job description here…"
          className="jd-textarea"
          disabled={loading}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
          {rawText.length} chars
        </div>
        <ModelSelect value={model} onChange={setModel} />
        {result && (
          <PromptOverridePanel
            defaultPrompt={defaultPrompt || DEFAULT_PROMPT_LABEL}
            value={promptOverride}
            onChange={setPromptOverride}
          />
        )}
        {error && <div style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <RunButton label="Run Parser" loading={loading} onClick={run} disabled={!rawText.trim()} />
      </div>

      <div>
        {loading && <Spinner label="Asking the AI..." />}
        {!loading && !result && <EmptyState>Paste a job description and run the parser to see results.</EmptyState>}
        {!loading && result && (
          <>
            {ranAt && <ResultsHeader ranAt={ranAt} onRerun={run} model={result.model_used} />}

            <RatedCard
              title="Company"
              rating={fieldRatings.company ?? null}
              onRate={(v) => setFieldRatings({ ...fieldRatings, company: v })}
              correction={
                <input
                  className="form-input"
                  placeholder="Correct value"
                  value={corrections.company ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, company: e.target.value })}
                />
              }
            >
              {result.extracted.extracted_company || <em style={{ color: 'var(--text3)' }}>empty</em>}
            </RatedCard>

            <RatedCard
              title="Job Title"
              rating={fieldRatings.title ?? null}
              onRate={(v) => setFieldRatings({ ...fieldRatings, title: v })}
              correction={
                <input
                  className="form-input"
                  placeholder="Correct value"
                  value={corrections.title ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, title: e.target.value })}
                />
              }
            >
              {result.extracted.extracted_job_title || <em style={{ color: 'var(--text3)' }}>empty</em>}
            </RatedCard>

            <RatedCard
              title="Role Type"
              rating={fieldRatings.role_type ?? null}
              onRate={(v) => setFieldRatings({ ...fieldRatings, role_type: v })}
              correction={
                <input
                  className="form-input"
                  placeholder="Correct role type"
                  value={corrections.role_type ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, role_type: e.target.value })}
                />
              }
            >
              {result.extracted.extracted_role_type}
            </RatedCard>

            <RatedCard
              title="Seniority"
              rating={fieldRatings.seniority ?? null}
              onRate={(v) => setFieldRatings({ ...fieldRatings, seniority: v })}
              correction={
                <input
                  className="form-input"
                  placeholder="Correct seniority"
                  value={corrections.seniority ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, seniority: e.target.value })}
                />
              }
            >
              {result.extracted.extracted_seniority}
            </RatedCard>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Themes ({(result.extracted.extracted_themes ?? []).length})
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                {(result.extracted.extracted_themes ?? []).map((t) => {
                  const state = themeStates[t] ?? 'neutral';
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => cycleTag(themeStates, setThemeStates, t)}
                      className="theme-chip"
                      style={{
                        cursor: 'pointer',
                        borderColor: state === 'good' ? 'var(--teal)' : state === 'bad' ? 'var(--rose)' : 'var(--teal-glow)',
                        background: state === 'good' ? 'var(--teal-dim)' : state === 'bad' ? 'var(--rose-dim)' : 'var(--teal-dim)',
                        color: state === 'bad' ? 'var(--rose)' : 'var(--teal)',
                        textDecoration: state === 'bad' ? 'line-through' : 'none',
                      }}
                    >
                      {t} {state === 'good' ? '✓' : state === 'bad' ? '✗' : ''}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="form-input"
                  placeholder="Add missing theme"
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  style={{ fontSize: 12.5, padding: '7px 10px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTheme.trim()) {
                      setThemeStates({ ...themeStates, [newTheme.trim()]: 'good' });
                      setNewTheme('');
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                ATS Phrases ({(result.extracted.extracted_phrases ?? []).length})
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(result.extracted.extracted_phrases ?? []).map((p) => {
                  const state = phraseStates[p] ?? 'neutral';
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => cycleTag(phraseStates, setPhraseStates, p)}
                      className="theme-chip"
                      style={{
                        cursor: 'pointer',
                        borderColor: state === 'good' ? 'var(--teal)' : state === 'bad' ? 'var(--rose)' : 'var(--teal-glow)',
                        background: state === 'good' ? 'var(--teal-dim)' : state === 'bad' ? 'var(--rose-dim)' : 'var(--teal-dim)',
                        color: state === 'bad' ? 'var(--rose)' : 'var(--teal)',
                        textDecoration: state === 'bad' ? 'line-through' : 'none',
                      }}
                    >
                      {p} {state === 'good' ? '✓' : state === 'bad' ? '✗' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text3)', marginBottom: 6 }}>
                <span>Feedback</span>
                <span>{ratedCount} / {totalFields} fields rated</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: '100%', background: 'var(--teal)', transformOrigin: 'left',
                  transform: `scaleX(${Math.min(1, ratedCount / totalFields)})`, transition: 'transform 0.2s',
                }} />
              </div>
            </div>

            <SaveFeedbackBar
              notes={notes}
              onNotesChange={setNotes}
              onSave={saveFeedback}
              saving={saving}
              saved={saved}
              onShowRaw={() => setShowRaw(true)}
            />
          </>
        )}
      </div>

      {showRaw && result && <RawOutputDrawer raw={result.raw_ai_response} onClose={() => setShowRaw(false)} />}
    </div>
  );
}
