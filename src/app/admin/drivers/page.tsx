'use client';

export default function DriversPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Conductores</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión de conductores registrados</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h8m-8 5h4m4 6H6a2 2 0 01-2-2V6a2 2 0 012-2h8l6 6v6a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-600 mb-2">Próximamente</h3>
        <p className="text-gray-400 text-sm">Esta sección estará disponible pronto con la gestión completa de conductores.</p>
      </div>
    </div>
  );
}
