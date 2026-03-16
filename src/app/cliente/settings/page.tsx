'use client';
import { useState } from 'react';
import ClientScreenLayout from '../components/ClientScreenLayout';
import { useClientContext } from '../context';
import { supabase } from '@/lib/supabaseClient';

export default function ClientSettingsPage() {
  const { email, displayName } = useClientContext();
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving(false);
    if (error) showToast('Error: ' + error.message);
    else { showToast('Contraseña actualizada'); setNewPass(''); }
  };

  return (
    <ClientScreenLayout title="Configuración">
      {/* Account info */}
      <div className="client-form-card">
        <h3 className="client-form-title">👤 Información de Cuenta</h3>
        <div className="client-form-grid">
          <div>
            <label className="client-form-label">Email</label>
            <input className="client-form-input" value={email} readOnly style={{ background: '#f9fafb' }} />
          </div>
          <div>
            <label className="client-form-label">Nombre</label>
            <input className="client-form-input" value={displayName} readOnly style={{ background: '#f9fafb' }} />
          </div>
        </div>
      </div>

      {/* Change password */}
      <form className="client-form-card" onSubmit={handleChangePassword}>
        <h3 className="client-form-title">🔒 Cambiar Contraseña</h3>
        <div className="client-form-grid">
          <div>
            <label className="client-form-label">Nueva contraseña</label>
            <input className="client-form-input" type="password" placeholder="Mínimo 6 caracteres" value={newPass} onChange={e => setNewPass(e.target.value)} />
          </div>
          <button type="submit" className="client-btn client-btn-primary" disabled={saving} style={{ alignSelf: 'start' }}>
            {saving ? 'Guardando...' : 'Actualizar Contraseña'}
          </button>
        </div>
      </form>

      {toast && <div className="client-toast">{toast}</div>}
    </ClientScreenLayout>
  );
}
