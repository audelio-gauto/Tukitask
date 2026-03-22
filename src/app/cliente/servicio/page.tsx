'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ServiceChatInput from '../components/ServiceChatInput';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useClientContext } from '../context';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });
const MapboxSearch = dynamic(() => import('../components/MapboxSearch'), { ssr: false });
const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false });

const CATEGORIES = [
  { key: 'aire_split', label: 'Tec Aire Split', icon: '❄️' },
  { key: 'electrico', label: 'Servicio Eléctrico', icon: '⚡' },
  { key: 'plomeria', label: 'Servicio Plomería', icon: '🔧' },
  { key: 'cerrajeria', label: 'Servicio Cerrajería', icon: '🔑' },
];

const paymentMethods = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
];

// Service pricing: fixed per category (no per-km)
const SERVICE_PRICES: Record<string, number> = {
  aire_split: 300000,
  electrico: 250000,
  plomeria: 200000,
  cerrajeria: 180000,
};

export default function SolicitarServicioPage() {
  const { openDrawer } = useClientContext();
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  // Location state (same pattern as enviar)
  const [locationAddress, setLocationAddress] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [pickerMode, setPickerMode] = useState(false);

  // Form fields
  const [category, setCategory] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [genderPreference, setGenderPreference] = useState('indiferente'); // 'mujer', 'hombre', 'indiferente'
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');

  // Pricing state
  const suggestedPrice = category ? (SERVICE_PRICES[category] || 200000) : 200000;
  const [offerPrice, setOfferPrice] = useState(0);
  const offerInitialized = useRef(false);
  useEffect(() => {
    if (suggestedPrice > 0 && !offerInitialized.current) {
      setOfferPrice(suggestedPrice);
      offerInitialized.current = true;
    }
  }, [suggestedPrice]);
  useEffect(() => {
    if (offerInitialized.current && suggestedPrice > 0) {
      setOfferPrice(suggestedPrice);
    }
  }, [suggestedPrice]);

  // Bottom sheet state
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
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
      startTranslate.current = getTranslateY();
      if (!sheet) return;
      sheet.style.transition = 'none';
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!isDragging.current) return;
      if (!sheet) return;
      const currentY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const delta = currentY - startY.current;
      const newTranslate = Math.max(0, startTranslate.current + delta);
      sheet.style.transform = `translateY(${newTranslate}px)`;
    }

    function onEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      if (!sheet) return;
      sheet.style.transition = '';
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

  const handlePhoto = async (fileList: FileList | null) => {
    if (!fileList) return;
    const urls: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      urls.push(URL.createObjectURL(fileList[i]));
    }
    setPhotos(prev => [...prev, ...urls]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const payload = {
      location: locationAddress,
      location_lat: locationLat,
      location_lng: locationLng,
      category,
      details,
      gender_preference: genderPreference,
      photos: photos.length,
      suggested_price: suggestedPrice,
      offer: offerPrice,
      payment_method: paymentMethod,
      audio: !!audioBlob,
      created_at: Date.now(),
    };
    try {
      localStorage.setItem('servicio_preview', JSON.stringify(payload));
      await new Promise(r => setTimeout(r, 800));
      setSuccess(true);
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

  if (success) {
    return (
      <div className="enviar-success-screen">
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>¡Solicitud enviada!</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem', maxWidth: 320 }}>Se registró tu solicitud. Te notificaremos cuando un técnico acepte.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/cliente" className="client-btn client-btn-primary">Volver al inicio</Link>
          <button className="client-btn" style={{ background: '#f1f5f9', color: '#374151' }} onClick={() => {
            setSuccess(false);
            setLocationAddress(''); setLocationLat(''); setLocationLng('');
            setCategory(null); setDetails(''); setPhotos([]);
            setGenderPreference('indiferente');
            setAudioBlob(null); setPaymentMethod('efectivo');
            offerInitialized.current = false;
          }}>Nueva Solicitud</button>
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
          <form id="servicio-form" onSubmit={handleSubmit}>
            {/* Ubicación */}
            <div className="enviar-address-section">
              <div className="enviar-address-row">
                <span className="enviar-dot green" />
                <input
                  className="enviar-address-input"
                  placeholder="Ubicación del servicio"
                  value={locationAddress}
                  onChange={e => setLocationAddress(e.target.value)}
                  onFocus={() => setSearchMode(true)}
                />
                <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); setPickerMode(true); }} aria-label="Seleccionar en mapa">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>
                </button>
              </div>
            </div>

            {/* Categoría — horizontal cards like vehicle type */}
            <div className="enviar-section-label">Tipo de servicio</div>
            <div className="enviar-type-scroll">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  className={`enviar-type-card ${category === cat.key ? 'selected' : ''}`}
                  onClick={() => setCategory(cat.key)}
                >
                  <span className="enviar-type-icon">{cat.icon}</span>
                  <span className="enviar-type-label">{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Detalles del problema */}
            <div className="enviar-section-label">¿Qué necesitás en tu casa?</div>
            <div style={{ marginBottom: 16 }}>
              <ServiceChatInput
                placeholder="Ej: limpiar casa hoy, reparar aire acondicionado..."
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

            {/* Preferencia de género */}
            <div className="enviar-section-label">Preferís que vaya:</div>
            <div className="gender-preference-pills">
              {[
                { key: 'mujer', label: 'Solo mujer', icon: '👩' },
                { key: 'hombre', label: 'Solo hombre', icon: '👨' },
                { key: 'indiferente', label: 'Indiferente', icon: '🧑‍🔧' },
              ].map(pref => (
                <button
                  key={pref.key}
                  type="button"
                  className={`gender-pill ${genderPreference === pref.key ? 'selected' : ''}`}
                  onClick={() => setGenderPreference(pref.key)}
                >
                  <span className="gender-pill-icon">{pref.icon}</span>
                  <span>{pref.label}</span>
                </button>
              ))}
            </div>

            {/* Fotos */}
            <div className="enviar-section-label">Fotos del problema</div>
            <div className="enviar-details-card">
              <input type="file" accept="image/*" multiple onChange={e => handlePhoto(e.target.files)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />)}
              </div>
            </div>

            {/* Spacer for fixed bottom bar */}
            {locationLat && locationLng && category && (
              <div style={{ height: 220 }} />
            )}
          </form>
        </div>
      </div>

      {/* ── Fixed bottom bar: Precio + Pago + CTA (same Bolt-style as enviar) ── */}
      {locationLat && locationLng && category && (
      <div className="enviar-fixed-bottom">
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

        {/* Método de pago */}
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

        {/* CTA */}
        <div className="enviar-cta-row">
          <Link href="/cliente" className="enviar-cta-cancel">Cancelar</Link>
          <button type="submit" form="servicio-form" className="enviar-cta-submit" disabled={sending || offerPrice <= 0}>
            {sending ? (
              <span className="enviar-cta-loading">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="animate-spin">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
                Enviando...
              </span>
            ) : (
              <>Solicitar Servicio · {offerPrice > 0 ? offerPrice.toLocaleString('es-PY') : '0'} Gs</>
            )}
          </button>
        </div>
      </div>
      )}
    </>
  );
}
