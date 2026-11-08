'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabaseClient';
import { activeAdminLink, adminNavigation } from './adminNavigation';

type Props = {
  mobileOpen: boolean;
  onClose: () => void;
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="adm-nav-badge" aria-label={`${count} pendientes`}>{count > 99 ? '99+' : count}</span>;
}

export default function AdminSidebar({ mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const active = activeAdminLink(pathname);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [criticalCounts, setCriticalCounts] = useState<Record<string, number>>({});
  const [badgesError, setBadgesError] = useState(false);

  useEffect(() => {
    const current = activeAdminLink(pathname);
    setOpenSection(current?.sectionId ?? null);
    setOpenGroup(current ? `${current.sectionId}:${current.groupLabel}` : null);
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    const loadCriticalCounts = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!session?.access_token) throw new Error('Sesión no disponible');
        const res = await fetch('/api/admin/badges', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
        const json = await res.json() as { counts?: Record<string, number> };
        if (!json.counts) throw new Error('Respuesta de indicadores incompleta');
        const requiredCounts = [
          '/admin/vendors/productos/aprobar',
          '/admin/vendors/pedidos/disputas',
          '/admin/finanzas/pagos-pendientes',
        ];
        const incomplete = requiredCounts.some(href => typeof json.counts?.[href] !== 'number');
        if (incomplete) console.error('[admin/sidebar] Algunos indicadores no están disponibles.');
        if (alive) {
          setCriticalCounts(json.counts);
          setBadgesError(incomplete);
        }
      } catch (error) {
        console.error('[admin/sidebar] No se pudieron cargar los indicadores:', error);
        if (alive) {
          setCriticalCounts({});
          setBadgesError(true);
        }
      }
    };
    void loadCriticalCounts();
    const refreshId = window.setInterval(() => { void loadCriticalCounts(); }, 60000);
    return () => {
      alive = false;
      window.clearInterval(refreshId);
    };
  }, []);

  const query = normalize(search);

  return (
    <>
      {mobileOpen && <button className="adm-sidebar-backdrop" aria-label="Cerrar menú" onClick={onClose} />}
      <aside id="admin-navigation" className={`adm-sidebar${mobileOpen ? ' adm-sidebar-open' : ''}`}>
        <div className="adm-sidebar-brand">
          <div className="adm-brand-mark">T</div>
          <div><strong>Tukitask</strong><span>Panel de administración</span></div>
          <button type="button" className="adm-sidebar-close" onClick={onClose} aria-label="Cerrar menú">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="adm-nav-search">
          <label htmlFor="admin-nav-search">Buscar en el menú</label>
          <input id="admin-nav-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar sección..." />
        </div>
        <nav className="adm-nav" aria-label="Navegación de administración">
          <Link href="/admin" onClick={onClose} className={`adm-nav-section${pathname === '/admin' ? ' is-active' : ''}`} aria-current={pathname === '/admin' ? 'page' : undefined}>
            <Icon name="home" size={19} /><span>Inicio</span>
          </Link>
          {adminNavigation.map(section => {
            const groups = section.groups.map(group => ({
              ...group,
              links: group.links.filter(link => !query || normalize(`${section.label} ${group.label} ${link.label} ${link.note ?? ''}`).includes(query)),
            })).filter(group => group.links.length > 0);
            if (!groups.length) return null;
            const expanded = !!query || openSection === section.id;
            const sectionCount = section.groups.flatMap(group => group.links).reduce((sum, link) => sum + (criticalCounts[link.href] ?? 0), 0);
            return (
              <div key={section.id}>
                <button type="button" className={`adm-nav-section${active?.sectionId === section.id ? ' is-current' : ''}`} aria-expanded={expanded} disabled={!!query} onClick={() => setOpenSection(expanded ? null : section.id)}>
                  <Icon name={section.icon} size={19} /><span>{section.label}</span>
                  <Badge count={sectionCount} />
                  <span className={`adm-nav-chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
                </button>
                {expanded && <div className="adm-nav-groups">
                  {groups.map(group => {
                    const groupId = `${section.id}:${group.label}`;
                    const groupExpanded = !!query || openGroup === groupId;
                    const groupCount = group.links.reduce((sum, link) => sum + (criticalCounts[link.href] ?? 0), 0);
                    return (
                      <div key={groupId}>
                        <button type="button" className="adm-nav-group" aria-expanded={groupExpanded} disabled={!!query} onClick={() => setOpenGroup(groupExpanded ? null : groupId)}>
                          <span>{group.label}</span><Badge count={groupCount} />
                          <span className={`adm-nav-chevron${groupExpanded ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
                        </button>
                        {groupExpanded && <div className="adm-nav-links">
                          {group.links.map(link => (
                            <Link key={link.href} href={link.href} onClick={onClose} className={`adm-nav-link${active?.href === link.href ? ' is-active' : ''}`} aria-current={active?.href === link.href ? 'page' : undefined}>
                              <span>{link.label}{link.note && <small>{link.note}</small>}</span>
                              <Badge count={criticalCounts[link.href] ?? 0} />
                            </Link>
                          ))}
                        </div>}
                      </div>
                    );
                  })}
                </div>}
              </div>
            );
          })}
          {query && !adminNavigation.some(section => section.groups.some(group => group.links.some(link => normalize(`${section.label} ${group.label} ${link.label} ${link.note ?? ''}`).includes(query)))) && (
            <p className="adm-nav-empty">No se encontraron secciones.</p>
          )}
        </nav>
        <div className="adm-sidebar-footer">
          {badgesError ? <span role="status">Algunos indicadores no están disponibles. Se reintentará automáticamente.</span> : <span>Administración de Tukitask</span>}
        </div>
      </aside>
    </>
  );
}
