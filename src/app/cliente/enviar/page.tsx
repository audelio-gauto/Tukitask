
"use client";
// ...existing code...
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useClientContext } from '../context';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });

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
    // ...existing code...
  const { openDrawer } = useClientContext();
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Address search overlay state
  const [searchMode, setSearchMode] = useState<null | 'pickup' | 'delivery'>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Autocomplete suggestion state (Mapbox)
  const [pickupSuggestions, setPickupSuggestions] = useState<Array<any>>([]);
  const [deliverySuggestions, setDeliverySuggestions] = useState<Array<any>>([]);
  const pickupTimer = useRef<number | null>(null);
  const deliveryTimer = useRef<number | null>(null);
  const pickupAbort = useRef<AbortController | null>(null);
  const deliveryAbort = useRef<AbortController | null>(null);

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

  // Simple in-memory geocode/autocomplete cache (per session)
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const geoCache = useRef<Map<string, { ts: number; data: any }>>(new Map());

  const getCached = (key: string) => {
    const entry = geoCache.current.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) {
      geoCache.current.delete(key);
      return null;
    }
    return entry.data;
  };

  const setCached = (key: string, data: any) => {
    try {
      geoCache.current.set(key, { ts: Date.now(), data });
    } catch (err) {
      // ignore cache errors
    }
  };

  /** Fetch autocomplete suggestions via backend proxy — Mapbox only */
  function fetchProxyGeocode(query: string, signal?: AbortSignal) {
    const payload: any = { query, multi: true, limit: 6 };
    if (userLocation.current) {
      payload.proximity = { lat: userLocation.current.lat, lng: userLocation.current.lng };
    }
    return fetch('/api/maps/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          console.warn('[geocode]', data.error);
          return [];
        }
        if (data.results && Array.isArray(data.results)) {
          return data.results.map((r: any) => ({
            display_name: r.display_name,
            lat: r.lat,
            lon: r.lng,
            raw: r,
          }));
        }
        if (data.result) {
          return [{ display_name: data.result.display_name, lat: data.result.lat, lon: data.result.lng, raw: data.result }];
        }
        return [];
      });
  }

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

  // debounce pickupAddress
  useEffect(() => {
    const q = form.pickupAddress;
    if (pickupTimer.current) window.clearTimeout(pickupTimer.current);
    if (pickupAbort.current) pickupAbort.current.abort();
    if (!q || q.length < 3) {
      setPickupSuggestions([]);
      return;
    }
    pickupAbort.current = new AbortController();
    pickupTimer.current = window.setTimeout(() => {
      const cacheKey = `proxy:${q}`;
      const cached = getCached(cacheKey);
      if (cached) {
        setPickupSuggestions(cached);
        return;
      }
      fetchProxyGeocode(q, pickupAbort.current!.signal)
        .then((items) => {
          setCached(cacheKey, items);
          setPickupSuggestions(items);
        })
        .catch(() => setPickupSuggestions([]));
    }, 300);
    return () => {
      if (pickupTimer.current) window.clearTimeout(pickupTimer.current);
      if (pickupAbort.current) pickupAbort.current.abort();
    };
  }, [form.pickupAddress]);

  // debounce deliveryAddress
  useEffect(() => {
    const q = form.deliveryAddress;
    if (deliveryTimer.current) window.clearTimeout(deliveryTimer.current);
    if (deliveryAbort.current) deliveryAbort.current.abort();
    if (!q || q.length < 3) {
      setDeliverySuggestions([]);
      return;
    }
    deliveryAbort.current = new AbortController();
    deliveryTimer.current = window.setTimeout(() => {
      const cacheKey = `proxy:${q}`;
      const cached = getCached(cacheKey);
      if (cached) {
        setDeliverySuggestions(cached);
        return;
      }
      fetchProxyGeocode(q, deliveryAbort.current!.signal)
        .then((items) => {
          setCached(cacheKey, items);
          setDeliverySuggestions(items);
        })
        .catch(() => setDeliverySuggestions([]));
    }, 300);
    return () => {
      if (deliveryTimer.current) window.clearTimeout(deliveryTimer.current);
      if (deliveryAbort.current) deliveryAbort.current.abort();
    };
  }, [form.deliveryAddress]);

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

  // Focus search input when overlay opens
  useEffect(() => {
    if (searchMode && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchMode]);

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
            offer: form.offer,
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
        setSearchQuery('');
      },
      () => {}
    );
  };

  const openSearch = (mode: 'pickup' | 'delivery') => {
    setSearchMode(mode);
    setSearchQuery(mode === 'pickup' ? form.pickupAddress : form.deliveryAddress);
  };

  const selectSuggestion = (address: string) => {
    if (searchMode === 'pickup') {
      update('pickupAddress', address);
      const found = pickupSuggestions.find((it: any) => (it.display_name || it.name || it.label) === address);
      if (found) {
        update('pickupLat', String(found.lat ?? ''));
        update('pickupLng', String(found.lon ?? ''));
      }
    } else if (searchMode === 'delivery') {
      update('deliveryAddress', address);
      const found = deliverySuggestions.find((it: any) => (it.display_name || it.name || it.label) === address);
      if (found) {
        update('deliveryLat', String(found.lat ?? ''));
        update('deliveryLng', String(found.lon ?? ''));
      }
    }
    setSearchMode(null);
    setSearchQuery('');
  };

  const filteredSuggestions = searchQuery.length > 0
    ? (searchMode === 'pickup'
        ? pickupSuggestions.map((it: any) => it.display_name || it.name || it.label)
        : deliverySuggestions.map((it: any) => it.display_name || it.name || it.label)
      )
    : [];

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
            <button type="button" className="enviar-search-back" onClick={() => { setSearchMode(null); setSearchQuery(''); }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="enviar-search-input-wrap">
              <span className={`enviar-dot ${searchMode === 'pickup' ? 'green' : 'red'}`} />
              <input
                ref={searchInputRef}
                className="enviar-search-input"
                placeholder={searchMode === 'pickup' ? 'Punto de recogida' : '¿A dónde va el paquete?'}
                value={searchQuery}
                onChange={e => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  if (searchMode === 'pickup') update('pickupAddress', v);
                  else if (searchMode === 'delivery') update('deliveryAddress', v);
                }}
              />
              {searchQuery && (
                <button type="button" className="enviar-search-clear" onClick={() => setSearchQuery('')}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
          {/* GPS option */}
          <button type="button" className="enviar-search-gps" onClick={() => handleUseGPS(searchMode)}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
            <span>Usar mi ubicación actual</span>
          </button>
          {/* Suggestions */}
          <div className="enviar-search-suggestions">
            {filteredSuggestions.map((s, i) => (
              <button key={i} type="button" className="enviar-search-suggestion" onClick={() => selectSuggestion(s)}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span>{s}</span>
              </button>
            ))}
          </div>
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

            {/* ...se elimina sección de tipo de paquete... */}

            {/* Precio sugerido */}
            {suggestedPrice > 0 && (
              <div style={{ margin: '12px 0', padding: '14px 16px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderRadius: 14, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 500 }}>Precio sugerido</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>
                    {pricing[form.vehicleType]?.base_price != null && (<span>Base: {Number(pricing[form.vehicleType].base_price).toLocaleString('es-PY')} Gs</span>)}
                    {pricing[form.vehicleType]?.price_per_km != null && (routeDistanceMeters || distanceKm > 0) && (
                      <span> + {Number(pricing[form.vehicleType].price_per_km).toLocaleString('es-PY')} Gs/km × {routeDistanceMeters ? (routeDistanceMeters/1000).toFixed(1) : distanceKm.toFixed(1)} km</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>
                  {suggestedPrice.toLocaleString('es-PY')} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Gs</span>
                </div>
              </div>
            )}

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

            {/* Payment method */}
            <div className="enviar-section-label">Método de pago</div>
            <div className="enviar-payment-grid">
              {paymentMethods.map(pm => (
                <button
                  key={pm.value}
                  type="button"
                  className={`enviar-payment-btn ${form.paymentMethod === pm.value ? 'selected' : ''}`}
                  onClick={() => update('paymentMethod', pm.value)}
                >
                  <span>{pm.icon}</span> {pm.label}
                </button>
              ))}
            </div>

            {/* Instructions */}
            <div className="enviar-details-card" style={{ marginTop: '0.75rem' }}>
              <div className="enviar-field">
                <label className="enviar-field-label">Instrucciones especiales</label>
                <textarea className="enviar-field-textarea" placeholder="Indicaciones adicionales para el conductor..." value={form.instructions} onChange={e => update('instructions', e.target.value)} />
              </div>
              <div className="enviar-field" style={{ marginTop: '1rem' }}>
                <label className="enviar-field-label">Precio sugerido</label>
                <div style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>
                  {suggestedPrice > 0 ? `${suggestedPrice.toLocaleString('es-PY')} Gs` : 'Selecciona direcciones y vehículo'}
                </div>
              </div>
              <div className="enviar-field" style={{ marginTop: '0.5rem' }}>
                <label className="enviar-field-label">Tu oferta (opcional)</label>
                <input
                  type="number"
                  className="enviar-field-input"
                  placeholder={suggestedPrice > 0 ? String(suggestedPrice) : 'Ej: 95000'}
                  value={form.offer || ''}
                  onChange={e => update('offer', e.target.value)}
                  min="0"
                />
              </div>
            </div>

            {/* Submit buttons */}
            <div className="enviar-submit-row">
              <Link href="/cliente" className="enviar-cancel-btn">Cancelar</Link>
              <button type="submit" className="enviar-submit-btn" disabled={sending}>
                {sending ? 'Enviando...' : 'Solicitar Envío'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
