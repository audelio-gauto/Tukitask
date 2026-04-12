'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavTab = { href: string; icon: React.ReactNode; label: string };

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
            <span className="tuki-bottom-nav-icon" style={active ? { color: accent } : undefined}>
              {tab.icon}
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
