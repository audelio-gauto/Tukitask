'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { useDriverContext } from '../context';
import DriverScreenLayout from '../components/DriverScreenLayout';

const VEHICLE_TYPES = [
  { value: 'bicicleta', label: 'Bicicleta', emoji: '🚲', color: '#10b981' },
  { value: 'moto',      label: 'Moto',      emoji: '🏍️', color: '#f59e0b' },
  { value: 'auto',      label: 'Auto',      emoji: '🚗', color: '#3b82f6' },
  { value: 'camioneta', label: 'Camioneta', emoji: '🚙', color: '#8b5cf6' },
  { value: 'camion',    label: 'Camión',    emoji: '🚛', color: '#ef4444' },
];

const NAV_APPS = [
  { value: 'google_maps', label: 'Google Maps', logo: '🗺️' },
  { value: 'waze',        label: 'Waze',        logo: '📍' },
];

export default function DriverSettingsPage() {
  const { setProfilePhoto: setCtxPhoto } = useDriverContext();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vehicleType, setVehicleType] = useState('moto');
  const [vehicleModel, setVehicleModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [navApp, setNavApp] = useState('google_maps');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || '');
      try {
        const res = await fetch(`/api/driver-profile?email=${encodeURIComponent(user.email || '')}`);
        const json = await res.json();
        const data = json.profile;
        if (data) {
          setProfilePhoto(data.profile_photo || '');
          setVehicleType(data.transport_mode || data.vehicle_type || 'moto');
          setVehicleModel(data.vehicle_type || '');
          setLicensePlate(data.license_plate || '');
          setNavApp(data.nav_app || 'google_maps');
          setFirstName(data.first_name || '');
          setLastName(data.last_name || '');
          setPhone(data.phone || '');
          if (data.avg_rating) setAvgRating(Number(data.avg_rating));
          if (data.total_ratings) setTotalRatings(Number(data.total_ratings));
        }
      } catch {}
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await authFetch('/api/driver-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          transport_mode: vehicleType,
          vehicle_type: vehicleModel,
          license_plate: licensePlate.toUpperCase(),
          nav_app: navApp,
          first_name: firstName,
          last_name: lastName,
          phone,
        }),
      });
      const json = await res.json();
      setMessage(json.error ? json.error : '¡Perfil actualizado correctamente!');
    } catch {
      setMessage('Error de conexión');
    }
    setSaving(false);
  }

  const selectedVehicle = VEHICLE_TYPES.find(v => v.value === vehicleType);

  return (
    <DriverScreenLayout title="Mi Perfil">
      <form onSubmit={handleSave} style={{ paddingBottom: '2rem' }}>

        {/* ── HERO: Foto + identidad ── */}
        <div style={{
          background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
          borderRadius: 20, margin: '1rem 0 1.25rem', padding: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 88, height: 88, borderRadius: '50%',
                background: profilePhoto ? `url(${profilePhoto}) center/cover` : 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: '3px solid #10b981',
                fontSize: '2rem', color: '#fff', fontWeight: 800,
              }}
            >
              {!profilePhoto && (firstName?.[0] || email?.[0] || 'D').toUpperCase()}
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 26, height: 26, borderRadius: '50%',
                background: '#10b981', border: '2px solid #111827',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {uploading
                ? <span style={{ color: '#fff', fontSize: '0.55rem' }}>...</span>
                : <svg width="12" height="12" fill="none" stroke="#fff" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              }
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !email) return;
              setUploading(true);
              setMessage('');
              try {
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const res = await authFetch('/api/upload-photo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, base64, mimeType: file.type }),
                });
                const json = await res.json();
                if (json.url) {
                  const url = json.url + '?t=' + Date.now();
                  setProfilePhoto(url);
                  setCtxPhoto(url);
                  setMessage('Foto actualizada correctamente.');
                } else {
                  setMessage(json.error || 'Error al subir foto');
                }
              } catch { setMessage('Error al subir la foto'); }
              setUploading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', margin: 0, lineHeight: 1.2 }}>
              {[firstName, lastName].filter(Boolean).join(' ') || 'Conductor'}
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.78rem', margin: '4px 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email}
            </p>
            {avgRating > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: '#f59e0b', fontSize: '0.95rem', letterSpacing: 1 }}>
                  {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}
                </span>
                <span style={{ color: '#d1fae5', fontWeight: 700, fontSize: '0.9rem' }}>{Number(avgRating).toFixed(1)}</span>
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>({totalRatings} reseñas)</span>
              </div>
            ) : (
              <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>Sin calificaciones aún</span>
            )}
            {selectedVehicle && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6,
                background: 'rgba(16,185,129,0.15)', borderRadius: 99, padding: '2px 10px',
              }}>
                <span style={{ fontSize: '0.85rem' }}>{selectedVehicle.emoji}</span>
                <span style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>{selectedVehicle.label}</span>
                {vehicleModel && <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>· {vehicleModel}</span>}
                {licensePlate && <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>· {licensePlate}</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── SECCIÓN: TIPO DE VEHÍCULO ── */}
        <div style={{
          background: '#fff', borderRadius: 18, padding: '1.25rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
            </div>
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>Tipo de Vehículo</h3>
          </div>

          {/* Cards de selección */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: '1.25rem' }}>
            {VEHICLE_TYPES.map(v => {
              const active = vehicleType === v.value;
              return (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVehicleType(v.value)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 4, padding: '0.7rem 0.25rem',
                    borderRadius: 14,
                    border: active ? `2px solid ${v.color}` : '2px solid #e5e7eb',
                    background: active ? `${v.color}18` : '#fafafa',
                    cursor: 'pointer', transition: 'all 0.15s',
                    outline: 'none',
                  }}
                >
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{v.emoji}</span>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: active ? 700 : 500,
                    color: active ? v.color : '#6b7280',
                  }}>{v.label}</span>
                </button>
              );
            })}
          </div>

          {/* Detalles del vehículo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Modelo
              </label>
              <input
                type="text"
                value={vehicleModel}
                onChange={e => setVehicleModel(e.target.value)}
                placeholder={vehicleType === 'moto' ? 'Ej. Honda CB 150' : vehicleType === 'bicicleta' ? 'Ej. Trek FX3' : 'Ej. Toyota Hilux'}
                style={{
                  width: '100%', padding: '0.65rem 0.75rem', borderRadius: 10,
                  border: '1.5px solid #e5e7eb', fontSize: '0.88rem',
                  outline: 'none', boxSizing: 'border-box', color: '#111827',
                  background: '#fafafa',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Matrícula / Placa
              </label>
              <input
                type="text"
                value={licensePlate}
                onChange={e => setLicensePlate(e.target.value.toUpperCase())}
                placeholder="Ej. ABC 123"
                maxLength={10}
                style={{
                  width: '100%', padding: '0.65rem 0.75rem', borderRadius: 10,
                  border: '1.5px solid #e5e7eb', fontSize: '0.88rem',
                  outline: 'none', boxSizing: 'border-box', color: '#111827',
                  background: '#fafafa', textTransform: 'uppercase', letterSpacing: 1,
                }}
              />
            </div>
          </div>
        </div>

        {/* ── SECCIÓN: NAVEGACIÓN ── */}
        <div style={{
          background: '#fff', borderRadius: 18, padding: '1.25rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="none" stroke="#3b82f6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            </div>
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>App de Navegación</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {NAV_APPS.map(app => {
              const active = navApp === app.value;
              return (
                <button
                  key={app.value}
                  type="button"
                  onClick={() => setNavApp(app.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.85rem 1rem', borderRadius: 12,
                    border: active ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    background: active ? '#eff6ff' : '#fafafa',
                    cursor: 'pointer', transition: 'all 0.15s', outline: 'none',
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{app.logo}</span>
                  <span style={{ fontWeight: active ? 700 : 500, color: active ? '#3b82f6' : '#374151', fontSize: '0.88rem' }}>
                    {app.label}
                  </span>
                  {active && (
                    <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="16" height="16" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── SECCIÓN: DATOS PERSONALES ── */}
        <div style={{
          background: '#fff', borderRadius: 18, padding: '1.25rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#fdf4ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="none" stroke="#8b5cf6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>Datos Personales</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {[
              { label: 'Nombre', value: firstName, set: setFirstName, placeholder: 'Tu nombre' },
              { label: 'Apellido', value: lastName, set: setLastName, placeholder: 'Tu apellido' },
            ].map(field => (
              <div key={field.label}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  {field.label}
                </label>
                <input
                  type="text"
                  value={field.value}
                  onChange={e => field.set(e.target.value)}
                  placeholder={field.placeholder}
                  style={{
                    width: '100%', padding: '0.65rem 0.75rem', borderRadius: 10,
                    border: '1.5px solid #e5e7eb', fontSize: '0.88rem',
                    outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fafafa',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+595 9xx xxxxxx"
              style={{
                width: '100%', padding: '0.65rem 0.75rem', borderRadius: 10,
                border: '1.5px solid #e5e7eb', fontSize: '0.88rem',
                outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fafafa',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              readOnly
              style={{
                width: '100%', padding: '0.65rem 0.75rem', borderRadius: 10,
                border: '1.5px solid #e5e7eb', fontSize: '0.88rem',
                outline: 'none', boxSizing: 'border-box', color: '#9ca3af',
                background: '#f3f4f6', cursor: 'not-allowed',
              }}
            />
          </div>
        </div>

        {/* ── BOTÓN GUARDAR ── */}
        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%', padding: '1rem', borderRadius: 16, border: 'none',
            background: saving ? '#9ca3af' : 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', fontWeight: 800, fontSize: '1rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: saving ? 'none' : '0 4px 16px rgba(16,185,129,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {saving ? 'Guardando...' : '💾 Guardar Cambios'}
        </button>

        {message && (
          <div style={{
            marginTop: '0.75rem', padding: '0.85rem 1rem', borderRadius: 12,
            fontSize: '0.88rem', fontWeight: 600, textAlign: 'center',
            background: message.includes('correctamente') ? '#f0fdf4' : '#fef2f2',
            color: message.includes('correctamente') ? '#059669' : '#dc2626',
            border: `1px solid ${message.includes('correctamente') ? '#bbf7d0' : '#fecaca'}`,
          }}>
            {message.includes('correctamente') ? '✅ ' : '⚠️ '}{message}
          </div>
        )}

      </form>
    </DriverScreenLayout>
  );
}


  // Form fields
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
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || '');
      try {
        const res = await fetch(`/api/driver-profile?email=${encodeURIComponent(user.email || '')}`);
        const json = await res.json();
        const data = json.profile;
        if (data) {
          setThemeMode(data.theme_mode || 'light');
          setProfilePhoto(data.profile_photo || '');
          setTransportMode(data.transport_mode || 'moto');
          setVehicleType(data.vehicle_type || '');
          setLicensePlate(data.license_plate || '');
          setNavApp(data.nav_app || 'google_maps');
          setFirstName(data.first_name || '');
          setLastName(data.last_name || '');
          setCompany(data.company || '');
          setAddress(data.address || '');
          setCity(data.city || '');
          setPhone(data.phone || '');
          if (data.avg_rating) setAvgRating(Number(data.avg_rating));
          if (data.total_ratings) setTotalRatings(Number(data.total_ratings));
        }
      } catch {}
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const profile = {
      email,
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
    };

    try {
      const res = await authFetch('/api/driver-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const json = await res.json();
      setMessage(json.error ? json.error : 'Perfil actualizado correctamente.');
    } catch {
      setMessage('Error de conexión');
    }
    setSaving(false);
  }

  return (
    <DriverScreenLayout title="Configuración">
      <form onSubmit={handleSave}>
        {/* Apariencia */}
        <h1 className="tuki-heading" style={{ marginTop: '1.5rem' }}>Configuración</h1>

        <div className="tuki-order-card">
          <div className="tuki-order-body">
            <h3 className="tuki-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Apariencia del Panel</h3>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="tuki-form-label">Tema</label>
              <select value={themeMode} onChange={e => setThemeMode(e.target.value)} className="tuki-form-input">
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
            </div>

            <hr style={{ border: 0, borderTop: '1px solid var(--tuki-border)', margin: '1.5rem 0' }} />

            {/* Transporte y Vehículo */}
            <h3 className="tuki-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Transporte y Vehículo</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label className="tuki-form-label">Modo de Transporte</label>
              <select value={transportMode} onChange={e => setTransportMode(e.target.value)} className="tuki-form-input">
                <option value="bici">Bici</option>
                <option value="moto">Moto</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
              <div>
                <label className="tuki-form-label">Tipo de Vehículo / Modelo</label>
                <input type="text" value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="tuki-form-input" placeholder="Ej. Toyota Yaris" />
              </div>
              <div>
                <label className="tuki-form-label">Matrícula</label>
                <input type="text" value={licensePlate} onChange={e => setLicensePlate(e.target.value)} className="tuki-form-input" />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="tuki-form-label">APP de Navegación</label>
              <select value={navApp} onChange={e => setNavApp(e.target.value)} className="tuki-form-input">
                <option value="google_maps">Google Maps</option>
                <option value="waze">Waze</option>
              </select>
            </div>

            <hr style={{ border: 0, borderTop: '1px solid var(--tuki-border)', margin: '1.5rem 0' }} />

            {/* Datos de Contacto */}
            <h3 className="tuki-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Datos de Contacto</h3>

            {/* Profile Photo Upload */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 80, height: 80, borderRadius: '50%',
                  backgroundColor: '#e5e7eb',
                  backgroundImage: profilePhoto ? `url(${profilePhoto})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  border: '3px solid var(--tuki-border)', flexShrink: 0,
                }}
              >
                {!profilePhoto && (
                  <svg width="28" height="28" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  fontSize: '0.65rem', textAlign: 'center', padding: '2px 0',
                }}>
                  {uploading ? '...' : 'Cambiar'}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !email) return;
                  setUploading(true);
                  setMessage('');
                  try {
                    const arrayBuffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) {
                      binary += String.fromCharCode(bytes[i]);
                    }
                    const base64 = btoa(binary);

                    const res = await authFetch('/api/upload-photo', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, base64, mimeType: file.type }),
                    });
                    const json = await res.json();
                    if (json.url) {
                      const photoUrl = json.url + '?t=' + Date.now();
                      setProfilePhoto(photoUrl);
                      setCtxPhoto(photoUrl);
                      setMessage('Foto actualizada correctamente.');
                    } else {
                      setMessage(json.error || 'Error al subir foto');
                    }
                  } catch (err) {
                    setMessage('Error al subir la foto: ' + (err instanceof Error ? err.message : 'desconocido'));
                  }
                  setUploading(false);
                  // Reset input so same file can be selected again
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--tuki-text-main)', margin: 0 }}>Foto de Perfil</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--tuki-text-secondary)', margin: '0.25rem 0 0' }}>JPG, PNG o WebP. Máximo 2MB.</p>
                {avgRating > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <span style={{ color: '#f59e0b', fontSize: '1rem' }}>
                      {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>{Number(avgRating).toFixed(1)}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>({totalRatings})</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
              <div>
                <label className="tuki-form-label">Nombre</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="tuki-form-input" />
              </div>
              <div>
                <label className="tuki-form-label">Apellido</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="tuki-form-input" />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="tuki-form-label">Empresa (Opcional)</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} className="tuki-form-input" />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="tuki-form-label">Ubicación (Dirección)</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="tuki-form-input" placeholder="Dirección" />
              <input type="text" value={city} onChange={e => setCity(e.target.value)} className="tuki-form-input" style={{ marginTop: '0.5rem' }} placeholder="Ciudad" />
            </div>

            <hr style={{ border: 0, borderTop: '1px solid var(--tuki-border)', margin: '1.5rem 0' }} />

            <hr style={{ border: 0, borderTop: '1px solid var(--tuki-border)', margin: '1.5rem 0' }} />

            {/* Cuenta */}
            <h3 className="tuki-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Cuenta</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label className="tuki-form-label">Número de teléfono</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="tuki-form-input" />
              <small style={{ color: '#6b7280', fontSize: '0.8rem' }}>Que aparece en su cuenta</small>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="tuki-form-label">Dirección de correo electrónico</label>
              <input type="email" value={email} readOnly className="tuki-form-input" style={{ background: '#f3f4f6' }} />
            </div>

            {/* Save button */}
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <button type="submit" className="tuki-btn tuki-btn-success" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : '💾 Guardar Cambios'}
              </button>
            </div>

            {message && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                background: message.includes('correctamente') ? '#f0fdf4' : '#fef2f2',
                color: message.includes('correctamente') ? '#059669' : '#dc2626',
                border: `1px solid ${message.includes('correctamente') ? '#bbf7d0' : '#fecaca'}`,
              }}>
                {message}
              </div>
            )}
          </div>
        </div>
      </form>
    </DriverScreenLayout>
  );
}
