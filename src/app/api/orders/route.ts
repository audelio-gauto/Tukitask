import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// GET: Listar pedidos pendientes
export async function GET() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
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
