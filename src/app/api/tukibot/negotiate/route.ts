import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type NegotiateRequest = {
  buyerOffer: number;
  quantity?: number;
  listedPrice: number;
  floorPrice: number;
  autoAcceptFrom?: number;
  productName?: string;
  vendorName?: string;
};

type NegotiateResponse = {
  status: 'accepted' | 'countered';
  acceptedAmount?: number;
  counterAmount?: number;
  totalAmount: number;
  message: string;
};

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NegotiateRequest;
    const buyerOffer = Number(body?.buyerOffer || 0);
    const listedPrice = Number(body?.listedPrice || 0);
    const floorPrice = Number(body?.floorPrice || 0);
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const autoAcceptFrom = Number(body?.autoAcceptFrom || floorPrice);
    const productName = body?.productName?.trim() || 'este producto';
    const vendorName = body?.vendorName?.trim() || 'la tienda';

    if (!buyerOffer || !listedPrice || !floorPrice) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    if (floorPrice > listedPrice) {
      return NextResponse.json({ error: 'Configuración de precios inválida' }, { status: 400 });
    }

    const normalizedAutoAccept = Math.min(listedPrice, Math.max(floorPrice, autoAcceptFrom));

    let payload: NegotiateResponse;

    if (buyerOffer >= normalizedAutoAccept) {
      payload = {
        status: 'accepted',
        acceptedAmount: buyerOffer,
        totalAmount: buyerOffer * quantity,
        message: `Perfecto, en ${vendorName} te aceptamos ${gs(buyerOffer)} por ${productName}.`,
      };
    } else {
      const midpoint = Math.round((buyerOffer + floorPrice) / 2 / 1000) * 1000;
      const counterAmount = Math.max(floorPrice, midpoint);
      payload = {
        status: 'countered',
        counterAmount,
        totalAmount: counterAmount * quantity,
        message: `Puedo mejorarte la propuesta: te dejo ${productName} en ${gs(counterAmount)} por unidad.`,
      };
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la negociación' }, { status: 500 });
  }
}
