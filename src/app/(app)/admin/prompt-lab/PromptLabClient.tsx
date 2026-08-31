'use client'

import { useState } from 'react';
import { IconFlask } from './shared';
import JdParserTab from './JdParserTab';
import MatcherTab from './MatcherTab';
import RewriterTab from './RewriterTab';
import HistoryTab from './HistoryTab';

type Tab = 'jd-parser' | 'matcher' | 'rewriter' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'jd-parser', label: 'JD Parser' },
  { id: 'matcher', label: 'Matcher' },
  { id: 'rewriter', label: 'Rewriter' },
  { id: 'history', label: 'History' },
];

export default function PromptLabClient() {
  const [tab, setTab] = useState<Tab>('jd-parser');

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">
            <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8, color: 'var(--teal)' }}>
              <IconFlask />
            </span>
            Prompt Lab
          </span>
          <span className="topbar-sub">— Test and rate AI prompts</span>
        </div>
      </div>

      <div className="dash-content">
        <div className="tab-bar">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={`tab-panel${tab === 'jd-parser' ? ' active' : ''}`}>
          {tab === 'jd-parser' && <JdParserTab />}
        </div>
        <div className={`tab-panel${tab === 'matcher' ? ' active' : ''}`}>
          {tab === 'matcher' && <MatcherTab />}
        </div>
        <div className={`tab-panel${tab === 'rewriter' ? ' active' : ''}`}>
          {tab === 'rewriter' && <RewriterTab />}
        </div>
        <div className={`tab-panel${tab === 'history' ? ' active' : ''}`}>
          {tab === 'history' && <HistoryTab />}
        </div>

        <div style={{ marginTop: 32, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          Runs against real data via dry-run endpoints — nothing is written except saved feedback.
        </div>
      </div>
    </>
  );
}
