import type { IconName } from '@/components/Icon';

export type AdminLink = {
  label: string;
  href: string;
  matchPaths?: string[];
  note?: string;
};

export type AdminGroup = {
  label: string;
  links: AdminLink[];
};

export type AdminSection = {
  id: string;
  label: string;
  icon: IconName;
  groups: AdminGroup[];
};

export const adminNavigation: AdminSection[] = [
  {
    id: 'personas', label: 'Personas', icon: 'user',
    groups: [
      { label: 'Roles', links: [
        { label: 'Clientes', href: '/admin/clients' },
        { label: 'Conductores', href: '/admin/drivers/driver', matchPaths: ['/admin/drivers'] },
        { label: 'Técnicos', href: '/admin/services/tecnico', matchPaths: ['/admin/services'] },
        { label: 'Vendedores', href: '/admin/vendors/lista' },
        { label: 'Hotelerías', href: '/admin/hotels' },
        { label: 'Usuarios y administradores', href: '/admin/users', matchPaths: ['/admin/profile'] },
      ] },
      { label: 'Vendedores', links: [
        { label: 'Resumen de vendedores', href: '/admin/vendors' },
        { label: 'Registros y estados', href: '/admin/vendors/verificaciones' },
        { label: 'Bloqueos y suspensiones', href: '/admin/vendors/bloqueos' },
      ] },
    ],
  },
  {
    id: 'operaciones', label: 'Operaciones', icon: 'truck',
    groups: [
      { label: 'Seguimiento', links: [
        { label: 'Pedidos y servicios', href: '/admin/orders' },
        { label: 'Rutas en vivo', href: '/admin/ruta' },
        { label: 'Pedidos sospechosos', href: '/admin/orders/suspicious' },
      ] },
    ],
  },
  {
    id: 'marketplace', label: 'Marketplace', icon: 'shopping-cart',
    groups: [
      { label: 'Productos', links: [
        { label: 'Todos los productos', href: '/admin/vendors/productos' },
        { label: 'Aprobación de productos', href: '/admin/vendors/productos/aprobar' },
        { label: 'Valoraciones de vendedores', href: '/admin/vendors/productos/valoraciones' },
      ] },
      { label: 'Catálogo', links: [
        { label: 'Categorías', href: '/admin/vendors/productos/categorias' },
        { label: 'Marcas', href: '/admin/vendors/productos/marcas' },
        { label: 'Atributos', href: '/admin/vendors/productos/atributos' },
        { label: 'Etiquetas', href: '/admin/vendors/productos/etiquetas' },
      ] },
      { label: 'Ventas y reclamos', links: [
        { label: 'Resumen de pedidos de venta', href: '/admin/vendors/pedidos' },
        { label: 'Cancelaciones', href: '/admin/vendors/pedidos/cancelaciones' },
        { label: 'Disputas', href: '/admin/vendors/pedidos/disputas' },
        { label: 'Reembolsos', href: '/admin/vendors/pedidos/reembolsos' },
      ] },
      { label: 'Negociaciones', links: [
        { label: 'Monitoreo de ofertas', href: '/admin/vendors/negociaciones' },
        { label: 'Fraude y spam', href: '/admin/vendors/negociaciones/fraude' },
        { label: 'Historial', href: '/admin/vendors/negociaciones/historial' },
        { label: 'Límites aplicados', href: '/admin/vendors/negociaciones/limites' },
      ] },
      { label: 'Vistas no conectadas', links: [
        { label: 'Control de stock', href: '/admin/vendors/productos/stock', note: 'Vista no conectada' },
        { label: 'Productos reportados', href: '/admin/vendors/productos/reportados', note: 'Vista no conectada' },
      ] },
    ],
  },
  {
    id: 'finanzas', label: 'Finanzas', icon: 'credit-card',
    groups: [
      { label: 'Resumen y movimientos', links: [
        { label: 'Resumen financiero', href: '/admin/finanzas' },
        { label: 'Recargas pendientes', href: '/admin/finanzas/pagos-pendientes' },
        { label: 'Comisiones cobradas', href: '/admin/finanzas/comisiones' },
        { label: 'Movimientos financieros', href: '/admin/finanzas/movimientos' },
        { label: 'Retiros de vendedores', href: '/admin/finanzas/retiros', note: 'No habilitado' },
      ] },
      { label: 'Billeteras', links: [
        { label: 'Conductores y técnicos', href: '/admin/wallets' },
        { label: 'Historial de recargas', href: '/admin/billetera/historial' },
        { label: 'Vendedores', href: '/admin/billetera/vendedores' },
      ] },
    ],
  },
  {
    id: 'control', label: 'Calidad y control', icon: 'shield',
    groups: [
      { label: 'Documentos', links: [
        { label: 'Revisión de documentos', href: '/admin/documentos' },
        { label: 'Aprobados', href: '/admin/documentos/aprobados' },
        { label: 'Rechazados', href: '/admin/documentos/rechazados' },
      ] },
      { label: 'Supervisión', links: [
        { label: 'Reportes', href: '/admin/reports' },
        { label: 'Calificaciones', href: '/admin/ratings' },
        { label: 'Auditoría', href: '/admin/audit' },
      ] },
    ],
  },
  {
    id: 'estadisticas', label: 'Estadísticas', icon: 'clipboard',
    groups: [{ label: 'Análisis', links: [
      { label: 'Métricas', href: '/admin/metrics' },
    ] }],
  },
  {
    id: 'configuracion', label: 'Configuración', icon: 'settings',
    groups: [
      { label: 'Conductores', links: [
        { label: 'Precios y tarifas', href: '/admin/drivers/pricing' },
        { label: 'Comisiones y suscripciones', href: '/admin/drivers/commission' },
        { label: 'Rentabilidad por km', href: '/admin/drivers/rates' },
      ] },
      { label: 'Técnicos', links: [
        { label: 'Precios y comisiones', href: '/admin/services/commission' },
      ] },
      { label: 'Marketplace', links: [
        { label: 'Comisiones de vendedores', href: '/admin/vendors/configuracion/comisiones' },
        { label: 'Métodos de pago', href: '/admin/vendors/configuracion/metodos-pago' },
        { label: 'Ciudades de entrega', href: '/admin/vendors/configuracion/ciudades' },
        { label: 'Límites de negociación', href: '/admin/vendors/configuracion/limites-negociacion' },
      ] },
      { label: 'Sistema', links: [
        { label: 'Configuración general', href: '/admin/settings' },
        { label: 'Alias bancario', href: '/admin/bank-alias' },
        { label: 'Promociones', href: '/admin/promos' },
        { label: 'Claves API', href: '/admin/apikeys' },
        { label: 'Control de IA', href: '/admin/control-ai' },
      ] },
    ],
  },
];

export function activeAdminLink(pathname: string): { sectionId: string; groupLabel: string; href: string } | null {
  let best: { sectionId: string; groupLabel: string; href: string; length: number } | null = null;
  for (const section of adminNavigation) {
    for (const group of section.groups) {
      for (const link of group.links) {
        for (const path of [link.href, ...(link.matchPaths ?? [])]) {
          if ((pathname === path || pathname.startsWith(`${path}/`)) && (!best || path.length > best.length)) {
            best = { sectionId: section.id, groupLabel: group.label, href: link.href, length: path.length };
          }
        }
      }
    }
  }
  return best;
}
