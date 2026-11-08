'use client';
import Link from 'next/link';

export default function ProductosReportadosPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Productos Reportados</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Productos Reportados</h1>
        <p className="text-gray-500 text-sm mt-0.5">Esta vista todavía no está conectada a reportes de productos.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
          <p className="text-sm font-medium text-gray-500">Reportes de productos no disponibles en esta vista</p>
          <Link href="/admin/reports" className="mt-3 text-sm font-semibold text-blue-700 underline">Consultar reportes generales</Link>
        </div>
      </div>
    </div>
  );
}
