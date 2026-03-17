'use client';

import { useEffect, useState } from 'react';

interface DriverItem {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
}

export default function DriverListPage() {
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/drivers/list');
        if (!res.ok) throw new Error('Error cargando drivers');
        const json = await res.json();
        setDrivers(json.data || []);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Driver - Roles registrados</h1>
        <p className="text-gray-500 text-sm mt-1">Listado de usuarios con rol de conductor.</p>
      </div>

      {loading && (
        <div className="py-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flow-root">
            <ul className="divide-y divide-gray-100">
              {drivers.map(d => (
                <li key={d.id} className="py-3 sm:py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.full_name || d.email}</p>
                      <p className="text-sm text-gray-500 truncate">{d.email}</p>
                    </div>
                    <div className="text-sm text-gray-500">{d.role || 'driver'}</div>
                  </div>
                </li>
              ))}
              {drivers.length === 0 && (
                <li className="py-6 text-center text-gray-500">No se encontraron drivers</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
