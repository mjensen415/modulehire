import '@/app/globals.css';
import AppSidebar from '@/components/layout/AppSidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <main className="app-main">
        {children}
      </main>
    </>
  );
}
