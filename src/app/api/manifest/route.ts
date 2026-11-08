import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'La instalación web de TukiTask fue retirada.' }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}
