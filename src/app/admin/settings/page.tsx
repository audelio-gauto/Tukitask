'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // ── Logo / Branding ──────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl]       = useState('/logo.svg');
  const [logoSize, setLogoSize]     = useState(90);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMsg, setLogoMsg]       = useState('');
  const [sizeSaving, setSizeSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  };

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.logo_url)  setLogoUrl(cfg.logo_url);
        if (cfg.logo_size) setLogoSize(Number(cfg.logo_size));
      });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoMsg('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      // Show local preview immediately
      setLogoPreview(URL.createObjectURL(file));
      const res = await fetch('/api/admin/upload-logo', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ base64, mimeType: file.type, fileName: 'logo' }),
      });
      const json = await res.json();
      if (json.url) {
        setLogoUrl(json.url);
        setLogoPreview(json.url);
        setLogoMsg('✅ Logo actualizado correctamente');
      } else {
        setLogoMsg(`❌ ${json.error || 'Error al subir'}`);
      }
    } catch {
      setLogoMsg('❌ Error al subir el logo');
    }
    setLogoUploading(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleSaveSize = async () => {
    setSizeSaving(true);
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ key: 'logo_size', value: String(logoSize) }),
    });
    const json = await res.json();
    setLogoMsg(json.ok ? '✅ Tamaño guardado' : `❌ ${json.error}`);
    setSizeSaving(false);
  };

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    const form = e.target as HTMLFormElement;
    const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
    if (newPassword.length < 6) {
      setMessage('La contraseña debe tener al menos 6 caracteres');
      setSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Contraseña actualizada correctamente');
      form.reset();
    }
    setSaving(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Ajustes de tu cuenta y preferencias del sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#C8960A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Información de cuenta
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  disabled
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                />
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Verificado
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <input
                type="text"
                value="Administrador"
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
              />
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#C8960A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Cambiar contraseña
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <input
                type="password"
                name="newPassword"
                minLength={6}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] outline-none"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#F5C518] text-[#1C1C2E] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#E6A800] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </form>
          {message && (
            <div className={`mt-3 p-3 text-sm rounded-lg border ${message.includes('correctamente')
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {message}
            </div>
          )}
        </div>

        {/* ── Logo & Branding ── */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#C8960A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Logo & Branding
          </h3>

          <div className="flex flex-col sm:flex-row gap-8 items-start">
            {/* Preview */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                <img
                  src={logoPreview || logoUrl}
                  alt="Logo preview"
                  style={{ height: logoSize, width: 'auto', objectFit: 'contain' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).src = '/logo.svg'; }}
                />
              </div>
              <span className="text-xs text-gray-400">Vista previa login</span>
            </div>

            {/* Controls */}
            <div className="flex-1 space-y-5">
              {/* Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subir nuevo logo</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoFile}
                    className="hidden"
                    id="logo-upload-input"
                  />
                  <label
                    htmlFor="logo-upload-input"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#F5C518] bg-[#FEF9E7] text-[#C8960A] text-sm font-semibold hover:bg-[#FDF3C0] transition-colors"
                  >
                    {logoUploading ? (
                      <span className="inline-block w-4 h-4 border-2 border-[#C8960A] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    )}
                    {logoUploading ? 'Subiendo...' : 'Seleccionar imagen'}
                  </label>
                  <span className="text-xs text-gray-400">PNG, JPG, WebP, SVG · máx 2MB</span>
                </div>
              </div>

              {/* Size slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tamaño del logo en login: <span className="text-[#C8960A] font-bold">{logoSize}px</span>
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={40}
                    max={160}
                    step={5}
                    value={logoSize}
                    onChange={e => setLogoSize(Number(e.target.value))}
                    className="flex-1 accent-[#F5C518]"
                  />
                  <button
                    onClick={handleSaveSize}
                    disabled={sizeSaving}
                    className="px-4 py-2 rounded-lg bg-[#F5C518] text-[#1C1C2E] text-sm font-semibold hover:bg-[#E6A800] transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {sizeSaving ? 'Guardando...' : 'Guardar tamaño'}
                  </button>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>40px (pequeño)</span>
                  <span>160px (grande)</span>
                </div>
              </div>

              {/* URL actual */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">URL actual del logo</label>
                <input
                  type="text"
                  value={logoUrl}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-400 truncate"
                />
              </div>

              {/* Feedback */}
              {logoMsg && (
                <div className={`p-3 text-sm rounded-lg border ${logoMsg.startsWith('✅')
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {logoMsg}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#C8960A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Información del sistema
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Versión</p>
              <p className="text-sm font-semibold text-gray-800">1.0.0</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Framework</p>
              <p className="text-sm font-semibold text-gray-800">Next.js 14 + Supabase</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Estado</p>
              <p className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
                Operativo
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
