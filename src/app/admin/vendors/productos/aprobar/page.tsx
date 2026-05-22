'use client';
import Link from 'next/link';

export default function AprobarProductosPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Aprobar Productos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Aprobar Productos</h1>
        <p className="text-gray-500 text-sm mt-0.5">Revisar y aprobar productos enviados por vendedores antes de publicarlos en la plataforma.</p>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-5">
        {[
          { label: 'Pendientes', count: 0 },
          { label: 'Aprobados', count: null },
          { label: 'Rechazados', count: null },
        ].map((tab, i) => (
          <button
            key={tab.label}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              i === 0 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-sm font-medium text-gray-400">No hay productos pendientes de aprobación</p>
          <p className="text-xs text-gray-300 mt-1">Los productos enviados por vendedores aparecerán aquí</p>
        </div>
      </div>
    </div>
  );
}
