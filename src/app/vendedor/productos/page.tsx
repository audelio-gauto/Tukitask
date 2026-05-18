'use client';
import { useState } from 'react';
import Link from 'next/link';

/* ── Types ───────────────────────────────────────────────── */
type ProductStatus = 'published' | 'draft' | 'out_of_stock' | 'paused';
type ProductType   = 'physical' | 'digital' | 'service';

interface Product {
  id: string;
  image?: string;
  name: string;
  sku: string;
  status: ProductStatus;
  stock: number;
  price: number;
  floorPrice: number;
  type: ProductType;
  views: number;
  createdAt: string;
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtGs(n: number) {
  return '₲\u00a0' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

const STATUS_CFG: Record<ProductStatus, { cls: string; label: string; dot: string }> = {
  published:    { cls: 'vnd-badge-green',  label: 'Publicado',  dot: '#4ade80' },
  draft:        { cls: 'vnd-badge-gray',   label: 'Borrador',   dot: '#9aa8ba' },
  out_of_stock: { cls: 'vnd-badge-red',    label: 'Agotado',    dot: '#f87171' },
  paused:       { cls: 'vnd-badge-amber',  label: 'Pausado',    dot: '#fbbf24' },
};

const TYPE_CFG: Record<ProductType, string> = {
  physical: '📦 Físico',
  digital:  '💾 Digital',
  service:  '🔧 Servicio',
};

/* Sample mock data — replace with Supabase query */
const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'Auricular JBL Tune 510', sku: 'JBL-510-BLK', status: 'published', stock: 48, price: 180000, floorPrice: 130000, type: 'physical', views: 234, createdAt: '2026-05-10' },
  { id: '2', name: 'Cable USB-C 2m Tejido', sku: 'USB-2M-WH', status: 'published', stock: 120, price: 35000, floorPrice: 25000, type: 'physical', views: 89, createdAt: '2026-05-12' },
  { id: '3', name: 'Funda Samsung A55', sku: 'FUNDA-A55', status: 'out_of_stock', stock: 0, price: 28000, floorPrice: 18000, type: 'physical', views: 412, createdAt: '2026-05-08' },
  { id: '4', name: 'Cargador 65W GaN', sku: 'CHG-65W-BLK', status: 'draft', stock: 30, price: 120000, floorPrice: 90000, type: 'physical', views: 0, createdAt: '2026-05-18' },
  { id: '5', name: 'Soporte para Auto Magnético', sku: 'SOPORTE-MAG', status: 'paused', stock: 15, price: 45000, floorPrice: 32000, type: 'physical', views: 67, createdAt: '2026-05-14' },
];

type TabKey = 'all' | ProductStatus;

const TABS: { key: TabKey; label: string; filter: (p: Product) => boolean }[] = [
  { key: 'all',          label: 'Todos',      filter: () => true },
  { key: 'published',    label: 'Publicados', filter: p => p.status === 'published' },
  { key: 'draft',        label: 'Borrador',   filter: p => p.status === 'draft' },
  { key: 'out_of_stock', label: 'Agotados',   filter: p => p.status === 'out_of_stock' },
  { key: 'paused',       label: 'Pausados',   filter: p => p.status === 'paused' },
];

/* ══════════════════════════════════════════════════════════ */
export default function ProductosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch]       = useState('');
  const [products]                = useState<Product[]>(MOCK_PRODUCTS);

  const filtered = products
    .filter(TABS.find(t => t.key === activeTab)!.filter)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) ||
                 p.sku.toLowerCase().includes(search.toLowerCase()));

  const countOf = (k: TabKey) => TABS.find(t => t.key === k)!.filter
    ? products.filter(TABS.find(t => t.key === k)!.filter).length : 0;

  const earnings = (p: Product) => ((p.price - p.floorPrice) / p.price * 100).toFixed(0);

  return (
    <div>
      {/* Heading */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading">Productos</h1>
          <p className="vnd-page-sub">Gestioná tu catálogo — {products.length} producto{products.length !== 1 ? 's' : ''} en total</p>
        </div>
        <Link href="/vendedor/productos/nuevo" className="vnd-btn vnd-btn-primary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Añadir nuevo producto
        </Link>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        {/* Tabs */}
        <div className="vnd-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`vnd-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              <span className="vnd-tab-count">{countOf(t.key)}</span>
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="vnd-search-wrap">
            <svg className="vnd-search-icon" width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="vnd-search"
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="vnd-select">
            <option>Más recientes</option>
            <option>Más vendidos</option>
            <option>Mayor precio</option>
            <option>Menor precio</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="vnd-card">
        {filtered.length === 0 ? (
          <div className="vnd-empty">
            <div className="vnd-empty-icon">📦</div>
            <p className="vnd-empty-title">No hay productos en esta categoría</p>
            <p className="vnd-empty-sub">Añadí tu primer producto y empezá a vender en TukiMarket</p>
            <Link href="/vendedor/productos/nuevo" className="vnd-btn vnd-btn-primary" style={{ marginTop: 8 }}>
              Añadir producto
            </Link>
          </div>
        ) : (
          <div className="vnd-table-wrap">
            <table className="vnd-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Imagen</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Inventario</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Margen</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Vistas</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const cfg = STATUS_CFG[p.status];
                  return (
                    <tr key={p.id}>
                      {/* Image */}
                      <td style={{ paddingLeft: 22 }}>
                        {p.image
                          ? <img src={p.image} alt={p.name} className="vnd-table-img" />
                          : (
                            <div className="vnd-table-img-placeholder">📦</div>
                          )
                        }
                      </td>

                      {/* Name */}
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--vnd-text-primary)', fontSize: '0.875rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 2 }}>
                          Piso: {fmtGs(p.floorPrice)}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`vnd-badge ${cfg.cls}`}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* SKU */}
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--vnd-text-muted)' }}>
                          {p.sku}
                        </span>
                      </td>

                      {/* Stock */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 700,
                          color: p.stock === 0 ? 'var(--vnd-danger)' : p.stock <= 5 ? 'var(--vnd-warning)' : 'var(--vnd-text-primary)',
                        }}>
                          {p.stock === 0 ? '—' : p.stock}
                        </span>
                        <span style={{ color: 'var(--vnd-text-muted)', fontSize: '0.72rem' }}> und</span>
                      </td>

                      {/* Price */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, color: 'var(--vnd-text-primary)' }}>{fmtGs(p.price)}</span>
                      </td>

                      {/* Margin */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: '#4ade80' }}>{earnings(p)}%</span>
                      </td>

                      {/* Type */}
                      <td>
                        <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-secondary)' }}>
                          {TYPE_CFG[p.type]}
                        </span>
                      </td>

                      {/* Views */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--vnd-text-muted)' }}>
                          {p.views > 0 ? p.views.toLocaleString('es-PY') : '—'}
                        </span>
                      </td>

                      {/* Date */}
                      <td>
                        <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(p.createdAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ paddingRight: 18 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="vnd-action-btn" title="Editar">
                            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Editar
                          </button>
                          <button className="vnd-action-btn" title="Ver más opciones"
                            style={{ padding: '5px 8px' }}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      <p style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', marginTop: 12, textAlign: 'right' }}>
        Mostrando {filtered.length} de {products.length} productos
      </p>
    </div>
  );
}
