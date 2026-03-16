'use client';
import Link from 'next/link';
import { useClientContext } from '../context';

export default function ClientScreenLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const { openDrawer } = useClientContext();

  return (
    <>
      <header className="client-header">
        <Link href="/cliente" className="client-header-btn" aria-label="Volver">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <span className="client-header-title">{title}</span>
        <button className="client-header-btn" onClick={openDrawer} aria-label="Menú">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>
      <div className="client-content">
        {children}
      </div>
    </>
  );
}
