'use client';
import Link from 'next/link';

export default function HistorialNegociacionPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/negociaciones" className="hover:text-gray-600 transition-colors">Negociaciones</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Historial</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Historial de Negociación</h1>
        <p className="text-gray-500 text-sm mt-0.5">Registro completo de todas las negociaciones: ofertas iniciales, contraofertas y acuerdos finales.</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por vendedor o producto..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] w-64"
          />
        </div>
        <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
          <option>Todos los estados</option>
          <option>Acordadas</option>
          <option>Rechazadas</option>
          <option>Expiradas</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-gray-400">Sin historial de negociaciones</p>
        </div>
      </div>
    </div>
  );
}
