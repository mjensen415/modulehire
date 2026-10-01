import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function PATCH(
  req: Request,
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
    const body = await req.json().catch(() => null) ?? Object.fromEntries(new URL(req.url).searchParams);

    const adminClient = await createAdminClient();

    const update: Record<string, unknown> = {};
    if (body.plan !== undefined) {
      update.plan = body.plan;
      // `plan` (free/starter/pro) and `tier` (free/pro/beta_pro) are separate columns —
      // `tier` is what every feature gate actually reads (isProTier in src/lib/plan.ts).
      // Keep them in sync here the same way the Stripe webhook does: promote/demote on
      // free <-> pro, but never touch a complimentary beta_pro grant, and leave `starter`
      // alone since it has no pro-equivalent tier today.
      if (body.plan === 'pro' || body.plan === 'free') {
        const { data: current } = await adminClient.from('users').select('tier').eq('id', id).single();
        if (current?.tier !== 'beta_pro') update.tier = body.plan;
      }
    }
    if (body.is_admin !== undefined) update.is_admin = body.is_admin === 'true' || body.is_admin === true;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('users')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ user: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
