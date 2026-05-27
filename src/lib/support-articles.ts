import fs from 'fs'
import path from 'path'

const SUPPORT_DIR = path.join(process.cwd(), 'content', 'support')

export function getArticleSlugs(): string[] {
  if (!fs.existsSync(SUPPORT_DIR)) return []
  return fs
    .readdirSync(SUPPORT_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => f.replace(/\.md$/, ''))
}

export function getArticleMarkdown(slug: string): string | null {
  const file = path.join(SUPPORT_DIR, `${slug}.md`)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf-8')
}

export function getIndexMarkdown(): string | null {
  const file = path.join(SUPPORT_DIR, '_index.md')
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf-8')
}

export function getArticleTitle(markdown: string, fallbackSlug: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  return fallbackSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
