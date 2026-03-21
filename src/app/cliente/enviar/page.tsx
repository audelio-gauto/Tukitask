"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useClientContext } from '../context';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });
const MapboxSearch = dynamic(() => import('../components/MapboxSearch'), { ssr: false });

const vehicleTypes = [
  { value: 'moto', label: 'Moto', sub: 'Paquetes chicos', icon: '🏍️' },
  { value: 'auto', label: 'Auto', sub: 'Más capacidad', icon: '🚗' },
  { value: 'motocarro', label: 'Moto carro', sub: 'Envíos rápidos', icon: '🛵' },
  { value: 'camion2t', label: 'Camión 2T', sub: 'Carga media', icon: '🚛' },
];



const paymentMethods = [
  { value: 'prometido', label: 'Prometido', icon: '💰' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
];

// (using Mapbox autocomplete results)

export default function EnviarPaquetePage() {
  const { openDrawer } = useClientContext();
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Address search overlay state
  const [searchMode, setSearchMode] = useState<null | 'pickup' | 'delivery'>(null);

  const [form, setForm] = useState({
    pickupAddress: '',
    deliveryAddress: '',
    vehicleType: 'moto',
    senderContact: '',
    senderPhone: '',
    senderAddress: '',
    senderRef: '',
    receiverContact: '',
    receiverPhone: '',
    receiverAddress: '',
    description: '',
    instructions: '',
    paymentMethod: 'prometido',
    offer: '',
    pickupLat: '',
    pickupLng: '',
    deliveryLat: '',
    deliveryLng: '',
  });



  // User location for proximity bias
  const userLocation = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { userLocation.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

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
      startTranslate.current = getTranslateY();
      sheet!.style.transition = 'none';
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!isDragging.current) return;
      const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = currentY - startY.current;
      const newTranslate = Math.max(0, startTranslate.current + delta);
      sheet!.style.transform = `translateY(${newTranslate}px)`;
    }

    function onEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      sheet!.style.transition = '';
      const finalTranslate = getTranslateY();
      const viewH = window.innerHeight;
      if (finalTranslate > viewH * 0.6) setSheet('collapsed');
      else if (finalTranslate > viewH * 0.3) setSheet('half');
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
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_address: form.pickupAddress,
          delivery_address: form.deliveryAddress,
          vehicle_type: form.vehicleType,
          sender_contact: form.senderContact,
          sender_phone: form.senderPhone,
          sender_address: form.senderAddress,
          sender_ref: form.senderRef,
          receiver_contact: form.receiverContact,
          receiver_phone: form.receiverPhone,
          receiver_address: form.receiverAddress,
          description: form.description,
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
      if (!res.ok) throw new Error('Error al crear el pedido');
      setSuccess(true);
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
          <button className="client-btn" style={{ background: '#f1f5f9', color: '#374151' }} onClick={() => { setSuccess(false); setForm({ pickupAddress: '', pickupLat: '', pickupLng: '', deliveryAddress: '', deliveryLat: '', deliveryLng: '', vehicleType: 'moto', senderContact: '', senderPhone: '', senderAddress: '', senderRef: '', receiverContact: '', receiverPhone: '', receiverAddress: '', description: '', instructions: '', paymentMethod: 'prometido', offer: '' }); }}>
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
        />
      </div>

      {/* Distance / ETA badge — floating above Mapbox map */}
      {(routeDistanceMeters || distanceKm > 0) && (
        <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 12, background: 'rgba(255,255,255,0.97)', padding: '8px 18px', borderRadius: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', gap: 16, alignItems: 'center', zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#f97316', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
            </span>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1f2937' }}>{routeDistanceMeters ? (routeDistanceMeters/1000).toFixed(1) : distanceKm.toFixed(1)} km</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#22c55e', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151' }}>{routeDurationSec ? Math.max(1, Math.round(routeDurationSec/60)) + ' min' : Math.max(1, Math.round((distanceKm / 30) * 60)) + ' min'}</span>
          </div>
        </div>
      )}

      {/* Floating menu button */}
      <button className="enviar-float-btn menu" onClick={openDrawer} aria-label="Menú">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Floating back button */}
      <Link href="/cliente" className="enviar-float-btn back" aria-label="Volver">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

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
        </div>
      )}

      {/* Bottom Sheet */}
      <div ref={sheetRef} className={`enviar-sheet ${sheetState}`}>
        <div className="enviar-sheet-handle"><span className="enviar-sheet-bar" /></div>

        <div className="enviar-sheet-content">
          <form onSubmit={handleSubmit}>
            {/* Demo geocode (IndexedDB cache + server proxy) */}

            {/* Address inputs — tap to open fullscreen search */}
            <div className="enviar-address-section">
              <div className="enviar-address-row">
                <span className="enviar-dot green" />
                <input
                  className="enviar-address-input"
                  placeholder="Punto de recogida"
                  value={form.pickupAddress}
                  onChange={e => { update('pickupAddress', e.target.value); }}
                  onFocus={() => openSearch('pickup')}
                />
                <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); handleUseGPS('pickup'); }} aria-label="Usar GPS">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
                </button>
                {/* opens full-screen search overlay on focus */}
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
                <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); handleUseGPS('delivery'); }} aria-label="Usar GPS">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
                </button>
                {/* opens full-screen search overlay on focus */}
              </div>
            </div>

            {/* Vehicle type — horizontal swipeable */}
            <div className="enviar-section-label">Tipo de vehículo</div>
            <div className="enviar-type-scroll">
              {vehicleTypes.map(v => (
                <button
                  key={v.value}
                  type="button"
                  className={`enviar-type-card ${form.vehicleType === v.value ? 'selected' : ''}`}
                  onClick={() => update('vehicleType', v.value)}
                >
                  <span className="enviar-type-icon">{v.icon}</span>
                  <span className="enviar-type-label">{v.label}</span>
                  <span className="enviar-type-sub">{v.sub}</span>
                </button>
              ))}
            </div>

            {/* Sender details */}
            <div className="enviar-section-label">Datos del envío</div>
            <div className="enviar-details-card">
              <div className="enviar-field-row">
                <div className="enviar-field">
                  <label className="enviar-field-label">Contacto remitente</label>
                  <input className="enviar-field-input" placeholder="Nombre completo" value={form.senderContact} onChange={e => update('senderContact', e.target.value)} required />
                </div>
                <div className="enviar-field">
                  <label className="enviar-field-label">Teléfono</label>
                  <input className="enviar-field-input" type="tel" placeholder="0981/492174" value={form.senderPhone} onChange={e => update('senderPhone', e.target.value)} required />
                </div>
              </div>
              <div className="enviar-field">
                <label className="enviar-field-label">Dirección completa del envío</label>
                <input className="enviar-field-input" placeholder="Calle, número, barrio..." value={form.senderAddress} onChange={e => update('senderAddress', e.target.value)} />
              </div>
              <div className="enviar-field">
                <label className="enviar-field-label">Referencia</label>
                <input className="enviar-field-input" placeholder="Ej: Frente a la heladería del barrio 5..." value={form.senderRef} onChange={e => update('senderRef', e.target.value)} />
              </div>
              <div className="enviar-field-row">
                <div className="enviar-field">
                  <label className="enviar-field-label">Contacto destinatario</label>
                  <input className="enviar-field-input" placeholder="Nombre completo" value={form.receiverContact} onChange={e => update('receiverContact', e.target.value)} required />
                </div>
                <div className="enviar-field">
                  <label className="enviar-field-label">Tel. destinatario</label>
                  <input className="enviar-field-input" type="tel" placeholder="Teléfono" value={form.receiverPhone} onChange={e => update('receiverPhone', e.target.value)} required />
                </div>
              </div>
              <div className="enviar-field">
                <label className="enviar-field-label">Dirección de entrega</label>
                <input className="enviar-field-input" placeholder="Ubicar el punto en el mapa..." value={form.receiverAddress} onChange={e => update('receiverAddress', e.target.value)} />
              </div>
            </div>

            {/* ── Precio + Pago: Bolt/Uber style ── */}
            <div className="enviar-pricing-card">
              {/* Precio sugerido label */}
              <div className="enviar-pricing-header">
                <div className="enviar-pricing-label">
                  <svg width="16" height="16" fill="none" stroke="#16a34a" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" /></svg>
                  <span>Precio del envío</span>
                </div>
                {suggestedPrice > 0 && (
                  <span className="enviar-pricing-hint">
                    Sugerido: {suggestedPrice.toLocaleString('es-PY')} Gs
                  </span>
                )}
              </div>

              {/* Precio editable con +/- */}
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

              {/* Desglose */}
              {suggestedPrice > 0 && (
                <div className="enviar-pricing-breakdown">
                  {pricing[form.vehicleType]?.base_price != null && (
                    <span>Base: {Number(pricing[form.vehicleType].base_price).toLocaleString('es-PY')} Gs</span>
                  )}
                  {pricing[form.vehicleType]?.price_per_km != null && (routeDistanceMeters || distanceKm > 0) && (
                    <span> + {Number(pricing[form.vehicleType].price_per_km).toLocaleString('es-PY')} Gs/km × {routeDistanceMeters ? (routeDistanceMeters / 1000).toFixed(1) : distanceKm.toFixed(1)} km</span>
                  )}
                </div>
              )}

              {/* Separador */}
              <div className="enviar-pricing-divider" />

              {/* Método de pago */}
              <div className="enviar-pricing-label" style={{ marginBottom: 8 }}>
                <svg width="16" height="16" fill="none" stroke="#6366f1" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></svg>
                <span>Método de pago</span>
              </div>
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
            </div>

            {/* Instrucciones (colapsable) */}
            <div className="enviar-details-card" style={{ marginTop: '0.75rem' }}>
              <div className="enviar-field">
                <label className="enviar-field-label">Instrucciones especiales</label>
                <textarea className="enviar-field-textarea" placeholder="Indicaciones adicionales para el conductor..." value={form.instructions} onChange={e => update('instructions', e.target.value)} rows={2} />
              </div>
            </div>

            {/* Botones CTA */}
            <div className="enviar-cta-row">
              <Link href="/cliente" className="enviar-cta-cancel">
                Cancelar
              </Link>
              <button type="submit" className="enviar-cta-submit" disabled={sending || offerPrice <= 0}>
                {sending ? (
                  <span className="enviar-cta-loading">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="animate-spin">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  <>
                    Solicitar Envío · {offerPrice > 0 ? offerPrice.toLocaleString('es-PY') : '0'} Gs
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
