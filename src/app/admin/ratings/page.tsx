'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';

interface RatingEntry {
  email: string;
  avg: number;
  count: number;
  ones: number;
}

interface RatingData {
  bottom10: RatingEntry[];
  top10: RatingEntry[];
  recent_ones: { score: number; comment?: string; rated_email: string; rater_email: string; created_at: string }[];
  stats: { totalRatings: number; oneStarCount: number; avgOverall: number };
  topKeywords: { word: string; count: number }[];
}

function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} className={`w-3 h-3 ${s <= Math.round(score) ? 'text-[#F5C518]' : 'text-gray-300'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export default function RatingsDashboardPage() {
  const [data, setData] = useState<RatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'bottom' | 'top'>('bottom');

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/ratings', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
  );

  if (!data) return null;

  const displayList = viewMode === 'bottom' ? data.bottom10 : data.top10;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center">
          <Icon name="star" size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard de Calificaciones</h1>
          <p className="text-sm text-gray-500">Últimos 30 días · mínimo 3 calificaciones para aparecer</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{data.stats.totalRatings}</p>
          <p className="text-xs text-gray-500 mt-1">Calificaciones totales</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <p className="text-2xl font-bold text-gray-900">{data.stats.avgOverall}</p>
            <Stars score={data.stats.avgOverall} />
          </div>
          <p className="text-xs text-gray-500">Promedio general</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{data.stats.oneStarCount}</p>
          <p className="text-xs text-gray-500 mt-1">Calificaciones de 1 ★</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Ranking table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Ranking de Usuarios</h2>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                <button
                  onClick={() => setViewMode('bottom')}
                  className={`px-3 py-1.5 font-semibold transition-colors ${viewMode === 'bottom' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Peor calificados
                </button>
                <button
                  onClick={() => setViewMode('top')}
                  className={`px-3 py-1.5 font-semibold transition-colors ${viewMode === 'top' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Mejor calificados
                </button>
              </div>
            </div>

            {displayList.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Sin datos suficientes</p>
            ) : (
              <div className="space-y-2">
                {displayList.map((e, i) => (
                  <div key={e.email} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      viewMode === 'bottom'
                        ? (i === 0 ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700')
                        : (i === 0 ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700')
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{e.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars score={e.avg} />
                        <span className="text-xs text-gray-500">{e.avg} · {e.count} calificaciones</span>
                        {e.ones > 0 && (
                          <span className="text-xs text-red-500 font-medium">{e.ones} × ★</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent 1-star */}
          {data.recent_ones.length > 0 && (
            <div className="bg-white rounded-lg border border-red-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 inline-flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0" />
                Últimas calificaciones de 1 ★
              </h2>
              <div className="space-y-2">
                {data.recent_ones.map((r, i) => (
                  <div key={i} className="py-2.5 px-3 rounded-lg bg-red-50 border border-red-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">{r.rated_email}</p>
                      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('es-PY')}</span>
                    </div>
                    {r.comment && (
                      <p className="text-xs text-gray-600 italic">&ldquo;{r.comment}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">por: {r.rater_email}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Keywords */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Palabras en malas reseñas</h2>
            {data.topKeywords.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Sin comentarios negativos</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.topKeywords.map(kw => {
                  const maxCount = data.topKeywords[0]?.count || 1;
                  const size = 0.7 + (kw.count / maxCount) * 0.6;
                  return (
                    <span
                      key={kw.word}
                      className="px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium"
                      style={{ fontSize: `${size}rem` }}
                      title={`${kw.count} apariciones`}
                    >
                      {kw.word}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
