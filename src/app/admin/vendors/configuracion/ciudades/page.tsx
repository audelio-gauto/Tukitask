'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { PY_CITIES } from '@/app/tienda/data';

interface DeliveryCity {
  city: string;
  shipping_price: number;
  delivery_days: number;
  free_shipping: boolean;
  cash_on_delivery: boolean;
  transfer: boolean;
}

export default function DeliveryCitiesAdminPage() {
  const [cities, setCities] = useState<DeliveryCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCity, setNewCity] = useState('');

  const allCities = Array.from(new Set([...PY_CITIES, ...cities.map(item => item.city)])).sort((a, b) => a.localeCompare(b, 'es'));

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  };

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setMsg({ ok: false, text: 'Sesión expirada. Volvé a iniciar sesión.' });
        setLoading(false);
        return;
      }

      const res = await fetch('/api/admin/delivery-cities', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setMsg({ ok: false, text: 'No se pudieron cargar las ciudades de entrega.' });
        setLoading(false);
        return;
      }

      const json = await res.json();
      const list: DeliveryCity[] = Array.isArray(json.cities) ? json.cities : [];
      setCities(list.length ? list : PY_CITIES.slice(0, 6).map(city => ({
        city,
        shipping_price: 25000,
        delivery_days: 4,
        free_shipping: false,
        cash_on_delivery: true,
        transfer: true,
      })));
      setLoading(false);
    })();
  }, []);

  const addCustomCity = () => {
    const city = newCity.trim();
    if (!city) return;

    const clean = city.replace(/\s+/g, ' ');
    if (cities.some(item => item.city.toLowerCase() === clean.toLowerCase())) {
      setNewCity('');
      return;
    }

    setCities(prev => [...prev, {
      city: clean,
      shipping_price: 25000,
      delivery_days: 4,
      free_shipping: false,
      cash_on_delivery: true,
      transfer: true,
    }]);
    setNewCity('');
  };

  const setValue = (city: string, patch: Partial<DeliveryCity>) => {
    setCities(prev => prev.map(item => item.city === city ? { ...item, ...patch } : item));
  };

  const removeCity = (city: string) => {
    setCities(prev => prev.filter(item => item.city !== city));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const token = await getToken();
    if (!token) {
      setMsg({ ok: false, text: 'Sesión expirada. Volvé a iniciar sesión.' });
      setSaving(false);
      return;
    }

    const res = await fetch('/api/admin/delivery-cities', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cities: cities.filter(c => c.city.trim()) }),
    });

    if (res.ok) {
      setMsg({ ok: true, text: 'Ciudades de entrega guardadas.' });
    } else {
      const body = await res.json().catch(() => ({ error: 'Error al guardar.' }));
      setMsg({ ok: false, text: body.error || 'Error al guardar.' });
    }

    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ciudades de entrega</h1>
        <p className="text-sm text-gray-500 mt-1">Configurá las ciudades habilitadas para envío, el costo por ciudad y los métodos de pago disponibles.</p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Cargando ciudades...</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Crear ciudad nueva</label>
            <div className="flex gap-3 flex-wrap">
              <input
                value={newCity}
                onChange={e => setNewCity(e.target.value)}
                placeholder="Ej: Pedro Juan Caballero"
                className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <button
                type="button"
                onClick={addCustomCity}
                className="bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg"
              >
                Agregar ciudad
              </button>
            </div>
          </div>

          {allCities.map(city => {
            const item = cities.find(entry => entry.city === city) ?? {
              city,
              shipping_price: 25000,
              delivery_days: 4,
              free_shipping: false,
              cash_on_delivery: true,
              transfer: true,
            };
            const enabled = cities.some(entry => entry.city === city);

            return (
              <div key={city} className={`rounded-xl border p-4 ${enabled ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCities(prev => {
                          const exists = prev.some(entry => entry.city === city);
                          if (exists) return prev.filter(entry => entry.city !== city);
                          return [...prev, { city, shipping_price: 25000, delivery_days: 4, free_shipping: false, cash_on_delivery: true, transfer: true }];
                        });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold ${enabled ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}
                    >
                      {enabled ? 'Habilitada' : 'Habilitar'}
                    </button>
                    {enabled && !PY_CITIES.includes(city) && (
                      <button
                        type="button"
                        onClick={() => removeCity(city)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  <span className="font-semibold text-gray-900">{city}</span>
                </div>

                {enabled && (
                  <div className="mt-4 grid md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Precio de envío</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={item.free_shipping ? 0 : item.shipping_price || ''}
                        onChange={e => setValue(city, { shipping_price: Number(e.target.value) || 0, free_shipping: Number(e.target.value) === 0 })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        disabled={item.free_shipping}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Días hábiles</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={item.delivery_days || 4}
                        onChange={e => setValue(city, { delivery_days: Number(e.target.value) || 4 })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm text-gray-700 pt-6">
                      <input
                        type="checkbox"
                        checked={Boolean(item.free_shipping)}
                        onChange={e => setValue(city, { free_shipping: e.target.checked, shipping_price: e.target.checked ? 0 : item.shipping_price || 25000 })}
                      />
                      Envío gratis
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-700 pt-6">
                      <input
                        type="checkbox"
                        checked={Boolean(item.cash_on_delivery)}
                        onChange={e => setValue(city, { cash_on_delivery: e.target.checked })}
                      />
                      Contra entrega
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-700 pt-6 md:col-span-1">
                      <input
                        type="checkbox"
                        checked={Boolean(item.transfer)}
                        onChange={e => setValue(city, { transfer: e.target.checked })}
                      />
                      Transferencia
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {msg && <span className={`text-sm font-medium ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
