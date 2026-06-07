'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type TaxonomyType = 'category' | 'brand' | 'attribute' | 'tag';

type Item = {
  id: number;
  taxonomy_type: TaxonomyType;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export default function TaxonomyManager({
  type,
  title,
  subtitle,
  breadcrumb,
}: {
  type: TaxonomyType;
  title: string;
  subtitle: string;
  breadcrumb: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState({ name: '', description: '' });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const url = `/api/admin/vendors/catalog-taxonomies?type=${type}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar datos');
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [type, q]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const activeCount = useMemo(() => items.filter(i => i.is_active).length, [items]);

  const createItem = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/vendors/catalog-taxonomies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          name: draft.name,
          description: draft.description,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo crear');
      setDraft({ name: '', description: '' });
      await fetchItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: Item) => {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/vendors/catalog-taxonomies', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: item.id,
          type,
          is_active: !item.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo actualizar');
      setItems(prev => prev.map(x => (x.id === item.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: Item) => {
    if (!confirm(`Eliminar "${item.name}"?`)) return;
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch(`/api/admin/vendors/catalog-taxonomies?id=${item.id}&type=${type}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo eliminar');
      setItems(prev => prev.filter(x => x.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/productos" className="hover:text-gray-600 transition-colors">Productos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">{breadcrumb}</span>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>
          </div>
          <div className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-semibold">
            {activeCount} activos · {items.length} total
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
          <input
            value={draft.name}
            onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))}
            placeholder={`Nombre de ${breadcrumb.toLowerCase()}`}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Descripcion (opcional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={createItem}
            disabled={saving || !draft.name.trim()}
            className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg text-sm font-bold hover:bg-yellow-400 disabled:opacity-50"
          >
            Crear
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/70">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o slug"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No hay registros.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(item => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">/{item.slug}</p>
                  {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(item)}
                    disabled={saving}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${item.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                  >
                    {item.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    onClick={() => removeItem(item)}
                    disabled={saving}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold text-red-600 border border-red-200 bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
