'use client';
import Link from 'next/link';

export default function DisputasPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/pedidos" className="hover:text-gray-600 transition-colors">Pedidos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Disputas</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Disputas</h1>
        <p className="text-gray-500 text-sm mt-0.5">Resolver conflictos entre vendedores y compradores. Mediar y decidir el resultado de cada disputa.</p>
      </div>

      {/* Priority legend */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs text-gray-400 font-medium">Prioridad:</span>
        {[
          { label: 'Alta', color: 'bg-red-100 text-red-700' },
          { label: 'Media', color: 'bg-amber-100 text-amber-700' },
          { label: 'Baja', color: 'bg-gray-100 text-gray-600' },
        ].map(p => (
          <span key={p.label} className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${p.color}`}>{p.label}</span>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
          <p className="text-sm font-medium text-gray-400">Sin disputas activas</p>
          <p className="text-xs text-gray-300 mt-1">Las disputas abiertas aparecerán aquí</p>
        </div>
      </div>
    </div>
  );
}
