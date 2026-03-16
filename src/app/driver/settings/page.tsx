'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useDriverContext } from '../context';
import DriverScreenLayout from '../components/DriverScreenLayout';

export default function DriverSettingsPage() {
  const { setProfilePhoto: setCtxPhoto } = useDriverContext();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [pickupRange, setPickupRange] = useState('');
  const [deliveryRange, setDeliveryRange] = useState('');
  const [maxWeight, setMaxWeight] = useState('');
  const [acceptsPackages, setAcceptsPackages] = useState(false);

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
          setPickupRange(data.pickup_range || '');
          setDeliveryRange(data.delivery_range || '');
          setMaxWeight(data.max_weight || '');
          setAcceptsPackages(data.accepts_packages || false);
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
      pickup_range: pickupRange ? parseFloat(String(pickupRange)) : null,
      delivery_range: deliveryRange ? parseFloat(String(deliveryRange)) : null,
      max_weight: maxWeight ? parseFloat(String(maxWeight)) : null,
      accepts_packages: acceptsPackages,
    };

    try {
      const res = await fetch('/api/driver-profile', {
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

                    const res = await fetch('/api/upload-photo', {
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

            {/* Capacidad y Rangos */}
            <h3 className="tuki-heading" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Capacidad y Rangos</h3>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '1rem' }}>
              <div>
                <label className="tuki-form-label">Rango Recogida (km)</label>
                <input type="number" value={pickupRange} onChange={e => setPickupRange(e.target.value)} className="tuki-form-input" step="0.1" />
              </div>
              <div>
                <label className="tuki-form-label">Rango Entrega (km)</label>
                <input type="number" value={deliveryRange} onChange={e => setDeliveryRange(e.target.value)} className="tuki-form-input" step="0.1" />
              </div>
              <div>
                <label className="tuki-form-label">Peso Máximo (kg)</label>
                <input type="number" value={maxWeight} onChange={e => setMaxWeight(e.target.value)} className="tuki-form-input" step="0.1" />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={acceptsPackages} onChange={e => setAcceptsPackages(e.target.checked)} />
                <span className="tuki-form-label" style={{ margin: 0 }}>📦 Acepto envíos de paquetes (tipo Bolt)</span>
              </label>
              <small style={{ color: '#6b7280', fontSize: '0.8rem' }}>Recibirás notificaciones de solicitudes de envío de paquetes cercanas.</small>
            </div>

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
