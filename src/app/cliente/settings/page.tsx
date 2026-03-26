'use client';
import { useState, useRef } from 'react';
import ClientScreenLayout from '../components/ClientScreenLayout';
import { useClientContext } from '../context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';

function StarDisplay({ rating, total }: { rating: number; total: number }) {
  if (!rating) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} style={{ fontSize: '1.05rem', color: rating >= s ? '#f59e0b' : '#d1d5db' }}>★</span>
        ))}
      </div>
      <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.92rem' }}>{Number(rating).toFixed(1)}</span>
      <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>({total} {total === 1 ? 'calificación' : 'calificaciones'})</span>
    </div>
  );
}

export default function ClientSettingsPage() {
  const {
    email, displayName, profilePhoto, setProfilePhoto,
    phone, setPhone, avgRating, totalRatings,
  } = useClientContext();

  const [nameInput, setNameInput] = useState(displayName);
  const [phoneInput, setPhoneInput] = useState(phone);
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPass, setNewPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const [toast, setToast] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !email) return;
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const res = await authFetch('/api/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, base64, mimeType: file.type, role: 'client' }),
      });
      const json = await res.json();
      if (json.url) { setProfilePhoto(json.url + '?t=' + Date.now()); showToast('Foto actualizada ✓'); }
      else showToast(json.error || 'Error al subir foto');
    } catch { showToast('Error de conexión'); }
    setUploading(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authFetch('/api/client-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, display_name: nameInput, phone: phoneInput }),
      });
      const json = await res.json();
      if (json.error) showToast('Error: ' + json.error);
      else { setPhone(phoneInput); showToast('Perfil actualizado ✓'); }
    } catch { showToast('Error de conexión'); }
    setSavingProfile(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres'); return; }
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSavingPass(false);
    if (error) showToast('Error: ' + error.message);
    else { showToast('Contraseña actualizada ✓'); setNewPass(''); }
  };

  return (
    <ClientScreenLayout title="Configuración">

      <form className="client-form-card" onSubmit={handleSaveProfile}>
        <h3 className="client-form-title">🧑 Mi Perfil</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 82, height: 82, borderRadius: '50%', flexShrink: 0,
              backgroundColor: '#f3f4f6',
              backgroundImage: profilePhoto ? `url(${profilePhoto})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
              border: '3px solid #10b981',
            }}
          >
            {!profilePhoto && (
              <span style={{ fontSize: '2rem' }}>{displayName?.[0]?.toUpperCase() || '👤'}</span>
            )}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.5)', color: '#fff',
              fontSize: '0.6rem', textAlign: 'center', padding: '3px 0',
            }}>
              {uploading ? '...' : '📷 Cambiar'}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }} onChange={handlePhotoChange} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
              {displayName || email?.split('@')[0]}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 2 }}>{email}</div>
            <StarDisplay rating={avgRating} total={totalRatings} />
          </div>
        </div>

        <div className="client-form-grid">
          <div>
            <label className="client-form-label">Nombre para mostrar</label>
            <input className="client-form-input" value={nameInput}
              onChange={e => setNameInput(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div>
            <label className="client-form-label">Teléfono / WhatsApp</label>
            <input className="client-form-input" value={phoneInput} type="tel"
              onChange={e => setPhoneInput(e.target.value)} placeholder="+595 9xx xxx xxx" />
          </div>
        </div>

        <button type="submit" className="client-btn client-btn-primary" disabled={savingProfile}
          style={{ marginTop: '0.75rem' }}>
          {savingProfile ? 'Guardando...' : 'Guardar Perfil'}
        </button>
      </form>

      <div className="client-form-card">
        <h3 className="client-form-title">👤 Información de Cuenta</h3>
        <div className="client-form-grid">
          <div>
            <label className="client-form-label">Email</label>
            <input className="client-form-input" value={email} readOnly style={{ background: '#f9fafb' }} />
          </div>
          <div>
            <label className="client-form-label">Nombre de usuario</label>
            <input className="client-form-input" value={displayName} readOnly style={{ background: '#f9fafb' }} />
          </div>
        </div>
      </div>

      <form className="client-form-card" onSubmit={handleChangePassword}>
        <h3 className="client-form-title">🔒 Cambiar Contraseña</h3>
        <div className="client-form-grid">
          <div>
            <label className="client-form-label">Nueva contraseña</label>
            <input className="client-form-input" type="password" placeholder="Mínimo 6 caracteres"
              value={newPass} onChange={e => setNewPass(e.target.value)} />
          </div>
          <button type="submit" className="client-btn client-btn-primary" disabled={savingPass}
            style={{ alignSelf: 'end' }}>
            {savingPass ? 'Guardando...' : 'Actualizar Contraseña'}
          </button>
        </div>
      </form>

      {toast && <div className="client-toast">{toast}</div>}
    </ClientScreenLayout>
  );
}
