'use client'

import { useState, type ReactNode } from 'react'
import CopyButton from './CopyButton'
import s from './mcp.module.css'

type Tab = { id: string; label: string; steps: ReactNode[]; snippet?: { label: string; code: string }; note?: string; action?: ReactNode }

export default function SetupTabs({ serverUrl, cursorDeeplink }: { serverUrl: string; cursorDeeplink: string }) {
  const url = (
    <span className={s.inlineCode}>
      <code>{serverUrl}</code>
      <CopyButton text={serverUrl} label="Copy server URL" compact />
    </span>
  )
  const tabs: Tab[] = [
    {
      id: 'claude',
      label: 'Claude',
      steps: [
        <>In Claude on the web or desktop, open <b>Settings</b>, then <b>Connectors</b>.</>,
        <>Choose <b>Add custom connector</b>.</>,
        <>Name it <b>ModuleHire</b> and paste the server URL: {url}</>,
        <>Click <b>Connect</b>, sign in to ModuleHire, and choose <b>Allow</b>.</>,
        <>In a chat, turn ModuleHire on from the tools menu and ask away.</>,
      ],
      note: 'Custom connectors depend on your Claude plan. If you do not see the option, check Claude\'s help center.',
    },
    {
      id: 'chatgpt',
      label: 'ChatGPT',
      steps: [
        <>Open <b>Settings</b>, then <b>Apps &amp; Connectors</b>, then <b>Advanced settings</b>, and turn on <b>Developer mode</b>.</>,
        <>Back in <b>Apps &amp; Connectors</b>, choose <b>Create</b>.</>,
        <>Name it <b>ModuleHire</b>, paste the server URL, and pick <b>OAuth</b> for authentication: {url}</>,
        <>Sign in to ModuleHire and choose <b>Allow</b>.</>,
        <>In a new chat, add ModuleHire from the <b>+</b> menu.</>,
      ],
      note: 'ChatGPT moves these menus around now and then. Look for custom apps or connectors under Settings.',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      steps: [
        <>Click <b>Add to Cursor</b> below, or paste the config into <code>~/.cursor/mcp.json</code>.</>,
        <>Cursor opens ModuleHire in your browser. Sign in and choose <b>Allow</b>.</>,
        <>Ask the agent about your resume in any chat.</>,
      ],
      snippet: { label: '~/.cursor/mcp.json', code: JSON.stringify({ mcpServers: { modulehire: { url: serverUrl } } }, null, 2) },
      action: (
        <a href={cursorDeeplink} className={`btn-primary ${s.ctaBtn}`}>
          Add to Cursor
        </a>
      ),
    },
    {
      id: 'claude-code',
      label: 'Claude Code',
      steps: [
        <>Run this in your terminal.</>,
        <>Start Claude Code, type <code>/mcp</code>, pick <b>modulehire</b>, and sign in.</>,
      ],
      snippet: { label: 'Terminal', code: `claude mcp add --transport http modulehire ${serverUrl}` },
    },
    {
      id: 'codex',
      label: 'Codex',
      steps: [
        <>Run these in your terminal.</>,
        <>Your browser opens ModuleHire. Sign in and choose <b>Allow</b>.</>,
        <>Ask Codex about your resume in any thread.</>,
      ],
      snippet: { label: 'Terminal', code: `codex mcp add modulehire --url ${serverUrl}\ncodex mcp login modulehire` },
      note: 'Already added it in your app\'s MCP settings? Leave the bearer token and header fields blank, then run the login command with the name you gave it. Run codex mcp list to see the name.',
    },
  ]
  const [active, setActive] = useState(tabs[0].id)
  const tab = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <div className={s.setup}>
      <div className={s.tabs} role="tablist" aria-label="Choose your app">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            className={`${s.tab} ${t.id === active ? s.tabActive : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.panel} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`}>
        <ol className={s.steps}>
          {tab.steps.map((step, i) => (
            <li key={i}>
              <span className={s.stepNum}>{i + 1}</span>
              <div>{step}</div>
            </li>
          ))}
        </ol>
        {tab.action && <div style={{ marginTop: 20 }}>{tab.action}</div>}
        {tab.snippet && (
          <div className={s.snippet}>
            <div className={s.snippetHead}>
              <span>{tab.snippet.label}</span>
              <CopyButton text={tab.snippet.code} label={`Copy ${tab.snippet.label}`} />
            </div>
            <pre>
              <code>{tab.snippet.code}</code>
            </pre>
          </div>
        )}
        {tab.note && <p className={s.note}>{tab.note}</p>}
      </div>
    </div>
  )
}
