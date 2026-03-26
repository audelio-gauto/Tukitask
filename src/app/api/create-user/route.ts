import { NextResponse } from 'next/server';
import { getAuthAdmin, unauthorized, sbAdmin } from '@/lib/apiAuth';

export async function POST(req: Request) {
  // Solo admins pueden crear usuarios
  const adminUser = await getAuthAdmin(req);
  if (!adminUser) return unauthorized('Solo administradores pueden crear usuarios');

  try {
    const { email, password, role } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Email, contraseña y rol son obligatorios' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    const validRoles = ['admin', 'driver', 'vendedor', 'servicio', 'hoteleria', 'cliente'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Rol no válido' }, { status: 400 });
    }

    const sb = sbAdmin();
    const emailNormalized = String(email).toLowerCase().trim();

    // 1. Create auth user in Supabase Auth
    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email: emailNormalized,
      password,
      email_confirm: true, // Auto-confirm so user can log in immediately
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // 2. Insert into users table with role
    const { error: dbError } = await sb.from('users').upsert(
      { email: emailNormalized, role },
      { onConflict: 'email' }
    );

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: authData.user?.id });
  } catch (err) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
