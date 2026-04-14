'use client';
import Link from 'next/link';

const SECTIONS = [
  {
    href: '/admin/services/tecnico',
    icon: '👷',
    title: 'Lista de Técnicos',
    desc: 'Ver, verificar y gestionar técnicos registrados.',
    color: 'rgba(99,102,241,0.08)',
    border: 'rgba(99,102,241,0.25)',
    textColor: '#6366f1',
  },
  {
    href: '/admin/services/commission',
    icon: '💰',
    title: 'Comisiones & Suscripciones',
    desc: 'Ajustar comisión por técnico, precios y suscripciones.',
    color: 'rgba(251,146,60,0.08)',
    border: 'rgba(251,146,60,0.25)',
    textColor: '#f97316',
  },
];

export default function ServicesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Servicios</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión de técnicos y configuración de servicios</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href}
            className="block rounded-xl border bg-white p-6 hover:shadow-md transition-shadow"
            style={{ borderColor: s.border }}
          >
            <div className="text-3xl mb-3">{s.icon}</div>
            <h3 className="font-semibold text-gray-900 text-base mb-1">{s.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
