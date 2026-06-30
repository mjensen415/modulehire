import '@/app/globals.css';
import { redirect } from 'next/navigation';
import AppSidebar from '@/components/layout/AppSidebar';
import AppSidebarUser from '@/components/layout/AppSidebarUser';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  let tier: string = 'free';
  let isAdmin: boolean = false;

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('tier, is_admin')
      .eq('id', user.id)
      .single();
    tier = profile?.tier ?? 'free';
    isAdmin = profile?.is_admin ?? false;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppSidebar tier={tier} isAdmin={isAdmin} footer={<AppSidebarUser />} />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
