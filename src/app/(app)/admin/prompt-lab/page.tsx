import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PromptLabClient from './PromptLabClient';

export default async function PromptLabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/dashboard');

  return <PromptLabClient />;
}
