 'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useDriverContext } from '../driver/context';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const DriverMap = dynamic(() => import('../driver/components/DriverMap'), { ssr: false });

// ── Service catalogue (must mirror servicio/page.tsx) ─────────────────────────
const SERVICES_MUJER = [
  { key: 'limpieza',         label: 'Limpieza',          icon: '🧹' },
  { key: 'niera',            label: 'Niñera',            icon: '👶' },
  { key: 'cocina',           label: 'Cocina',            icon: '🍳' },
  { key: 'eventos',          label: 'Eventos',           icon: '🎉' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'otros',            label: 'Otros',             icon: '✨' },
];
const SERVICES_HOMBRE = [
  { key: 'aire_split',       label: 'Tec Aire Split',    icon: '❄️' },
  { key: 'electrico',        label: 'Serv. Eléctrico',   icon: '⚡' },
  { key: 'plomeria',         label: 'Serv. Plomería',    icon: '🔧' },
  { key: 'cerrajeria',       label: 'Serv. Cerrajería',  icon: '🔑' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'otros',            label: 'Otros',             icon: '✨' },
];

function getCatalogueForGender(gender: string) {
  if (gender === 'mujer')  return SERVICES_MUJER;
  if (gender === 'hombre') return SERVICES_HOMBRE;
  // No gender set: show all unique services
  const seen = new Set<string>();
  return [...SERVICES_MUJER, ...SERVICES_HOMBRE].filter(s => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
}

function buildDefaultFilters(catalogue: { key: string }[]) {
  const f: Record<string, boolean> = {};
  catalogue.forEach(s => { f[s.key] = true; });
  return f;
}

export default function TecnicoDashboard() {
  const { openDrawer, email } = useDriverContext();

  // ── Availability – persisted ───────────────────────────────────────────────
  const [available, setAvailable] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Gender loaded from profile ─────────────────────────────────────────────
  const [gender, setGender] = useState<'hombre' | 'mujer' | ''>('');

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen]     = useState(false);
  const [serviceFilters, setServiceFilters] = useState<Record<string, boolean>>({});
  const [rangoKm, setRangoKm]           = useState(20);

  const isDesktop = useCallback(() => window.matchMedia('(min-width: 768px)').matches, []);

  // Bootstrap from localStorage + API on mount
  useEffect(() => {
    if (!isDesktop()) setSheetState('half');

    try {
      const savedAvail   = localStorage.getItem('tecnico_available');
      const savedRango   = localStorage.getItem('tecnico_rango_km');
      const savedFilters = localStorage.getItem('tecnico_service_filters');
      if (savedAvail !== null)    setAvailable(savedAvail === 'true');
      if (savedRango)             setRangoKm(Number(savedRango));
      if (savedFilters)           setServiceFilters(JSON.parse(savedFilters));
    } catch {}

    if (!email) return;
    fetch(`/api/tecnico/settings?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(json => {
        const g = (json?.settings?.gender || '') as 'hombre' | 'mujer' | '';
        setGender(g);
        // If no filters saved yet, build defaults from profile gender
        try {
          if (!localStorage.getItem('tecnico_service_filters')) {
            setServiceFilters(buildDefaultFilters(getCatalogueForGender(g)));
          }
        } catch {}
        // Merge server-saved filters (overwrite local if they exist on server)
        if (json?.settings?.accepted_services) {
          setServiceFilters(prev => ({ ...prev, ...json.settings.accepted_services }));
        }
        if (json?.settings?.pickup_range) setRangoKm(Number(json.settings.pickup_range));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // When gender resolves, ensure filter keys exist for the new catalogue
  useEffect(() => {
    if (!gender) return;
    const catalogue = getCatalogueForGender(gender);
    setServiceFilters(prev => {
      const defaults = buildDefaultFilters(catalogue);
      Object.keys(defaults).forEach(k => { if (prev[k] !== undefined) defaults[k] = prev[k]; });
      return defaults;
    });
  }, [gender]);

  const toggleFilter = (key: string) => {
    setServiceFilters(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('tecnico_service_filters', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const applyFilters = () => {
    try {
      localStorage.setItem('tecnico_service_filters', JSON.stringify(serviceFilters));
      localStorage.setItem('tecnico_rango_km', String(rangoKm));
    } catch {}
    if (email) {
      fetch('/api/tecnico/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accepted_services: serviceFilters, pickup_range: rangoKm }),
      }).catch(() => {});
    }
    setFilterOpen(false);
  };

  const catalogue      = getCatalogueForGender(gender);
  const hasActiveFilter = Object.values(serviceFilters).some(v => !v);
  const enabledCount   = catalogue.filter(s => serviceFilters[s.key]).length;

  const stats = [
    { label: 'Ofertas Activas',   value: 3,              href: '/tecnico/ofertas',    icon: '🎁' },
    { label: 'Citas Confirmadas', value: 5,              href: '/tecnico/citas',      icon: '📅' },
    { label: 'Tasa Aceptación',   value: '75%',          href: '/tecnico/aceptacion', icon: '🏆' },
    { label: 'Ganancias del Mes', value: '2.150.000 Gs.', href: '/tecnico/ganancias', icon: '💰' },
  ];

  return (
    <>
      <div className="tuki-map">
        <DriverMap onLocate={() => {}} />
      </div>

      {/* ── Menú ── */}
      <button className="tuki-float-btn menu" aria-label="Menú" onClick={openDrawer}>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Filtro button ── */}
      <button
        className={`tuki-float-btn filter${hasActiveFilter ? ' has-filter' : ''}`}
        aria-label="Filtrar servicios"
        onClick={() => setFilterOpen(true)}
        style={{ bottom: 'calc(50vh + 16px)' }}
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        {hasActiveFilter && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 8, height: 8, borderRadius: '50%',
            background: '#f59e0b', border: '1.5px solid #fff',
          }} />
        )}
      </button>

      {/* ── Filter Modal ── */}
      {filterOpen && (
        <>
          <div className="driver-filter-overlay" onClick={() => setFilterOpen(false)} />
          <div className="driver-filter-modal">
            <div className="driver-filter-header">
              <h3>Servicios que acepto</h3>
              <button className="driver-filter-close" onClick={() => setFilterOpen(false)} aria-label="Cerrar">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Gender indicator */}
            {gender && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 12px', borderBottom: '1px solid #f1f5f9', marginBottom: 8 }}>
                <span style={{ fontSize: '1.2rem' }}>{gender === 'hombre' ? '👨' : '👩'}</span>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                  Perfil: <strong style={{ color: '#6366f1' }}>{gender === 'hombre' ? 'Hombre' : 'Mujer'}</strong>
                  {' · '}{enabledCount}/{catalogue.length} activos
                </span>
              </div>
            )}

            <p className="driver-filter-subtitle">Activá o desactivá los servicios que querés recibir</p>

            <div className="driver-filter-list">
              {catalogue.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={`driver-filter-item${serviceFilters[item.key] ? ' active' : ''}`}
                  onClick={() => toggleFilter(item.key)}
                >
                  <span className="driver-filter-item-icon">{item.icon}</span>
                  <div className="driver-filter-item-info">
                    <span className="driver-filter-item-label">{item.label}</span>
                  </div>
                  <span className={`driver-filter-toggle${serviceFilters[item.key] ? ' on' : ''}`}>
                    <span className="driver-filter-toggle-knob" />
                  </span>
                </button>
              ))}
            </div>

            {/* Rango de trabajo slider */}
            <div style={{ padding: '12px 4px 4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tuki-text-main)' }}>
                  📍 Rango de trabajo
                </label>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#6366f1' }}>{rangoKm} km</span>
              </div>
              <input
                type="range" min={1} max={60} step={1} value={rangoKm}
                onChange={e => setRangoKm(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>
                <span>1 km</span><span>60 km</span>
              </div>
            </div>

            <button className="driver-filter-done" onClick={applyFilters}>
              Aplicar filtros
            </button>
          </div>
        </>
      )}

      {/* ── Bottom sheet ── */}
      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`}>
        <div className="tuki-sheet-handle"><span className="tuki-sheet-bar" /></div>
        <div className="tuki-sheet-content">

          {/* Availability toggle */}
          <div className="tuki-availability">
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--tuki-text-main)' }}>Estado</h3>
              <span className={`tuki-status-badge ${available ? 'tuki-status-online' : 'tuki-status-offline'}`}>
                {available ? '● CONECTADO' : '● DESCONECTADO'}
              </span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available} onChange={() => {
                const next = !available;
                setAvailable(next);
                try { localStorage.setItem('tecnico_available', String(next)); } catch {}
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Active services summary chip strip */}
          {catalogue.length > 0 && (
            <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: 12, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1' }}>
                  🛠 Serv. activos · {rangoKm} km
                </span>
                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Editar →
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {catalogue.filter(s => serviceFilters[s.key]).map(s => (
                  <span key={s.key} style={{ fontSize: '0.75rem', background: '#ede9fe', color: '#6d28d9', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>
                    {s.icon} {s.label}
                  </span>
                ))}
                {enabledCount === 0 && (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Ningún servicio activo — abrí el filtro para activar.</span>
                )}
              </div>
            </div>
          )}

          <div className="tuki-stats-grid">
            {stats.map((s) => (
              <Link key={s.label} href={s.href} className="tuki-stat-card">
                <span className="tuki-stat-icon">{s.icon}</span>
                <div className="tuki-stat-value">{s.value}</div>
                <div className="tuki-stat-label">{s.label}</div>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tuki-text-main)', marginBottom: '0.75rem' }}>Acciones Rápidas</h2>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
              <button className="tuki-btn tuki-btn-primary" onClick={() => setFilterOpen(true)}>🛠 Mis Servicios</button>
              <Link href="/tecnico/ofertas" className="tuki-btn tuki-btn-success">Ver Ofertas</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
