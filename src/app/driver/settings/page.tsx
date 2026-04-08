'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { useDriverContext } from '../context';
import DriverScreenLayout from '../components/DriverScreenLayout';

const VEHICLE_TYPES = [
  { value: 'moto',       label: 'Moto',       emoji: '🏍️', color: '#f59e0b' },
  { value: 'auto',       label: 'Auto',       emoji: '🚗', color: '#3b82f6' },
  { value: 'moto_carro', label: 'Moto carro', emoji: '🚙', color: '#8b5cf6' },
  { value: 'camion',     label: 'Camión',     emoji: '🚛', color: '#ef4444' },
];

const NAV_APPS = [
  { value: 'google_maps', label: 'Google Maps', logo: '🗺️' },
  { value: 'waze',        label: 'Waze',        logo: '📍' },
];

type DocEntry = { key: string; label: string; icon: string; hint?: string; requiresExpiry?: boolean };

const PERSONAL_DOCS: DocEntry[] = [
  { key: 'cedula_frente', label: 'Cédula — frente',          icon: '🪪', requiresExpiry: true },
  { key: 'antecedentes',  label: 'Antecedentes policiales',  icon: '📋', hint: 'Vigente', requiresExpiry: true },
  { key: 'domicilio',     label: 'Comprobante de domicilio', icon: '🏠', hint: 'ANDE, agua o internet' },
];

const VEHICLE_DOCS: DocEntry[] = [
  { key: 'registro_frente',     label: 'Registro de conducir — frente', icon: '🚗', requiresExpiry: true },
  { key: 'registro_dorso',      label: 'Registro de conducir — dorso',  icon: '🚗' },
  { key: 'cedula_verde_frente', label: 'Cédula Verde — frente',         icon: '📄' },
  { key: 'cedula_verde_dorso',  label: 'Cédula Verde — dorso',          icon: '📄' },
  { key: 'foto_1',              label: 'Foto del vehículo 1',            icon: '📸', hint: 'Chapa visible' },
  { key: 'foto_2',              label: 'Foto del vehículo 2',            icon: '📸', hint: 'Chapa visible' },
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
  const [vehicleDetails, setVehicleDetails] = useState<Record<string, { marca: string; matricula: string }>>({});
  const [navApp, setNavApp] = useState('google_maps');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [docStatus, setDocStatus] = useState<Record<string, { status: string; rejection_reason?: string; expires_at?: string }>>({});
  const [docExpiries, setDocExpiries] = useState<Record<string, string>>({});
  const [docUploading, setDocUploading] = useState<Record<string, boolean>>({});

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
          const savedType = data.transport_mode || 'moto';
          setVehicleType(savedType);
          try {
            const parsed = JSON.parse(data.vehicle_type || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
              setVehicleDetails(parsed);
            } else {
              setVehicleDetails({ [savedType]: { marca: data.vehicle_type || '', matricula: data.license_plate || '' } });
            }
          } catch {
            setVehicleDetails({ [savedType]: { marca: data.vehicle_type || '', matricula: data.license_plate || '' } });
          }
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
          vehicle_type: JSON.stringify(vehicleDetails),
          license_plate: (vehicleDetails[vehicleType]?.matricula || '').toUpperCase(),
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
          if (d.expires_at) ex[d.doc_type] = d.expires_at.substring(0, 10);
        }
        setDocStatus(sm);
        setDocExpiries(ex);
      })
      .catch(() => {});
  }, [email]);

  async function updateExpiry(docType: string, expiresAt: string) {
    if (!email) return;
    setDocExpiries(prev => ({ ...prev, [docType]: expiresAt }));
    try {
      await authFetch('/api/upload-driver-doc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, doc_type: docType, expires_at: expiresAt || null }),
      });
    } catch {}
  }

  async function uploadDoc(docType: string, file: File) {
    if (!email || !file) return;
    setDocUploading(prev => ({ ...prev, [docType]: true }));
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const res = await authFetch('/api/upload-driver-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, doc_type: docType, base64, mimeType: file.type, role: 'driver' }),
      });
      const json = await res.json();
      if (json.error) {
        setMessage(json.error);
      } else {
        setDocStatus(prev => ({ ...prev, [docType]: { status: 'pending' } }));
        setMessage('Documento subido — en revisión.');
      }
    } catch {
      setMessage('Error al subir el documento');
    }
    setDocUploading(prev => ({ ...prev, [docType]: false }));
  }

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
                {vehicleDetails[vehicleType]?.marca && <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>· {vehicleDetails[vehicleType].marca}</span>}
                {vehicleDetails[vehicleType]?.matricula && <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>· {vehicleDetails[vehicleType].matricula}</span>}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: '1.25rem' }}>
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
                Marca
              </label>
              <input
                type="text"
                value={vehicleDetails[vehicleType]?.marca || ''}
                onChange={e => setVehicleDetails(prev => ({ ...prev, [vehicleType]: { ...prev[vehicleType], marca: e.target.value } }))}
                placeholder={vehicleType === 'moto' ? 'Ej. Honda CB 150' : vehicleType === 'auto' ? 'Ej. Toyota Corolla' : vehicleType === 'moto_carro' ? 'Ej. Piaggio Ape' : 'Ej. Mercedes Sprinter'}
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
                value={vehicleDetails[vehicleType]?.matricula || ''}
                onChange={e => setVehicleDetails(prev => ({ ...prev, [vehicleType]: { ...prev[vehicleType], matricula: e.target.value.toUpperCase() } }))}
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

          {/* Documentos del vehículo seleccionado */}
          <div style={{ marginTop: '1rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
              Documentos — {selectedVehicle?.label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {VEHICLE_DOCS.map(doc => {
                const docKey = `${vehicleType}_${doc.key}`;
                const ds = docStatus[docKey];
                const isUploading = docUploading[docKey];
                const _expAtV = docExpiries[docKey] || ds?.expires_at;
                const isLocked = ds?.status === 'approved' && !(_expAtV && new Date(_expAtV).getTime() <= Date.now());
                return (
                  <div key={docKey}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fafafa', borderRadius: 12, border: '1px solid #f1f5f9' }}>
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
                          background: ds?.status === 'approved' ? '#fffbeb' : '#f0f9ff',
                          color: ds?.status === 'approved' ? '#b45309' : '#0284c7',
                          fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid',
                          borderColor: ds?.status === 'approved' ? '#fcd34d' : '#bae6fd',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                          {ds?.status === 'approved' ? '↑ Resubir (vencido)' : ds ? '↑ Re-subir' : '↑ Subir'}
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(docKey, f); e.target.value = ''; }} />
                        </label>
                      )}
                    </div>
                    {doc.requiresExpiry && (
                      <div style={{ marginTop: 4, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Vencimiento:</span>
                        {isLocked ? (
                          <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>
                            {docExpiries[docKey] ? new Date(docExpiries[docKey]).toLocaleDateString('es-PY') : '—'}
                          </span>
                        ) : (
                          <input type="date" value={docExpiries[docKey] || ''} onChange={e => updateExpiry(docKey, e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fafafa', color: '#374151' }} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── SECCIÓN: IDENTIFICACIÓN PERSONAL ── */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '1.25rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🪪</div>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>Identificación personal</h3>
              <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>Cédula, antecedentes y domicilio</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PERSONAL_DOCS.map(doc => {
              const ds = docStatus[doc.key];
              const isUploading = docUploading[doc.key];
              const _expAtP = docExpiries[doc.key] || ds?.expires_at;
              const isLocked = ds?.status === 'approved' && !(_expAtP && new Date(_expAtP).getTime() <= Date.now());
              return (
                <div key={doc.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fafafa', borderRadius: 12, border: '1px solid #f1f5f9' }}>
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
                        background: ds?.status === 'approved' ? '#fffbeb' : '#f0f9ff',
                        color: ds?.status === 'approved' ? '#b45309' : '#0284c7',
                        fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid',
                        borderColor: ds?.status === 'approved' ? '#fcd34d' : '#bae6fd',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        {ds?.status === 'approved' ? '↑ Resubir (vencido)' : ds ? '↑ Re-subir' : '↑ Subir'}
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(doc.key, f); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                  {doc.requiresExpiry && (
                    <div style={{ marginTop: 4, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Vencimiento:</span>
                      {isLocked ? (
                        <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>
                          {docExpiries[doc.key] ? new Date(docExpiries[doc.key]).toLocaleDateString('es-PY') : '—'}
                        </span>
                      ) : (
                        <input type="date" value={docExpiries[doc.key] || ''} onChange={e => updateExpiry(doc.key, e.target.value)}
                          style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fafafa', color: '#374151' }} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
