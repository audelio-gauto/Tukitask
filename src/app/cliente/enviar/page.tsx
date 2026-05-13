"use client";
import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useClientContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import { haversineKm, nearestNeighborSort } from '@/lib/geo';
import { Icon } from '@/components/Icon';

const MapboxSearch = dynamic(() => import('../components/MapboxSearch'), { ssr: false });
const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false });
const RoutePreviewMap = dynamic(() => import('../components/RoutePreviewMap'), { ssr: false });

const vehicleTypes = [
  { value: 'moto', label: 'Moto', sub: 'Paquetes pequeños', icon: 'bolt', priceHint: 'Más económico' },
  { value: 'auto', label: 'Auto', sub: 'Mayor capacidad', icon: 'car', priceHint: 'Cómodo y seguro' },
  { value: 'motocarro', label: 'Moto Carro', sub: 'Carga mediana, mudanza', icon: 'truck', priceHint: 'Carga mediana' },
  { value: 'camion2t', label: 'Camion flete', sub: 'Carga mediana, pesada, mudanza', icon: 'truck', priceHint: 'Mudanzas y fletes' },
];

const paymentMethods = [
  { value: 'efectivo', label: 'Efectivo', icon: 'money' },
  { value: 'transferencia', label: 'Transferencia', icon: 'credit-card' },
];

const ORDER_TYPE_ICONS = {
  envio: 'package',
  mandadito: 'shopping-cart',
  flete: 'truck',
  viaje: 'car',
} as const;

// ── Multi-stop types ──────────────────────────────────────────────────────────
interface DeliveryStop {
  id: string;            // local React key
  address: string;
  lat: string;
  lng: string;
  receiverContact: string;
  receiverPhone: string;
  description: string;
}

function emptyStop(): DeliveryStop {
  return { id: crypto.randomUUID(), address: '', lat: '', lng: '', receiverContact: '', receiverPhone: '', description: '' };
}

export default function EnviarPaquetePage() {
  const { openDrawer, email, displayName, profilePhoto, avgRating, phone } = useClientContext();
  const router = useRouter();
  const [orderType, setOrderType] = useState<'envio' | 'mandadito' | 'flete' | 'viaje'>('envio');
  const [shoppingList, setShoppingList] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dateScheduled, setDateScheduled] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{ discount_amount: number; description: string | null; code_id: string } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Address search overlay state — now also handles stop index
  const [searchMode, setSearchMode] = useState<null | 'pickup' | 'delivery' | `stop_${number}`>(null);
  // Location picker (map pin) state
  const [pickerMode, setPickerMode] = useState<null | 'pickup' | 'delivery' | `stop_${number}`>(null);

  // Escape key to dismiss address overlay
  useEffect(() => {
    if (!searchMode) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchMode(null); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [searchMode]);

  const [form, setForm] = useState({
    pickupAddress: '',
    vehicleType: 'moto',
    senderContact: '',
    senderPhone: '',
    instructions: '',
    paymentMethod: 'efectivo',
    offer: '',
    pickupLat: '',
    pickupLng: '',
  });

  // Auto-fill sender info from profile
  useEffect(() => {
    if (displayName || phone) {
      setForm(f => ({
        ...f,
        senderContact: f.senderContact || displayName || '',
        senderPhone:   f.senderPhone   || phone       || '',
      }));
    }
  }, [displayName, phone]);

  // ── Multi-stop state ──────────────────────────────────────────────────────
  // stops[0] is always the first (and possibly only) delivery destination
  const [stops, setStops] = useState<DeliveryStop[]>([emptyStop()]);
  const MAX_STOPS = 20;

  const updateStop = (idx: number, field: keyof DeliveryStop, value: string) => {
    setStops(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return;
    setStops(prev => [...prev, emptyStop()]);
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 1) return;
    setStops(prev => prev.filter((_, i) => i !== idx));
  };

  // Nearest-neighbor route optimization — reorders stops in-place
  const [optimized, setOptimized] = useState(false);
  const optimizeStops = () => {
    const pLat = parseFloat(form.pickupLat);
    const pLng = parseFloat(form.pickupLng);
    if (!isFinite(pLat) || !isFinite(pLng)) return;
    const sorted = nearestNeighborSort(
      { lat: pLat, lng: pLng },
      stops,
      s => s.lat,
      s => s.lng,
    );
    setStops(sorted.map((s, i) => ({ ...s, id: stops[i]?.id ?? crypto.randomUUID() })));
    setOptimized(true);
    setTimeout(() => setOptimized(false), 2500);
  };

  // Whether optimize button should be shown
  const canOptimize = stops.length >= 2 && stops.filter(s => isFinite(parseFloat(s.lat)) && isFinite(parseFloat(s.lng))).length >= 2 && isFinite(parseFloat(form.pickupLat));

  // First stop conveniently maps to legacy delivery fields for backward compat
  const firstStop = stops[0];
  const deliveryLat  = firstStop.lat;
  const deliveryLng  = firstStop.lng;



  // User location for proximity bias + auto-fill pickup address (envio only)
  const userLocation = useRef<{ lat: number; lng: number } | null>(null);
  const [pickupLoading, setPickupLoading] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setPickupLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        userLocation.current = { lat, lng };
        // In mandadito mode keep coords for search bias only — don't fill the pickup field
        // (Point A is the store, not the client's location)
        if (orderType === 'mandadito') { setPickupLoading(false); return; }
        update('pickupLat', lat.toFixed(6));
        update('pickupLng', lng.toFixed(6));
        try {
          const res = await fetch('/api/maps/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reverse: true, lat, lng }),
          });
          const data = await res.json();
          update('pickupAddress', data.result?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } catch {
          update('pickupAddress', `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
        setPickupLoading(false);
      },
      () => setPickupLoading(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType]);

  /** Fetch route via backend proxy (API key stays server-side) */
  function fetchProxyDirections(lat1: number, lng1: number, lat2: number, lng2: number) {
    return fetch('/api/maps/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { lat: lat1, lng: lng1 },
        to: { lat: lat2, lng: lng2 },
      }),
    }).then(r => r.json());
  }



  // Pricing state
  const [pricing, setPricing] = useState<{ [key: string]: { base_price: number | null, price_per_km: number | null, image_url?: string | null } }>({});
  const [pricingSettings, setPricingSettings] = useState<Record<string, number>>({});
  const [loadingPricing, setLoadingPricing] = useState(true);

  // Fetch pricing config from public API
  useEffect(() => {
    fetch('/api/pricing')
      .then(res => res.json())
      .then(data => {
        const map: { [key: string]: { base_price: number | null, price_per_km: number | null, image_url?: string | null } } = {};
        if (data && data.vehicle_pricing) {
          for (const v of data.vehicle_pricing) {
            const key = v.vehicle_type || '';
            map[key] = {
              base_price: v.base_price === null || v.base_price === undefined ? null : Number(v.base_price),
              price_per_km: v.price_per_km === null || v.price_per_km === undefined ? null : Number(v.price_per_km),
              image_url: v.image_url ?? null,
            };
          }
        }
        const settingsMap: Record<string, number> = {};
        if (data && data.pricing_settings) {
          for (const s of data.pricing_settings) {
            settingsMap[s.key] = Number(s.value);
          }
        }
        setPricing(map);
        setPricingSettings(settingsMap);
        setLoadingPricing(false);
      })
      .catch(() => setLoadingPricing(false));
  }, []);

  // Calcular precio sugerido automáticamente
  // Haversine total distance across all segments: pickup→stop1→stop2→...
  const distanceKm = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    const pLat = parseFloat(form.pickupLat);
    const pLng = parseFloat(form.pickupLng);
    if (isFinite(pLat) && isFinite(pLng)) pts.push({ lat: pLat, lng: pLng });
    for (const s of stops) {
      const lat = parseFloat(s.lat);
      const lng = parseFloat(s.lng);
      if (isFinite(lat) && isFinite(lng)) pts.push({ lat, lng });
    }
    if (pts.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += haversineKm(pts[i].lat, pts[i].lng, pts[i+1].lat, pts[i+1].lng);
    }
    return Math.max(0, total);
  }, [form.pickupLat, form.pickupLng, stops]);

  // Route/state for routed polyline using provider (Mapbox)
  const [routeCoords, setRouteCoords] = useState<Array<{ lat: number; lng: number }>>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationSec, setRouteDurationSec] = useState<number | null>(null);

  const suggestedPrice = useMemo(() => {
    const key = form.vehicleType || '';
    const v = pricing[key];
    const globalMin = pricingSettings['min_shipping_price'] ?? 0;
    const base = v?.base_price ?? null;
    const perKm = v?.price_per_km ?? null;

    // Use real route distance if available, otherwise haversine
    const dist = routeDistanceMeters ? routeDistanceMeters / 1000 : distanceKm;

    let price = 0;
    if (base !== null) price += base;
    if (perKm !== null && dist > 0) price += perKm * dist;

    // If vehicle-specific data is missing, try falling back to globals
    if ((base === null || perKm === null) && pricingSettings) {
      const globalBase = pricingSettings['global_base_price'] ?? pricingSettings['base_price'] ?? 0;
      const globalPerKm = pricingSettings['global_price_per_km'] ?? pricingSettings['price_per_km'] ?? 0;
      if (base === null && globalBase) price = globalBase + (perKm !== null && dist > 0 ? perKm * dist : globalPerKm * dist);
      if (perKm === null && base !== null) price = base + globalPerKm * dist;
    }

    // enforce minimum
    if (globalMin && price < globalMin) price = globalMin;

    // round to nearest integer
    return Math.round(price || 0);
  }, [pricing, pricingSettings, form.vehicleType, distanceKm, routeDistanceMeters]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  // Editable offer price — initialized from suggestedPrice
  const [offerPrice, setOfferPrice] = useState(0);
  const offerInitialized = useRef(false);
  useEffect(() => {
    if (suggestedPrice > 0 && !offerInitialized.current) {
      setOfferPrice(suggestedPrice);
      offerInitialized.current = true;
    }
  }, [suggestedPrice]);
  // Keep synced when vehicle/route changes AFTER first init
  useEffect(() => {
    if (offerInitialized.current && suggestedPrice > 0) {
      setOfferPrice(suggestedPrice);
    }
  }, [suggestedPrice]);

  // ── Dynamic surge pricing ─────────────────────────────────────────────────
  type SurgeData = { suggested: number; range_min: number; range_max: number; multiplier: number; label: string; color: 'green' | 'orange' | 'red' };
  const [surgeData, setSurgeData] = useState<SurgeData | null>(null);
  const surgeCtrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const dist = routeDistanceMeters ? routeDistanceMeters / 1000 : distanceKm;
    if (dist <= 0 || !form.vehicleType) { setSurgeData(null); return; }

    // Debounce 600 ms — avoids a request on every coord update while user drags
    const timer = setTimeout(() => {
      surgeCtrlRef.current?.abort();
      const ctrl = new AbortController();
      surgeCtrlRef.current = ctrl;
      fetch(
        `/api/pricing/dynamic?vehicle_type=${encodeURIComponent(form.vehicleType)}&distance_km=${dist.toFixed(3)}`,
        { signal: ctrl.signal },
      )
        .then(r => (r.ok ? r.json() : null))
        .then((data: SurgeData | null) => { if (data && !('error' in data)) setSurgeData(data); })
        .catch(() => {}); // silently ignore AbortError / network errors
    }, 600);

    return () => clearTimeout(timer);
  }, [form.vehicleType, distanceKm, routeDistanceMeters]);

  // Override offerPrice with dynamic suggested when surge data arrives
  useEffect(() => {
    if (surgeData && surgeData.suggested > 0) {
      setOfferPrice(surgeData.suggested);
      offerInitialized.current = true;
    }
  }, [surgeData]);

  // When pickup + first stop coordinates change, request a routed path via backend proxy
  // For multi-stop we compute per-segment then concatenate into one polyline
  useEffect(() => {
    const lat1 = parseFloat(form.pickupLat);
    const lon1 = parseFloat(form.pickupLng);
    const lat2 = parseFloat(deliveryLat);
    const lon2 = parseFloat(deliveryLng);
    if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) {
      setRouteCoords([]);
      setRouteDistanceMeters(null);
      setRouteDurationSec(null);
      return;
    }

    // Build all waypoint pairs: pickup→stop1, stop1→stop2, ...
    const waypoints: Array<[number, number]> = [[lat1, lon1]];
    for (const s of stops) {
      const la = parseFloat(s.lat), lo = parseFloat(s.lng);
      if (isFinite(la) && isFinite(lo)) waypoints.push([la, lo]);
    }

    // Fetch all segments in parallel
    const pairs: Array<[number, number, number, number]> = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      pairs.push([waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1]]);
    }

    Promise.all(pairs.map(([a, b, c, d]) => fetchProxyDirections(a, b, c, d)))
      .then(results => {
        let allCoords: Array<{ lat: number; lng: number }> = [];
        let totalDist = 0, totalDur = 0;
        for (const data of results) {
          if (data?.coords?.length > 0) allCoords = allCoords.concat(data.coords);
          if (data?.distance_meters) totalDist += data.distance_meters;
          if (data?.duration_seconds) totalDur += data.duration_seconds;
        }
        setRouteCoords(allCoords);
        setRouteDistanceMeters(totalDist || null);
        setRouteDurationSec(totalDur || null);
      })
      .catch(() => {
        setRouteCoords([]);
        setRouteDistanceMeters(null);
        setRouteDurationSec(null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pickupLat, form.pickupLng, deliveryLat, deliveryLng, stops]);

  const validatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoResult(null);
    try {
      const res = await authFetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim(), order_amount: offerPrice || suggestedPrice, order_type: orderType }),
      });
      const data = await res.json();
      if (!res.ok) { setPromoError(data.error || 'Código inválido'); return; }
      setPromoResult({ discount_amount: data.discount_amount, description: data.description, code_id: data.code_id });
    } catch { setPromoError('Error al validar código'); }
    setPromoLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones previas al envío
    if (!form.pickupAddress.trim()) { setSubmitError('Dirección de recogida requerida'); return; }
    if (!firstStop.address.trim()) { setSubmitError('Dirección de entrega requerida'); return; }
    if (orderType === 'mandadito' && !shoppingList?.trim()) {
      setSubmitError('Para mandaditos debes escribir qué debe comprar el mensajero'); return;
    }
    const multiStop = stops.length > 1;
    if (multiStop && stops.some(s => !s.address.trim())) {
      setSubmitError('Todas las paradas deben tener dirección'); return;
    }

    // Validação formato teléfono Paraguay (+595 9XX o 09XX, 10 dígitos)
    const PY_PHONE_RE = /^(\+595|0)9\d{8}$/;
    if (form.senderPhone && !PY_PHONE_RE.test(form.senderPhone.replace(/[\s\-()]/g, ''))) {
      setSubmitError('Teléfono de remitente inválido. Ej: 0981 123456 o +595981123456'); return;
    }
    for (let i = 0; i < stops.length; i++) {
      const ph = stops[i].receiverPhone;
      if (ph && !PY_PHONE_RE.test(ph.replace(/[\s\-()]/g, ''))) {
        setSubmitError(`Teléfono de destinatario inválido en parada ${i + 1}. Ej: 0981 123456`); return;
      }
    }

    setSending(true);
    try {
      const isMulti = stops.length > 1;
      const res = await authFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_email: email,
          client_name: displayName || email.split('@')[0],
          client_photo: profilePhoto || '',
          client_avg_rating: avgRating > 0 ? avgRating : null,
          pickup_address: form.pickupAddress,
          // delivery = last stop (single-stop: that one stop; multi-stop: final destination — no A→stops→A duplication)
          delivery_address: stops[stops.length - 1].address,
          receiver_contact: firstStop.receiverContact,
          receiver_phone: firstStop.receiverPhone,
          description: firstStop.description || null,
          order_type: orderType,
          shopping_list: orderType === 'mandadito' ? (shoppingList || null) : null,
          max_budget: orderType === 'mandadito' && maxBudget ? parseInt(maxBudget.replace(/\D/g, '')) || null : null,
          vehicle_type: form.vehicleType,
          sender_contact: form.senderContact,
          sender_phone: form.senderPhone,
          instructions: form.instructions,
          payment_method: form.paymentMethod,
          suggested_price: suggestedPrice,
          offer: offerPrice > 0 ? String(offerPrice) : form.offer,
          pickup_lat: form.pickupLat,
          pickup_lng: form.pickupLng,
          delivery_lat: stops[stops.length - 1].lat,
          delivery_lng: stops[stops.length - 1].lng,
          date_scheduled: dateScheduled ? new Date(dateScheduled).toISOString() : null,
          promo_code: promoResult ? promoCode.trim() : null,
          promo_discount: promoResult?.discount_amount ?? 0,
          // Multi-stop
          stops: isMulti ? stops.map(s => ({
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            receiver_contact: s.receiverContact || null,
            receiver_phone: s.receiverPhone || null,
            description: s.description || null,
          })) : undefined,
        }),
      });
      if (res.status === 401) { router.replace('/auth'); return; }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al crear el pedido');
      }
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al crear el pedido');
    } finally {
      setSending(false);
    }
  };

  const handleUseGPS = (field: 'pickup' | 'delivery' | `stop_${number}`) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const latStr = lat.toFixed(6);
        const lngStr = lng.toFixed(6);
        // Reverse geocode to get a human-readable address
        let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          const res = await fetch('/api/maps/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reverse: true, lat, lng }),
          });
          const data = await res.json();
          if (data.result?.display_name) address = data.result.display_name;
        } catch { /* use coordinates as fallback */ }

        if (field === 'pickup') {
          update('pickupAddress', address);
          update('pickupLat', latStr);
          update('pickupLng', lngStr);
        } else if (field === 'delivery') {
          update('deliveryAddress', address);
          update('deliveryLat', latStr);
          update('deliveryLng', lngStr);
        } else if (field.startsWith('stop_')) {
          const idx = parseInt(field.split('_')[1]);
          updateStop(idx, 'lat', latStr);
          updateStop(idx, 'lng', lngStr);
          updateStop(idx, 'address', address);
        }
        setSearchMode(null);
      },
      () => {}
    );
  };

  const openSearch = (mode: 'pickup' | 'delivery' | `stop_${number}`) => setSearchMode(mode);

  // Resolve address/coords from search or picker into state
  const resolveLocation = (mode: typeof searchMode, address: string, lat: number, lng: number) => {
    if (!mode) return;
    if (mode === 'pickup') {
      update('pickupAddress', address);
      update('pickupLat', String(lat));
      update('pickupLng', String(lng));
    } else if (mode.startsWith('stop_')) {
      const idx = parseInt((mode as string).split('_')[1]);
      updateStop(idx, 'address', address);
      updateStop(idx, 'lat', String(lat));
      updateStop(idx, 'lng', String(lng));
    }
  };

  if (success) {
    return (
      <div className="enviar-success-screen">
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={28} color="#22c55e" />
          </div>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>¡Envío registrado!</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem', maxWidth: 320 }}>Tu solicitud se ha creado correctamente. Te notificaremos cuando un conductor acepte tu envío.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/cliente/mis-envios" className="client-btn client-btn-primary">Ver Mis Envíos</Link>
          <button className="client-btn" style={{ background: '#f1f5f9', color: '#374151' }} onClick={() => { setSuccess(false); setStep(1); setForm(f => ({ pickupAddress: '', pickupLat: '', pickupLng: '', vehicleType: 'moto', senderContact: f.senderContact, senderPhone: f.senderPhone, instructions: '', paymentMethod: 'efectivo', offer: '' })); setStops([emptyStop()]); }}>
            Nuevo Envío
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Address search fullscreen overlay */}
      {searchMode && (
        <div className="enviar-search-overlay">
          <div className="enviar-search-header">
            <button type="button" className="enviar-search-back" onClick={() => setSearchMode(null)}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className={`enviar-dot ${searchMode === 'pickup' ? 'green' : 'red'}`} style={{ marginLeft: 8 }} />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--client-text)', marginLeft: 8 }}>
              {searchMode === 'pickup' ? 'Punto de recogida' : searchMode.startsWith('stop_') ? `Parada ${parseInt((searchMode as string).split('_')[1]) + 1}` : 'Destino'}
            </span>
          </div>
          <div style={{ padding: '12px 16px 0' }}>
            <MapboxSearch
              placeholder={searchMode === 'pickup' ? 'Buscar punto de recogida...' : 'Buscar destino...'}
              value={searchMode === 'pickup' ? form.pickupAddress : searchMode.startsWith('stop_') ? stops[parseInt((searchMode as string).split('_')[1])]?.address || '' : ''}
              onSelect={(name: string, lat: number, lng: number) => {
                resolveLocation(searchMode, name, lat, lng);
                setSearchMode(null);
              }}
            />
          </div>
          <button type="button" className="enviar-search-gps" onClick={() => handleUseGPS(searchMode as 'pickup' | `stop_${number}`)}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
            <span>Usar mi ubicación actual</span>
          </button>
          <button type="button" className="enviar-search-gps" onClick={() => { setPickerMode(searchMode as typeof pickerMode); setSearchMode(null); }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
            <span>Seleccionar en el mapa</span>
          </button>
        </div>
      )}

      {/* Location Picker (Uber/Bolt style) */}
      {pickerMode && (
        <LocationPicker
          mode={pickerMode.startsWith('stop_') ? 'delivery' : pickerMode as 'pickup' | 'delivery'}
          initialCenter={
            pickerMode === 'pickup' && form.pickupLat && form.pickupLng
              ? { lat: Number(form.pickupLat), lng: Number(form.pickupLng) }
              : pickerMode.startsWith('stop_') && stops[parseInt((pickerMode as string).split('_')[1])]?.lat
              ? { lat: Number(stops[parseInt((pickerMode as string).split('_')[1])].lat), lng: Number(stops[parseInt((pickerMode as string).split('_')[1])].lng) }
              : null
          }
          onConfirm={(address, lat, lng) => {
            resolveLocation(pickerMode, address, lat, lng);
            setPickerMode(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      )}

      {/* Clean form page */}
      <div className="enviar-page">
        <div className="enviar-page-header">
          <button type="button" className="enviar-page-menu" onClick={openDrawer} aria-label="Menú">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="enviar-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={ORDER_TYPE_ICONS[orderType]} size={18} />
            <span>
              {orderType === 'mandadito' ? 'Nuevo Mandadito' : orderType === 'flete' ? 'Nuevo Flete' : orderType === 'viaje' ? 'Nuevo Viaje' : 'Nuevo Envio'}
            </span>
          </h1>
        </div>

        <div className="enviar-page-body">
          {/* Order type toggle — solo visible en paso 1 */}
          {step === 1 ? (
            <div className="enviar-order-toggle">
                {([
                  { key: 'mandadito', icon: 'shopping-cart' as const, label: 'Mandaditos', sub: 'Ir a comprar' },
                  { key: 'viaje',     icon: 'car'     as const, label: 'Remis',      sub: 'Pasajero' },
                  { key: 'envio',     icon: 'package' as const, label: 'Envío',      sub: 'Paquetes' },
                  { key: 'flete',     icon: 'truck'   as const, label: 'Fletes',     sub: 'Carga grande' },
                ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setOrderType(tab.key);
                    if (tab.key === 'mandadito' && !['moto', 'auto'].includes(form.vehicleType)) update('vehicleType', 'moto');
                    if (tab.key === 'flete' && !['motocarro', 'camion2t'].includes(form.vehicleType)) update('vehicleType', 'motocarro');
                    if (tab.key === 'viaje') update('vehicleType', 'auto');
                    if (tab.key === 'mandadito') { update('pickupAddress', ''); update('pickupLat', ''); update('pickupLng', ''); }
                  }}
                  className={`enviar-order-tab ${orderType === tab.key ? 'active' : ''}`}
                >
                  <span className="enviar-order-tab-icon">
                    {(() => {
                      const vt = tab.key === 'flete' ? 'camion2t' : tab.key === 'viaje' ? 'auto' : 'moto';
                      const imgUrl = pricing[vt]?.image_url;
                      return imgUrl
                        ? <img src={imgUrl} alt={tab.label} width={40} height={40} />
                        : <Icon name={tab.icon} size={20} />;
                    })()}
                  </span>
                  <span className="enviar-order-tab-text">
                    <span className="enviar-order-tab-label">{tab.label}</span>
                    <span className="enviar-order-tab-sublabel">{tab.sub}</span>
                  </span>
                  {orderType === tab.key && (
                    <span className="enviar-vehicle-check">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span className={`enviar-step-pill ${orderType}`}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={ORDER_TYPE_ICONS[orderType]} size={12} />
                  {orderType === 'mandadito' ? 'Mandaditos' : orderType === 'flete' ? 'Fletes' : orderType === 'viaje' ? 'Viaje' : 'Envio'}
                </span>
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--client-text-secondary)' }}>Paso {step} de 3</span>
            </div>
          )}

          {/* Step indicator */}
          <div className="enviar-step-indicator">
            {[1, 2, 3].map((s) => (
              <div key={s} className="enviar-step-item">
                <div className={`enviar-step-circle ${step === s ? 'active' : step > s ? 'done' : ''}`}>
                  {step > s ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : s}
                </div>
                {s < 3 && <div className={`enviar-step-line ${step > s ? 'done' : ''}`} />}
              </div>
            ))}
          </div>

          <form id="enviar-form" onSubmit={handleSubmit}>

            {/* ── STEP 1: ADDRESSES ── */}
            {step === 1 && (
              <>
                <div className="enviar-address-section">
                  {/* Pickup */}
                  <div className="enviar-address-row">
                    <span className="enviar-dot green" />
                    <input
                      className="enviar-address-input"
                      placeholder={pickupLoading ? 'Detectando ubicación…' : orderType === 'mandadito' ? 'Almacen / Tienda donde comprar' : orderType === 'viaje' ? 'Tu ubicación (punto de salida)' : 'Punto de recogida'}
                      value={form.pickupAddress}
                      onClick={() => { if (!pickupLoading) openSearch('pickup'); }}
                      readOnly
                    />
                    <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); setPickerMode('pickup'); }} aria-label="Seleccionar en mapa">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                    </button>
                  </div>

                  {/* Delivery stops — dynamic list */}
                  {stops.map((stop, idx) => (
                    <div key={stop.id}>
                      <div className="enviar-address-divider" />
                      <div className="enviar-address-row" style={{ alignItems: 'flex-start', gap: 8 }}>
                        {/* Numbered badge */}
                        <span style={{
                          minWidth: 20, height: 20, borderRadius: '50%',
                          background: 'var(--client-danger)', color: '#fff',
                          fontSize: '0.7rem', fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 2,
                        }}>
                          {stops.length > 1 ? idx + 1 : ''}
                          {stops.length === 1 && (
                            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                          )}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Address */}
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              className="enviar-address-input"
                              placeholder={orderType === 'viaje' ? '¿A dónde vas?' : `Destino${stops.length > 1 ? ` ${idx + 1}` : ''}`}
                              value={stop.address}
                              onClick={() => openSearch(`stop_${idx}`)}
                              readOnly
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); setPickerMode(`stop_${idx}`); }} aria-label="Seleccionar en mapa">
                              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                            </button>
                            {stops.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeStop(idx)}
                                style={{ background: 'none', border: 'none', color: 'var(--client-danger)', cursor: 'pointer', padding: '2px 4px', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
                                aria-label="Eliminar parada"
                              >✕</button>
                            )}
                          </div>

  
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add stop button */}
                  {stops.length < MAX_STOPS && (
                    <button
                      type="button"
                      onClick={addStop}
                      className="enviar-add-stop-btn"
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Agregar parada {stops.length > 1 ? `(${stops.length}/${MAX_STOPS})` : ''}
                    </button>
                  )}

                  {/* Optimize route button — visible when ≥2 stops have coords */}
                  {canOptimize && (
                    <button
                      type="button"
                      onClick={optimizeStops}
                      className="enviar-optimize-btn"
                      title="Reordena las paradas de más cercana a más lejana para reducir la distancia total"
                    >
                      {optimized ? (
                        <>
                          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Ruta optimizada
                        </>
                      ) : (
                        <>
                          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M9 18h6"/></svg>
                          Optimizar ruta
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Route preview map — shown when both pickup + at least one stop are set */}
                {isFinite(parseFloat(form.pickupLat)) && stops.some(s => isFinite(parseFloat(s.lat))) && (
                  <RoutePreviewMap
                    pickup={{ lat: parseFloat(form.pickupLat), lng: parseFloat(form.pickupLng) }}
                    stops={stops
                      .filter(s => isFinite(parseFloat(s.lat)) && isFinite(parseFloat(s.lng)))
                      .map(s => ({ lat: parseFloat(s.lat), lng: parseFloat(s.lng) }))}
                    routeCoords={routeCoords}
                  />
                )}

                {/* Route info pill */}
                {(routeDistanceMeters || distanceKm > 0) && (
                  <div className="enviar-route-info">
                    <div className="enviar-route-stat">
                      <span className="enviar-route-icon" style={{ background: '#f97316' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                      </span>
                      <span><strong>{routeDistanceMeters ? (routeDistanceMeters/1000).toFixed(1) : distanceKm.toFixed(1)}</strong> km</span>
                    </div>
                    {stops.length > 1 && (
                      <>
                        <div className="enviar-route-divider" />
                        <div className="enviar-route-stat">
                          <span className="enviar-route-icon" style={{ background: '#8b5cf6' }}>
                            <Icon name="map-pin" size={10} />
                          </span>
                          <span><strong>{stops.length}</strong> paradas</span>
                        </div>
                      </>
                    )}
                    <div className="enviar-route-divider" />
                    <div className="enviar-route-stat">
                      <span className="enviar-route-icon" style={{ background: '#22c55e' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </span>
                      <span><strong>{routeDurationSec ? Math.max(1, Math.round(routeDurationSec/60)) : Math.max(1, Math.round((distanceKm / 30) * 60))}</strong> min</span>
                    </div>
                    {suggestedPrice > 0 && (
                      <>
                        <div className="enviar-route-divider" />
                        <div className="enviar-route-stat">
                          <span className="enviar-route-icon" style={{ background: '#F5C518' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C1C2E" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                          </span>
                          <span>Desde <strong>{suggestedPrice.toLocaleString('es-PY')} Gs</strong></span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Mandadito extra fields */}
                {orderType === 'mandadito' && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="enviar-mandadito-label">
                        Lista de lo que necesitás <span className="enviar-mandadito-note">(describí cada producto)</span>
                      </label>
                      <textarea
                        className="enviar-field-textarea"
                        placeholder={'Ej:\n- 1 kg arroz Ceres\n- 2 lt leche La Láctea\n- 6 huevos'}
                        value={shoppingList}
                        onChange={e => setShoppingList(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div>
                      <label className="enviar-mandadito-label">
                        Monto máximo a gastar <span className="enviar-mandadito-note">(Gs.)</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="enviar-field-input"
                        placeholder="Ej: 50.000"
                        value={maxBudget}
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setMaxBudget(raw ? parseInt(raw).toLocaleString('es-PY') : '');
                        }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="enviar-next-btn"
                  disabled={!form.pickupLat || !firstStop.lat || (orderType === 'mandadito' && !shoppingList.trim())}
                  onClick={() => setStep(2)}
                >
                  Continuar
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </>
            )}

            {/* ── STEP 2: VEHICLE + PRICE + PAYMENT ── */}
            {step === 2 && (
              <>
                <div className="enviar-step-title">
                  <span className="enviar-step-title-icon">
                    <Icon name="car" size={16} />
                  </span>
                  <div>
                    <div className="enviar-step-title-main">Elegí el vehículo y tu oferta</div>
                    <div className="enviar-step-title-sub">{orderType === 'viaje' ? 'Viaja fácil, rápido y a tu manera' : 'Los conductores verán tu precio y aceptarán'}</div>
                  </div>
                </div>

                {/* Vehicle cards */}
                <div className="enviar-vehicle-grid">
                  {vehicleTypes.filter(v =>
                    orderType === 'flete' ? ['motocarro', 'camion2t'].includes(v.value) :
                    ['moto', 'auto'].includes(v.value)
                  ).map(v => {
                    const vp = pricing[v.value];
                    const dist = routeDistanceMeters ? routeDistanceMeters / 1000 : distanceKm;
                    let estPrice = 0;
                    if (vp?.base_price) estPrice += vp.base_price;
                    if (vp?.price_per_km && dist > 0) estPrice += vp.price_per_km * dist;
                    const globalMin = pricingSettings['min_shipping_price'] ?? 0;
                    if (globalMin && estPrice < globalMin) estPrice = globalMin;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        className={`enviar-vehicle-card ${form.vehicleType === v.value ? 'selected' : ''}`}
                        onClick={() => update('vehicleType', v.value)}
                      >
                        <span className="enviar-vehicle-icon">
                          {pricing[v.value]?.image_url ? (
                            <img
                              src={pricing[v.value].image_url!}
                              alt={v.label}
                              width={72}
                              height={72}
                            />
                          ) : (
                            <Icon name={v.icon as import('@/components/Icon').IconName} size={32} />
                          )}
                        </span>
                        <div className="enviar-vehicle-info">
                          <span className="enviar-vehicle-name">{v.label}</span>
                          <span className="enviar-vehicle-sub">
                            {orderType === 'viaje' && v.value === 'moto' ? 'Capacidad 1 Persona' :
                             orderType === 'viaje' && v.value === 'auto' ? 'Capacidad hasta 3 personas' :
                             v.sub}
                          </span>
                        </div>
                        <div className="enviar-vehicle-price">
                          {!loadingPricing && estPrice > 0 ? (
                            <span>{Math.round(estPrice).toLocaleString('es-PY')} <small>Gs</small></span>
                          ) : (
                            <span className="enviar-vehicle-hint">{v.priceHint}</span>
                          )}
                        </div>
                        {form.vehicleType === v.value && (
                          <span className="enviar-vehicle-check">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Price control */}
                <div className="enviar-price-section">
                  {/* Surge badge — only visible when multiplier > 1 */}
                  {surgeData && surgeData.multiplier > 1.0 && (
                    <div className={`enviar-surge-badge enviar-surge-${surgeData.color}`}>
                      {surgeData.color === 'red' ? '🔥' : '⚡'} {surgeData.label}
                    </div>
                  )}
                  <div className="enviar-price-label">
                    Tu oferta al conductor
                    {(surgeData?.suggested ?? suggestedPrice) > 0 && (
                      <button
                        type="button"
                        className="enviar-price-reset"
                        onClick={() => setOfferPrice(surgeData?.suggested ?? suggestedPrice)}
                      >
                        Sugerido: {(surgeData?.suggested ?? suggestedPrice).toLocaleString('es-PY')} Gs
                      </button>
                    )}
                  </div>
                  {surgeData && surgeData.multiplier > 1.0 && (
                    <div className="enviar-surge-range">
                      Rango normal: {surgeData.range_min.toLocaleString('es-PY')} – {surgeData.range_max.toLocaleString('es-PY')} Gs
                    </div>
                  )}
                  <div className="enviar-price-control">
                    <button
                      type="button"
                      className="enviar-price-btn minus"
                      onClick={() => setOfferPrice(prev => Math.max(0, prev - 5000))}
                      disabled={offerPrice <= 0}
                      aria-label="Restar 5.000"
                    >
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
                    </button>
                    <div className="enviar-price-display">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="enviar-price-input"
                        value={offerPrice > 0 ? offerPrice.toLocaleString('es-PY') : '0'}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setOfferPrice(Math.max(0, parseInt(raw) || 0));
                        }}
                      />
                      <span className="enviar-price-currency">Gs</span>
                    </div>
                    <button
                      type="button"
                      className="enviar-price-btn plus"
                      onClick={() => setOfferPrice(prev => prev + 5000)}
                      aria-label="Sumar 5.000"
                    >
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                  </div>
                </div>

                {/* Low-price warning */}
                {(surgeData?.suggested ?? suggestedPrice) > 0 &&
                  offerPrice < (surgeData?.suggested ?? suggestedPrice) && (
                  <div className="enviar-price-warning">
                    <div className="enviar-price-warning-icon">⚠️</div>
                    <div className="enviar-price-warning-body">
                      <p className="enviar-price-warning-title">Tu Oferta es baja.</p>
                      <p className="enviar-price-warning-text">
                        Sube un poco tu oferta para aumentar las posibilidades de aceptación inmediata.
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment method */}
                <div className="enviar-payment-pills">
                  {paymentMethods.map(pm => (
                    <button
                      key={pm.value}
                      type="button"
                      className={`enviar-pay-pill ${form.paymentMethod === pm.value ? 'active' : ''}`}
                      onClick={() => update('paymentMethod', pm.value)}
                    >
                      <span className="enviar-pay-pill-icon">
                        <Icon name={pm.icon as import('@/components/Icon').IconName} size={14} />
                      </span>
                      <span>{pm.label}</span>
                    </button>
                  ))}
                </div>

                <div className="enviar-step-actions">
                  <button type="button" className="enviar-back-btn" onClick={() => setStep(1)}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <button
                    type="button"
                    className="enviar-next-btn"
                    disabled={offerPrice <= 0}
                    onClick={() => setStep(3)}
                    style={{ flex: 1 }}
                  >
                    Continuar
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 3: CONTACTS ── */}
            {step === 3 && (
              <>
                <div className="enviar-step-title">
                  <span className="enviar-step-title-icon">
                    <Icon name="user" size={16} />
                  </span>
                  <div>
                    <div className="enviar-step-title-main">{orderType === 'viaje' ? 'Confirmá tus datos de pasajero' : 'Confirmar datos del remitente'}</div>
                    <div className="enviar-step-title-sub">{orderType === 'viaje' ? 'El conductor verá tu nombre y contacto' : 'Revisá tu nombre y teléfono'}</div>
                  </div>
                </div>

                <div className="enviar-contact-card">
                  <div className="enviar-contact-header">
                    <span className="enviar-dot green" style={{ width: 10, height: 10 }} /> {orderType === 'viaje' ? 'Pasajero' : 'Remitente'}
                  </div>
                  <div className="enviar-field-row">
                    <div className="enviar-field">
                      <label className="enviar-field-label">Nombre</label>
                      <input
                        className="enviar-field-input"
                        placeholder="Nombre completo"
                        value={form.senderContact}
                        onChange={e => update('senderContact', e.target.value)}
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div className="enviar-field">
                      <label className="enviar-field-label">Teléfono</label>
                      <input
                        className="enviar-field-input"
                        type="tel"
                        placeholder="0981 000 000"
                        value={form.senderPhone}
                        onChange={e => update('senderPhone', e.target.value)}
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>


                <div className="enviar-contact-card" style={{ marginTop: '0.75rem', background: 'var(--client-action-active)' }}>
                  <div className="enviar-field">
                    <label className="enviar-field-label">Indicaciones para el conductor <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--client-text-secondary)' }}>(opcional)</span></label>
                    <textarea
                      className="enviar-field-textarea"
                      placeholder={orderType === 'viaje' ? 'Ej: Viajo con mascota, llevo equipaje, u otras condiciones' : 'Ej: Dejar en portería, tocar timbre 2 veces, es frágil...'}
                      value={form.instructions}
                      onChange={e => update('instructions', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                {/* ── Card: Ubicación seleccionada ── */}
                <div className="enviar-summary-card">
                  <div className="enviar-summary-card-header"></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {/* Pickup */}
                    <span className="enviar-summary-stop-dot green" style={{ flexShrink: 0 }} />
                    <span className="enviar-summary-stop-text" style={{ flex: 1 }}>
                      {form.pickupAddress.split(',')[0] || '—'}
                    </span>
                    {/* Arrow */}
                    <svg width="14" height="14" fill="none" stroke="var(--client-text-secondary)" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    {/* Last stop */}
                    <span className="enviar-summary-stop-dot red" style={{ flexShrink: 0 }} />
                    <span className="enviar-summary-stop-text" style={{ flex: 1 }}>
                      {stops.length === 1
                        ? (firstStop.address || '').split(',')[0] || '—'
                        : `${stops.length} paradas`}
                    </span>
                  </div>
                </div>

                {/* ── Card: Vehículo seleccionado ── */}
                {(() => {
                  const veh = vehicleTypes.find(v => v.value === form.vehicleType);
                  if (!veh) return null;
                  const vp = pricing[veh.value];
                  const subText =
                    orderType === 'viaje' && veh.value === 'moto' ? 'Capacidad 1 Persona' :
                    orderType === 'viaje' && veh.value === 'auto' ? 'Capacidad hasta 3 personas' :
                    veh.sub;
                  return (
                    <div className="enviar-vehicle-summary-card">
                      <div className="enviar-vehicle-summary-icon">
                        {vp?.image_url ? (
                          <img src={vp.image_url} alt={veh.label} width={48} height={48} style={{ objectFit: 'contain' }} />
                        ) : (
                          <Icon name={veh.icon as import('@/components/Icon').IconName} size={32} />
                        )}
                      </div>
                      <div className="enviar-vehicle-summary-info">
                        <div className="enviar-vehicle-summary-name">{veh.label}</div>
                        <div className="enviar-vehicle-summary-sub">{subText}</div>
                      </div>
                      <span className="enviar-vehicle-summary-badge">✓ Seleccionado</span>
                    </div>
                  );
                })()}

                {/* Extras: Programar + Promo — accordion colapsable */}
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8 }}>

                  {/* ── Programar pedido accordion ── */}
                  <div className={`enviar-accordion${scheduleOpen ? ' open' : ''}${dateScheduled ? ' has-value' : ''}`}>
                    <button
                      type="button"
                      className="enviar-accordion-row"
                      onClick={() => setScheduleOpen(o => !o)}
                      aria-expanded={scheduleOpen}
                    >
                      <span className="enviar-accordion-left">
                        <span className="enviar-accordion-icon">📅</span>
                        <span className="enviar-accordion-label">
                          {dateScheduled
                            ? (() => {
                                const d = new Date(dateScheduled);
                                return d.toLocaleString('es-PY', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                              })()
                            : 'Reservas'}
                        </span>
                        {dateScheduled && <span className="enviar-accordion-badge scheduled">Programado</span>}
                      </span>
                      <svg
                        className="enviar-accordion-chevron"
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <div className="enviar-accordion-body">
                      <div className="enviar-accordion-content">
                        <label className="enviar-field-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          Elegí fecha y hora
                        </label>
                        <input
                          type="datetime-local"
                          className="enviar-field-input"
                          value={dateScheduled}
                          onChange={e => setDateScheduled(e.target.value)}
                          min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                        />
                        {dateScheduled && (
                          <button
                            type="button"
                            onClick={() => { setDateScheduled(''); setScheduleOpen(false); }}
                            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--client-danger)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          >
                            × Cancelar programación
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Código promocional accordion ── */}
                  <div className={`enviar-accordion${promoOpen ? ' open' : ''}${promoResult ? ' has-value' : ''}`}>
                    <button
                      type="button"
                      className="enviar-accordion-row"
                      onClick={() => setPromoOpen(o => !o)}
                      aria-expanded={promoOpen}
                    >
                      <span className="enviar-accordion-left">
                        <span className="enviar-accordion-icon">🏷️</span>
                        <span className="enviar-accordion-label">
                          {promoResult
                            ? `${promoCode.toUpperCase()} · -${promoResult.discount_amount.toLocaleString('es-PY')} Gs`
                            : '¿Tenés un código promo?'}
                        </span>
                        {promoResult && <span className="enviar-accordion-badge promo">✓ Aplicado</span>}
                      </span>
                      <svg
                        className="enviar-accordion-chevron"
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <div className="enviar-accordion-body">
                      <div className="enviar-accordion-content">
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="enviar-field-input"
                            placeholder="Ej: PROMO10"
                            value={promoCode}
                            onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); setPromoError(null); }}
                            style={{ flex: 1 }}
                            autoCapitalize="characters"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={validatePromo}
                            disabled={promoLoading || !promoCode.trim()}
                            className="enviar-promo-apply-btn"
                          >
                            {promoLoading ? '...' : 'Aplicar'}
                          </button>
                        </div>
                        {promoResult && (
                          <div className="enviar-accordion-feedback success">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                            Descuento: -{promoResult.discount_amount.toLocaleString('es-PY')} Gs{promoResult.description ? ` · ${promoResult.description}` : ''}
                          </div>
                        )}
                        {promoError && (
                          <div className="enviar-accordion-feedback error">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            {promoError}
                          </div>
                        )}
                        {promoResult && (
                          <button
                            type="button"
                            onClick={() => { setPromoResult(null); setPromoCode(''); setPromoError(null); }}
                            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--client-danger)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          >
                            × Quitar código
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

                {/* CTA */}
                {submitError && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--client-danger)', fontSize: '0.84rem', fontWeight: 500, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="exclamation" size={12} color="var(--client-danger)" />
                    {submitError}
                  </div>
                )}
                <div className="enviar-step-actions">
                  <button type="button" className="enviar-back-btn" onClick={() => setStep(2)}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <button
                    type="submit"
                    form="enviar-form"
                    className="enviar-submit-final"
                    disabled={sending || offerPrice <= 0}
                    style={{ flex: 1 }}
                  >
                    {sending ? (
                      <span className="enviar-cta-loading">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                        </svg>
                        Enviando...
                      </span>
                    ) : promoResult ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Solicitar ·
                        <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.85em' }}>{offerPrice.toLocaleString('es-PY')} Gs</span>
                        <span style={{ color: '#bbf7d0', fontWeight: 800 }}>{Math.max(0, offerPrice - promoResult.discount_amount).toLocaleString('es-PY')} Gs</span>
                      </span>
                    ) : (
                      <>Solicitar · {offerPrice > 0 ? offerPrice.toLocaleString('es-PY') : '0'} Gs</>
                    )}
                  </button>
                </div>

                <div style={{ height: '1rem' }} />
              </>
            )}

          </form>
        </div>
      </div>
    </>
  );
}
