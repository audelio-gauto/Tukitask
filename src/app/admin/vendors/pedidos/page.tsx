'use client';
import Link from 'next/link';

const SUB_LINKS = [
  { label: 'Cancelaciones', href: '/admin/vendors/pedidos/cancelaciones', desc: 'Pedidos cancelados por vendedor o cliente.' },
  { label: 'Reembolsos', href: '/admin/vendors/pedidos/reembolsos', desc: 'Solicitudes de devolución de dinero pendientes.' },
  { label: 'Disputas', href: '/admin/vendors/pedidos/disputas', desc: 'Conflictos entre vendedores y compradores.' },
];

export default function VendorPedidosPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Pedidos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Pedidos de Vendedores</h1>
        <p className="text-gray-500 text-sm mt-0.5">Supervisión completa de todos los pedidos realizados a través de la plataforma de vendedores.</p>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Todos', value: 0, color: 'text-gray-900' },
          { label: 'Pendientes', value: 0, color: 'text-amber-600' },
          { label: 'Completados', value: 0, color: 'text-emerald-600' },
          { label: 'Cancelados', value: 0, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm font-medium text-gray-400">Sin pedidos registrados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SUB_LINKS.map(s => (
          <Link key={s.href} href={s.href} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md hover:border-gray-300 transition-all group">
            <h3 className="font-semibold text-gray-900 group-hover:text-[#F5C518] transition-colors text-sm mb-1">{s.label}</h3>
            <p className="text-xs text-gray-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
