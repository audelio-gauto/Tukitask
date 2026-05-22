'use client';
import Link from 'next/link';

export default function ReembolsosPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/pedidos" className="hover:text-gray-600 transition-colors">Pedidos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Reembolsos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Reembolsos</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gestionar solicitudes de devolución de dinero. Aprobar, rechazar o escalar reembolsos pendientes.</p>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-5">
        {['Pendientes', 'Aprobados', 'Rechazados'].map((tab, i) => (
          <button
            key={tab}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              i === 0 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <p className="text-sm font-medium text-gray-400">Sin solicitudes de reembolso pendientes</p>
        </div>
      </div>
    </div>
  );
}
