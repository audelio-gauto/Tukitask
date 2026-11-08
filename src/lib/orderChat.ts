const CLOSED_ORDER_CHAT_STATUSES = new Set([
  'delivered', 'commission_charged', 'client_confirmed', 'cancelled',
  'driver_cancelled', 'returned', 'incident_closed',
]);

export function isOrderChatClosed(status: string | null | undefined): boolean {
  return status != null && CLOSED_ORDER_CHAT_STATUSES.has(status);
}

export function canShowOrderChat(
  order: { status: string | null; client_email: string | null; accepted_by: string | null },
  email: string,
): boolean {
  return !isOrderChatClosed(order.status) &&
    (order.client_email?.toLowerCase() === email || order.accepted_by?.toLowerCase() === email);
}
