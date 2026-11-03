// /sitemap.xml: the public marketing, docs and support pages. App pages need a session and are
// left out (and disallowed in robots.ts).
import type { MetadataRoute } from 'next'
import { getArticleSlugs } from '@/lib/support-articles'
import { appUrl } from '@/lib/mcp/urls'

const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/how-it-works', priority: 0.8 },
  { path: '/pricing', priority: 0.8 },
  { path: '/mcp', priority: 0.8 },
  { path: '/modules', priority: 0.6 },
  { path: '/business', priority: 0.6 },
  { path: '/docs', priority: 0.6 },
  { path: '/docs/upload-resume', priority: 0.5 },
  { path: '/docs/understanding-modules', priority: 0.5 },
  { path: '/docs/module-types', priority: 0.5 },
  { path: '/docs/tags-and-themes', priority: 0.5 },
  { path: '/docs/editing-modules', priority: 0.5 },
  { path: '/docs/job-description-input', priority: 0.5 },
  { path: '/docs/module-matching', priority: 0.5 },
  { path: '/docs/output-formats', priority: 0.5 },
  { path: '/support', priority: 0.5 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getArticleSlugs().map((slug) => ({ path: `/support/${slug}`, priority: 0.4 }))
  return [...PAGES, ...articles].map(({ path, priority }) => ({
    url: appUrl(path === '/' ? '' : path),
    priority,
  }))
}
