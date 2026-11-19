import '@/app/globals.css';
import { redirect } from 'next/navigation';
import AppSidebar from '@/components/layout/AppSidebar';
import { accessEndsAt, hasActiveSprint } from '@/lib/entitlements';
import AppSidebarUser from '@/components/layout/AppSidebarUser';
import MobileTabBar from '@/components/layout/MobileTabBar';
import MobileTopHeader from '@/components/layout/MobileTopHeader';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import { createClient } from '@/lib/supabase/server';
import { needsEmailVerification } from '@/lib/email-verification';
import { getActiveProfileId } from '@/lib/profile';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  let sprintActive = false;
  let sprintLabel = 'Free';
  let isAdmin: boolean = false;
  let activeProfileId = '';
  let activeProfileName = 'Default';

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('tier, is_admin, sprint_ends_at, plan_period_end, tier_expires_at')
      .eq('id', user.id)
      .single();
    sprintActive = hasActiveSprint(profile);
    const ends = accessEndsAt(profile);
    sprintLabel = !sprintActive ? 'Free' : ends
      ? `Sprint until ${new Date(ends).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
      : 'Sprint';
    isAdmin = profile?.is_admin ?? false;

    const profileId = await getActiveProfileId(supabase, user.id).catch(() => null);
    if (profileId) {
      const { data: profileRow } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('id', profileId)
        .single();
      activeProfileId = profileRow?.id ?? '';
      activeProfileName = profileRow?.name ?? 'Default';
    }
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
    <div className="app-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppSidebar sprintActive={sprintActive} isAdmin={isAdmin} footer={<AppSidebarUser planLabel={sprintLabel} />} activeProfileName={activeProfileName} activeProfileId={activeProfileId} />
      <main className="app-main">
        <MobileTopHeader userInitial={userInitial} />
        {showVerifyBanner && <EmailVerificationBanner email={user.email ?? null} />}
        {children}
      </main>
      <MobileTabBar sprintActive={sprintActive} />
    </div>
  );
}
