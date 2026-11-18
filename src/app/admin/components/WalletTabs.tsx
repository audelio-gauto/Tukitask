'use client';

import AdminTabs, { type AdminTab } from './AdminTabs';

const TABS: AdminTab[] = [
  { label: 'Conductores y técnicos', href: '/admin/wallets' },
  { label: 'Historial de recargas', href: '/admin/billetera/historial' },
  { label: 'Vendedores', href: '/admin/billetera/vendedores' },
];

export default function WalletTabs() {
  return <AdminTabs tabs={TABS} label="Billeteras" />;
}
