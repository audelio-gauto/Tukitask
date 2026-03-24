'use client';
import { useState, useEffect, useRef } from 'react';
import { useDriverContext } from '../../driver/context';
import DriverScreenLayout from '../../driver/components/DriverScreenLayout';

export default function TecnicoSettings() {
  const { email, displayName, profilePhoto: ctxPhoto, setProfilePhoto: setCtxPhoto } = useDriverContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // basic flags
  const [gender, setGender] = useState<'hombre' | 'mujer' | ''>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);

  // extended fields (mirror driver settings)
  const [themeMode, setThemeMode] = useState('light');
  const [transportMode, setTransportMode] = useState('moto');
  const [vehicleType, setVehicleType] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [navApp, setNavApp] = useState('google_maps');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupRange, setPickupRange] = useState('');
  const [acceptsPackages, setAcceptsPackages] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(ctxPhoto || '');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!email) return;
        const res = await fetch(`/api/tecnico/settings?email=${encodeURIComponent(email)}`);
        const json = await res.json();
        if (json?.settings) {
          const s = json.settings;
          setGender(s.gender || '');
          // try populate extended fields if present
          setThemeMode(s.theme_mode || 'light');
          setTransportMode(s.transport_mode || 'moto');
          setVehicleType(s.vehicle_type || '');
          setLicensePlate(s.license_plate || '');
          setNavApp(s.nav_app || 'google_maps');
          setFirstName(s.first_name || '');
          setLastName(s.last_name || '');
          setCompany(s.company || '');
          setAddress(s.address || '');
          setCity(s.city || '');
          setPhone(s.phone || '');
          setPickupRange(s.pickup_range ?? '');
          setAcceptsPackages(Boolean(s.accepts_packages));
          setProfilePhoto(s.profile_photo || ctxPhoto || '');
          return;
        }
        // If API returns no settings, fallthrough to localStorage
      } catch (e) {
        // API failed (likely table not created) -> enable local mode
        setLocalMode(true);
      }

      // Try load from localStorage as fallback for preview
      try {
        const raw = localStorage.getItem('tecnico_settings_preview');
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj.gender) setGender(obj.gender as 'hombre' | 'mujer');
          if (obj.themeMode) setThemeMode(obj.themeMode);
          if (obj.transportMode) setTransportMode(obj.transportMode);
          if (obj.vehicleType) setVehicleType(obj.vehicleType);
          if (obj.licensePlate) setLicensePlate(obj.licensePlate);
          if (obj.navApp) setNavApp(obj.navApp);
          if (obj.firstName) setFirstName(obj.firstName);
          if (obj.lastName) setLastName(obj.lastName);
          if (obj.company) setCompany(obj.company);
          if (obj.address) setAddress(obj.address);
          if (obj.city) setCity(obj.city);
          if (obj.phone) setPhone(obj.phone);
          if (obj.pickupRange) setPickupRange(obj.pickupRange);
          if (obj.acceptsPackages !== undefined) setAcceptsPackages(obj.acceptsPackages);
          if (obj.profilePhoto) setProfilePhoto(obj.profilePhoto);
          setLocalMode(true);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender) { setError('Debés seleccionar si sos Hombre o Mujer.'); return; }
    if (!firstName.trim()) { setError('El Nombre es obligatorio.'); return; }
    if (!lastName.trim()) { setError('El Apellido es obligatorio.'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try {
      const payload = {
        email,
        gender,
        // extended
        theme_mode: themeMode,
        transport_mode: transportMode,
        vehicle_type: vehicleType,
        license_plate: licensePlate,
        nav_app: navApp,
        first_name: firstName,
        last_name: lastName,
        company,
        address,
        city,
        phone,
        pickup_range: pickupRange ? parseFloat(String(pickupRange)) : null,
        accepts_packages: acceptsPackages,
        profile_photo: profilePhoto,
      };
      try {
        const res = await fetch('/api/tecnico/settings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json?.error) throw new Error(json.error);
        setSuccess('Configuración guardada en servidor.');
      } catch (apiErr) {
        // Fallback: save locally for preview if API/table not available
        try {
          localStorage.setItem('tecnico_settings_preview', JSON.stringify({
            gender,
            themeMode,
            transportMode,
            vehicleType,
            licensePlate,
            navApp,
            firstName,
            lastName,
            company,
            address,
            city,
            phone,
            pickupRange,
            acceptsPackages,
            profilePhoto,
          }));
          setLocalMode(true);
          setSuccess('Configuración guardada localmente (tabla no creada).');
        } catch (e) {
          throw apiErr;
        }
      }
    } catch (err) {
      setError('Error al guardar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DriverScreenLayout title="Configuración">
      <form onSubmit={handleSave} className="flex flex-col gap-4" style={{ paddingBottom: '3rem' }}>

        {/* ── Soy ── */}
        <h2 className="tuki-heading" style={{ fontSize: '1.05rem' }}>Soy <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {(['hombre', 'mujer'] as const).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              style={{
                flex: 1,
                padding: '0.85rem',
                borderRadius: 14,
                border: gender === g ? '2px solid #6366f1' : '2px solid #e5e7eb',
                background: gender === g ? '#6366f1' : 'transparent',
                color: gender === g ? '#fff' : 'inherit',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: '1.4rem' }}>{g === 'hombre' ? '\uD83D\uDC68' : '\uD83D\uDC69'}</span>
              <span>{g === 'hombre' ? 'Hombre' : 'Mujer'}</span>
            </button>
          ))}
        </div>
        <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: -8, minHeight: '1.1rem' }}>
          {!gender ? 'Selección obligatoria' : ''}
        </p>

        <h2 className="tuki-heading" style={{ fontSize: '1.05rem' }}>Apariencia</h2>
        <label className="tuki-form-label">Tema</label>
        <select value={themeMode} onChange={e => setThemeMode(e.target.value)} className="tuki-form-input">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>

        <h2 className="tuki-heading" style={{ fontSize: '1.05rem' }}>Transporte / App</h2>
        <label className="tuki-form-label">APP de navegación</label>
        <select value={navApp} onChange={e => setNavApp(e.target.value)} className="tuki-form-input">
          <option value="google_maps">Google Maps</option>
          <option value="waze">Waze</option>
        </select>

        <h2 className="tuki-heading" style={{ fontSize: '1.05rem' }}>Datos de Contacto</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 80, height: 80, borderRadius: '50%', backgroundColor: '#e5e7eb',
              backgroundImage: profilePhoto ? `url(${profilePhoto})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '3px solid var(--tuki-border)'
            }}
          >
            {!profilePhoto && (
              <svg width="28" height="28" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '0.65rem', textAlign: 'center' }}>{uploading ? '...' : 'Cambiar'}</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file || !email) return; setUploading(true); setError(null); setSuccess(null);
            try {
              const arrayBuffer = await file.arrayBuffer(); const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);
              const res = await fetch('/api/upload-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, base64, mimeType: file.type }) });
              const json = await res.json();
              if (json.url) {
                const photoUrl = json.url + '?t=' + Date.now(); setProfilePhoto(photoUrl); setCtxPhoto(photoUrl); setSuccess('Foto actualizada');
              } else {
                setError(json.error || 'Error al subir foto');
              }
            } catch (err) {
              setError('Error al subir la foto');
            }
            setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '';
          }} />

          <div>
            <p style={{ fontWeight: 600 }}>{displayName || email}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--tuki-text-secondary)' }}>{phone || ''}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label className="tuki-form-label">Nombre <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="tuki-form-input" required />
          </div>
          <div>
            <label className="tuki-form-label">Apellido <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="tuki-form-input" required />
          </div>
        </div>

        <div>
          <label className="tuki-form-label">Empresa (Opcional)</label>
          <input type="text" value={company} onChange={e => setCompany(e.target.value)} className="tuki-form-input" />
        </div>

        <div>
          <label className="tuki-form-label">Ubicación (Dirección)</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="tuki-form-input" placeholder="Dirección" />
          <input type="text" value={city} onChange={e => setCity(e.target.value)} className="tuki-form-input" style={{ marginTop: '0.5rem' }} placeholder="Ciudad" />
        </div>

        <h2 className="tuki-heading" style={{ fontSize: '1.05rem' }}>Cuenta</h2>
        <div>
          <label className="tuki-form-label">Número de teléfono</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="tuki-form-input" />
        </div>
        <div>
          <label className="tuki-form-label">Correo electrónico</label>
          <input type="email" value={email || ''} readOnly className="tuki-form-input" style={{ background: '#f3f4f6' }} />
        </div>

        <div className="flex gap-2">
          <button className="tuki-btn tuki-btn-primary" type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</button>
          <button type="button" className="tuki-btn" onClick={() => {
            setGender(''); setSuccess(null); setError(null);
          }}>Restablecer</button>
        </div>

        {success && <p className="text-green-600">{success}</p>}
        {error && <p className="text-red-500">{error}</p>}
      </form>
    </DriverScreenLayout>
  );
}
