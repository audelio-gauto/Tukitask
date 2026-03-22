import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// GET: Listar pedidos pendientes y en negociación
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientEmail = searchParams.get('client_email');

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientEmail) {
    // Client wants their own orders (any status)
    query = query.eq('client_email', clientEmail);
  } else {
    // Drivers see pending + negotiating
    query = query.in('status', ['pending', 'negotiating']);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: Crear nuevo pedido
export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('orders')
    .insert([body])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
