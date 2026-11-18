'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

// The round's time in the viewer's own time zone.
export default function RoundWhen({ iso }: { iso: string | null }) {
  const text = useSyncExternalStore(
    subscribe,
    () => (iso
      ? new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Date not set'),
    () => (iso ? '' : 'Date not set'),
  )
  return <>{text}</>
}
