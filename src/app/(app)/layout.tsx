import '@/app/globals.css';
import { redirect } from 'next/navigation';
import AppSidebar from '@/components/layout/AppSidebar';
import AppSidebarUser from '@/components/layout/AppSidebarUser';
import MobileTabBar from '@/components/layout/MobileTabBar';
import MobileTopHeader from '@/components/layout/MobileTopHeader';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import { createClient } from '@/lib/supabase/server';
import { needsEmailVerification } from '@/lib/email-verification';

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

  const showVerifyBanner = needsEmailVerification(user);

  const name = user.user_metadata?.full_name ?? user.email ?? 'User';
  const userInitial = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppSidebar tier={tier} isAdmin={isAdmin} footer={<AppSidebarUser />} />
      <main className="app-main">
        <MobileTopHeader userInitial={userInitial} />
        {showVerifyBanner && <EmailVerificationBanner email={user.email ?? null} />}
        {children}
      </main>
      <MobileTabBar tier={tier} />
    </div>
  );
}
