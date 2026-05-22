'use client';
import Link from 'next/link';

export default function FraudePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/negociaciones" className="hover:text-gray-600 transition-colors">Negociaciones</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Spam / Fraude</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Detección de Spam y Fraude</h1>
        <p className="text-gray-500 text-sm mt-0.5">Identificar patrones sospechosos: precios anómalos, ofertas masivas automatizadas y comportamiento fraudulento.</p>
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Alertas activas', value: 0, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
          { label: 'Revisados hoy', value: 0, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
          { label: 'Resueltos este mes', value: 0, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-xs font-semibold text-red-700">Actividad sospechosa detectada</span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <p className="text-sm font-medium text-gray-400">Sin alertas de fraude activas</p>
          <p className="text-xs text-gray-300 mt-1">El sistema monitorea automáticamente patrones anómalos</p>
        </div>
      </div>
    </div>
  );
}
