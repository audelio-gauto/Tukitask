'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import { useCart } from '../cart-context';
import { gs, PY_CITIES } from '../data';
import type { CheckoutItem } from '@/app/api/tienda/checkout/route';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false, loading: () => (
  <div style={{ height: 300, borderRadius: 14, background: 'var(--tnd-surface-2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--tnd-text-muted)', fontSize:'0.85rem', border:'1px solid var(--tnd-border)' }}>
    Cargando mapa...
  </div>
) });

interface BillingForm {
  name: string;
  email: string;
  phone: string;
  cedula: string;
  wants_invoice: boolean;
}

interface DeliveryForm {
  ciudad: string;
  barrio: string;
  referencia: string;
  nombre: string;
  lat: number | null;
  lng: number | null;
}

type PaymentMethod = 'contra_entrega' | 'transferencia';

interface BankInfo {
  banco?: string;
  cuenta?: string;
  alias?: string;
  titular?: string;
  tipo_cuenta?: string;
}

interface PaymentInfo {
  cash_on_delivery: {
    available: boolean;
  };
  transfer: {
    available: boolean;
    source: 'global' | 'vendor' | null;
    bank_data: BankInfo | null;
  };
}

interface VendorDeliveryCity {
  city: string;
  shipping_price: number;
  free_shipping: boolean;
  cash_on_delivery: boolean;
  transfer: boolean;
}

function CheckoutInner() {
  const router       = useRouter();
  const params       = useSearchParams();
  const productId    = params.get('product');
  const qtyParam     = parseInt(params.get('qty') ?? '1', 10) || 1;
  const priceParam   = params.get('price');   // used for negotiated price
  const negotiationId = params.get('negotiationId');
  const productName  = params.get('name');
  const vendorEmail  = params.get('vendor');
  const vendorId     = params.get('vid') ?? '';

  const { items: cartItems, clear: clearCart } = useCart();
  const [items,       setItems]       = useState<CheckoutItem[]>([]);
  const [loadingProd, setLoadingProd] = useState(!!productId);
  const [billing,     setBilling]     = useState<BillingForm>({
    name: '', email: '', phone: '', cedula: '', wants_invoice: false,
  });
  const [delivery, setDelivery] = useState<DeliveryForm>({
    ciudad: 'Asunción', barrio: '', referencia: '', nombre: '', lat: null, lng: null,
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('contra_entrega');
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [notes,     setNotes]     = useState('');
  const [paymentProofBase64, setPaymentProofBase64] = useState<string | null>(null);
  const [paymentProofMime,   setPaymentProofMime]   = useState<string | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderIds,   setOrderIds]   = useState<string[] | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [vendorDeliveryCities, setVendorDeliveryCities] = useState<VendorDeliveryCity[]>([]);

  const availableDeliveryCities = vendorDeliveryCities.length > 0
    ? vendorDeliveryCities.map(item => item.city)
    : PY_CITIES;

  const getCityPaymentAvailability = useCallback((city: string) => {
    const byCity = vendorDeliveryCities.find(item => item.city === city);
    if (byCity) {
      return {
        cash_on_delivery: byCity.cash_on_delivery,
        transfer: byCity.transfer,
      };
    }
    return {
      cash_on_delivery: Boolean(paymentInfo?.cash_on_delivery?.available),
      transfer: Boolean(paymentInfo?.transfer?.available),
    };
  }, [paymentInfo, vendorDeliveryCities]);

  /* ── Load product from URL param ── */
  useEffect(() => {
    if (!productId) {
      // No URL product — load from cart
      if (cartItems.length > 0) {
        setItems(cartItems.map(c => ({
          productId:   c.id,
          name:        c.name,
          price:       c.price,
          qty:         c.qty,
          vendorEmail: c.vendorEmail ?? '',
          vendorId:    c.vendorId   ?? '',
          image:       c.image ?? null,
        })));
      }
      setLoadingProd(false);
      return;
    }
    supabase
      .from('products')
      .select('id, vendor_id, vendor_email, name, price, image')
      .eq('id', productId)
      .single()
      .then(({ data }) => {
        if (data) {
          setItems([{
            productId:   data.id,
            name:        productName ?? data.name,
            price:       priceParam ? parseInt(priceParam, 10) : data.price,
            qty:         qtyParam,
            vendorEmail: vendorEmail ?? data.vendor_email,
            vendorId:    vendorId   || data.vendor_id,
            negotiationId,
            image:       data.image,
          }]);
        }
        setLoadingProd(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  /* ── Prefill billing from session + profile ── */
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const email = session.user.email ?? '';
      setBilling(b => ({ ...b, email }));
      try {
        const res = await fetch(`/api/client-profile?email=${encodeURIComponent(email)}`);
        const { profile } = await res.json();
        if (profile) {
          setBilling(b => ({
            ...b,
            name:  profile.display_name ?? b.name,
            phone: profile.phone        ?? b.phone,
          }));
        }
      } catch { /* silent */ }
    });
  }, []);

  /* ── Load payment methods + bank data ── */
  useEffect(() => {
    const ve = items.find(i => i.vendorEmail)?.vendorEmail ?? vendorEmail ?? '';
    const url = ve
      ? `/api/payment-info?vendor_email=${encodeURIComponent(ve)}`
      : '/api/payment-info';
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPaymentInfo(d); })
      .catch(() => {});
   
  }, [items, vendorEmail]);

  useEffect(() => {
    if (!paymentInfo) return;

    if (paymentMethod === 'contra_entrega' && !paymentInfo.cash_on_delivery?.available) {
      if (paymentInfo.transfer?.available) {
        setPaymentMethod('transferencia');
      }
      return;
    }

    if (paymentMethod === 'transferencia' && !paymentInfo.transfer?.available) {
      if (paymentInfo.cash_on_delivery?.available) {
        setPaymentMethod('contra_entrega');
      }
    }
  }, [paymentInfo, paymentMethod]);

  useEffect(() => {
    const vendorIdToUse = vendorId || items.find(item => item.vendorId)?.vendorId || '';
    if (!vendorIdToUse) {
      setVendorDeliveryCities([]);
      return;
    }

    let cancelled = false;

    const loadVendorCities = async () => {
      try {
        const { data, error } = await supabase
          .from('store_configs')
          .select('config')
          .eq('vendor_id', vendorIdToUse)
          .maybeSingle();

        if (cancelled || error) return;

        const cfg = (data?.config ?? {}) as {
          deliveryCities?: Array<{
            city?: string;
            shipping_price?: number;
            free_shipping?: boolean;
            cash_on_delivery?: boolean;
            transfer?: boolean;
          }>;
        };

        const cities = Array.isArray(cfg.deliveryCities)
          ? cfg.deliveryCities
              .map(item => ({
                city: String(item?.city ?? '').trim(),
                shipping_price: Number(item?.shipping_price ?? 0) || 0,
                free_shipping: Boolean(item?.free_shipping),
                cash_on_delivery: Boolean(item?.cash_on_delivery),
                transfer: Boolean(item?.transfer),
              }))
              .filter(item => item.city)
          : [];

        if (!cancelled) {
          setVendorDeliveryCities(cities);
        }
      } catch {
        if (!cancelled) setVendorDeliveryCities([]);
      }
    };

    void loadVendorCities();
    return () => { cancelled = true; };
  }, [items, vendorId]);

  useEffect(() => {
    const citiesList = availableDeliveryCities;
    if (!citiesList.length) return;

    if (!citiesList.includes(delivery.ciudad)) {
      setDelivery(d => ({ ...d, ciudad: citiesList[0] }));
      return;
    }

    const enabled = getCityPaymentAvailability(delivery.ciudad);
    if (paymentMethod === 'contra_entrega' && !enabled.cash_on_delivery && enabled.transfer) {
      setPaymentMethod('transferencia');
      return;
    }

    if (paymentMethod === 'transferencia' && !enabled.transfer && enabled.cash_on_delivery) {
      setPaymentMethod('contra_entrega');
    }
  }, [availableDeliveryCities, delivery.ciudad, getCityPaymentAvailability, paymentMethod]);

  /* ── Geolocation ── */
  const handleGeo = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setDelivery(d => ({ ...d, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 8000 }
    );
  }, []);

  /* ── Submit ── */
  function handleProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('El comprobante supera los 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      const [header, b64] = result.split(',');
      const mime = header.replace('data:', '').replace(';base64', '');
      setPaymentProofBase64(b64);
      setPaymentProofMime(mime);
      setPaymentProofPreview(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) { setError('No hay productos para comprar.'); return; }
    if (!paymentInfo?.cash_on_delivery?.available && !paymentInfo?.transfer?.available) {
      setError('No hay métodos de pago disponibles para este pedido.');
      return;
    }
    const missingFields: string[] = [];

    if (!billing.name) missingFields.push('nombre y apellido');
    if (!billing.email) missingFields.push('email');
    if (!billing.phone) missingFields.push('teléfono');
    if (!billing.cedula) missingFields.push('cédula o documento');

    if (!delivery.ciudad) missingFields.push('ciudad');
    if (!delivery.barrio) missingFields.push('barrio');
    if (!delivery.referencia) missingFields.push('referencia');
    if (!delivery.nombre) missingFields.push('nombre del lugar');
    if (delivery.lat === null || delivery.lng === null) missingFields.push('ubicación en el mapa');

    if (missingFields.length > 0) {
      setError(`Faltan completar campos obligatorios: ${missingFields.join(', ')}.`);
      return;
    }
    const cityAvailability = getCityPaymentAvailability(delivery.ciudad);
    if (paymentMethod === 'contra_entrega' && !cityAvailability.cash_on_delivery) {
      setError('La ciudad seleccionada no acepta pago contra entrega. Elegí otra opción de pago.');
      return;
    }
    if (paymentMethod === 'transferencia' && !cityAvailability.transfer) {
      setError('La ciudad seleccionada no acepta transferencia bancaria. Elegí otra opción de pago.');
      return;
    }
    if (paymentMethod === 'transferencia' && !paymentProofBase64) {
      setError('Adjuntá el comprobante de pago para continuar.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Debés iniciar sesión para realizar un pedido.');
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/tienda/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          items, billing, delivery, notes, payment_method: paymentMethod,
          payment_proof_base64: paymentMethod === 'transferencia' ? paymentProofBase64 : null,
          payment_proof_mime: paymentMethod === 'transferencia' ? paymentProofMime : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Error al procesar el pedido');
      clearCart();
      setOrderIds(data.orderIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const matchedDeliveryCity = vendorDeliveryCities.find(c => c.city === delivery.ciudad);
  const isFreeShipping = Boolean(matchedDeliveryCity?.free_shipping);
  const shippingCost = matchedDeliveryCity ? (isFreeShipping ? 0 : matchedDeliveryCity.shipping_price) : 0;
  const total = subtotal + shippingCost;
  const cityMethodState = getCityPaymentAvailability(delivery.ciudad);
  const cashAllowedForCity = cityMethodState.cash_on_delivery;
  const transferAllowedForCity = cityMethodState.transfer;

  /* ── Success screen ── */
  if (orderIds) {
    return (
      <div className="tnd-page" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--tnd-text-primary)', marginBottom: 8 }}>
          ¡Pedido confirmado!
        </h2>
        <p style={{ color: 'var(--tnd-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          Tu pedido fue procesado exitosamente.<br />
          El vendedor recibirá tu solicitud y se pondrá en contacto.
        </p>
        <div style={{ background: 'var(--tnd-success-bg)', border: '1px solid var(--tnd-success)', borderRadius: 12, padding: '14px 18px', marginBottom: 28 }}>
          <p style={{ color: 'var(--tnd-success)', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>
            {orderIds.length === 1
              ? `N° de pedido: ${orderIds[0].slice(0, 8).toUpperCase()}`
              : `${orderIds.length} pedidos generados`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/tienda" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', height:44, padding:'0 24px', background:'var(--tnd-accent)', color:'var(--tnd-accent-text)', borderRadius:11, fontWeight:700, fontSize:'0.92rem', textDecoration:'none' }}>
            Seguir comprando
          </Link>
          <Link href="/tienda/mis-pedidos" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', height:44, padding:'0 24px', background:'var(--tnd-surface)', border:'1px solid var(--tnd-border)', color:'var(--tnd-text-primary)', borderRadius:11, fontWeight:700, fontSize:'0.92rem', textDecoration:'none' }}>
            Ver mis pedidos
          </Link>
        </div>
      </div>
    );
  }

  if (loadingProd) {
    return (
      <div className="tnd-page" style={{ textAlign:'center', padding:'60px 20px' }}>
        <p style={{ color:'var(--tnd-text-muted)' }}>⏳ Cargando...</p>
      </div>
    );
  }

  return (
    <div className="tnd-page" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:24, fontSize:'0.82rem' }}>
        <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
        <span style={{ color:'var(--tnd-text-muted)' }}>›</span>
        <span style={{ color:'var(--tnd-text-muted)' }}>Checkout</span>
      </div>

      <h1 style={{ fontSize:'1.5rem', fontWeight:900, color:'var(--tnd-text-primary)', marginBottom:28 }}>
        Finalizar compra
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="tnd-checkout-grid">

          {/* ══ LEFT COLUMN ══════════════════════════════════ */}
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

            {/* ── Datos de facturación ── */}
            <section className="tnd-checkout-card">
              <h2 className="tnd-checkout-section-title">Datos de facturación</h2>
              <div className="tnd-checkout-2col">
                <div className="tnd-checkout-field">
                  <label className="tnd-checkout-label">Nombre y Apellido <span className="tnd-checkout-req">*</span></label>
                  <input
                    className="tnd-checkout-input"
                    value={billing.name}
                    onChange={e => setBilling(b => ({ ...b, name: e.target.value }))}
                    placeholder="Ej. Juan Pérez"
                    required
                  />
                </div>
                <div className="tnd-checkout-field">
                  <label className="tnd-checkout-label">Email <span className="tnd-checkout-req">*</span></label>
                  <input
                    type="email"
                    className="tnd-checkout-input"
                    value={billing.email}
                    onChange={e => setBilling(b => ({ ...b, email: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                    required
                  />
                </div>
                <div className="tnd-checkout-field">
                  <label className="tnd-checkout-label">Teléfono <span className="tnd-checkout-req">*</span></label>
                  <input
                    type="tel"
                    className="tnd-checkout-input"
                    value={billing.phone}
                    onChange={e => setBilling(b => ({ ...b, phone: e.target.value }))}
                    placeholder="0981 000 000"
                    required
                  />
                </div>
                <div className="tnd-checkout-field">
                  <label className="tnd-checkout-label">Cédula o Documento <span className="tnd-checkout-req">*</span></label>
                  <input
                    className="tnd-checkout-input"
                    value={billing.cedula}
                    onChange={e => setBilling(b => ({ ...b, cedula: e.target.value }))}
                    placeholder="1.234.567"
                    required
                  />
                </div>
              </div>
              <label className="tnd-checkout-checkbox-row">
                <input
                  type="checkbox"
                  checked={billing.wants_invoice}
                  onChange={e => setBilling(b => ({ ...b, wants_invoice: e.target.checked }))}
                />
                <span>Quiero factura a mi nombre</span>
              </label>
            </section>

            {/* ── Dirección de entrega ── */}
            <section className="tnd-checkout-card">
              <h2 className="tnd-checkout-section-title">Dirección de entrega</h2>
              <div className="tnd-checkout-2col">
                <div className="tnd-checkout-field">
                  <label className="tnd-checkout-label">Ciudad <span className="tnd-checkout-req">*</span></label>
                  <select
                    className="tnd-checkout-input"
                    value={delivery.ciudad}
                    onChange={e => setDelivery(d => ({ ...d, ciudad: e.target.value }))}
                    required
                  >
                    {availableDeliveryCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="tnd-checkout-field">
                  <label className="tnd-checkout-label">Barrio <span className="tnd-checkout-req">*</span></label>
                  <input
                    className="tnd-checkout-input"
                    value={delivery.barrio}
                    onChange={e => setDelivery(d => ({ ...d, barrio: e.target.value }))}
                    placeholder="Ej. 1ro de Marzo, Las Mercedes…"
                    required
                  />
                </div>
              </div>
              <div className="tnd-checkout-field" style={{ marginTop: 12 }}>
                <label className="tnd-checkout-label">Referencia <span className="tnd-checkout-req">*</span></label>
                <input
                  className="tnd-checkout-input"
                  value={delivery.referencia}
                  onChange={e => setDelivery(d => ({ ...d, referencia: e.target.value }))}
                  placeholder="Ej. Casa de la esquina con portón rojo"
                  required
                />
              </div>
              <div className="tnd-checkout-field" style={{ marginTop: 12 }}>
                <label className="tnd-checkout-label">Nombre del lugar <span className="tnd-checkout-req">*</span></label>
                <input
                  className="tnd-checkout-input"
                  value={delivery.nombre}
                  onChange={e => setDelivery(d => ({ ...d, nombre: e.target.value }))}
                  placeholder="Ej. Mi casa, Mi oficina"
                  required
                />
              </div>

              {/* Map */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <label className="tnd-checkout-label" style={{ margin:0 }}>
                    Ubicación en el mapa
                    <span style={{ fontWeight:400, color:'var(--tnd-text-muted)', marginLeft:4 }}>(mové el pin o hacé clic para ajustar)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeo}
                    disabled={geoLoading}
                    className="tnd-checkout-geo-btn"
                  >
                    {geoLoading ? '⏳' : '📍'} Usar mi ubicación
                  </button>
                </div>
                <MapPicker
                  lat={delivery.lat}
                  lng={delivery.lng}
                  onChange={(lat, lng) => setDelivery(d => ({ ...d, lat, lng }))}
                />
                {delivery.lat && delivery.lng && (
                  <p style={{ fontSize:'0.72rem', color:'var(--tnd-text-muted)', marginTop:6 }}>
                    📍 {delivery.lat.toFixed(5)}, {delivery.lng.toFixed(5)}
                  </p>
                )}
              </div>
            </section>

            {/* ── Método de pago ── */}
            <section className="tnd-checkout-card">
              <h2 className="tnd-checkout-section-title">Método de pago</h2>

              {/* Contra entrega */}
              {cashAllowedForCity && (
                <label className="tnd-checkout-checkbox-row" style={{ alignItems:'flex-start', gap:12, marginBottom: transferAllowedForCity ? 12 : 0 }}>
                  <input
                    type="radio"
                    name="payment_method"
                    checked={paymentMethod === 'contra_entrega'}
                    onChange={() => setPaymentMethod('contra_entrega')}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <strong>Contra entrega</strong>
                    <br />
                    <span style={{ color:'var(--tnd-text-muted)', fontSize:'0.78rem' }}>
                      Pagás cuando recibís el producto.
                    </span>
                  </span>
                </label>
              )}

              {/* Transferencia — solo si hay datos bancarios disponibles */}
              {transferAllowedForCity && (
                <>
                  <label className="tnd-checkout-checkbox-row" style={{ alignItems:'flex-start', gap:12 }}>
                    <input
                      type="radio"
                      name="payment_method"
                      checked={paymentMethod === 'transferencia'}
                      onChange={() => setPaymentMethod('transferencia')}
                      style={{ marginTop: 4 }}
                    />
                    <span>
                      <strong>Transferencia bancaria</strong>
                      <br />
                      <span style={{ color:'var(--tnd-text-muted)', fontSize:'0.78rem' }}>
                        <strong>En esta ciudad, el pedido se procesa con pago anticipado para recibir tu producto.</strong>
                      </span>
                    </span>
                  </label>

                  {/* Datos bancarios cuando se selecciona transferencia */}
                  {paymentMethod === 'transferencia' && paymentInfo?.transfer?.bank_data && (
                    <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--tnd-surface-2)', border: '1px solid var(--tnd-border)', borderRadius: 12 }}>
                      <p style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--tnd-text-primary)', marginBottom: 10 }}>
                        🏦 Datos para la transferencia
                      </p>
                      {paymentInfo?.transfer?.source === 'vendor' && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--tnd-text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                          Datos bancarios del vendedor
                        </p>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {([
                          ['Banco',           paymentInfo?.transfer?.bank_data?.banco],
                          ['Titular',         paymentInfo?.transfer?.bank_data?.titular],
                          ['Cuenta',          paymentInfo?.transfer?.bank_data?.cuenta],
                          ['Alias / CBU',     paymentInfo?.transfer?.bank_data?.alias],
                          ['Tipo de cuenta',  paymentInfo?.transfer?.bank_data?.tipo_cuenta],
                        ] as [string, string | undefined][])
                          .filter(([, v]) => v)
                          .map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--tnd-text-muted)', flexShrink: 0 }}>{label}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--tnd-text-primary)', textAlign: 'right' }}>{value}</span>
                            </div>
                          ))
                        }
                      </div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--tnd-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                        Realizá la transferencia y subí el comprobante abajo.
                      </p>

                      <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tnd-text-primary)', display: 'block', marginBottom: 6 }}>
                          Comprobante de pago
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 14px', background: 'var(--tnd-surface)', border: '1px solid var(--tnd-border)', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600, color: 'var(--tnd-text-primary)' }}>
                          {paymentProofPreview ? '✓ Comprobante cargado — tocar para cambiar' : '📷 Subir comprobante de pago'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProofChange} />
                        </label>
                        {paymentProofPreview && (
                          <div style={{ marginTop: 10 }}>
                            <img src={paymentProofPreview} alt="Comprobante" style={{ maxHeight: 160, borderRadius: 10, objectFit: 'contain', border: '1px solid var(--tnd-border)' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!paymentInfo?.cash_on_delivery?.available && !paymentInfo?.transfer?.available && (
                <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 12, background: 'var(--tnd-danger-bg)', border: '1px solid var(--tnd-danger)' }}>
                  <p style={{ margin: 0, color: 'var(--tnd-danger)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    No hay métodos de pago disponibles para este pedido en este momento.
                  </p>
                </div>
              )}
            </section>

            {/* ── Notas ── */}
            <section className="tnd-checkout-card">
              <h2 className="tnd-checkout-section-title">Notas del pedido <span style={{ fontWeight:400, color:'var(--tnd-text-muted)' }}>(opcional)</span></h2>
              <textarea
                className="tnd-checkout-input"
                style={{ minHeight:80, resize:'vertical', padding:'10px 14px' }}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Instrucciones especiales, horario de entrega, etc."
                maxLength={400}
              />
            </section>
          </div>

          {/* ══ RIGHT COLUMN: resumen ════════════════════════ */}
          <div>
            <section className="tnd-checkout-card tnd-checkout-summary-card">
              <h2 className="tnd-checkout-section-title">Resumen del pedido</h2>

              {items.length === 0 ? (
                <p style={{ color:'var(--tnd-text-muted)', fontSize:'0.85rem' }}>
                  Sin productos. <Link href="/tienda" className="tnd-back-link">Ir al catálogo</Link>
                </p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display:'flex', gap:12, alignItems:'center' }}>
                      <div style={{ width:52, height:52, borderRadius:10, background:'var(--tnd-surface-2)', border:'1px solid var(--tnd-border)', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.6rem' }}>
                        {item.image
                          ? <img src={item.image} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : '📦'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:700, color:'var(--tnd-text-primary)', fontSize:'0.88rem', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {item.name}
                        </p>
                        <p style={{ color:'var(--tnd-text-muted)', fontSize:'0.75rem', margin:'2px 0 0' }}>
                          {item.qty} × {gs(item.price)}
                        </p>
                      </div>
                      <span style={{ fontWeight:800, color:'var(--tnd-accent)', fontSize:'0.92rem', flexShrink:0 }}>
                        {gs(item.price * item.qty)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop:'1px solid var(--tnd-border)', paddingTop:14, marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ color:'var(--tnd-text-muted)', fontSize:'0.85rem' }}>Subtotal</span>
                  <span style={{ color:'var(--tnd-text-secondary)', fontSize:'0.85rem', fontWeight:700 }}>{gs(subtotal)}</span>
                </div>
                {matchedDeliveryCity && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ color:'var(--tnd-text-muted)', fontSize:'0.85rem' }}>Envío</span>
                    <span style={{ color: isFreeShipping ? 'var(--tnd-success)' : 'var(--tnd-text-secondary)', fontSize:'0.85rem', fontWeight:700 }}>
                      {isFreeShipping ? 'Envío gratis' : gs(shippingCost)}
                    </span>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--tnd-border)', paddingTop:10 }}>
                  <span style={{ fontWeight:700, color:'var(--tnd-text-secondary)' }}>Total</span>
                  <span style={{ fontSize:'1.5rem', fontWeight:900, color:'var(--tnd-accent)' }}>{gs(total)}</span>
                </div>
              </div>

              {(paymentInfo?.cash_on_delivery?.available || paymentInfo?.transfer?.available) && (
                <div style={{ background:'var(--tnd-surface-2)', border:'1px solid var(--tnd-border)', borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
                  <p style={{ margin:0, fontWeight:800, color:'var(--tnd-text-primary)', fontSize:'0.88rem' }}>
                    {paymentMethod === 'transferencia' ? '🏦 Transferencia bancaria' : '💵 Contra entrega'}
                  </p>
                  <p style={{ margin:'4px 0 0', color:'var(--tnd-text-muted)', fontSize:'0.78rem', lineHeight:1.5 }}>
                    {paymentMethod === 'transferencia'
                      ? 'Realizá la transferencia y subí el comprobante.'
                      : 'Pagar al recibir el producto.'}
                  </p>
                </div>
              )}

              {error && (
                <div style={{ background:'var(--tnd-danger-bg)', border:'1px solid var(--tnd-danger)', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:'0.82rem', color:'var(--tnd-danger)' }}>
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !items.length || (!cashAllowedForCity && !transferAllowedForCity)}
                style={{ width:'100%', height:50, background:'var(--tnd-accent)', color:'var(--tnd-accent-text)', border:'none', borderRadius:13, fontSize:'1rem', fontWeight:900, cursor:'pointer', transition:'background 0.15s', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity: (submitting || !items.length) ? 0.6 : 1 }}
              >
                {submitting ? '⏳ Procesando...' : '✅ Confirmar pedido'}
              </button>

              <p style={{ fontSize:'0.72rem', color:'var(--tnd-text-muted)', textAlign:'center', marginTop:10, lineHeight:1.5 }}>
                Al confirmar aceptás los términos de compra de TukiMarket.
              </p>
            </section>
          </div>

        </div>
      </form>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="tnd-page" style={{ textAlign:'center', padding:'60px 20px' }}>
        <p style={{ color:'var(--tnd-text-muted)' }}>⏳ Cargando checkout...</p>
      </div>
    }>
      <CheckoutInner />
    </Suspense>
  );
}
