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
  const [showModal, setShowModal] = useState(false);

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

      {/* Modal de acción */}
      {showModal && (
        <div className="client-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="client-modal" onClick={e => e.stopPropagation()}>
            <div className="client-modal-top">
              <div className="client-modal-avatar" style={profilePhoto ? { backgroundImage: `url(${profilePhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                {!profilePhoto && (displayName?.[0]?.toUpperCase() || '👤')}
              </div>
              <span className="client-modal-title">¿Qué necesitás hoy?</span>
              <button className="client-modal-close" onClick={() => setShowModal(false)} aria-label="Cerrar">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="client-modal-divider" />
            <div className="client-modal-body">
              <Link href="/cliente/enviar" className="client-modal-action" onClick={() => setShowModal(false)}>
                <div className="client-modal-action-icon" style={{ background: 'linear-gradient(135deg,#F5C518,#F58A07)' }}>
                  <svg width="26" height="26" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                </div>
                <div className="client-modal-action-text">
                  <span className="client-modal-action-title">Enviar Paquete</span>
                  <span className="client-modal-action-sub">Encomiendas y delivery rápido</span>
                </div>
                <svg className="client-modal-action-arrow" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
              <Link href="/cliente/servicio" className="client-modal-action" onClick={() => setShowModal(false)}>
                <div className="client-modal-action-icon" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  <svg width="26" height="26" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                </div>
                <div className="client-modal-action-text">
                  <span className="client-modal-action-title">Solicitar Servicio</span>
                  <span className="client-modal-action-sub">Técnicos, limpieza, plomería...</span>
                </div>
                <svg className="client-modal-action-arrow" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="client-content">
        {/* Saludo */}
        <div className="client-greeting-row">
          <span className="client-greeting-wave">👋</span>
          <div>
            <span className="client-greeting-hi">{getGreeting()},&nbsp;</span>
            <span className="client-greeting-name">{displayName || 'Cliente'}</span>
          </div>
        </div>

        {/* Facebook-style action bar */}
        <button className="client-action-bar" onClick={() => setShowModal(true)}>
          <div
            className="client-action-bar-avatar"
            style={profilePhoto ? { backgroundImage: `url(${profilePhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          >
            {!profilePhoto && (displayName?.[0]?.toUpperCase() || '👤')}
          </div>
          <span className="client-action-bar-placeholder">¿Qué ayuda necesitás hoy?</span>
          <span className="client-action-bar-pill">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </span>
        </button>

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
            <Link href="/cliente/mis-servicios" className="client-quick-card card-marketplace">
              <div className="client-card-icon">🛠</div>
              <div className="client-card-count">—</div>
              <div className="client-card-title">Mis Servicios</div>
              <div className="client-card-subtitle">Técnicos en curso</div>
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
