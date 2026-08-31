'use client'

import { useEffect, useState } from 'react';

export function IconFlask() {
  return (
    <svg width="20" height="20" viewBox="0 0 15 15" fill="none">
      <path d="M6 1.5h3M6.2 1.5v3.8L2.8 11a1.5 1.5 0 0 0 1.3 2.3h6.8a1.5 1.5 0 0 0 1.3-2.3L8.8 5.3V1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.3 9.5h6.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function RatingToggle({
  value,
  onChange,
}: {
  value: 'good' | 'bad' | null;
  onChange: (v: 'good' | 'bad' | null) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        type="button"
        onClick={() => onChange(value === 'good' ? null : 'good')}
        title="Correct"
        style={{
          width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13,
          border: `1px solid ${value === 'good' ? 'var(--teal)' : 'var(--border2)'}`,
          background: value === 'good' ? 'var(--teal)' : 'transparent',
          color: value === 'good' ? '#fff' : 'var(--text3)',
          transition: 'all 0.15s',
        }}
      >
        ✓
      </button>
      <button
        type="button"
        onClick={() => onChange(value === 'bad' ? null : 'bad')}
        title="Wrong"
        style={{
          width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13,
          border: `1px solid ${value === 'bad' ? 'var(--rose)' : 'var(--border2)'}`,
          background: value === 'bad' ? 'var(--rose)' : 'transparent',
          color: value === 'bad' ? '#fff' : 'var(--text3)',
          transition: 'all 0.15s',
        }}
      >
        ✗
      </button>
    </div>
  );
}

export function RatedCard({
  title,
  rating,
  onRate,
  children,
  correction,
}: {
  title: string;
  rating: 'good' | 'bad' | null;
  onRate: (v: 'good' | 'bad' | null) => void;
  children: React.ReactNode;
  correction?: React.ReactNode;
}) {
  const borderColor = rating === 'good' ? 'var(--teal)' : rating === 'bad' ? 'var(--rose)' : 'var(--border)';
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}`,
      borderRadius: 10, padding: '14px 16px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingTop: 5 }}>{title}</div>
        <RatingToggle value={rating} onChange={onRate} />
      </div>
      <div style={{ fontSize: 14, color: 'var(--text)' }}>{children}</div>
      {rating === 'bad' && correction && <div style={{ marginTop: 10 }}>{correction}</div>}
    </div>
  );
}

export const MODEL_OPTIONS = [
  { value: '', label: 'Default (env ANTHROPIC_MODEL)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5' },
  { value: 'claude-opus-5', label: 'Opus 5' },
];

export function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(!MODEL_OPTIONS.some((o) => o.value === value));

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="form-label">Model</div>
      <select
        value={custom ? '__custom' : value}
        onChange={(e) => {
          if (e.target.value === '__custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
        className="form-input"
      >
        {MODEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value="__custom">Custom model ID…</option>
      </select>
      {custom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. claude-opus-5"
          className="form-input"
          style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 12.5 }}
        />
      )}
    </div>
  );
}

export function PromptOverridePanel({
  defaultPrompt,
  value,
  onChange,
}: {
  defaultPrompt: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isOverridden = value !== '' && value !== defaultPrompt;

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => {
          if (!open && !value) onChange(defaultPrompt);
          setOpen(!open);
        }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)',
          fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', padding: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
        Prompt override
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={value || defaultPrompt}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%', minHeight: 200, background: 'var(--bg3)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: 12, fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text2)',
              resize: 'vertical', outline: 'none', lineHeight: 1.55,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{(value || defaultPrompt).length} chars</span>
            <button
              type="button"
              onClick={() => onChange(defaultPrompt)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font)' }}
            >
              Reset to default
            </button>
          </div>
          {isOverridden && (
            <div style={{
              marginTop: 8, background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6,
              padding: '8px 12px', fontSize: 12, color: 'var(--amber)',
            }}>
              ⚠ Changes apply to this run only — edit the route file to make permanent changes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RawOutputDrawer({ raw, onClose }: { raw: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, height: '40vh', zIndex: 100,
      background: '#0b0e12', borderTop: '1px solid var(--border2)', boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: '#8b96a5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Raw AI Output</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(raw); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#e6e9ee', fontSize: 11.5, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b96a5', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
          >
            ✕
          </button>
        </div>
      </div>
      <pre style={{ flex: 1, overflow: 'auto', margin: 0, padding: 16, fontSize: 12.5, fontFamily: 'var(--mono)', color: '#c8d0da', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {raw}
      </pre>
    </div>
  );
}

export function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null || data === undefined) {
    return <span style={{ color: 'var(--text3)' }}>null</span>;
  }
  if (typeof data === 'string') {
    return <span style={{ color: 'var(--teal)' }}>&quot;{data}&quot;</span>;
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span style={{ color: 'var(--amber)' }}>{String(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'var(--text3)' }}>[]</span>;
    return (
      <div style={{ marginLeft: depth === 0 ? 0 : 14 }}>
        <span onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer', color: 'var(--text3)', userSelect: 'none' }}>
          {collapsed ? `▶ Array(${data.length})` : '▼ ['}
        </span>
        {!collapsed && (
          <>
            {data.map((v, i) => (
              <div key={i} style={{ marginLeft: 14 }}><JsonTree data={v} depth={depth + 1} />{i < data.length - 1 ? ',' : ''}</div>
            ))}
            <div style={{ color: 'var(--text3)' }}>]</div>
          </>
        )}
      </div>
    );
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return <span style={{ color: 'var(--text3)' }}>{'{}'}</span>;
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 14 }}>
      <span onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer', color: 'var(--text3)', userSelect: 'none' }}>
        {collapsed ? `▶ Object(${entries.length})` : '▼ {'}
      </span>
      {!collapsed && (
        <>
          {entries.map(([k, v], i) => (
            <div key={k} style={{ marginLeft: 14 }}>
              <span style={{ color: 'var(--indigo)' }}>{k}</span>: <JsonTree data={v} depth={depth + 1} />{i < entries.length - 1 ? ',' : ''}
            </div>
          ))}
          <div style={{ color: 'var(--text3)' }}>{'}'}</div>
        </>
      )}
    </div>
  );
}

export function RunButton({ label, loading, onClick, disabled }: { label: string; loading: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="btn-primary-full"
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled || loading ? 'default' : 'pointer', position: 'relative' }}
    >
      {loading ? 'Running…' : label}
    </button>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 240, gap: 14 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border2)',
        borderTopColor: 'var(--teal)', animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 13, color: 'var(--text3)' }}>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ResultsHeader({ ranAt, onRerun, model }: { ranAt: Date; onRerun: () => void; model?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      {model && (
        <span style={{ fontSize: 10.5, color: 'var(--teal)', fontFamily: 'var(--mono)', background: 'var(--teal-dim)', padding: '2px 8px', borderRadius: 4 }}>
          {model}
        </span>
      )}
      <span style={{ fontSize: 11.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        Run at {ranAt.toLocaleTimeString('en-US')}
      </span>
      <button
        type="button"
        onClick={onRerun}
        className="btn-ghost"
        style={{ fontSize: 11.5, padding: '4px 10px' }}
      >
        Re-run
      </button>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, textAlign: 'center', color: 'var(--text3)', fontSize: 13.5, padding: 24 }}>
      {children}
    </div>
  );
}

export function SaveFeedbackBar({
  notes,
  onNotesChange,
  onSave,
  saving,
  saved,
  onShowRaw,
}: {
  notes: string;
  onNotesChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onShowRaw: () => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Notes</div>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Free text — anything the fields above don't capture"
          className="form-input"
          style={{ minHeight: 70, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onSave} disabled={saving} className="btn-primary-full" style={{ margin: 0, flex: 1 }}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Feedback'}
        </button>
        <button type="button" onClick={onShowRaw} className="btn-ghost" style={{ flexShrink: 0 }}>
          Show Raw AI Output
        </button>
      </div>
    </div>
  );
}
