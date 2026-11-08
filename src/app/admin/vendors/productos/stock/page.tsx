'use client';
import Link from 'next/link';

export default function StockPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Control de Stock</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Control de Stock</h1>
        <p className="text-gray-500 text-sm mt-0.5">Esta vista todavía no está conectada a alertas de inventario.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <p className="text-sm font-medium text-gray-500">Alertas de stock no disponibles</p>
          <Link href="/admin/vendors/productos" className="mt-3 text-sm font-semibold text-blue-700 underline">Consultar productos y stock</Link>
        </div>
      </div>
    </div>
  );
}
