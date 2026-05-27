import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { getIndexMarkdown, getArticleSlugs, getArticleMarkdown, getArticleTitle } from '@/lib/support-articles'
import PublicNav from '@/components/layout/PublicNav'
import PublicFooter from '@/components/layout/PublicFooter'

export const metadata = {
  title: 'Support — ModuleHire',
  description: 'Help articles and FAQs for using ModuleHire.',
}

export default function SupportIndex() {
  const indexMd = getIndexMarkdown()

  if (indexMd) {
    return (
      <>
        <PublicNav />
        <main className="docs-shell">
          <article className="docs-article">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{indexMd}</ReactMarkdown>
          </article>
        </main>
        <PublicFooter />
      </>
    )
  }

  // Fallback: list articles directly from filesystem
  const slugs = getArticleSlugs()
  const articles = slugs.map(slug => {
    const md = getArticleMarkdown(slug) ?? ''
    return { slug, title: getArticleTitle(md, slug) }
  })

  return (
    <>
      <PublicNav />
      <main className="docs-shell">
        <article className="docs-article">
          <h1>Support</h1>
          <p>How can we help?</p>
          <ul>
            {articles.map(a => (
              <li key={a.slug}>
                <Link href={`/support/${a.slug}`}>{a.title}</Link>
              </li>
            ))}
          </ul>
          <p>Still need help? Email <a href="mailto:info@modulehire.com">info@modulehire.com</a>.</p>
        </article>
      </main>
      <PublicFooter />
    </>
  )
}
