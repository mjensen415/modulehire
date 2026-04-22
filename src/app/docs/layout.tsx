import PublicNav from '@/components/layout/PublicNav'
import DocsSidebar from '@/components/docs/DocsSidebar'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      <div className="docs-layout">
        <DocsSidebar />
        <main className="docs-content">
          {children}
        </main>
      </div>
    </>
  )
}
