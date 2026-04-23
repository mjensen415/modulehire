# Antigravity Prompt — Dashboard Implementation

## What was done (already committed)

The following changes are already in the repo:

- `src/app/globals.css` — added `--green`, `--green-dim`, `--amber-dim`, `--indigo-dim`, `--rose-dim` CSS vars + `--sidebar-w: 220px`. Replaced old dashboard CSS block with new component classes: `.app-sidebar`, `.app-topbar`, `.dash-content`, `.dash-stats`, `.dash-two-col`, `.section-card`, `.mod-chip`, `.job-item`, `.app-row`, `.upload-zone`, `.quick-actions`, `.btn-primary`, `.btn-ghost`, `.user-avatar`, etc.
- `src/app/(app)/layout.tsx` — wrapped in `<div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>` so the sidebar is fixed and only `app-main` scrolls.
- `src/components/layout/AppSidebar.tsx` — full redesign. New nav items: Dashboard, My Modules, Job History, Generate, Job Matches, Applications, Settings. New classes: `.sidebar-logo`, `.logo-mark`, `.nav-item`, `.nav-item-icon`, `.sidebar-section`, `.sidebar-section-label`, `.sidebar-footer`, `.user-row`, `.user-avatar`.
- `src/app/(app)/dashboard/page.tsx` — full redesign. Server component. Fetches real data from Supabase (`modules`, `generated_resumes`, `job_descriptions`). Renders: sticky topbar with greeting + action buttons, 4-col stat cards, 2-col layout (module chips grid + right column with resume card + quick actions), job descriptions list, recent generations list, empty state.

---

## What still needs to be built

### 1. `/matches` route — Job Matches page

Create `src/app/(app)/matches/page.tsx`.

This page should:
- Require a job description to be pasted (reuse the JD input from `/generate`)
- On submission, call `POST /api/analyze-jd` then `POST /api/match-modules`
- Display ranked modules as job-item cards with `.match-score` (green ≥85, amber ≥70, else text3), `.match-label`, and a "Generate →" button
- Wire the "Generate" button to pre-fill `/generate` with the `jd_id` and pre-selected module IDs from `recommended_stack`
- Topbar title: "Job Matches" / "Ranked by module fit"

### 2. `/applications` route — Applications tracker

Create `src/app/(app)/applications/page.tsx`.

This page tracks generated resumes as "applications". It should:
- Fetch from `generated_resumes` table, joining `job_descriptions` on `job_description_id`
- Display as a table using `.app-row` styles: status dot, role title, company, date, badge
- Status should be editable (add a `status` column to `generated_resumes` if it doesn't exist: enum 'draft' | 'sent' | 'viewed' | 'interview')
- Provide signed download URLs for DOCX/PDF from Supabase Storage (`temp` bucket)
- Topbar title: "Applications" / "Track your progress"

### 3. `/library` page — Modules grid redesign

Update `src/app/(app)/library/page.tsx` to use the new 3-column `.mod-chip` grid (see design). Each chip should:
- Show domain label, title, theme count, strength pips, source company
- Have an edit icon that opens an inline edit panel or navigates to `/library/[id]`
- Support search/filter by weight, theme, role_type
- Show "used in N resumes" count (query `generated_resumes` for each module_id in `module_ids_used`)

### 4. User avatar — real data from Supabase auth

In `AppSidebar.tsx`, replace hardcoded `MJ` / `Matt Jensen` with actual user data. Since it's a server component issue (sidebar is client), pass user info via a server component wrapper or use a client-side Supabase hook:

```tsx
// src/components/layout/AppSidebarUser.tsx  (server component)
import { createClient } from '@/lib/supabase/server'
export default async function AppSidebarUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email ?? 'User'
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  return { name, initials, plan: 'Pro plan' }  // pass as props to sidebar footer
}
```

Then render `<AppSidebarUser />` inside the sidebar footer slot.

### 5. Module badge counts in sidebar

The design shows badge counts on "My Modules" and "Job Matches" nav items. To implement:
- Fetch `count` from `modules` table in the app layout (server component) and pass to sidebar
- Or expose a small server component that renders the badge inline

```tsx
// In AppLayout or a wrapper:
const { count } = await supabase.from('modules').select('*', { count: 'exact', head: true }).is('deleted_at', null)
// Pass to sidebar as prop
```

### 6. Sticky topbar on non-dashboard pages

Pages like `/library`, `/generate`, `/upload` currently render inside `<main className="app-main">` with `padding: 36px 40px`. They need a topbar. Options:
- Add a shared `<AppTopbar title="..." sub="..." />` server component used in each page
- Or add topbar HTML directly at the top of each page's JSX (simpler, consistent with dashboard pattern)

The topbar HTML pattern:
```tsx
<div className="app-topbar">
  <div>
    <span className="topbar-title">Page Title</span>
    <span className="topbar-sub">— subtitle</span>
  </div>
  <div className="topbar-actions">
    {/* page-specific CTAs */}
  </div>
</div>
<div className="dash-content">
  {/* page content */}
</div>
```

For non-dashboard pages currently using `padding: 36px 40px` on `.app-main`, switch them to use `.dash-content` (which has `padding: 28px 32px 60px`) and add the `.app-topbar` div at the top.

### 7. Font loading

The design uses Plus Jakarta Sans and JetBrains Mono. Both are referenced in `globals.css` via `--font` and `--mono` vars but must be loaded. In `src/app/layout.tsx` (root layout), add:

```tsx
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300','400','500','600','700','800'],
  variable: '--font',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400','500'],
  variable: '--mono',
})
```

Then add `className={`${jakarta.variable} ${mono.variable}`}` to the `<html>` tag.

---

## CSS classes reference (already in globals.css)

| Class | Purpose |
|---|---|
| `.app-sidebar` | Fixed left nav, 220px wide |
| `.sidebar-logo` | Logo row at top of sidebar |
| `.logo-mark` | Teal 26×26 monogram badge |
| `.nav-item` | Sidebar nav link (default, hover, active states) |
| `.nav-item.active` | Teal dim bg + teal text + teal border |
| `.nav-badge` | Small count badge (teal) on nav items |
| `.sidebar-footer` | User row at bottom of sidebar |
| `.user-avatar` | Gradient initials circle |
| `.app-main` | Main scrollable area, `margin-left: var(--sidebar-w)` |
| `.app-topbar` | Sticky 56px topbar with blur backdrop |
| `.topbar-title` | 15px 700 weight page title |
| `.topbar-sub` | 12px dim subtitle |
| `.topbar-actions` | `margin-left: auto` flex row of buttons |
| `.btn-primary` | Teal filled button |
| `.btn-ghost` | Ghost button with border |
| `.dash-content` | Content padding `28px 32px 60px` |
| `.dash-stats` | 4-col stat card grid |
| `.stat-card` | Individual stat card with `.stat-accent` corner |
| `.stat-change.up` | Green positive change indicator |
| `.dash-two-col` | `1fr 340px` two-column grid |
| `.section-card` | Bordered card with `.section-head` |
| `.section-head-title` | Flex row, icon + label |
| `.section-head-action` | Right-aligned teal link |
| `.modules-grid` | 2-col grid of `.mod-chip` |
| `.mod-chip.c-{color}` | Module card with colored top bar + domain text |
| `.mod-chip-bar` | 2px color top bar |
| `.mod-chip-domain` | Small mono uppercase label |
| `.mod-chip-name` | Bold module title |
| `.mod-chip-pips` + `.pip.on` | Strength indicator dots |
| `.job-item` | Job match row (logo + info + score + button) |
| `.match-score.high/.mid/.low` | Colored score text |
| `.generate-btn` | Small teal "Generate ↗" button |
| `.app-row` | Application/resume row with status dot |
| `.app-dot.sent/.viewed/.interview/.draft` | Status dot colors |
| `.app-badge.{status}` | Small mono status badge |
| `.upload-zone` | Dashed drop target, hovers to teal |
| `.quick-actions` | 2×2 grid of `.quick-action` cards |
| `.resume-row` | Parsed resume info row |

## Color vars (all available in :root)

```
--teal / --teal-dim / --teal-glow
--amber / --amber-dim
--indigo / --indigo-dim
--rose / --rose-dim
--green / --green-dim
--text / --text2 / --text3
--bg / --bg2 / --bg3
--surface / --surface2
--border / --border2
--font (Plus Jakarta Sans)
--mono (JetBrains Mono)
--sidebar-w (220px)
```
