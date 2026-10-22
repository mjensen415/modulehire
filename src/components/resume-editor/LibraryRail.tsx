'use client'

import type { EditorModule } from './ResumeEditor'

export type LibraryGroup = {
  entryIndex: number
  heading: string
  onResume: { module: EditorModule; blockId: string }[]
  available: EditorModule[]
}

type Props = {
  groups: LibraryGroup[]
  preview: (m: EditorModule) => string
  onShow: (blockId: string) => void
  onAdd: (entryIndex: number, m: EditorModule) => void
}

// The old Match screen, simplified: each job's modules, either on the resume (click to find
// the line) or one click from being added. Picking happens automatically; this is for swaps.
export default function LibraryRail({ groups, preview, onShow, onAdd }: Props) {
  if (groups.length === 0) {
    return <div className="rd-rail-body"><div className="rd-fit-sub">No jobs on this resume yet.</div></div>
  }
  return (
    <div className="rd-rail-body">
      <div className="rd-fit-sub" style={{ marginBottom: 10 }}>Your modules for each job on this resume.</div>
      {groups.map(g => (
        <div key={g.entryIndex} className="rd-lib-group">
          <div className="rd-lib-heading">{g.heading}</div>
          {g.onResume.length === 0 && g.available.length === 0 && (
            <div className="rd-fit-sub">No other modules for this job.</div>
          )}
          {g.onResume.map(({ module: m, blockId }) => (
            <button key={m.id} type="button" className="rd-lib-item" onClick={() => onShow(blockId)} title="Find it on the page">
              <span className="rd-lib-title">{m.title}</span>
              <span className="rd-lib-state on">On resume</span>
            </button>
          ))}
          {g.available.map(m => (
            <div key={m.id} className="rd-lib-item rd-lib-avail">
              <span className="rd-lib-text">
                <span className="rd-lib-title">{m.title}</span>
                <span className="rd-lib-preview">{preview(m)}</span>
              </span>
              <button type="button" className="rd-lib-add" onClick={() => onAdd(g.entryIndex, m)} aria-label={`Add ${m.title} to the resume`}>+ Add</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
