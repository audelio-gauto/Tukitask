import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Los íconos de la aplicación web fueron retirados.' }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}
