'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useDriverContext } from '../../driver/context';
import { authFetch } from '@/lib/authFetch';
import { useRouter, useSearchParams } from 'next/navigation';
import DriverScreenLayout from '../../driver/components/DriverScreenLayout';

const TECNICO_DOC_TYPES: { key: string; label: string; icon: string; hint?: string; requiresExpiry?: boolean }[] = [
  { key: 'selfie_cedula', label: 'Selfie sosteniendo tu cédula', icon: '🤳', hint: 'Cara y cédula visibles' },
  { key: 'cedula_frente', label: 'Cédula — frente',               icon: '🪪', requiresExpiry: true },
  { key: 'cedula_dorso',  label: 'Cédula — dorso',                icon: '🪪' },
  { key: 'antecedentes',  label: 'Antecedentes policiales',       icon: '📋', hint: 'Vigente', requiresExpiry: true },
  { key: 'domicilio',     label: 'Comprobante de domicilio',      icon: '🏠', hint: 'ANDE, agua o internet' },
];

export default function TecnicoSettings() {
  const { email, displayName, profilePhoto: ctxPhoto, setProfilePhoto: setCtxPhoto } = useDriverContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const docsRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Auto-scroll to docs section when ?scroll=docs is in the URL
  useEffect(() => {
    if (searchParams.get('scroll') === 'docs' && docsRef.current) {
      setTimeout(() => docsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, [searchParams]);

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
  const [docStatus, setDocStatus] = useState<Record<string, { status: string; rejection_reason?: string; expires_at?: string }>>({});
  const [docUploading, setDocUploading] = useState<Record<string, boolean>>({});
  const [docExpiries, setDocExpiries] = useState<Record<string, string>>({});

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

  // Cargar estado de documentos cuando hay email disponible
  useEffect(() => {
    if (!email) return;
    authFetch(`/api/upload-driver-doc?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(j => {
        const sm: Record<string, { status: string; rejection_reason?: string; expires_at?: string }> = {};
        const ex: Record<string, string> = {};
        for (const d of (j.docs || [])) {
          sm[d.doc_type] = { status: d.status, rejection_reason: d.rejection_reason, expires_at: d.expires_at };
          if (d.expires_at) ex[d.doc_type] = d.expires_at.slice(0, 10);
        }
        setDocStatus(sm);
        setDocExpiries(ex);
      })
      .catch(() => {});
  }, [email]);

  const updateExpiry = async (docKey: string, dateValue: string) => {
    if (!email) return;
    setDocExpiries(prev => ({ ...prev, [docKey]: dateValue }));
    try {
      await authFetch('/api/upload-driver-doc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, doc_type: docKey, expires_at: dateValue || null, role: 'tecnico' }),
      });
    } catch { /* silent */ }
  };

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
        const res = await authFetch('/api/tecnico/settings', {
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
      <form onSubmit={handleSave} style={{ paddingBottom: '2rem' }}>

        {/* ── HERO: Avatar + nombre + email ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '1.5rem 1rem 1.25rem', gap: '0.6rem',
          background: 'linear-gradient(135deg, #F5C518 0%, #F58A07 100%)',
          borderRadius: '0 0 24px 24px', marginBottom: '1.25rem',
          marginLeft: '-1rem', marginRight: '-1rem', marginTop: '-1rem',
        }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'relative', width: 88, height: 88, borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
              backgroundImage: profilePhoto ? `url(${profilePhoto})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: '3px solid rgba(255,255,255,0.6)',
              overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}
          >
            {!profilePhoto && (
              <svg width="36" height="36" fill="none" stroke="rgba(255,255,255,0.8)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              fontSize: '0.6rem', fontWeight: 700, textAlign: 'center',
              padding: '3px 0', letterSpacing: '0.05em',
            }}>
              {uploading ? '⏳' : '📷 CAMBIAR'}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file || !email) return; setUploading(true); setError(null); setSuccess(null);
            try {
              const arrayBuffer = await file.arrayBuffer(); const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);
              const res = await authFetch('/api/upload-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, base64, mimeType: file.type }) });
              const json = await res.json();
              if (json.url) { const photoUrl = json.url + '?t=' + Date.now(); setProfilePhoto(photoUrl); setCtxPhoto(photoUrl); setSuccess('Foto actualizada'); }
              else { setError(json.error || 'Error al subir foto'); }
            } catch { setError('Error al subir la foto'); }
            setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '';
          }} />

          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', margin: 0, lineHeight: 1.2 }}>
              {firstName && lastName ? `${firstName} ${lastName}` : displayName || 'Mi perfil'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', margin: '2px 0 0' }}>{email}</p>
          </div>
        </div>

        {/* ── SECCIÓN: Soy ── */}
        <Section icon="🧑" title="Soy" required>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {(['hombre', 'mujer'] as const).map(g => (
              <button key={g} type="button" onClick={() => setGender(g)} style={{
                flex: 1, padding: '0.9rem 0.5rem', borderRadius: 14,
                border: gender === g ? '2px solid #F5C518' : '2px solid #e5e7eb',
                background: gender === g ? 'linear-gradient(135deg,#F5C518,#F58A07)' : '#f9fafb',
                color: gender === g ? '#1C1C2E' : '#374151',
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.18s', boxShadow: gender === g ? '0 4px 12px rgba(245,197,24,0.35)' : 'none',
              }}>
                <span style={{ fontSize: '1.5rem' }}>{g === 'hombre' ? '👨' : '👩'}</span>
                <span>{g === 'hombre' ? 'Hombre' : 'Mujer'}</span>
              </button>
            ))}
          </div>
          {!gender && <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: 6 }}>Selección obligatoria</p>}
        </Section>



        {/* ── SECCIÓN: Datos personales ── */}
        <Section icon="👤" title="Datos personales">
          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Nombre" required>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" style={inputStyle} required />
            </Field>
            <Field label="Apellido" required>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Pérez" style={inputStyle} required />
            </Field>
          </div>
          <Field label="Empresa" hint="Opcional">
            <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Nombre de tu empresa" style={inputStyle} />
          </Field>
        </Section>

        {/* ── SECCIÓN: Contacto ── */}
        <Section icon="📞" title="Contacto">
          <Field label="Teléfono / WhatsApp">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+595 9XX XXX XXX" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Dirección">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle y número" style={inputStyle} />
            </Field>
            <Field label="Ciudad">
              <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Asunción" style={inputStyle} />
            </Field>
          </div>
        </Section>

        {/* ── SECCIÓN: Cuenta ── */}
        <Section icon="🔒" title="Cuenta">
          <Field label="Correo electrónico">
            <input type="email" value={email || ''} readOnly style={{ ...inputStyle, background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }} />
          </Field>
          <Field label="Tema de la app">
            <select value={themeMode} onChange={e => setThemeMode(e.target.value)} style={inputStyle}>
              <option value="light">☀️ Claro</option>
              <option value="dark">🌙 Oscuro</option>
            </select>
          </Field>
          <Field label="APP de navegación">
            <select value={navApp} onChange={e => setNavApp(e.target.value)} style={inputStyle}>
              <option value="google_maps">Google Maps</option>
              <option value="waze">Waze</option>
            </select>
          </Field>
        </Section>

        {/* ── SECCIÓN: Mis documentos ── */}
        <div ref={docsRef} style={{ scrollMarginTop: 80 }}>
        <Section icon="📎" title="Mis documentos" collapsible>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
            Subi los siguientes documentos. Serán revisados por el equipo antes de habilitar tu cuenta.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TECNICO_DOC_TYPES.map(doc => {
              const ds = docStatus[doc.key];
              const isUploading = docUploading[doc.key];
              const _expAtT = docExpiries[doc.key] || ds?.expires_at;
              const isLocked = ds?.status === 'approved' && !(_expAtT && new Date(_expAtT).getTime() <= Date.now());
              return (
                <div key={doc.key} style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 12, border: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>{doc.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3 }}>{doc.label}</p>
                    {doc.hint && <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{doc.hint}</p>}
                    {ds?.rejection_reason && <p style={{ margin: 0, fontSize: '0.7rem', color: '#dc2626' }}>↳ {ds.rejection_reason}</p>}
                  </div>
                  {ds && (
                    <span style={{
                      flexShrink: 0, borderRadius: 99, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700,
                      background: ds.status === 'approved' ? '#d1fae5' : ds.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                      color: ds.status === 'approved' ? '#065f46' : ds.status === 'rejected' ? '#991b1b' : '#92400e',
                    }}>
                      {ds.status === 'approved' ? '✅ Verificado' : ds.status === 'rejected' ? '❌ Rechazado' : '⏳ Pendiente'}
                    </span>
                  )}
                  {isUploading ? (
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', flexShrink: 0 }}>Subiendo...</span>
                  ) : isLocked ? (
                    <span style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, background: '#f0fdf4', color: '#059669', fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid #bbf7d0' }}>🔒 Verificado</span>
                  ) : (
                    <label style={{
                      flexShrink: 0, cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                      background: ds?.status === 'approved' ? '#fffbeb' : '#fefce8',
                      color: ds?.status === 'approved' ? '#b45309' : '#92400e',
                      fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid',
                      borderColor: ds?.status === 'approved' ? '#fcd34d' : '#fde68a',
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                      {ds?.status === 'approved' ? '↑ Resubir (vencido)' : ds ? '↑ Re-subir' : '↑ Subir'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        style={{ display: 'none' }}
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file || !email) return;
                          e.target.value = '';
                          setDocUploading(prev => ({ ...prev, [doc.key]: true }));
                          try {
                            const buf = await file.arrayBuffer();
                            const bytes = new Uint8Array(buf);
                            let bin = '';
                            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                            const res = await authFetch('/api/upload-driver-doc', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ email, doc_type: doc.key, base64: btoa(bin), mimeType: file.type, role: 'tecnico' }),
                            });
                            const json = await res.json();
                            if (json.error) setError(json.error);
                            else { setDocStatus(prev => ({ ...prev, [doc.key]: { status: 'pending' } })); setSuccess('Documento enviado — en revisión.'); }
                          } catch { setError('Error al subir el documento'); }
                          setDocUploading(prev => ({ ...prev, [doc.key]: false }));
                        }}
                      />
                    </label>
                  )}
                  </div>
                  {doc.requiresExpiry && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: '0.72rem', color: '#6b7280', whiteSpace: 'nowrap' }}>📅 Vence:</label>
                      {isLocked ? (
                        <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>
                          {docExpiries[doc.key] ? new Date(docExpiries[doc.key]).toLocaleDateString('es-PY') : '—'}
                        </span>
                      ) : (
                        <input
                          type="date"
                          value={docExpiries[doc.key] || ''}
                          onChange={e => updateExpiry(doc.key, e.target.value)}
                          style={{ fontSize: '0.75rem', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 6px', color: '#374151', background: '#fff', outline: 'none', flex: 1 }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
        </div>

        {/* ── Mensajes ── */}
        {success && (
          <div style={{ margin: '0 0 0.75rem', padding: '0.75rem 1rem', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            ✅ {success}
          </div>
        )}
        {error && (
          <div style={{ margin: '0 0 0.75rem', padding: '0.75rem 1rem', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Botón guardar ── */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '1rem', borderRadius: 16, border: 'none',
            background: loading ? '#f0e68c' : 'linear-gradient(135deg, #F5C518, #F58A07)',
            color: loading ? '#888' : '#1C1C2E', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 6px 20px rgba(245,197,24,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.18s',
          }}
        >
          {loading ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
              Guardando...
            </>
          ) : '💾 Guardar configuración'}
        </button>

      </form>
    </DriverScreenLayout>
  );
}

/* ── Helpers de layout ── */
function Section({ icon, title, required, collapsible, children }: { icon: string; title: string; required?: boolean; collapsible?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div style={{ marginBottom: '1rem', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{ padding: '0.75rem 1rem', borderBottom: open ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: collapsible ? 'pointer' : 'default' }}
      >
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#374151', flex: 1 }}>{title}</span>
        {required && <span style={{ color: '#ef4444', marginLeft: 2, fontSize: '0.85rem' }}>*</span>}
        {collapsible && <span style={{ fontSize: '0.85rem', color: '#9ca3af', transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>}
      </div>
      {open && (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' }}>{label}</label>
        {required && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>*</span>}
        {hint && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>({hint})</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.7rem 0.85rem', borderRadius: 10,
  border: '1.5px solid #e5e7eb', background: '#f9fafb',
  fontSize: '0.92rem', color: '#111827', outline: 'none',
  boxSizing: 'border-box',
};
