import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const role   = (searchParams.get('role') || '').trim();
  const offset = (page - 1) * limit;
  const validRoles = ['admin', 'super_admin', 'owner', 'driver', 'vendedor', 'servicio', 'hoteleria', 'cliente', 'tecnico'];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sbAdmin() as any)
      .from('users')
      .select('id,email,role,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }
    if (role && validRoles.includes(role)) {
      query = query.eq('role', role);
    }

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    
    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// Roles que un admin puede asignar desde el panel (super_admin / owner no se asignan aquí).
const ASSIGNABLE_ROLES = ['admin', 'driver', 'vendedor', 'servicio', 'hoteleria', 'cliente', 'tecnico'];

// PATCH /api/admin/users — cambia el rol de un usuario. body: { id, role }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { id?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  if (!id || !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = sbAdmin() as any;
    const { data: target, error: findError } = await db
      .from('users')
      .select('id, email, role')
      .eq('id', id)
      .maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    if (String(target.email ?? '').toLowerCase() === admin.email) {
      return NextResponse.json({ error: 'No podés cambiar tu propio rol' }, { status: 409 });
    }
    if (target.role === role) return NextResponse.json({ ok: true, unchanged: true });

    const { error: updateError } = await db.from('users').update({ role }).eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    try {
      await db.from('admin_audit_log').insert({
        admin_email: admin.email,
        action: 'change_role',
        target_type: 'user',
        target_id: id,
        metadata: { email: target.email, from: target.role, to: role },
      });
    } catch { /* la auditoría es best-effort */ }

    return NextResponse.json({ ok: true, role });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
