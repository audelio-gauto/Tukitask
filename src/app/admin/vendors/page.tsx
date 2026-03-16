'use client';

export default function VendorsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Vendedores</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión de vendedores registrados</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-600 mb-2">Próximamente</h3>
        <p className="text-gray-400 text-sm">Esta sección estará disponible pronto con la gestión completa de vendedores.</p>
      </div>
    </div>
  );
}
