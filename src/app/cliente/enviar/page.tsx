"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useClientContext } from '../context';
import { authFetch } from '@/lib/authFetch';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });
const MapboxSearch = dynamic(() => import('../components/MapboxSearch'), { ssr: false });
const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false });

const vehicleTypes = [
  { value: 'moto', label: 'Moto', sub: 'Paquetes pequeños', icon: '🏍️', priceHint: 'Más económico' },
  { value: 'auto', label: 'Auto', sub: 'Mayor capacidad', icon: '🚗', priceHint: 'Cómodo y seguro' },
  { value: 'motocarro', label: 'Moto Carro', sub: 'Fletes 300kg', icon: '🛵', priceHint: 'Carga mediana' },
  { value: 'camion2t', label: 'Camión 2T', sub: 'Carga pesada', icon: '🚛', priceHint: 'Mudanzas y fletes' },
];

const paymentMethods = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
];

export default function EnviarPaquetePage() {
  const { openDrawer, email, displayName, profilePhoto } = useClientContext();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Address search overlay state
  const [searchMode, setSearchMode] = useState<null | 'pickup' | 'delivery'>(null);
  // Location picker (map pin) state
  const [pickerMode, setPickerMode] = useState<null | 'pickup' | 'delivery'>(null);

  const [form, setForm] = useState({
    pickupAddress: '',
    deliveryAddress: '',
    vehicleType: 'moto',
    senderContact: '',
    senderPhone: '',
    receiverContact: '',
    receiverPhone: '',
    instructions: '',
    paymentMethod: 'efectivo',
    offer: '',
    pickupLat: '',
    pickupLng: '',
    deliveryLat: '',
    deliveryLng: '',
  });



  // User location for proximity bias + auto-fill pickup address
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
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

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
  const [pricing, setPricing] = useState<{ [key: string]: { base_price: number | null, price_per_km: number | null } }>({});
  const [pricingSettings, setPricingSettings] = useState<Record<string, number>>({});
  const [loadingPricing, setLoadingPricing] = useState(true);

  // Fetch pricing config from public API
  useEffect(() => {
    fetch('/api/pricing')
      .then(res => res.json())
      .then(data => {
        const map: { [key: string]: { base_price: number | null, price_per_km: number | null } } = {};
        if (data && data.vehicle_pricing) {
          for (const v of data.vehicle_pricing) {
            const key = v.vehicle_type || '';
            map[key] = {
              base_price: v.base_price === null || v.base_price === undefined ? null : Number(v.base_price),
              price_per_km: v.price_per_km === null || v.price_per_km === undefined ? null : Number(v.price_per_km),
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
  // Haversine distance in km
  const distanceKm = useMemo(() => {
    const lat1 = parseFloat(form.pickupLat);
    const lon1 = parseFloat(form.pickupLng);
    const lat2 = parseFloat(form.deliveryLat);
    const lon2 = parseFloat(form.deliveryLng);
    if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return 0;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.max(0, R * c);
  }, [form.pickupLat, form.pickupLng, form.deliveryLat, form.deliveryLng]);

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

  // Drag state
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const startTranslate = useRef(0);

  const isDesktop = useCallback(() => window.matchMedia('(min-width: 768px)').matches, []);

  const getTranslateY = useCallback(() => {
    if (!sheetRef.current) return 0;
    const st = window.getComputedStyle(sheetRef.current);
    const matrix = new DOMMatrix(st.transform);
    return matrix.m42;
  }, []);

  const setSheet = useCallback((state: 'collapsed' | 'half' | 'full') => {
    if (isDesktop()) return;
    setSheetState(state);
  }, [isDesktop]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    function onStart(e: TouchEvent | MouseEvent) {
      if (isDesktop()) return;
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase();
      if (['button', 'input', 'textarea', 'select', 'a', 'label'].includes(tag)) return;
      isDragging.current = true;
      startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
      startX.current = 0;
      startTranslate.current = getTranslateY();
      sheet!.style.transition = 'none';
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!isDragging.current) return;
      const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      // Block if horizontal swipe is dominant
      if (!startX.current) startX.current = currentX;
      const deltaX = Math.abs(currentX - startX.current);
      const deltaY = Math.abs(currentY - startY.current);
      if (deltaX > deltaY + 5) { isDragging.current = false; return; }
      if (e.cancelable) e.preventDefault();
      const delta = currentY - startY.current;
      const maxTranslate = sheet!.offsetHeight * 0.8;
      const newTranslate = Math.min(maxTranslate, Math.max(0, startTranslate.current + delta));
      sheet!.style.transform = `translateY(${newTranslate}px)`;
    }

    function onEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      startX.current = 0;
      sheet!.style.transition = '';
      const finalTranslate = getTranslateY();
      const viewH = window.innerHeight;
      if (finalTranslate > viewH * 0.55) setSheet('collapsed');
      else if (finalTranslate > viewH * 0.25) setSheet('half');
      else setSheet('full');
    }

    sheet.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    sheet.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    const handleResize = () => {
      if (isDesktop()) {
        sheet.style.transform = '';
      } else {
        setSheet('half');
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      sheet.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('mousedown', onStart);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      window.removeEventListener('resize', handleResize);
    };
  }, [getTranslateY, isDesktop, setSheet]);


  // When coordinates change, request a routed path via backend proxy
  useEffect(() => {
    const lat1 = parseFloat(form.pickupLat);
    const lon1 = parseFloat(form.pickupLng);
    const lat2 = parseFloat(form.deliveryLat);
    const lon2 = parseFloat(form.deliveryLng);
    if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) {
      setRouteCoords([]);
      setRouteDistanceMeters(null);
      setRouteDurationSec(null);
      return;
    }

    fetchProxyDirections(lat1, lon1, lat2, lon2)
      .then((data) => {
        if (data && data.coords && data.coords.length > 0) {
          setRouteCoords(data.coords);
          setRouteDistanceMeters(data.distance_meters || null);
          setRouteDurationSec(data.duration_seconds || null);
        } else {
          setRouteCoords([]);
          setRouteDistanceMeters(null);
          setRouteDurationSec(null);
        }
      })
      .catch(() => {
        setRouteCoords([]);
        setRouteDistanceMeters(null);
        setRouteDurationSec(null);
      });
  }, [form.pickupLat, form.pickupLng, form.deliveryLat, form.deliveryLng]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await authFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_email: email,
          client_name: displayName || email.split('@')[0],
          client_photo: profilePhoto || '',
          pickup_address: form.pickupAddress,
          delivery_address: form.deliveryAddress,
          vehicle_type: form.vehicleType,
          sender_contact: form.senderContact,
          sender_phone: form.senderPhone,
          receiver_contact: form.receiverContact,
          receiver_phone: form.receiverPhone,
          instructions: form.instructions,
          payment_method: form.paymentMethod,
          suggested_price: suggestedPrice,
          offer: offerPrice > 0 ? String(offerPrice) : form.offer,
          pickup_lat: form.pickupLat,
          pickup_lng: form.pickupLng,
          delivery_lat: form.deliveryLat,
          delivery_lng: form.deliveryLng,
        }),
      });
      if (res.status === 401) { router.push('/auth'); return; }
      if (!res.ok) throw new Error('Error al crear el pedido');
      // Redirect to home to see offers
      router.push('/cliente');
    } catch (err) {
      alert('Error al crear el pedido');
    } finally {
      setSending(false);
    }
  };

  const handleUseGPS = (field: 'pickup' | 'delivery') => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        const coords = `${lat}, ${lon}`;
        if (field === 'pickup') {
          update('pickupAddress', coords);
          update('pickupLat', lat);
          update('pickupLng', lon);
        } else {
          update('deliveryAddress', coords);
          update('deliveryLat', lat);
          update('deliveryLng', lon);
        }
        setSearchMode(null);
      },
      () => {}
    );
  };

  const openSearch = (mode: 'pickup' | 'delivery') => setSearchMode(mode);

  if (success) {
    return (
      <div className="enviar-success-screen">
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>¡Envío registrado!</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem', maxWidth: 320 }}>Tu solicitud se ha creado correctamente. Te notificaremos cuando un conductor acepte tu envío.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/cliente/mis-envios" className="client-btn client-btn-primary">Ver Mis Envíos</Link>
          <button className="client-btn" style={{ background: '#f1f5f9', color: '#374151' }} onClick={() => { setSuccess(false); setStep(1); setForm({ pickupAddress: '', pickupLat: '', pickupLng: '', deliveryAddress: '', deliveryLat: '', deliveryLng: '', vehicleType: 'moto', senderContact: '', senderPhone: '', receiverContact: '', receiverPhone: '', instructions: '', paymentMethod: 'efectivo', offer: '' }); }}>
            Nuevo Envío
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Full screen map */}
      <div className="enviar-map">
        <ClientMap
          pickup={form.pickupLat && form.pickupLng ? { lat: Number(form.pickupLat), lng: Number(form.pickupLng) } : undefined}
          delivery={form.deliveryLat && form.deliveryLng ? { lat: Number(form.deliveryLat), lng: Number(form.deliveryLng) } : undefined}
          routeCoords={routeCoords && routeCoords.length > 0 ? routeCoords : undefined}
          showMyLocationButton
        />
      </div>

      {/* Floating menu button (fixed) */}
      <button className="enviar-float-btn menu" onClick={openDrawer} aria-label="Menú">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Address search fullscreen overlay */}
      {searchMode && (
        <div className="enviar-search-overlay" style={{ background: '#fff' }}>
          <div className="enviar-search-header">
            <button type="button" className="enviar-search-back" onClick={() => setSearchMode(null)}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className={`enviar-dot ${searchMode === 'pickup' ? 'green' : 'red'}`} style={{ marginLeft: 8 }} />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginLeft: 8 }}>
              {searchMode === 'pickup' ? 'Punto de recogida' : 'Destino de entrega'}
            </span>
          </div>
          {/* Mapbox SearchBox autocomplete */}
          <div style={{ padding: '12px 16px 0' }}>
            <MapboxSearch
              placeholder={searchMode === 'pickup' ? 'Buscar punto de recogida...' : 'Buscar destino...'}
              value={searchMode === 'pickup' ? form.pickupAddress : form.deliveryAddress}
              onSelect={(name: string, lat: number, lng: number) => {
                if (searchMode === 'pickup') {
                  update('pickupAddress', name);
                  update('pickupLat', String(lat));
                  update('pickupLng', String(lng));
                } else {
                  update('deliveryAddress', name);
                  update('deliveryLat', String(lat));
                  update('deliveryLng', String(lng));
                }
                setSearchMode(null);
              }}
            />
          </div>
          {/* GPS option */}
          <button type="button" className="enviar-search-gps" onClick={() => handleUseGPS(searchMode)}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
            <span>Usar mi ubicación actual</span>
          </button>
          {/* Open map picker */}
          <button type="button" className="enviar-search-gps" onClick={() => { setSearchMode(null); setPickerMode(searchMode); }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
            <span>Seleccionar en el mapa</span>
          </button>
        </div>
      )}

      {/* Location Picker (Uber/Bolt style) */}
      {pickerMode && (
        <LocationPicker
          mode={pickerMode}
          initialCenter={
            pickerMode === 'pickup' && form.pickupLat && form.pickupLng
              ? { lat: Number(form.pickupLat), lng: Number(form.pickupLng) }
              : pickerMode === 'delivery' && form.deliveryLat && form.deliveryLng
              ? { lat: Number(form.deliveryLat), lng: Number(form.deliveryLng) }
              : null
          }
          onConfirm={(address, lat, lng) => {
            if (pickerMode === 'pickup') {
              update('pickupAddress', address);
              update('pickupLat', String(lat));
              update('pickupLng', String(lng));
            } else {
              update('deliveryAddress', address);
              update('deliveryLat', String(lat));
              update('deliveryLng', String(lng));
            }
            setPickerMode(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      )}

      {/* Bottom Sheet */}
      <div ref={sheetRef} className={`enviar-sheet ${sheetState}`}>
        <div className="enviar-sheet-handle"><span className="enviar-sheet-bar" /></div>

        <div className="enviar-sheet-content">
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
                <div className="enviar-step-title">
                  <span className="enviar-step-title-icon">📍</span>
                  <div>
                    <div className="enviar-step-title-main">¿Dónde recogemos y entregamos?</div>
                    <div className="enviar-step-title-sub">Ingresá el origen y destino del paquete</div>
                  </div>
                </div>

                <div className="enviar-address-section">
                  <div className="enviar-address-row">
                    <span className="enviar-dot green" />
                    <input
                      className="enviar-address-input"
                      placeholder={pickupLoading ? 'Detectando ubicación…' : 'Punto de recogida'}
                      value={form.pickupAddress}
                      onChange={e => { update('pickupAddress', e.target.value); }}
                      onFocus={() => { if (!pickupLoading) openSearch('pickup'); }}
                      readOnly={pickupLoading}
                    />
                    <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); setPickerMode('pickup'); }} aria-label="Seleccionar en mapa">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                    </button>
                  </div>
                  <div className="enviar-address-divider" />
                  <div className="enviar-address-row">
                    <span className="enviar-dot red" />
                    <input
                      className="enviar-address-input"
                      placeholder="¿A dónde va el paquete?"
                      value={form.deliveryAddress}
                      onChange={e => { update('deliveryAddress', e.target.value); }}
                      onFocus={() => openSearch('delivery')}
                    />
                    <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); setPickerMode('delivery'); }} aria-label="Seleccionar en mapa">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                    </button>
                  </div>
                </div>

                {/* Route info pill */}
                {(routeDistanceMeters || distanceKm > 0) && (
                  <div className="enviar-route-info">
                    <div className="enviar-route-stat">
                      <span className="enviar-route-icon" style={{ background: '#f97316' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                      </span>
                      <span><strong>{routeDistanceMeters ? (routeDistanceMeters/1000).toFixed(1) : distanceKm.toFixed(1)}</strong> km</span>
                    </div>
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

                <button
                  type="button"
                  className="enviar-next-btn"
                  disabled={!form.pickupLat || !form.deliveryLat}
                  onClick={() => { setStep(2); setSheet('full'); /* vehicle step needs scroll */ }}
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
                  <span className="enviar-step-title-icon">🚗</span>
                  <div>
                    <div className="enviar-step-title-main">Elegí el vehículo y tu oferta</div>
                    <div className="enviar-step-title-sub">Los conductores verán tu precio y aceptarán</div>
                  </div>
                </div>

                {/* Vehicle cards */}
                <div className="enviar-vehicle-grid">
                  {vehicleTypes.map(v => {
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
                        <span className="enviar-vehicle-icon">{v.icon}</span>
                        <div className="enviar-vehicle-info">
                          <span className="enviar-vehicle-name">{v.label}</span>
                          <span className="enviar-vehicle-sub">{v.sub}</span>
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Price control */}
                <div className="enviar-price-section">
                  <div className="enviar-price-label">
                    Tu oferta al conductor
                    {suggestedPrice > 0 && (
                      <button type="button" className="enviar-price-reset" onClick={() => setOfferPrice(suggestedPrice)}>
                        Sugerido: {suggestedPrice.toLocaleString('es-PY')} Gs
                      </button>
                    )}
                  </div>
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

                {/* Payment method */}
                <div className="enviar-payment-pills">
                  {paymentMethods.map(pm => (
                    <button
                      key={pm.value}
                      type="button"
                      className={`enviar-pay-pill ${form.paymentMethod === pm.value ? 'active' : ''}`}
                      onClick={() => update('paymentMethod', pm.value)}
                    >
                      <span className="enviar-pay-pill-icon">{pm.icon}</span>
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
                  <span className="enviar-step-title-icon">👤</span>
                  <div>
                    <div className="enviar-step-title-main">¿Quién envía y quién recibe?</div>
                    <div className="enviar-step-title-sub">Solo nombre y teléfono de cada parte</div>
                  </div>
                </div>

                <div className="enviar-contact-card">
                  <div className="enviar-contact-header">
                    <span className="enviar-dot green" style={{ width: 10, height: 10 }} /> Remitente
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

                <div className="enviar-contact-card" style={{ marginTop: '0.75rem' }}>
                  <div className="enviar-contact-header">
                    <span className="enviar-dot red" style={{ width: 10, height: 10 }} /> Destinatario
                  </div>
                  <div className="enviar-field-row">
                    <div className="enviar-field">
                      <label className="enviar-field-label">Nombre</label>
                      <input
                        className="enviar-field-input"
                        placeholder="Nombre completo"
                        value={form.receiverContact}
                        onChange={e => update('receiverContact', e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="enviar-field">
                      <label className="enviar-field-label">Teléfono</label>
                      <input
                        className="enviar-field-input"
                        type="tel"
                        placeholder="0981 000 000"
                        value={form.receiverPhone}
                        onChange={e => update('receiverPhone', e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>

                <div className="enviar-contact-card" style={{ marginTop: '0.75rem', background: '#fafafa' }}>
                  <div className="enviar-field">
                    <label className="enviar-field-label">Indicaciones para el conductor <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af' }}>(opcional)</span></label>
                    <textarea
                      className="enviar-field-textarea"
                      placeholder="Ej: Dejar en portería, tocar timbre 2 veces, es frágil..."
                      value={form.instructions}
                      onChange={e => update('instructions', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                {/* Summary row */}
                <div className="enviar-summary-row" style={{ marginTop: '0.75rem' }}>
                  <div className="enviar-summary-item">
                    <span className="enviar-summary-dot green" />
                    <span className="enviar-summary-addr">{form.pickupAddress.split(',')[0]}</span>
                  </div>
                  <svg width="14" height="14" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  <div className="enviar-summary-item">
                    <span className="enviar-summary-dot red" />
                    <span className="enviar-summary-addr">{form.deliveryAddress.split(',')[0]}</span>
                  </div>
                </div>

                {/* CTA */}
                <div className="enviar-step-actions">
                  <button type="button" className="enviar-back-btn" onClick={() => setStep(2)}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <button
                    type="submit"
                    form="enviar-form"
                    className="enviar-submit-final"
                    disabled={sending || offerPrice <= 0 || !form.senderContact.trim() || !form.senderPhone.trim() || !form.receiverContact.trim() || !form.receiverPhone.trim()}
                    style={{ flex: 1 }}
                  >
                    {sending ? (
                      <span className="enviar-cta-loading">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                        </svg>
                        Enviando...
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
