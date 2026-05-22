'use client';
import Link from 'next/link';

const SUB_PAGES = [
  {
    href: '/admin/vendors/negociaciones/fraude',
    title: 'Spam / Fraude',
    desc: 'Detectar patrones sospechosos en ofertas y negociaciones entre vendedores y clientes.',
    color: 'red',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  {
    href: '/admin/vendors/negociaciones/historial',
    title: 'Historial de Negociación',
    desc: 'Ver todo el historial de ofertas, contraofertas y negociaciones completadas.',
    color: 'blue',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: '/admin/vendors/negociaciones/limites',
    title: 'Límites Automáticos',
    desc: 'Configurar reglas automáticas de límites de precio, descuentos máximos y condiciones de negociación.',
    color: 'purple',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
];

const colorMap: Record<string, string> = {
  red:    'bg-red-50 text-red-600 border-red-100',
  blue:   'bg-blue-50 text-blue-600 border-blue-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
};

export default function NegociacionesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Negociaciones</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Monitorear Negociaciones</h1>
        <p className="text-gray-500 text-sm mt-0.5">Supervisión de ofertas activas, detección de fraude y configuración de límites.</p>
      </div>

      {/* Live offers monitor */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Ofertas Activas Ahora</h2>
            <p className="text-xs text-gray-400 mt-0.5">Negociaciones en curso en tiempo real</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            En vivo
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm font-medium text-gray-400">Sin negociaciones activas en este momento</p>
          <p className="text-xs text-gray-300 mt-1">Las ofertas aparecerán aquí en tiempo real</p>
        </div>
      </div>

      {/* Sub-section cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SUB_PAGES.map(s => (
          <Link key={s.href} href={s.href} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-gray-300 transition-all group">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 border ${colorMap[s.color]}`}>
              {s.icon}
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-[#F5C518] transition-colors text-sm">{s.title}</h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
