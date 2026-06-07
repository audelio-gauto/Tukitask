'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Attribute = {
  id: number;
  taxonomy_type: 'attribute';
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type AttributeValue = {
  id: number;
  attribute_id: number;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
};

export default function AttributeWithValuesManager() {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [selectedAttributeId, setSelectedAttributeId] = useState<number | null>(null);
  const [values, setValues] = useState<AttributeValue[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(true);
  const [loadingValues, setLoadingValues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [attrDraft, setAttrDraft] = useState({ name: '', description: '' });
  const [valueDraft, setValueDraft] = useState({ name: '' });

  const selectedAttribute = useMemo(
    () => attributes.find(a => a.id === selectedAttributeId) ?? null,
    [attributes, selectedAttributeId],
  );

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  }, []);

  const loadAttributes = useCallback(async () => {
    setLoadingAttrs(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/vendors/catalog-taxonomies?type=attribute', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudieron cargar atributos');
      const rows = (json.items ?? []) as Attribute[];
      setAttributes(rows);
      setSelectedAttributeId(prev => {
        if (prev && rows.some(r => r.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingAttrs(false);
    }
  }, [getToken]);

  const loadValues = useCallback(async (attributeId: number | null) => {
    if (!attributeId) {
      setValues([]);
      return;
    }
    setLoadingValues(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/vendors/catalog-attribute-values?attribute_id=${attributeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudieron cargar valores');
      setValues((json.items ?? []) as AttributeValue[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingValues(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadAttributes();
  }, [loadAttributes]);

  useEffect(() => {
    loadValues(selectedAttributeId);
  }, [selectedAttributeId, loadValues]);

  const createAttribute = async () => {
    if (!attrDraft.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/vendors/catalog-taxonomies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'attribute',
          name: attrDraft.name,
          description: attrDraft.description,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo crear atributo');
      setAttrDraft({ name: '', description: '' });
      await loadAttributes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const createValue = async () => {
    if (!selectedAttributeId || !valueDraft.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/vendors/catalog-attribute-values', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          attribute_id: selectedAttributeId,
          name: valueDraft.name,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo crear valor');
      setValueDraft({ name: '' });
      await loadValues(selectedAttributeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeAttribute = async (id: number, name: string) => {
    if (!confirm(`Eliminar atributo "${name}" y sus valores?`)) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/vendors/catalog-taxonomies?id=${id}&type=attribute`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo eliminar atributo');
      await loadAttributes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeValue = async (id: number, name: string) => {
    if (!confirm(`Eliminar valor "${name}"?`)) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/vendors/catalog-attribute-values?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo eliminar valor');
      await loadValues(selectedAttributeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleValueActive = async (row: AttributeValue) => {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/vendors/catalog-attribute-values', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: row.id,
          is_active: !row.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo actualizar valor');
      setValues(prev => prev.map(v => (v.id === row.id ? { ...v, is_active: !v.is_active } : v)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/productos" className="hover:text-gray-600 transition-colors">Productos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Atributos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Atributos y Valores</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Estilo WooCommerce: crea atributos (Color, Talla) y luego define sus valores (Azul, Rojo, S, M, XXL).
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Attributes */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/70">
            <h2 className="text-sm font-semibold text-gray-800">Atributos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Ejemplos: Color, Talla, Material</p>
          </div>

          <div className="p-4 border-b border-gray-100 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
            <input
              value={attrDraft.name}
              onChange={(e) => setAttrDraft(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nombre de atributo"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={attrDraft.description}
              onChange={(e) => setAttrDraft(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Descripcion (opcional)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={createAttribute}
              disabled={saving || !attrDraft.name.trim()}
              className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg text-sm font-bold hover:bg-yellow-400 disabled:opacity-50"
            >
              Crear
            </button>
          </div>

          {loadingAttrs ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
            </div>
          ) : attributes.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No hay atributos creados.</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[480px] overflow-auto">
              {attributes.map(a => (
                <div key={a.id} className={`p-4 ${selectedAttributeId === a.id ? 'bg-amber-50/50' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => setSelectedAttributeId(a.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.name}</p>
                      <p className="text-xs text-gray-400">/{a.slug}</p>
                      {a.description && <p className="text-xs text-gray-500 mt-1 truncate">{a.description}</p>}
                    </button>
                    <button
                      onClick={() => removeAttribute(a.id, a.name)}
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
        </section>

        {/* Values */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/70">
            <h2 className="text-sm font-semibold text-gray-800">Valores del atributo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedAttribute ? `Atributo seleccionado: ${selectedAttribute.name}` : 'Selecciona un atributo para gestionar valores'}
            </p>
          </div>

          <div className="p-4 border-b border-gray-100 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <input
              value={valueDraft.name}
              onChange={(e) => setValueDraft({ name: e.target.value })}
              placeholder="Nuevo valor (ej: Azul, Rojo, S, M, XXL)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              disabled={!selectedAttributeId}
            />
            <button
              onClick={createValue}
              disabled={saving || !selectedAttributeId || !valueDraft.name.trim()}
              className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg text-sm font-bold hover:bg-yellow-400 disabled:opacity-50"
            >
              Agregar
            </button>
          </div>

          {loadingValues ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
            </div>
          ) : !selectedAttributeId ? (
            <div className="py-12 text-center text-sm text-gray-400">Selecciona un atributo para ver sus valores.</div>
          ) : values.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No hay valores para este atributo.</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[480px] overflow-auto">
              {values.map(v => (
                <div key={v.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{v.name}</p>
                    <p className="text-xs text-gray-400">/{v.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleValueActive(v)}
                      disabled={saving}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${v.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                    >
                      {v.is_active ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      onClick={() => removeValue(v.id, v.name)}
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
        </section>
      </div>
    </div>
  );
}
