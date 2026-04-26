'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavTab = { href: string; icon: React.ReactNode; label: string; badge?: number };

export function BottomNav({ tabs, accent = '#F5C518' }: { tabs: NavTab[]; accent?: string }) {
  const pathname = usePathname();
  return (
    <nav className="tuki-bottom-nav" aria-label="Navegación principal">
      {tabs.map(tab => {
        const isRoot = tab.href === '/driver' || tab.href === '/tecnico';
        const active = isRoot ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tuki-bottom-nav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {active && <span className="tuki-bottom-nav-dot" style={{ background: accent }} />}
            <span className="tuki-bottom-nav-icon" style={{ ...( active ? { color: accent } : {}), position: 'relative', display: 'inline-flex' }}>
              {tab.icon}
              {tab.badge != null && tab.badge > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-8px',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  lineHeight: 1,
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '99px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  pointerEvents: 'none',
                }}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </span>
            <span className="tuki-bottom-nav-label" style={active ? { color: accent, fontWeight: 700 } : undefined}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
