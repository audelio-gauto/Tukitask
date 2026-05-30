import { NextResponse } from 'next/server';
import { forbidden, getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

type NegotiationMeta = {
  last_buyer_read_at?: string;
  last_vendor_read_at?: string;
} & Record<string, unknown>;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(_req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = sbAdmin();

  const { data: negotiation, error } = await db
    .from('tukibot_negotiations')
    .select('id, vendor_id, buyer_id, meta')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!negotiation) return NextResponse.json({ error: 'Negociación no encontrada' }, { status: 404 });
  if (negotiation.vendor_id !== user.id && negotiation.buyer_id !== user.id) return forbidden();

  const { data, error: messagesError } = await db
    .from('tukibot_negotiation_messages')
    .select('id, sender_role, sender_id, sender_name, message, created_at')
    .eq('negotiation_id', id)
    .order('created_at', { ascending: true });

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  const viewerRole = negotiation.vendor_id === user.id ? 'vendor' : 'buyer';
  const readKey = viewerRole === 'vendor' ? 'last_vendor_read_at' : 'last_buyer_read_at';
  const meta = ((negotiation.meta ?? {}) as NegotiationMeta);
  await db
    .from('tukibot_negotiations')
    .update({
      meta: {
        ...meta,
        [readKey]: new Date().toISOString(),
      },
    })
    .eq('id', id);

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = sbAdmin();

  const { data: negotiation, error } = await db
    .from('tukibot_negotiations')
    .select('id, vendor_id, vendor_email, buyer_id, buyer_email, buyer_name, status, meta')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!negotiation) return NextResponse.json({ error: 'Negociación no encontrada' }, { status: 404 });
  if (negotiation.vendor_id !== user.id && negotiation.buyer_id !== user.id) return forbidden();

  const body = await req.json().catch(() => null) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });

  const senderRole = negotiation.vendor_id === user.id ? 'vendor' : 'buyer';
  const senderName = senderRole === 'vendor' ? 'Vendedor' : (negotiation.buyer_name || negotiation.buyer_email || 'Cliente');

  const { data: created, error: insertError } = await db
    .from('tukibot_negotiation_messages')
    .insert({
      negotiation_id: id,
      sender_role: senderRole,
      sender_id: user.id,
      sender_name: senderName,
      message,
    })
    .select('id, sender_role, sender_id, sender_name, message, created_at')
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Sender just interacted with the thread: clear unread for sender side.
  const readKey = senderRole === 'vendor' ? 'last_vendor_read_at' : 'last_buyer_read_at';
  const meta = ((negotiation.meta ?? {}) as NegotiationMeta);
  await db
    .from('tukibot_negotiations')
    .update({
      meta: {
        ...meta,
        [readKey]: new Date().toISOString(),
      },
    })
    .eq('id', id);

  const notifyEmail = senderRole === 'vendor' ? negotiation.buyer_email : negotiation.vendor_email;
  if (notifyEmail) {
    await db.from('notifications').insert({
      user_email: notifyEmail,
      type: 'market_negotiation_message',
      title: '💬 Nuevo mensaje en tu negociación',
      body: message.length > 120 ? `${message.slice(0, 117)}...` : message,
      data: { negotiation_id: id },
    });
  }

  return NextResponse.json({ item: created });
}
