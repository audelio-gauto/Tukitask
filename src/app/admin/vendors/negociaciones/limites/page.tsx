'use client';
import Link from 'next/link';

const LIMIT_RULES = [
  {
    label: 'Descuento máximo por oferta',
    value: '30%',
    desc: 'El vendedor no puede ofrecer más del 30% de descuento sobre el precio base.',
    active: true,
  },
  {
    label: 'Ofertas máximas por producto/día',
    value: '10',
    desc: 'Límite de 10 contraofertas diarias por producto para prevenir spam.',
    active: true,
  },
  {
    label: 'Tiempo mínimo entre ofertas',
    value: '5 min',
    desc: 'Espera mínima de 5 minutos entre ofertas consecutivas al mismo comprador.',
    active: false,
  },
  {
    label: 'Precio mínimo permitido',
    value: '1.000 Gs',
    desc: 'Precio mínimo que puede tener un producto publicado.',
    active: true,
  },
];

export default function LimitesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/negociaciones" className="hover:text-gray-600 transition-colors">Negociaciones</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Límites Automáticos</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Límites Automáticos</h1>
            <p className="text-gray-500 text-sm mt-0.5">Configurar reglas que el sistema aplica automáticamente a las negociaciones.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Regla
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {LIMIT_RULES.map(rule => (
          <div key={rule.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-900">{rule.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  rule.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {rule.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <p className="text-xs text-gray-400">{rule.desc}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-[#F5C518] bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">{rule.value}</span>
              <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
