'use client';
import Link from 'next/link';
import { useWorkerContext } from '../context';

export default function DriverScreenLayout({ children, title, backHref }: { children: React.ReactNode; title: string; backHref?: string }) {
  const { openDrawer } = useWorkerContext();

  return (
    <>
      <div className="tuki-normal-header">
        <Link href={backHref ?? '/driver'} className="tuki-back-btn" aria-label="Volver">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="tuki-screen-title">{title}</span>
        <button className="menu-btn" onClick={openDrawer} aria-label="Menú">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      <div className="tuki-normal-content">
        {children}
      </div>
    </>
  );
}
