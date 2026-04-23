import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (!caller?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const now = new Date().toISOString();
    const adminClient = createAdminClient();

    await Promise.all([
      adminClient.from('modules').update({ deleted_at: now }).eq('user_id', id).is('deleted_at', null),
      adminClient.from('generated_resumes').update({ deleted_at: now }).eq('user_id', id).is('deleted_at', null),
      adminClient.from('resumes').update({ deleted_at: now }).eq('user_id', id).is('deleted_at', null),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
