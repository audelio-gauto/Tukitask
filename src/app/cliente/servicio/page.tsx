'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ServiceChatInput from '../components/ServiceChatInput';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useClientContext } from '../context';

const ClientMap = dynamic(() => import('../components/ClientMap'), { ssr: false });

const CATEGORIES = [
  { key: 'aire_split', label: 'Tec Aire Split' },
  { key: 'electrico', label: 'Servicio Eléctrico' },
  { key: 'plomeria', label: 'Servicio Plomería' },
  { key: 'cerrajeria', label: 'Servicio Cerrajería' },
];

export default function SolicitarServicioPage() {
  const { openDrawer } = useClientContext();
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [suggestedPrice, setSuggestedPrice] = useState(300000);
  const [offer, setOffer] = useState('280000');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  // audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Bottom sheet state (reuse enviar behaviour)
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startTranslate = useRef(0);

  const isDesktop = useCallback(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches, []);

  const getTranslateY = useCallback(() => {
    if (!sheetRef.current) return 0;
    const st = window.getComputedStyle(sheetRef.current);
    // in some browsers transform may be 'none'
    try {
      const matrix = new DOMMatrix(st.transform);
      return matrix.m42;
    } catch (e) {
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
      sheet.style.transition = 'none';
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!isDragging.current) return;
      const currentY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const delta = currentY - startY.current;
      const newTranslate = Math.max(0, startTranslate.current + delta);
      sheet.style.transform = `translateY(${newTranslate}px)`;
    }

    function onEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
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

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleUseGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocation(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
    });
  };

  const handlePhoto = async (fileList: FileList | null) => {
    if (!fileList) return;
    const urls: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const url = URL.createObjectURL(f);
      urls.push(url);
    }
    setPhotos(prev => [...prev, ...urls]);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };
      mr.start();
      setRecording(true);
    } catch (e) {
      console.warn('No microphone', e);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // simple local persistence for preview
    const payload = { location, category, details, photos, suggestedPrice, offer: Number(offer), audio: !!audioUrl, created_at: Date.now() };
    try {
      localStorage.setItem('servicio_preview', JSON.stringify(payload));
      await new Promise(r => setTimeout(r, 800));
      setSuccess(true);
    } finally {
      setSending(false);
    }
  };

  if (success) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2>Solicitud enviada</h2>
        <p>Se registró tu solicitud. Te notificaremos cuando un técnico ofrezca.</p>
        <div style={{ marginTop: 12 }}>
          <Link href="/cliente" className="client-btn client-btn-primary">Volver al inicio</Link>
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

      {/* Bottom Sheet */}
      <div ref={sheetRef} className={`enviar-sheet ${sheetState}`}>
        <div className="enviar-sheet-handle"><span className="enviar-sheet-bar" /></div>
        <div className="enviar-sheet-content">
          <form onSubmit={handleSubmit}>
            {/* Sección: Ubicación */}
            <div className="enviar-section-label">Ubicación del problema</div>
            <div className="enviar-details-card" style={{ padding: 0, background: 'transparent', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '8px 12px', width: '100%' }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: 8, color: '#2563eb', cursor: 'pointer' }} onClick={handleUseGPS}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4m0 12v4m10-10h-4M6 12H2" strokeWidth={2} strokeLinecap="round" />
                </svg>
                <input
                  className="service-location-input"
                  placeholder="Ej: Avda. España 1234, Asunción"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  required
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', padding: '0' }}
                />
              </div>
            </div>

            {/* Sección: Categoría */}
            <div className="enviar-section-label">Categoría del servicio</div>
            <div className="enviar-details-card">
              <select
                className="enviar-field-input"
                value={category || ''}
                onChange={e => setCategory(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona una categoría</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Sección: Detalles tipo WhatsApp */}
            <div className="enviar-section-label">Detalles del problema</div>
            <div style={{ marginBottom: 16 }}>
              <ServiceChatInput
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
              />
            </div>

            {/* Sección: Fotos */}
            <div className="enviar-section-label">Fotos del problema</div>
            <div className="enviar-details-card">
              <input type="file" accept="image/*" multiple onChange={e => handlePhoto(e.target.files)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {photos.map((p, i) => <img key={i} src={p} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />)}
              </div>
            </div>

            {/* Sección: Precio y oferta */}
            <div className="enviar-section-label">Precio sugerido y tu oferta</div>
            <div className="enviar-details-card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label className="tuki-form-label">Precio sugerido</label>
                <div style={{ fontWeight: 700 }}>{suggestedPrice.toLocaleString()} Gs</div>
              </div>
              <div style={{ flex: 1 }}>
                <label className="tuki-form-label">Tu oferta</label>
                <input className="enviar-field-input" value={offer} onChange={e => setOffer(e.target.value)} />
              </div>
            </div>

            {/* Botones */}
            <div className="enviar-submit-row">
              <Link href="/cliente" className="enviar-cancel-btn">Cancelar</Link>
              <button className="enviar-submit-btn" type="submit" disabled={sending}>{sending ? 'Enviando...' : 'Enviar solicitud'}</button>
              <button type="button" className="tuki-btn" onClick={() => { setLocation(''); setCategory(null); setDetails(''); setPhotos([]); setAudioUrl(null); setOffer('280000'); }}>Limpiar</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
