'use client';
import { useDriverContext } from '../context';

export default function DriverScreenLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const { openDrawer } = useDriverContext();

  return (
    <>
      <div className="tuki-normal-header">
        <button className="menu-btn" onClick={openDrawer}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="tuki-screen-title">{title}</span>
        <a href="/driver" className="tuki-back-btn">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </a>
      </div>
      <div className="tuki-normal-content">
        {children}
      </div>
    </>
  );
}
