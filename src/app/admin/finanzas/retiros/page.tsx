'use client';
import Link from 'next/link';

export default function RetirosPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Retiros de Vendedores</h1>
        <p className="text-gray-500 text-sm mt-0.5">Solicitudes de retiro de fondos de los vendedores.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h2 className="text-base font-semibold text-gray-900">Los retiros aún no están habilitados</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-xl mx-auto">
          Hoy los vendedores cargan saldo mediante recargas y se les descuenta la comisión de cada venta entregada.
          Cuando exista el flujo de retiros, las solicitudes aparecerán en esta sección.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/admin/billetera/vendedores" className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors">Billetera de vendedores</Link>
          <Link href="/admin/finanzas/movimientos" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">Movimientos financieros</Link>
        </div>
      </div>
    </div>
  );
}
