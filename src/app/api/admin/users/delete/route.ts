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

    // Try to delete from Supabase Auth (by email lookup)
    if (userRow.email) {
      const { data: authUsers } = await db.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(
        (u: { email?: string }) => u.email?.toLowerCase() === userRow.email.toLowerCase()
      );
      if (authUser) {
        await db.auth.admin.deleteUser(authUser.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/delete] error:', err);
    return NextResponse.json({ error: 'Error interno al eliminar usuario' }, { status: 500 });
  }
}
