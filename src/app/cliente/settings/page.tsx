'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/lib/useTheme';
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
      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{Number(rating).toFixed(1)}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>({total} {total === 1 ? 'calificación' : 'calificaciones'})</span>
    </div>
  );
}

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <select
      value={theme}
      onChange={e => setTheme(e.target.value === 'dark' ? 'dark' : 'light')}
      style={{
        width: '100%', padding: '0.7rem 0.85rem', borderRadius: 10,
        border: '1.5px solid var(--input-border)', background: 'var(--input-bg)',
        fontSize: '0.92rem', color: 'var(--input-text)', outline: 'none',
        boxSizing: 'border-box',
      }}
    >
      <option value="light">☀️ Claro</option>
      <option value="dark">🌙 Oscuro</option>
    </select>
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

  const [toast, setToast] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Identity verification ────────────────────────────────────────────────
  const [idOpen,      setIdOpen]      = useState(false);
  const [isVerified,  setIsVerified]  = useState(false);
  const [idDocs,      setIdDocs]      = useState<Record<string, { status: string; rejection_reason?: string; expires_at?: string }>>({});
  const [idExpiries,  setIdExpiries]  = useState<Record<string, string>>({});
  const [idUploading, setIdUploading] = useState<Record<string, boolean>>({});

  const ID_DOCS = [
    { key: 'selfie_cedula', icon: '🤳', label: 'Selfie sosteniendo tu cédula', hint: 'Cara y cédula visibles', requiresExpiry: false },
    { key: 'cedula_frente', icon: '🪪', label: 'Cédula — frente', hint: 'Con fecha de vencimiento visible', requiresExpiry: true },
  ];

  const loadIdDocs = useCallback(async () => {
    if (!email) return;
    try {
      const res  = await authFetch(`/api/upload-driver-doc?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      const clientDocs = (json.docs || []).filter((d: { role: string }) => d.role === 'client');
      const sm: Record<string, { status: string; rejection_reason?: string; expires_at?: string }> = {};
      const ex: Record<string, string> = {};
      for (const d of clientDocs) {
        sm[d.doc_type] = { status: d.status, rejection_reason: d.rejection_reason, expires_at: d.expires_at };
        if (d.expires_at) ex[d.doc_type] = d.expires_at.substring(0, 10);
      }
      setIdDocs(sm);
      setIdExpiries(ex);
    } catch { /* non-fatal */ }
  }, [email]);

  const loadVerified = useCallback(async () => {
    if (!email) return;
    try {
      const res  = await fetch(`/api/client-profile?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      setIsVerified(json.profile?.is_verified === true);
    } catch { /* non-fatal */ }
  }, [email]);

  useEffect(() => { loadIdDocs(); loadVerified(); }, [loadIdDocs, loadVerified]);

  const uploadIdDoc = async (docType: string, file: File) => {
    if (!email) return;
    setIdUploading(p => ({ ...p, [docType]: true }));
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64   = btoa(binary);
      const expiresAt = idExpiries[docType] || null;
      const res = await authFetch('/api/upload-driver-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, doc_type: docType, base64, mimeType: file.type, role: 'client', expires_at: expiresAt }),
      });
      const json = await res.json();
      if (json.error) { showToast('Error: ' + json.error); }
      else {
        setIdDocs(p => ({ ...p, [docType]: { ...p[docType], status: 'pending', rejection_reason: undefined } }));
        showToast('Documento enviado ✓ — pendiente de revisión');
      }
    } catch { showToast('Error al subir documento'); }
    setIdUploading(p => ({ ...p, [docType]: false }));
  };

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

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authFetch('/api/client-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, display_name: nameInput, phone: phoneInput }),
      });
      const json = await res.json();
      if (json.error) { showToast('Error: ' + json.error); setSavingProfile(false); return; }
      setPhone(phoneInput);
    } catch { showToast('Error de conexión'); setSavingProfile(false); return; }

    if (newPass) {
      if (newPass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres'); setSavingProfile(false); return; }
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) { showToast('Error: ' + error.message); setSavingProfile(false); return; }
      setNewPass('');
    }

    setSavingProfile(false);
    showToast('Configuración guardada ✓');
  };

  return (
    <ClientScreenLayout title="Configuración">
      <form onSubmit={handleSaveAll}>

        {/* ── Perfil ── */}
        <div className="client-form-card">
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
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                {displayName || email?.split('@')[0]}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 2 }}>{email}</div>
              {isVerified && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 10px', borderRadius: 99, background: '#d1fae5', color: '#065f46', fontSize: '0.72rem', fontWeight: 700 }}>
                  ✅ Identidad verificada
                </span>
              )}
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
        </div>

        {/* ── Verificar identidad ── */}
        {(() => {
          const approvedCount = ID_DOCS.filter(d => idDocs[d.key]?.status === 'approved').length;
          const hasRejected   = ID_DOCS.some(d => idDocs[d.key]?.status === 'rejected');
          const allApproved   = approvedCount === ID_DOCS.length;
          const bgCol    = isVerified ? '#f0fdf4' : hasRejected ? '#fef2f2' : approvedCount > 0 ? '#fefce8' : '#f8fafc';
          const bdCol    = isVerified ? '#bbf7d0' : hasRejected ? '#fca5a5' : approvedCount > 0 ? '#fcd34d' : '#e2e8f0';
          const headerIcon = isVerified ? '✅' : hasRejected ? '❌' : approvedCount > 0 ? '⏳' : '🪪';
          return (
            <div className="client-form-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setIdOpen(p => !p)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '1rem 1.25rem', border: 'none', background: bgCol, cursor: 'pointer', outline: 'none',
                  borderBottom: idOpen ? `1.5px solid ${bdCol}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>{headerIcon}</span>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: '#1f2937' }}>Verificar tu identidad</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#4b5563' }}>
                      {isVerified ? 'Identidad verificada — badge ✅ activo en tu perfil'
                        : allApproved ? 'Documentos enviados — en revisión'
                        : hasRejected ? `${approvedCount}/${ID_DOCS.length} aprobados · documentos rechazados`
                        : approvedCount > 0 ? `${approvedCount}/${ID_DOCS.length} aprobados · opcional`
                        : 'Opcional · obtené el badge Verificado'}
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: '1rem', color: '#6b7280', flexShrink: 0 }}>{idOpen ? '∧' : '∨'}</span>
              </button>

              {idOpen && (
                <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
                    Subí los dos documentos para obtener el <strong>badge ✅ Verificado</strong> en tu perfil.
                    Es completamente opcional — el admin lo revisará y te avisará por email.
                  </p>

                  {ID_DOCS.map(doc => {
                    const ds        = idDocs[doc.key];
                    const isUp      = idUploading[doc.key];
                    const isLocked  = ds?.status === 'approved';
                    const needsDate = doc.requiresExpiry && !idExpiries[doc.key];
                    return (
                      <div key={doc.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--input-bg)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{doc.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3 }}>{doc.label}</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{doc.hint}</p>
                            {ds?.rejection_reason && <p style={{ margin: 0, fontSize: '0.7rem', color: '#dc2626' }}>↳ {ds.rejection_reason}</p>}
                          </div>
                          {ds && (
                            <span style={{ flexShrink: 0, borderRadius: 99, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700, background: ds.status === 'approved' ? '#d1fae5' : ds.status === 'rejected' ? '#fee2e2' : '#fef3c7', color: ds.status === 'approved' ? '#065f46' : ds.status === 'rejected' ? '#991b1b' : '#92400e' }}>
                              {ds.status === 'approved' ? '✅ Aprobado' : ds.status === 'rejected' ? '❌ Rechazado' : '⏳ Pendiente'}
                            </span>
                          )}
                          {isUp ? (
                            <span style={{ fontSize: '0.72rem', color: '#6b7280', flexShrink: 0 }}>Subiendo...</span>
                          ) : isLocked ? (
                            <span style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 8, background: '#f0fdf4', color: '#059669', fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid #bbf7d0' }}>🔒 Ok</span>
                          ) : needsDate ? (
                            <span style={{ flexShrink: 0, cursor: 'not-allowed', padding: '5px 10px', borderRadius: 8, background: '#f3f4f6', color: '#9ca3af', fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid #e5e7eb' }}>📅 Fecha primero</span>
                          ) : (
                            <label style={{ flexShrink: 0, cursor: 'pointer', padding: '5px 10px', borderRadius: 8, background: ds?.status === 'rejected' ? '#fff7f7' : '#f0f9ff', color: ds?.status === 'rejected' ? '#dc2626' : '#0284c7', fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid', borderColor: ds?.status === 'rejected' ? '#fca5a5' : '#bae6fd', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {ds ? '↑ Re-subir' : '↑ Subir'}
                              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadIdDoc(doc.key, f); e.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                        {doc.requiresExpiry && !isLocked && (
                          <div style={{ marginTop: 4, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Vencimiento cédula:</span>
                            <input type="date" value={idExpiries[doc.key] || ''} onChange={e => setIdExpiries(p => ({ ...p, [doc.key]: e.target.value }))} style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: 8, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Cuenta ── */}
        <div className="client-form-card">
          <h3 className="client-form-title">🔒 Cuenta</h3>
          <div className="client-form-grid">
            <div>
              <label className="client-form-label">Email</label>
              <input className="client-form-input" value={email} readOnly style={{ opacity: 0.6 }} />
            </div>
            <div>
              <label className="client-form-label">Nueva contraseña <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
              <input className="client-form-input" type="password" placeholder="Mínimo 6 caracteres"
                value={newPass} onChange={e => setNewPass(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Tema ── */}
        <div className="client-form-card">
          <h3 className="client-form-title">🎨 Tema de la app</h3>
          <ThemeSelector />
        </div>

        {/* ── Toast ── */}
        {toast && <div className="client-toast">{toast}</div>}

        {/* ── Botón único guardar ── */}
        <button
          type="submit"
          disabled={savingProfile}
          style={{
            width: '100%', padding: '1rem', borderRadius: 16, border: 'none',
            background: savingProfile ? '#f0e68c' : 'linear-gradient(135deg, #10b981, #059669)',
            color: savingProfile ? '#888' : '#fff', fontWeight: 800, fontSize: '1rem',
            cursor: savingProfile ? 'not-allowed' : 'pointer',
            boxShadow: savingProfile ? 'none' : '0 6px 20px rgba(16,185,129,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.18s', marginBottom: '1rem',
          }}
        >
          {savingProfile ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
              Guardando...
            </>
          ) : '💾 Guardar configuración'}
        </button>

      </form>
    </ClientScreenLayout>
  );
}
