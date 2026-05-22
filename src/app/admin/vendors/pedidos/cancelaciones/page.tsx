'use client';
import Link from 'next/link';

export default function CancelacionesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/pedidos" className="hover:text-gray-600 transition-colors">Pedidos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Cancelaciones</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Cancelaciones</h1>
        <p className="text-gray-500 text-sm mt-0.5">Historial y gestión de pedidos cancelados. Análisis de motivos y tasas de cancelación por vendedor.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Hoy', value: 0 },
          { label: 'Esta semana', value: 0 },
          { label: 'Este mes', value: 0 },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-2xl font-bold text-red-600">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-gray-400">Sin cancelaciones registradas</p>
        </div>
      </div>
    </div>
  );
}
