'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useClientContext } from '../context';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });

const vehicleTypes = [
  { value: 'moto', label: 'Moto', sub: 'Paquetes chicos', icon: '🏍️' },
  { value: 'auto', label: 'Auto', sub: 'Más capacidad', icon: '🚗' },
  { value: 'motocarro', label: 'Moto carro', sub: 'Envíos rápidos', icon: '🛵' },
  { value: 'camion2t', label: 'Camión 2T', sub: 'Carga media', icon: '🚛' },
  { value: 'camionft', label: 'Camión FT', sub: 'Carga pesada', icon: '🚚' },
];

const packageTypes = [
  { value: 'pequeno', label: 'Pequeño', sub: 'Hasta 5 kg', icon: '📦', color: '#10b981' },
  { value: 'documento', label: 'Documento', sub: 'Sobre / Carta', icon: '📄', color: '#3B82F6' },
  { value: 'mediano', label: 'Mediano', sub: '5 - 15 kg', icon: '📦', color: '#f59e0b' },
  { value: 'grande', label: 'Grande', sub: '15+ 30 kg', icon: '📦', color: '#8B5CF6' },
  { value: 'fragil', label: 'Frágil', sub: 'Paquete especial', icon: '⚠️', color: '#ef4444' },
];

const paymentMethods = [
  { value: 'prometido', label: 'Prometido', icon: '💰' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
];

// Mock suggestions for address autocomplete
const mockSuggestions = [
  'Avda. Santísima Trinidad esq. Brasilia',
  'Avda. Mariscal López c/ Cruz del Chaco',
  'Avda. España c/ Estados Unidos',
  'Avda. Eusebio Ayala esq. Sdor. Long',
  'Calle Palma esq. 15 de Agosto',
  'Avda. Sacramento c/ Stma. Trinidad',
  'Avda. San Martín c/ Río de Janeiro',
  'Ruta Mcal. Estigarribia km 10',
];

export default function EnviarPaquetePage() {
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
    packageType: 'pequeno',
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
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    await new Promise(r => setTimeout(r, 1500));
    setSending(false);
    setSuccess(true);
  };

  const handleUseGPS = (field: 'pickup' | 'delivery') => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        update(field === 'pickup' ? 'pickupAddress' : 'deliveryAddress', coords);
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
    if (searchMode === 'pickup') update('pickupAddress', address);
    else if (searchMode === 'delivery') update('deliveryAddress', address);
    setSearchMode(null);
    setSearchQuery('');
  };

  const filteredSuggestions = searchQuery.length > 0
    ? mockSuggestions.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
    : mockSuggestions;

  if (success) {
    return (
      <div className="enviar-success-screen">
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>¡Envío registrado!</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem', maxWidth: 320 }}>Tu solicitud se ha creado correctamente. Te notificaremos cuando un conductor acepte tu envío.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/cliente/mis-envios" className="client-btn client-btn-primary">Ver Mis Envíos</Link>
          <button className="client-btn" style={{ background: '#f1f5f9', color: '#374151' }} onClick={() => { setSuccess(false); setForm({ pickupAddress: '', deliveryAddress: '', vehicleType: 'moto', packageType: 'pequeno', senderContact: '', senderPhone: '', senderAddress: '', senderRef: '', receiverContact: '', receiverPhone: '', receiverAddress: '', description: '', instructions: '', paymentMethod: 'prometido' }); }}>
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
        <ClientMap />
      </div>

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
        <div className="enviar-search-overlay">
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
                onChange={e => setSearchQuery(e.target.value)}
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
            {/* Address inputs — tap to open fullscreen search */}
            <div className="enviar-address-section">
              <div className="enviar-address-row" onClick={() => openSearch('pickup')}>
                <span className="enviar-dot green" />
                <input
                  className="enviar-address-input"
                  placeholder="Punto de recogida"
                  value={form.pickupAddress}
                  readOnly
                />
                <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); handleUseGPS('pickup'); }} aria-label="Usar GPS">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
                </button>
              </div>
              <div className="enviar-address-divider" />
              <div className="enviar-address-row" onClick={() => openSearch('delivery')}>
                <span className="enviar-dot red" />
                <input
                  className="enviar-address-input"
                  placeholder="¿A dónde va el paquete?"
                  value={form.deliveryAddress}
                  readOnly
                />
                <button type="button" className="enviar-gps-btn" onClick={(e) => { e.stopPropagation(); handleUseGPS('delivery'); }} aria-label="Usar GPS">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" /></svg>
                </button>
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

            {/* Package type — horizontal swipeable */}
            <div className="enviar-section-label">Tipo de paquete</div>
            <div className="enviar-type-scroll">
              {packageTypes.map(p => (
                <button
                  key={p.value}
                  type="button"
                  className={`enviar-type-card ${form.packageType === p.value ? 'selected' : ''}`}
                  onClick={() => update('packageType', p.value)}
                  style={{ '--card-accent': p.color } as React.CSSProperties}
                >
                  <span className="enviar-type-icon">{p.icon}</span>
                  <span className="enviar-type-label">{p.label}</span>
                  <span className="enviar-type-sub">{p.sub}</span>
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
