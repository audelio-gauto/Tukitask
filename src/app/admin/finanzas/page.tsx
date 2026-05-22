'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface KpiCard {
  label: string;
  value: string;
  sub: string;
  gradient: string;
  href: string;
  svgPath: string;
}

export default function FinanzasDashboard() {
  const [totalComisiones, setTotalComisiones] = useState<number | null>(null);
  const [retirosPendientes, setRetirosPendientes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [
        { data: comData },
        { count: retiros },
      ] = await Promise.all([
        supabase.from('commissions').select('amount').limit(1000),
        supabase.from('wallet_transactions').select('*', { count: 'exact', head: true })
          .eq('type', 'withdrawal').eq('status', 'pending'),
      ]);
      const total = (comData ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0);
      setTotalComisiones(total);
      setRetirosPendientes(retiros ?? 0);
      setLoading(false);
    })();
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const kpis: KpiCard[] = [
    {
      label: 'Comisiones Totales',
      value: loading ? '—' : `Gs ${fmt(totalComisiones ?? 0)}`,
      sub: 'acumuladas',
      gradient: 'from-emerald-400 to-emerald-500',
      href: '/admin/finanzas/comisiones',
      svgPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Retiros Pendientes',
      value: loading ? '—' : String(retirosPendientes ?? 0),
      sub: 'sin procesar',
      gradient: 'from-amber-400 to-amber-500',
      href: '/admin/finanzas/retiros',
      svgPath: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
      label: 'Pagos Pendientes',
      value: '—',
      sub: 'por confirmar',
      gradient: 'from-blue-400 to-blue-500',
      href: '/admin/finanzas/pagos-pendientes',
      svgPath: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    },
    {
      label: 'Movimientos Hoy',
      value: '—',
      sub: 'transacciones',
      gradient: 'from-purple-400 to-purple-500',
      href: '/admin/finanzas/movimientos',
      svgPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    },
  ];

  const sections = [
    {
      title: 'Comisiones',
      color: 'emerald',
      borderColor: 'border-t-emerald-400',
      dotColor: 'bg-emerald-400',
      links: [
        { label: 'Ver todas las comisiones', href: '/admin/finanzas/comisiones' },
      ],
    },
    {
      title: 'Retiros Vendedores',
      color: 'amber',
      borderColor: 'border-t-amber-400',
      dotColor: 'bg-amber-400',
      links: [
        { label: 'Retiros pendientes', href: '/admin/finanzas/retiros' },
      ],
    },
    {
      title: 'Pagos Pendientes',
      color: 'blue',
      borderColor: 'border-t-blue-400',
      dotColor: 'bg-blue-400',
      links: [
        { label: 'Pagos por confirmar', href: '/admin/finanzas/pagos-pendientes' },
      ],
    },
    {
      title: 'Movimientos',
      color: 'purple',
      borderColor: 'border-t-purple-400',
      dotColor: 'bg-purple-400',
      links: [
        { label: 'Historial de movimientos', href: '/admin/finanzas/movimientos' },
      ],
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Panel de Finanzas</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Comisiones, retiros, pagos pendientes y movimientos financieros.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {kpis.map(k => (
          <Link key={k.label} href={k.href} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${k.gradient} flex items-center justify-center mb-3 shadow-sm`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={k.svgPath} />
              </svg>
            </div>
            <div className="text-2xl font-bold text-gray-900 leading-tight">{k.value}</div>
            <div className="text-xs font-medium text-gray-600 mt-0.5">{k.label}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{k.sub}</div>
          </Link>
        ))}
      </div>

      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Secciones</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map(sec => (
          <div key={sec.title} className={`bg-white rounded-xl border-t-4 ${sec.borderColor} border border-gray-200 shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${sec.dotColor}`} />
              <h3 className="text-sm font-semibold text-gray-900">{sec.title}</h3>
            </div>
            <ul className="space-y-1">
              {sec.links.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group">
                    <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
