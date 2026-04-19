import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const { userId } = await req.json();
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
    }

    const db = sbAdmin();

    // Get the user's email to find their auth account
    const { data: userRow, error: userError } = await db
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    if (!userRow) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Delete from users table first
    const { error: deleteError } = await db
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Try to delete from Supabase Auth by querying auth.users directly
    if (userRow.email) {
      const { data: authUserData } = await db
        .schema('auth')
        .from('users')
        .select('id')
        .eq('email', userRow.email.toLowerCase())
        .maybeSingle();
      if (authUserData?.id) {
        await db.auth.admin.deleteUser(authUserData.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/delete] error:', err);
    return NextResponse.json({ error: 'Error interno al eliminar usuario' }, { status: 500 });
  }
}
