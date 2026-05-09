'use client';
import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline]   = useState(false);
  const [backMsg, setBackMsg]   = useState(false); // "volviste" toast

  useEffect(() => {
    // initialise from browser state
    setOffline(!navigator.onLine);

    const handleOffline = () => {
      setOffline(true);
      setBackMsg(false);
    };

    const handleOnline = () => {
      setOffline(false);
      setBackMsg(true);
      // hide "volviste" banner after 4s
      setTimeout(() => setBackMsg(false), 4000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, []);

  if (!offline && !backMsg) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 16px',
        fontSize: '0.85rem',
        fontWeight: 700,
        letterSpacing: 0.2,
        background: offline ? '#dc2626' : '#16a34a',
        color: '#fff',
        boxShadow: offline
          ? '0 2px 12px rgba(220,38,38,0.45)'
          : '0 2px 12px rgba(22,163,74,0.45)',
        transition: 'background 0.3s',
      }}
    >
      {offline ? (
        <>
          {/* wifi-off icon */}
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0122.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 016.95 0"/>
            <circle cx="12" cy="20" r="1"/>
          </svg>
          Sin conexión a internet
        </>
      ) : (
        <>
          {/* wifi icon */}
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M5 12.55a11 11 0 0114.08 0"/>
            <path d="M1.42 9a16 16 0 0121.16 0"/>
            <path d="M8.53 16.11a6 6 0 016.95 0"/>
            <circle cx="12" cy="20" r="1"/>
          </svg>
          ¡Volviste a tener internet!
        </>
      )}
    </div>
  );
}
