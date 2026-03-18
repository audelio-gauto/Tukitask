 'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useDriverContext } from '../driver/context';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const DriverMap = dynamic(() => import('../driver/components/DriverMap'), { ssr: false });

export default function TecnicoDashboard() {
  const { openDrawer } = useDriverContext();
  const [available, setAvailable] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  const isDesktop = useCallback(() => window.matchMedia('(min-width: 768px)').matches, []);

  useEffect(() => {
    if (!isDesktop()) setSheetState('half');
  }, [isDesktop]);

  const stats = [
    { label: 'Ofertas Activas', value: 3, href: '/tecnico/ofertas', icon: '🎁' },
    { label: 'Citas Confirmadas', value: 5, href: '/tecnico/citas', icon: '📅' },
    { label: 'Tasa de Aceptación', value: '75%', href: '/tecnico/aceptacion', icon: '🏆' },
    { label: 'Ganancias del Mes', value: '2.150.000 Gs.', href: '/tecnico/ganancias', icon: '💰' },
  ];

  function playSound() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.2; o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 250);
    } catch {}
  }

  return (
    <>
      <div className="tuki-map">
        <DriverMap onLocate={() => {}} />
      </div>

      <button className="tuki-float-btn menu" aria-label="Menú" onClick={openDrawer}>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <button className="tuki-float-btn locate" onClick={() => { /* locate stub */ }} aria-label="Mi ubicación">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`}>
        <div className="tuki-sheet-handle"><span className="tuki-sheet-bar" /></div>
        <div className="tuki-sheet-content">
          <div className="tuki-availability">
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--tuki-text-main)' }}>Estado</h3>
              <span className={`tuki-status-badge ${available ? 'tuki-status-online' : 'tuki-status-offline'}`}>{available ? '● CONECTADO' : '● DESCONECTADO'}</span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available} onChange={() => setAvailable(!available)} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

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
              <button className="tuki-btn tuki-btn-primary" onClick={playSound}>Herramientas</button>
              <Link href="/tecnico/ofertas" className="tuki-btn tuki-btn-success">Ver Ofertas</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
