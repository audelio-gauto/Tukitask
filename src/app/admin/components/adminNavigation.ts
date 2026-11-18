import type { IconName } from '@/components/Icon';

export type AdminLink = {
  label: string;
  href: string;
  matchPaths?: string[];
  note?: string;
};

export type AdminSection = {
  id: string;
  label: string;
  icon: IconName;
  links: AdminLink[];
};

// Menú de dos niveles: sección → enlace. Las vistas relacionadas se agrupan
// dentro de cada página mediante pestañas (AdminTabs), no en el menú lateral.
export const adminNavigation: AdminSection[] = [
  {
    id: 'operaciones', label: 'Operaciones', icon: 'truck',
    links: [
      { label: 'Pedidos y servicios', href: '/admin/orders' },
      { label: 'Rutas en vivo', href: '/admin/ruta' },
      { label: 'Pedidos sospechosos', href: '/admin/orders/suspicious' },
      { label: 'Reportes y disputas', href: '/admin/reports', matchPaths: ['/admin/vendors/pedidos/disputas'] },
      { label: 'Calificaciones', href: '/admin/ratings' },
      { label: 'IA y TukiBot', href: '/admin/control-ai' },
    ],
  },
  {
    id: 'personas', label: 'Personas', icon: 'user',
    links: [
      { label: 'Clientes', href: '/admin/clients' },
      { label: 'Conductores', href: '/admin/drivers/driver', matchPaths: ['/admin/drivers'] },
      { label: 'Técnicos', href: '/admin/services/tecnico', matchPaths: ['/admin/services'] },
      {
        label: 'Vendedores',
        href: '/admin/vendors/lista',
        matchPaths: ['/admin/vendors', '/admin/vendors/verificaciones', '/admin/vendors/bloqueos'],
      },
      { label: 'Usuarios y administradores', href: '/admin/users', matchPaths: ['/admin/profile'] },
      { label: 'Documentos', href: '/admin/documentos', matchPaths: ['/admin/documentos/aprobados', '/admin/documentos/rechazados'] },
    ],
  },
  {
    id: 'marketplace', label: 'Marketplace', icon: 'shopping-cart',
    links: [
      { label: 'Productos', href: '/admin/vendors/productos', matchPaths: ['/admin/vendors/productos/aprobar'] },
      {
        label: 'Catálogo',
        href: '/admin/vendors/productos/categorias',
        matchPaths: [
          '/admin/vendors/productos/marcas',
          '/admin/vendors/productos/atributos',
          '/admin/vendors/productos/etiquetas',
        ],
      },
      {
        label: 'Pedidos de venta',
        href: '/admin/vendors/pedidos',
        matchPaths: ['/admin/vendors/pedidos/cancelaciones', '/admin/vendors/pedidos/reembolsos'],
      },
      { label: 'Negociaciones', href: '/admin/vendors/negociaciones/historial', matchPaths: ['/admin/vendors/negociaciones'] },
      { label: 'Promociones', href: '/admin/promos' },
      {
        label: 'Configuración',
        href: '/admin/vendors/configuracion/comisiones',
        matchPaths: ['/admin/vendors/configuracion'],
      },
    ],
  },
  {
    id: 'finanzas', label: 'Finanzas', icon: 'credit-card',
    links: [
      { label: 'Resumen', href: '/admin/finanzas' },
      { label: 'Pagos y recargas', href: '/admin/finanzas/pagos-pendientes' },
      { label: 'Billeteras', href: '/admin/wallets', matchPaths: ['/admin/billetera'] },
      { label: 'Movimientos', href: '/admin/finanzas/movimientos' },
      { label: 'Comisiones', href: '/admin/finanzas/comisiones' },
      { label: 'Alias bancario', href: '/admin/bank-alias' },
    ],
  },
  {
    id: 'configuracion', label: 'Configuración', icon: 'settings',
    links: [
      { label: 'General', href: '/admin/settings' },
      {
        label: 'Tarifas y comisiones',
        href: '/admin/drivers/pricing',
        matchPaths: ['/admin/drivers/commission', '/admin/drivers/rates', '/admin/services/commission'],
      },
      { label: 'Claves API', href: '/admin/apikeys' },
      { label: 'Métricas técnicas', href: '/admin/metrics' },
      { label: 'Auditoría', href: '/admin/audit' },
    ],
  },
];

export function activeAdminLink(pathname: string): { sectionId: string; href: string } | null {
  let best: { sectionId: string; href: string; length: number } | null = null;
  for (const section of adminNavigation) {
    for (const link of section.links) {
      for (const path of [link.href, ...(link.matchPaths ?? [])]) {
        if ((pathname === path || pathname.startsWith(`${path}/`)) && (!best || path.length > best.length)) {
          best = { sectionId: section.id, href: link.href, length: path.length };
        }
      }
    }
  }
  return best ? { sectionId: best.sectionId, href: best.href } : null;
}
