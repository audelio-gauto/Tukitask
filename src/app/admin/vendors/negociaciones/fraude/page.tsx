'use client';
import Link from 'next/link';

export default function FraudePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/negociaciones/historial" className="hover:text-gray-600 transition-colors">Negociaciones</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Spam / Fraude</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Detección de Spam y Fraude</h1>
        <p className="text-gray-500 text-sm mt-0.5">Esta vista todavía no está conectada a señales de fraude.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <p className="text-sm font-medium text-gray-500">Detección de fraude no disponible</p>
          <p className="text-xs text-gray-400 mt-1 max-w-md text-center">
            Los números que se mostraban aquí eran estáticos y no representaban alertas reales.
          </p>
          <Link href="/admin/reports" className="mt-4 text-sm font-semibold text-blue-700 underline">
            Consultar reportes y disputas
          </Link>
        </div>
      </div>
    </div>
  );
}
