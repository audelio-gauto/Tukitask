'use client';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';

const SECTIONS: Array<{
  href: string;
  icon: IconName;
  title: string;
  desc: string;
  color: string;
  border: string;
}> = [
  {
    href: '/admin/drivers/driver',
    icon: 'car',
    title: 'Lista de conductores',
    desc: 'Ver todos los usuarios con rol de conductor.',
    color: 'rgba(74,222,128,0.12)',
    border: 'rgba(74,222,128,0.3)',
  },
  {
    href: '/admin/drivers/commission',
    icon: 'money',
    title: 'Comisiones & Suscripciones',
    desc: 'Ajustar comisión por conductor y gestionar suscripciones.',
    color: 'rgba(245,197,24,0.1)',
    border: 'rgba(245,197,24,0.3)',
  },
  {
    href: '/admin/drivers/pricing',
    icon: 'clipboard',
    title: 'Tarifas & Precios',
    desc: 'Configurar multiplicadores de paquetes, recargos y tarifas base.',
    color: 'rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.3)',
  },
  {
    href: '/admin/drivers/rates',
    icon: 'money',
    title: 'Rentabilidad Gs/km',
    desc: 'Umbrales de Gs por km por tipo de vehículo — ayuda al driver a decidir si aceptar o contra-ofertar.',
    color: 'rgba(245,197,24,0.08)',
    border: 'rgba(245,197,24,0.25)',
  },
];

export default function DriversPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Conductores</h1>
        <p className="text-[rgba(255,255,255,0.45)] text-sm mt-1">Gestión de conductores y configuración de tarifas</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href}
            className="block rounded-xl border p-6 hover:opacity-90 transition-opacity"
            style={{ background: s.color, borderColor: s.border }}
          >
            <div className="mb-3">
              <Icon name={s.icon} size={28} className="text-white" />
            </div>
            <h3 className="font-bold text-white text-base mb-1">{s.title}</h3>
            <p className="text-[rgba(255,255,255,0.5)] text-sm leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
