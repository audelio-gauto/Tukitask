'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';

interface SuspiciousEntry {
  reason: string;
  severity: 'high' | 'medium';
  client_email: string;
  driver_email?: string;
  count?: number;
  order_ids?: string[];
  order_id?: string;
  offer?: number;
  created_at?: string;
}

export default function SuspiciousOrdersPage() {
  const [data, setData] = useState<SuspiciousEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/orders/suspicious', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = await res.json();
        setData(json.data || []);
        setTotal(json.total || 0);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
          <Icon name="alert-triangle" size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedidos Sospechosos</h1>
          <p className="text-sm text-gray-500">Patrones anómalos detectados en los últimos 30 días</p>
        </div>
        {!loading && (
          <span className="ml-auto text-sm font-semibold text-orange-700 bg-orange-100 px-3 py-1 rounded-full border border-orange-200">
            {total} alertas
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-5 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
          Alta severidad
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
          Media severidad
        </span>
        <span className="text-gray-400 ml-auto">
          Criterios: pares con &gt;3 pedidos en 30d · &gt;5 cancelaciones en 7d · oferta &lt;1000 Gs
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {!loading && !error && data.length === 0 && (
        <div className="p-12 text-center bg-white border border-gray-200 rounded-lg">
          <Icon name="check" size={32} />
          <p className="text-gray-500 mt-3 font-medium">Sin actividad sospechosa detectada</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="space-y-3">
          {data.map((item, idx) => (
            <div
              key={idx}
              className={`bg-white rounded-lg border shadow-sm p-4 ${item.severity === 'high' ? 'border-red-200' : 'border-orange-200'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item.severity === 'high' ? 'bg-red-500' : 'bg-orange-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {item.severity === 'high' ? 'ALTA' : 'MEDIA'}
                    </span>
                    <p className="text-sm font-semibold text-gray-800">{item.reason}</p>
                  </div>

                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
                    <a
                      href={`/admin/clients?search=${encodeURIComponent(item.client_email)}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium truncate max-w-[200px]"
                    >
                      <Icon name="user" size={11} />
                      {item.client_email}
                    </a>
                    {item.driver_email && (
                      <a
                        href={`/admin/drivers/driver?search=${encodeURIComponent(item.driver_email)}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium truncate max-w-[200px]"
                      >
                        <Icon name="car" size={11} />
                        {item.driver_email}
                      </a>
                    )}
                    {item.count && (
                      <span className="font-semibold text-gray-700">{item.count} veces</span>
                    )}
                    {item.offer !== undefined && (
                      <span className="font-semibold text-gray-700">
                        Oferta: {new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(item.offer)}
                      </span>
                    )}
                    {item.created_at && (
                      <span className="text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('es-PY')}
                      </span>
                    )}
                  </div>

                  {item.order_ids && item.order_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.order_ids.map(id => (
                        <span key={id} className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                          {id.slice(0, 8)}…
                        </span>
                      ))}
                      {(item.count ?? 0) > (item.order_ids?.length ?? 0) && (
                        <span className="text-[10px] text-gray-400">+{(item.count ?? 0) - (item.order_ids?.length ?? 0)} más</span>
                      )}
                    </div>
                  )}

                  {item.order_id && (
                    <div className="mt-2">
                      <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                        {item.order_id.slice(0, 8)}…
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
