'use client';

import { usePathname } from 'next/navigation';
import AdminTabs, { type AdminTab } from './AdminTabs';

const VENDOR_TABS: AdminTab[] = [
  { label: 'Resumen', href: '/admin/vendors' },
  { label: 'Lista', href: '/admin/vendors/lista' },
  { label: 'Registros', href: '/admin/vendors/verificaciones' },
  { label: 'Bloqueos', href: '/admin/vendors/bloqueos' },
];

const PRODUCT_TABS: AdminTab[] = [
  { label: 'Productos', href: '/admin/vendors/productos' },
  { label: 'Aprobación', href: '/admin/vendors/productos/aprobar' },
];

const CATALOG_TABS: AdminTab[] = [
  { label: 'Categorías', href: '/admin/vendors/productos/categorias' },
  { label: 'Marcas', href: '/admin/vendors/productos/marcas' },
  { label: 'Atributos', href: '/admin/vendors/productos/atributos' },
  { label: 'Etiquetas', href: '/admin/vendors/productos/etiquetas' },
];

const ORDER_TABS: AdminTab[] = [
  { label: 'Resumen', href: '/admin/vendors/pedidos' },
  { label: 'Cancelaciones', href: '/admin/vendors/pedidos/cancelaciones' },
];

const NEGOTIATION_TABS: AdminTab[] = [
  { label: 'Historial', href: '/admin/vendors/negociaciones/historial' },
  { label: 'Límites', href: '/admin/vendors/negociaciones/limites' },
];

const CONFIG_TABS: AdminTab[] = [
  { label: 'Comisiones', href: '/admin/vendors/configuracion/comisiones' },
  { label: 'Métodos de pago', href: '/admin/vendors/configuracion/metodos-pago' },
  { label: 'Ciudades', href: '/admin/vendors/configuracion/ciudades' },
  { label: 'Límites', href: '/admin/vendors/configuracion/limites-negociacion' },
];

const REPORT_TABS: AdminTab[] = [
  { label: 'Reportes', href: '/admin/reports' },
  { label: 'Disputas', href: '/admin/vendors/pedidos/disputas' },
];

const CATALOG_PATHS = CATALOG_TABS.map(tab => tab.href);

/** Muestra las pestañas del workspace correspondiente a cada ruta de vendedores. */
export default function VendorWorkspaceTabs() {
  const pathname = usePathname();

  if (pathname.startsWith('/admin/vendors/pedidos/disputas')) {
    return <AdminTabs tabs={REPORT_TABS} label="Reportes y disputas" />;
  }
  if (CATALOG_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))) {
    return <AdminTabs tabs={CATALOG_TABS} label="Catálogo" />;
  }
  if (pathname.startsWith('/admin/vendors/productos')) {
    return <AdminTabs tabs={PRODUCT_TABS} label="Productos" />;
  }
  if (pathname.startsWith('/admin/vendors/negociaciones')) {
    return <AdminTabs tabs={NEGOTIATION_TABS} label="Negociaciones" />;
  }
  if (pathname.startsWith('/admin/vendors/pedidos')) {
    return <AdminTabs tabs={ORDER_TABS} label="Pedidos de venta" />;
  }
  if (pathname.startsWith('/admin/vendors/configuracion')) {
    return <AdminTabs tabs={CONFIG_TABS} label="Configuración de marketplace" />;
  }
  return <AdminTabs tabs={VENDOR_TABS} label="Vendedores" />;
}
