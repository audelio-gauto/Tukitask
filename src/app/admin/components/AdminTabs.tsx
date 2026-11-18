'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AdminTab = {
  label: string;
  href: string;
};

type Props = {
  tabs: AdminTab[];
  label?: string;
};

/** Pestañas de un workspace del panel. Resalta la ruta más específica. */
export default function AdminTabs({ tabs, label = 'Secciones' }: Props) {
  const pathname = usePathname();

  let activeHref: string | null = null;
  let activeLength = -1;
  for (const tab of tabs) {
    if ((pathname === tab.href || pathname.startsWith(`${tab.href}/`)) && tab.href.length > activeLength) {
      activeHref = tab.href;
      activeLength = tab.href.length;
    }
  }

  return (
    <nav className="adm-tabs" aria-label={label}>
      {tabs.map(tab => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`adm-tab${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
