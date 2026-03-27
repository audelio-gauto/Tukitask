'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ServiceChatInput from '../components/ServiceChatInput';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useClientContext } from '../context';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });
const MapboxSearch = dynamic(() => import('../components/MapboxSearch'), { ssr: false });
const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false });

const CATEGORIES_MUJER = [
  { key: 'limpieza',         label: 'Limpieza',           icon: '🧹' },
  { key: 'niera',            label: 'Niñera',             icon: '👶' },
  { key: 'cocina',           label: 'Cocina',             icon: '🍳' },
  { key: 'eventos',          label: 'Eventos',            icon: '🎉' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'otros',            label: 'Otros',              icon: '✨' },
];

const CATEGORIES_HOMBRE = [
  { key: 'aire_split',       label: 'Tec Aire Split',     icon: '❄️' },
  { key: 'electrico',        label: 'Servicio Eléctrico', icon: '⚡' },
  { key: 'plomeria',         label: 'Servicio Plomería',  icon: '🔧' },
  { key: 'cerrajeria',       label: 'Servicio Cerrajería',icon: '🔑' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'otros',            label: 'Otros',              icon: '✨' },
];

function getCategoriesForGender(gender: string) {
  if (gender === 'mujer')  return CATEGORIES_MUJER;
  if (gender === 'hombre') return CATEGORIES_HOMBRE;
  // indiferente: combined unique by key
  const seen = new Set<string>();
  return [...CATEGORIES_MUJER, ...CATEGORIES_HOMBRE].filter(c => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
}

const paymentMethods = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
];

// Service pricing: loaded from admin config (service_pricing table)
// Falls back to empty object — when no suggested_price, client enters their own price
const EMPTY_PRICES: Record<string, number | null> = {};

export default function SolicitarServicioPage() {
  const { openDrawer, email, displayName } = useClientContext();
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Service pricing from admin panel
  const [servicePrices, setServicePrices] = useState<Record<string, number | null>>(EMPTY_PRICES);
  useEffect(() => {
    fetch('/api/service-pricing')
      .then(r => r.json())
      .then(d => { if (d.pricing) setServicePrices(d.pricing); })
      .catch(() => {});
  }, []);

  // Location state (same pattern as enviar)
  const [locationAddress, setLocationAddress] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [pickerMode, setPickerMode] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  // Auto-detect client location on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocationLat(lat.toFixed(6));
        setLocationLng(lng.toFixed(6));
        try {
          const res = await fetch('/api/maps/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reverse: true, lat, lng }),
          });
          const data = await res.json();
          setLocationAddress(data.result?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } catch {
          setLocationAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
        setLocationLoading(false);
      },
      () => setLocationLoading(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // Form fields
  const [category, setCategory] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [genderPreference, setGenderPreference] = useState('indiferente'); // 'mujer', 'hombre', 'indiferente'
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');

  // Pricing state — driven by admin-configured suggested_price (null = client sets own)
  const suggestedPrice = category != null
    ? (servicePrices[category] ?? null)
    : null;
  const [offerPrice, setOfferPrice] = useState(0);
  // Sync whenever suggestedPrice changes (category switch or pricing data loads from API)
  useEffect(() => {
    setOfferPrice(suggestedPrice ?? 0);
  }, [suggestedPrice]);

  // Step wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Bottom sheet state
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const startTranslate = useRef(0);

  const isDesktop = useCallback(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches, []);

  const getTranslateY = useCallback(() => {
    if (!sheetRef.current) return 0;
    const st = window.getComputedStyle(sheetRef.current);
    try {
      const matrix = new DOMMatrix(st.transform);
      return matrix.m42;
    } catch {
      return 0;
    }
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
      startY.current = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      startX.current = 0;
      startTranslate.current = getTranslateY();
      if (!sheet) return;
      sheet.style.transition = 'none';
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!isDragging.current) return;
      if (!sheet) return;
      const currentY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      // Block if horizontal swipe is dominant
      if (!startX.current) startX.current = currentX;
      const deltaX = Math.abs(currentX - startX.current);
      const deltaY = Math.abs(currentY - startY.current);
      if (deltaX > deltaY + 5) { isDragging.current = false; return; }
      if (e.cancelable) e.preventDefault();
      const delta = currentY - startY.current;
      const maxTranslate = sheet.offsetHeight * 0.8;
      const newTranslate = Math.min(maxTranslate, Math.max(0, startTranslate.current + delta));
      sheet.style.transform = `translateY(${newTranslate}px)`;
    }

    function onEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      startX.current = 0;
      if (!sheet) return;
      sheet.style.transition = '';
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

  const handlePhoto = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setPhotosUploading(true);
    const uploaded: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/upload-service-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: file.type }),
        });
        const json = await res.json();
        if (json.url) uploaded.push(json.url);
      } catch {
        // skip failed uploads silently
      }
    }
    setPhotos(prev => [...prev, ...uploaded]);
    setPhotosUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    setSending(true);
    setSubmitError('');
    try {
      // Upload audio if present
      let audioUrl: string | undefined;
      if (audioBlob) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
        const safeName = `${Date.now()}_${(email || 'anon').replace(/[^a-z0-9]/gi, '_')}.${ext}`;
        const upRes = await fetch('/api/upload-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: audioBlob.type, fileName: safeName }),
        });
        const upJson = await upRes.json();
        if (upRes.ok && upJson.url) audioUrl = upJson.url;
      }

      const res = await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:         'create',
          service_type:   category,
          service_gender: genderPreference,
          client_email:   email,
          client_name:    displayName || email.split('@')[0] || null,
          address:        locationAddress || null,
          lat:            locationLat   ? Number(locationLat)  : null,
          lng:            locationLng   ? Number(locationLng)  : null,
          description:    details       || null,
          price:          offerPrice,
          payment_method: paymentMethod,
          photos:         photos.length > 0 ? photos : undefined,
          audio_url:      audioUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error al enviar');
      setSuccess(true);
    } catch (err) {
      setSubmitError((err as Error).message || 'Error al enviar la solicitud');
    } finally {
      setSending(false);
    }
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setLocationAddress(`${lat}, ${lng}`);
        setLocationLat(lat);
        setLocationLng(lng);
        setSearchMode(false);
      },
      () => {},
    );
  };

  const router = useRouter();

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => router.push('/cliente/mis-servicios'), 2500);
    return () => clearTimeout(t);
  }, [success, router]);

  if (success) {
    return (
      <div className="enviar-success-screen">
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>¡Solicitud enviada!</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem', maxWidth: 320 }}>Se registró tu solicitud. Te notificaremos cuando un técnico acepte.</p>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '2rem' }}>Redirigiendo a Mis Servicios…</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/cliente/mis-servicios" className="client-btn client-btn-primary">Ver mis servicios →</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Full screen map */}
      <div className="enviar-map">
        <ClientMap
          pickup={locationLat && locationLng ? { lat: Number(locationLat), lng: Number(locationLng) } : undefined}
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
            <button type="button" className="enviar-search-back" onClick={() => setSearchMode(false)}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="enviar-dot green" style={{ marginLeft: 8 }} />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginLeft: 8 }}>
              Ubicación del servicio
            </span>
          </div>
          <div style={{ padding: '12px 16px 0' }}>
            <MapboxSearch
              placeholder="Buscar ubicación..."
              value={locationAddress}
              onSelect={(name: string, lat: number, lng: number) => {
                setLocationAddress(name);
                setLocationLat(String(lat));
                setLocationLng(String(lng));
                setSearchMode(false);
              }}
            />
          </div>
          <button type="button" className="enviar-search-gps" onClick={handleUseGPS}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
            <span>Usar mi ubicación actual</span>
          </button>
          <button type="button" className="enviar-search-gps" onClick={() => { setSearchMode(false); setPickerMode(true); }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
            <span>Seleccionar en el mapa</span>
          </button>
        </div>
      )}

      {/* Location Picker (Uber/Bolt style) */}
      {pickerMode && (
        <LocationPicker
          mode="pickup"
          initialCenter={
            locationLat && locationLng
              ? { lat: Number(locationLat), lng: Number(locationLng) }
              : null
          }
          onConfirm={(address, lat, lng) => {
            setLocationAddress(address);
            setLocationLat(String(lat));
            setLocationLng(String(lng));
            setPickerMode(false);
          }}
          onClose={() => setPickerMode(false)}
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

          <form id="servicio-form" onSubmit={handleSubmit}>

            {/* ── STEP 1: UBICACIÓN ── */}
            {step === 1 && (
              <>
                <div className="enviar-step-title">
                  <span className="enviar-step-title-icon">📍</span>
                  <div>
                    <div className="enviar-step-title-main">¿Dónde necesitás el servicio?</div>
                    <div className="enviar-step-title-sub">Ingresá la dirección o usá tu ubicación</div>
                  </div>
                </div>

                <div className="enviar-address-section">
                  <div className="enviar-address-row">
                    <span className="enviar-dot green" />
                    <input
                      className="enviar-address-input"
                      placeholder={locationLoading ? 'Detectando ubicación…' : 'Dirección del servicio'}
                      value={locationAddress}
                      onChange={e => setLocationAddress(e.target.value)}
                      onFocus={() => setSearchMode(true)}
                      readOnly={locationLoading}
                    />
                    <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); setPickerMode(true); }} aria-label="Seleccionar en mapa">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                    </button>
                  </div>
                </div>

                {locationAddress && locationLat && (
                  <div className="enviar-route-info">
                    <div className="enviar-route-stat">
                      <span className="enviar-route-icon" style={{ background: '#10b981' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                      </span>
                      <span style={{ fontSize: '0.82rem', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locationAddress.split(',').slice(0, 2).join(',')}</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="enviar-next-btn"
                  disabled={!locationLat}
                  onClick={() => { setStep(2); setSheet('full'); }}
                >
                  Continuar
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </>
            )}

            {/* ── STEP 2: TIPO DE SERVICIO ── */}
            {step === 2 && (
              <>
                <div className="enviar-step-title">
                  <span className="enviar-step-title-icon">🛠️</span>
                  <div>
                    <div className="enviar-step-title-main">¿Qué tipo de servicio?</div>
                    <div className="enviar-step-title-sub">Elegí quién y qué necesitás</div>
                  </div>
                </div>

                {/* Gender preference cards */}
                <div className="servicio-gender-grid">
                  {[
                    { key: 'mujer',       label: 'Mujer',        avatar: '👩', sub: 'Limpieza, niñera, cocina...' },
                    { key: 'hombre',      label: 'Hombre',       avatar: '👨', sub: 'Técnicos, plomeros...' },
                    { key: 'indiferente', label: 'Sin preferencia', avatar: '🧑', sub: 'Cualquier técnico' },
                  ].map(pref => (
                    <button
                      key={pref.key}
                      type="button"
                      className={`servicio-gender-card ${genderPreference === pref.key ? 'selected' : ''}`}
                      onClick={() => {
                        setGenderPreference(pref.key);
                        if (category) {
                          const newCats = getCategoriesForGender(pref.key);
                          if (!newCats.find(c => c.key === category)) setCategory(null);
                        }
                      }}
                    >
                      <span className="servicio-gender-emoji">{pref.avatar}</span>
                      <span className="servicio-gender-name">{pref.label}</span>
                      <span className="servicio-gender-sub">{pref.sub}</span>
                      {genderPreference === pref.key && (
                        <span className="enviar-vehicle-check" style={{ top: 6, right: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Category grid */}
                <div className="servicio-section-label">Categoría</div>
                <div className="enviar-vehicle-grid">
                  {getCategoriesForGender(genderPreference).map(cat => (
                    <button
                      key={cat.key}
                      type="button"
                      className={`enviar-vehicle-card ${category === cat.key ? 'selected' : ''}`}
                      onClick={() => setCategory(cat.key)}
                    >
                      <span className="enviar-vehicle-icon">{cat.icon}</span>
                      <div className="enviar-vehicle-info">
                        <span className="enviar-vehicle-name">{cat.label}</span>
                        {servicePrices[cat.key] != null && (servicePrices[cat.key] as number) > 0 && (
                          <span className="enviar-vehicle-sub">Desde {(servicePrices[cat.key] as number).toLocaleString('es-PY')} Gs</span>
                        )}
                      </div>
                      {category === cat.key && (
                        <span className="enviar-vehicle-check">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="enviar-step-actions">
                  <button type="button" className="enviar-back-btn" onClick={() => { setStep(1); setSheet('half'); }}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <button
                    type="button"
                    className="enviar-next-btn"
                    disabled={!category}
                    onClick={() => setStep(3)}
                    style={{ flex: 1 }}
                  >
                    Continuar
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 3: DETALLES + PRECIO + SUBMIT ── */}
            {step === 3 && (
              <>
                <div className="enviar-step-title">
                  <span className="enviar-step-title-icon">📋</span>
                  <div>
                    <div className="enviar-step-title-main">Descripción y oferta</div>
                    <div className="enviar-step-title-sub">Contanos qué necesitás y cuánto pagás</div>
                  </div>
                </div>

                {/* Summary row */}
                <div className="servicio-summary-row">
                  <div className="servicio-summary-col">
                    <span className="servicio-summary-icon">📍</span>
                    <span className="servicio-summary-text">{locationAddress.split(',')[0]}</span>
                  </div>
                  <div className="servicio-summary-divider" />
                  <div className="servicio-summary-col">
                    <span className="servicio-summary-icon">
                      {getCategoriesForGender(genderPreference).find(c => c.key === category)?.icon}
                    </span>
                    <span className="servicio-summary-text">
                      {getCategoriesForGender(genderPreference).find(c => c.key === category)?.label}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div className="enviar-contact-card" style={{ marginBottom: '0.75rem' }}>
                  <div className="enviar-contact-header" style={{ marginBottom: '0.5rem' }}>Describí el problema</div>
                  <ServiceChatInput
                    placeholder="Ej: reparar aire acondicionado, limpiar casa 3 habitaciones..."
                    value={details}
                    onChange={setDetails}
                    onSend={(val) => {
                      if (typeof val === 'string') {
                        setDetails(val);
                        setAudioBlob(null);
                      } else {
                        setAudioBlob(val);
                        setDetails('');
                      }
                    }}
                    audioUrl={audioBlob ? URL.createObjectURL(audioBlob) : null}
                    onAudioDelete={() => setAudioBlob(null)}
                    disabled={sending}
                    isSimpleInput={true}
                  />
                </div>

                {/* Photos */}
                <div className="enviar-contact-card" style={{ marginBottom: '0.75rem', background: '#fafafa' }}>
                  <div className="enviar-contact-header" style={{ marginBottom: '0.5rem' }}>
                    Fotos del problema <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af', fontSize: '0.72rem' }}>(opcional)</span>
                  </div>
                  <div className="photo-upload-area" style={{ marginBottom: 0 }}>
                    <input
                      id="photo-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={e => handlePhoto(e.target.files)}
                      className="photo-upload-hidden"
                    />
                    {photos.length === 0 ? (
                      <label htmlFor="photo-upload" className="photo-upload-placeholder" style={{ padding: '12px 0' }}>
                        {photosUploading ? (
                          <span style={{ color: '#F5C518', fontSize: '0.85rem', fontWeight: 600 }}>Subiendo...</span>
                        ) : (
                          <>
                            <svg width="28" height="28" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="3" />
                              <circle cx="8.5" cy="8.5" r="1.5" fill="#9ca3af" stroke="none" />
                              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                            </svg>
                            <span className="photo-upload-text">Agregar fotos</span>
                          </>
                        )}
                      </label>
                    ) : (
                      <div className="photo-grid">
                        {photos.map((p, i) => (
                          <div key={i} className="photo-thumb">
                            <img src={p} alt="" />
                            <button
                              type="button"
                              className="photo-thumb-delete"
                              onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                            >
                              <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                  ))}
                  {!photosUploading && (
                    <label htmlFor="photo-upload" className="photo-add-btn">
                      <svg width="28" height="28" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </label>
                      )}
                      {!photosUploading && (
                        <label htmlFor="photo-upload" className="photo-add-btn">
                          <svg width="28" height="28" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </label>
                      )}
                      {photosUploading && (
                        <div className="photo-add-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#F5C518', fontSize: '0.75rem', fontWeight: 600 }}>...</span>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                </div>

                {/* Price section */}
                <div className="enviar-price-section">
                  <div className="enviar-price-label">
                    Tu oferta al técnico
                    {suggestedPrice != null && suggestedPrice > 0 && (
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
                      className={`enviar-pay-pill ${paymentMethod === pm.value ? 'active' : ''}`}
                      onClick={() => setPaymentMethod(pm.value)}
                    >
                      <span className="enviar-pay-pill-icon">{pm.icon}</span>
                      <span>{pm.label}</span>
                    </button>
                  ))}
                </div>

                {submitError && (
                  <div style={{ margin: '4px 0 8px', padding: '8px 12px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    ⚠️ {submitError}
                  </div>
                )}

                <div className="enviar-step-actions">
                  <button type="button" className="enviar-back-btn" onClick={() => setStep(2)}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <button
                    type="submit"
                    form="servicio-form"
                    className="enviar-submit-final"
                    disabled={sending || !category || offerPrice <= 0}
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
