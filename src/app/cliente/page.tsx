'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useClientContext } from './context';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function ClienteDashboard() {
  const { openDrawer, email, displayName, profilePhoto } = useClientContext();
  const [activeEnvios] = useState(0);

  return (
    <>
      {/* Header */}
      <header className="client-header">
        <button className="client-header-btn" onClick={openDrawer} aria-label="Menú">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="client-header-title">TukiTask</span>
        <button className="client-header-btn" aria-label="Notificaciones">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        </button>
      </header>

      <div className="client-content">
        {/* Welcome banner */}
        <div className="client-welcome">
          <div
            className="client-welcome-avatar"
            style={profilePhoto ? { backgroundImage: `url(${profilePhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          >
            {!profilePhoto && (displayName?.[0]?.toUpperCase() || '👤')}
          </div>
          <div>
            <p className="client-welcome-greeting">{getGreeting()}</p>
            <h2 className="client-welcome-name">{displayName || 'Cliente'}</h2>
          </div>
        </div>

        {/* Quick access grid */}
        <div className="client-section">
          <div className="client-section-header">
            <h3 className="client-section-title">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              Acceso Rápido
            </h3>
          </div>
          <div className="client-quick-grid">
            <Link href="/cliente/mis-envios" className="client-quick-card card-envios">
              <div className="client-card-icon">📦</div>
              <div className="client-card-count">{activeEnvios}</div>
              <div className="client-card-title">Mis Envíos</div>
              <div className="client-card-subtitle">Envíos activos</div>
              <span className="client-card-arrow">→</span>
            </Link>
            <Link href="/cliente/pedidos" className="client-quick-card card-pedidos">
              <div className="client-card-icon">🛒</div>
              <div className="client-card-count">0</div>
              <div className="client-card-title">Mis Pedidos</div>
              <div className="client-card-subtitle">Pedidos realizados</div>
              <span className="client-card-arrow">→</span>
            </Link>
            <Link href="/cliente/enviar" className="client-quick-card card-marketplace">
              <div className="client-card-icon">🚀</div>
              <div className="client-card-count">—</div>
              <div className="client-card-title">Enviar Paquete</div>
              <div className="client-card-subtitle">Solicitar envío</div>
              <span className="client-card-arrow">→</span>
            </Link>
            <Link href="/cliente/direcciones" className="client-quick-card card-transporte">
              <div className="client-card-icon">📍</div>
              <div className="client-card-count">0</div>
              <div className="client-card-title">Direcciones</div>
              <div className="client-card-subtitle">Guardadas</div>
              <span className="client-card-arrow">→</span>
            </Link>
          </div>
        </div>

        {/* Package delivery section */}
        <div className="client-section">
          <div className="client-section-header">
            <h3 className="client-section-title">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              Paquetería
            </h3>
          </div>
          <div className="client-delivery-actions">
            <Link href="/cliente/enviar" className="client-delivery-btn btn-enviar">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              Enviar Paquete
            </Link>
            <Link href="/cliente/mis-envios" className="client-delivery-btn btn-envios">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              Mis Envíos
              {activeEnvios > 0 && <span className="client-delivery-badge">{activeEnvios}</span>}
            </Link>
          </div>
        </div>

        {/* Account section */}
        <div className="client-section">
          <div className="client-section-header">
            <h3 className="client-section-title">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Mi Cuenta
            </h3>
          </div>
          <div className="client-account-grid">
            <Link href="/cliente/settings" className="client-account-link">
              <span className="client-account-icon">⚙️</span>
              Configuración
            </Link>
            <Link href="/cliente/direcciones" className="client-account-link">
              <span className="client-account-icon">📍</span>
              Direcciones
            </Link>
            <button className="client-account-link" style={{ cursor: 'default' }}>
              <span className="client-account-icon">📧</span>
              {email ? email.split('@')[0] : 'Email'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
