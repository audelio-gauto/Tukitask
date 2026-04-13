'use client';
import Link from 'next/link';

const SECTIONS = [
  {
    href: '/admin/services/commission',
    icon: '💰',
    title: 'Técnicos — Comisiones & Suscripciones',
    desc: 'Ajustar comisión por técnico, precios de servicios y gestionar suscripciones.',
    color: 'rgba(251,146,60,0.1)',
    border: 'rgba(251,146,60,0.3)',
  },
];

export default function ServicesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Servicios</h1>
        <p className="text-[rgba(255,255,255,0.45)] text-sm mt-1">Gestión de técnicos y configuración de servicios</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href}
            className="block rounded-xl border p-6 hover:opacity-90 transition-opacity"
            style={{ background: s.color, borderColor: s.border }}
          >
            <div className="text-3xl mb-3">{s.icon}</div>
            <h3 className="font-bold text-white text-base mb-1">{s.title}</h3>
            <p className="text-[rgba(255,255,255,0.5)] text-sm leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
