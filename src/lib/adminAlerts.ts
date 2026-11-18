/**
 * Alertas dirigidas al equipo de administración.
 * Reutiliza el emisor de notificaciones para que lleguen a la bandeja del panel
 * y, cuando hay token nativo registrado, también como push.
 */
import { sbAdmin } from '@/lib/apiAuth';
import { ADMIN_ROLES } from '@/lib/constants';
import { emitNotificationBulk } from '@/lib/notificationEmitter';

async function getAdminEmails(): Promise<string[]> {
  try {
    const { data, error } = await sbAdmin()
      .from('users')
      .select('email')
      .in('role', ADMIN_ROLES);
    if (error) {
      console.error('[adminAlerts] No se pudo listar administradores:', error.message);
      return [];
    }
    const rows = (data ?? []) as Array<{ email?: unknown }>;
    const emails = rows
      .map(row => String(row.email ?? '').trim().toLowerCase())
      .filter((email): email is string => Boolean(email));
    return [...new Set(emails)];
  } catch (error) {
    console.error('[adminAlerts] Error inesperado:', error);
    return [];
  }
}

async function notifyAdmins(
  type: 'admin_product_review' | 'admin_wallet_recharge',
  title: string,
  body: string,
  data: Record<string, unknown>,
  groupKey: string,
): Promise<void> {
  const emails = await getAdminEmails();
  if (!emails.length) return;
  await emitNotificationBulk(
    emails.map(userEmail => ({
      userEmail,
      type,
      title,
      body,
      data,
      opts: { groupKey, priority: 'high' as const },
    })),
  );
}

export async function notifyAdminsProductReview(productName: string, pendingCount: number): Promise<void> {
  const safeName = productName.slice(0, 120) || 'Un producto';
  const body = pendingCount > 1
    ? `${safeName} y ${pendingCount - 1} producto${pendingCount - 1 === 1 ? '' : 's'} más esperan aprobación.`
    : `${safeName} fue enviado para revisión.`;
  await notifyAdmins(
    'admin_product_review',
    'Productos por aprobar',
    body,
    { source: 'product', pending_count: pendingCount },
    'admin:product_review',
  );
}

export async function notifyAdminsRecharge(
  source: 'driver' | 'vendor',
  amount: number,
  pendingCount: number,
): Promise<void> {
  const who = source === 'vendor' ? 'vendedor' : 'conductor/técnico';
  const body = `Nueva recarga de ${who} por Gs ${Math.abs(amount).toLocaleString('es-PY')}. Hay ${pendingCount} solicitud${pendingCount === 1 ? '' : 'es'} pendiente${pendingCount === 1 ? '' : 's'}.`;
  await notifyAdmins(
    'admin_wallet_recharge',
    'Recarga de billetera pendiente',
    body,
    { source, amount, pending_count: pendingCount },
    `admin:recharge:${source}`,
  );
}
