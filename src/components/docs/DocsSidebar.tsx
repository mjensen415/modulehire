'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  label: string
  href: string
  soon?: boolean
}

type NavSection = {
  title: string
  soon?: boolean
  items: NavItem[]
}

const nav: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Quick start', href: '/docs' },
      { label: 'Upload your first resume', href: '/docs/upload-resume' },
      { label: 'Understanding modules', href: '/docs/understanding-modules' },
    ],
  },
  {
    title: 'The Module System',
    items: [
      { label: 'Module types', href: '/docs/module-types' },
      { label: 'Tags and themes', href: '/docs/tags-and-themes' },
      { label: 'Editing modules', href: '/docs/editing-modules' },
    ],
  },
  {
    title: 'Generating Resumes',
    items: [
      { label: 'Job description input', href: '/docs/job-description-input' },
      { label: 'Module matching', href: '/docs/module-matching' },
      { label: 'Output formats', href: '/docs/output-formats' },
    ],
  },
  {
    title: 'API',
    soon: true,
    items: [
      { label: 'Authentication', href: '#', soon: true },
      { label: 'Endpoints', href: '#', soon: true },
      { label: 'Webhooks', href: '#', soon: true },
    ],
  },
]

export default function DocsSidebar() {
  const pathname = usePathname()

  return (
    <aside className="docs-sidebar">
      {nav.map((section, i) => (
        <div key={section.title}>
          {i > 0 && <div className="sidebar-divider" />}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              {section.title}
              {section.soon && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '1px 5px', marginLeft: 4, color: 'var(--text3)' }}>Soon</span>
              )}
            </div>
            {section.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${item.soon ? ' dim' : ''}${pathname === item.href ? ' active' : ''}`}
              >
                {item.label}
                {item.soon && <span className="coming-soon">Soon</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}
