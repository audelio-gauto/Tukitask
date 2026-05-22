'use client';
import Link from 'next/link';

const MOCK_CATS = [
  { name: 'Electrónica', count: 0, color: 'blue' },
  { name: 'Ropa y Moda', count: 0, color: 'pink' },
  { name: 'Alimentos', count: 0, color: 'emerald' },
  { name: 'Hogar y Deco', count: 0, color: 'amber' },
  { name: 'Deportes', count: 0, color: 'orange' },
  { name: 'Servicios', count: 0, color: 'purple' },
];

const colorMap: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-600 border-blue-100',
  pink:    'bg-pink-50 text-pink-600 border-pink-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  amber:   'bg-amber-50 text-amber-600 border-amber-100',
  orange:  'bg-orange-50 text-orange-600 border-orange-100',
  purple:  'bg-purple-50 text-purple-600 border-purple-100',
};

export default function CategoriasPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Categorías</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Categorías de Productos</h1>
            <p className="text-gray-500 text-sm mt-0.5">Gestionar las categorías disponibles para los productos de vendedores.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Categoría
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MOCK_CATS.map(cat => (
          <div key={cat.name} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${colorMap[cat.color]}`}>
                {cat.name}
              </span>
              <div className="flex items-center gap-1">
                <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{cat.count}</p>
            <p className="text-xs text-gray-400">productos</p>
          </div>
        ))}
      </div>
    </div>
  );
}
