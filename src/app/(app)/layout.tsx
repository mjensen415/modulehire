import '@/app/globals.css';
import AppSidebar from '@/components/layout/AppSidebar';
import AppSidebarUser from '@/components/layout/AppSidebarUser';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppSidebar footer={<AppSidebarUser />} />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
