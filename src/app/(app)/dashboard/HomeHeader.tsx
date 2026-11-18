'use client'

import { useSyncExternalStore } from 'react'

// Greeting and date follow the user's clock, so they render on the client.
const subscribe = () => () => {}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function HomeHeader({ firstName, summary }: { firstName: string | null; summary: string }) {
  const hello = useSyncExternalStore(subscribe, greeting, () => 'Hello')
  const date = useSyncExternalStore(
    subscribe,
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    () => '',
  )
  return (
    <header className="home-header">
      <StackedBlocks />
      <div className="home-header-text">
        <div className="home-date">{date || ' '}</div>
        <h1 className="home-greeting">{hello}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="home-summary">{summary}</p>
      </div>
    </header>
  )
}

// The modular-resume idea as a picture: offset blocks stacked into one column.
function StackedBlocks() {
  return (
    <svg className="home-blocks" width="112" height="96" viewBox="0 0 112 96" aria-hidden="true">
      <rect x="18" y="66" width="76" height="22" rx="7" fill="var(--h-sage)" stroke="var(--h-line-strong)" />
      <rect x="8" y="42" width="70" height="22" rx="7" fill="var(--h-peach)" stroke="var(--h-line-strong)" />
      <rect x="30" y="18" width="66" height="22" rx="7" fill="var(--h-lavender)" stroke="var(--h-line-strong)" />
      <rect x="46" y="2" width="30" height="14" rx="5" fill="var(--h-butter)" stroke="var(--h-line-strong)" />
      <path d="M28 77h30M18 53h36M42 29h28" stroke="var(--h-ink)" strokeOpacity="0.28" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
