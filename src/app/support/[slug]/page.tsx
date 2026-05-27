import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getArticleMarkdown, getArticleSlugs, getArticleTitle } from '@/lib/support-articles'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'

export function generateStaticParams() {
  return getArticleSlugs().map(slug => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const md = getArticleMarkdown(slug)
  if (!md) return { title: 'Support — ModuleHire' }
  return { title: `${getArticleTitle(md, slug)} — ModuleHire Support` }
}

export default async function SupportArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const md = getArticleMarkdown(slug)
  if (!md) notFound()

  return (
    <>
      <PublicNav />
      <main className="docs-shell">
        <article className="docs-article">
          <div style={{ marginBottom: 16, fontSize: 13 }}>
            <Link href="/support">← All support articles</Link>
          </div>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
          <hr style={{ margin: '32px 0' }} />
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>
            Still need help? Email <a href="mailto:info@modulehire.com">info@modulehire.com</a> — we respond within 1 business day.
          </p>
        </article>
      </main>
      <PublicFooter />
    </>
  )
}
