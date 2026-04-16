'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Order {
  id: string;
  created_at: string;
  status: string;
  client_email: string;
  pickup_address: string;
  delivery_address: string;
  vehicle_type: string;
  offer: number | null;
  suggested_price: number | null;
  accepted_by: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  payment_method: string | null;
  description: string | null;
  is_multi_stop: boolean;
  stop_count: number | null;
  order_stops: { sequence: number; address: string; lat: number; lng: number; status: string; fail_reason: string | null }[] | null;
  _type: 'order';
  _driver_active: boolean;
}

interface TecnicoJob {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  client_email: string;
  client_name: string | null;
  tecnico_email: string | null;
  tecnico_name: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  service_type: string | null;
  address: string | null;
  description: string | null;
  agreed_price: number | null;
  client_initial_price: number | null;
  _type: 'tecnico';
  _driver_active: boolean;
}

type Row = Order | TecnicoJob;

// ── Status config ──────────────────────────────────────────────────────────────
const ORDER_STATUSES: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pendiente',        color: 'bg-amber-100 text-amber-800' },
  negotiating:        { label: 'Negociando',        color: 'bg-blue-100 text-blue-800' },
  accepted:           { label: 'Aceptado',          color: 'bg-indigo-100 text-indigo-800' },
  picking_up:         { label: 'Recogiendo',        color: 'bg-purple-100 text-purple-800' },
  in_transit:         { label: 'En tránsito',       color: 'bg-cyan-100 text-cyan-800' },
  delivered:          { label: 'Entregado',         color: 'bg-green-100 text-green-800' },
  commission_charged: { label: 'Comisión cobrada',  color: 'bg-emerald-100 text-emerald-800' },
  client_confirmed:   { label: 'Confirmado',        color: 'bg-teal-100 text-teal-800' },
  cancelled:          { label: 'Cancelado',         color: 'bg-red-100 text-red-800' },
  failed:             { label: 'Fallido',           color: 'bg-rose-100 text-rose-800' },
  returning:          { label: 'Devolviendo',       color: 'bg-orange-100 text-orange-800' },
  returned:           { label: 'Devuelto',          color: 'bg-gray-100 text-gray-600' },
};

const TECNICO_STATUSES: Record<string, { label: string; color: string }> = {
  pending:             { label: 'Pendiente',        color: 'bg-amber-100 text-amber-800' },
  accepted:            { label: 'Aceptado',         color: 'bg-indigo-100 text-indigo-800' },
  en_camino:           { label: 'En camino',        color: 'bg-blue-100 text-blue-800' },
  llegue:              { label: 'Llegó',            color: 'bg-purple-100 text-purple-800' },
  en_proceso:          { label: 'En proceso',       color: 'bg-cyan-100 text-cyan-800' },
  completion_pending:  { label: 'Esperando cierre', color: 'bg-orange-100 text-orange-800' },
  completado:          { label: 'Completado',       color: 'bg-green-100 text-green-800' },
  cancelled:           { label: 'Cancelado',        color: 'bg-red-100 text-red-800' },
  rechazado:           { label: 'Rechazado',        color: 'bg-rose-100 text-rose-800' },
  incidente:           { label: 'Incidente',        color: 'bg-red-200 text-red-900' },
};

const VEHICLE_LABELS: Record<string, string> = {
  moto:       '🏍️ Moto',
  auto:       '🚗 Auto',
  motocarro:  '🛺 Motocarro',
  camion2t:   '🚛 Camión',
  camion_3000:'🚛 Camión 3T',
  camion_5000:'🚛 Camión 5T',
};

// ── Tab config ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',     label: 'Todos',     icon: '📋' },
  { key: 'orders',  label: 'Envíos',    icon: '🚗' },
  { key: 'tecnico', label: 'Servicios', icon: '🔧' },
];

const ALL_ORDER_STATUS_KEYS = Object.keys(ORDER_STATUSES);
const ALL_TECNICO_STATUS_KEYS = Object.keys(TECNICO_STATUSES);

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(n: number | null) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status, type }: { status: string; type: 'order' | 'tecnico' }) {
  const map = type === 'order' ? ORDER_STATUSES : TECNICO_STATUSES;
  const cfg = map[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: 'order' | 'tecnico' }) {
  return type === 'order'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">🚗 Envío</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">🔧 Servicio</span>;
}

function ActiveDot({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />Activo</span>
    : <span className="inline-flex items-center gap-1 text-gray-400 text-xs"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Offline</span>;
}

// ── Order detail drawer ────────────────────────────────────────────────────────
function OrderDrawer({ row, onClose }: { row: Row | null; onClose: () => void }) {
  if (!row) return null;
  const isOrder = row._type === 'order';
  const o = row as Order;
  const j = row as TecnicoJob;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />
      <div
        className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <TypeBadge type={row._type} />
              <StatusBadge status={row.status} type={row._type} />
            </div>
            <p className="text-xs text-gray-400 font-mono mt-1">{row.id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Timeline pills */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Creado', time: row.created_at },
            { label: 'Aceptado', time: row.accepted_at },
            { label: 'Completado', time: row.completed_at },
            ...(isOrder ? [{ label: 'Cancelado', time: o.cancelled_at }] : []),
          ].map(t => t.time ? (
            <div key={t.label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              <p className="text-[10px] text-gray-400 font-semibold uppercase">{t.label}</p>
              <p className="text-xs font-mono text-gray-700">{fmtDate(t.time)}</p>
            </div>
          ) : null)}
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoField label="Cliente" value={row.client_email} />
          {isOrder ? (
            <>
              <InfoField label="Driver" value={o.accepted_by} extra={<ActiveDot active={o._driver_active} />} />
              <InfoField label="Vehículo" value={VEHICLE_LABELS[o.vehicle_type] ?? o.vehicle_type} />
              <InfoField label="Pago" value={o.payment_method ?? '—'} />
              <InfoField label="Precio sugerido" value={fmtPrice(o.suggested_price)} />
              <InfoField label="Precio acordado" value={fmtPrice(o.offer)} highlight />
            </>
          ) : (
            <>
              <InfoField label="Técnico" value={j.tecnico_email} extra={<ActiveDot active={j._driver_active} />} />
              <InfoField label="Servicio" value={j.service_type ?? '—'} />
              <InfoField label="Precio sugerido" value={fmtPrice(j.client_initial_price)} />
              <InfoField label="Precio acordado" value={fmtPrice(j.agreed_price)} highlight />
            </>
          )}
        </div>

        {/* Addresses */}
        {isOrder && (
          <div className="space-y-2">
            <AddrField label="📍 Origen" value={o.pickup_address} />
            {o.is_multi_stop && o.order_stops && o.order_stops.length > 0 ? (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">📦 Paradas ({o.order_stops.length})</p>
                <div className="space-y-1.5">
                  {[...o.order_stops].sort((a, b) => a.sequence - b.sequence).map((s, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                        s.status === 'delivered' ? 'bg-green-500' : s.status === 'failed' ? 'bg-red-500' : 'bg-purple-500'
                      }`}>{s.sequence}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 leading-snug">{s.address}</p>
                        {s.status === 'failed' && s.fail_reason && (
                          <p className="text-[10px] text-red-500 mt-0.5">✗ {s.fail_reason}</p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-semibold ${
                        s.status === 'delivered' ? 'text-green-600' : s.status === 'failed' ? 'text-red-500' : 'text-gray-400'
                      }`}>{s.status === 'delivered' ? '✓' : s.status === 'failed' ? '✗' : '···'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <AddrField label="🎯 Destino" value={o.delivery_address} />
            )}
            {o.description && <AddrField label="📝 Descripción" value={o.description} />}
          </div>
        )}
        {!isOrder && j.address && (
          <AddrField label="📍 Dirección" value={j.address} />
        )}
        {!isOrder && j.description && (
          <AddrField label="📝 Descripción" value={j.description} />
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value, extra, highlight }: { label: string; value: string | null | undefined; extra?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className={`text-sm font-medium truncate ${highlight ? 'text-green-700 font-bold' : 'text-gray-800'}`}>
          {value || '—'}
        </p>
        {extra}
      </div>
    </div>
  );
}

function AddrField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-700 leading-snug">{value}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [tab, setTab] = useState<'all' | 'orders' | 'tecnico'>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDriversCount, setActiveDriversCount] = useState(0);

  // Detail drawer
  const [selected, setSelected] = useState<Row | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const params = new URLSearchParams({
        type: tab,
        page: String(page),
        limit: '50',
      });
      if (search) params.set('search', search);
      if (selectedStatuses.length > 0) params.set('status', selectedStatuses.join(','));
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo)   params.set('date_to', dateTo);

      const res = await fetch(`/api/admin/orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setRows(data.data || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setActiveDriversCount(data.active_drivers || 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [tab, page, search, selectedStatuses, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounce search
  const handleSearchChange = (v: string) => {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(v);
      setPage(1);
    }, 400);
  };

  const toggleStatus = (s: string) => {
    setSelectedStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
    setPage(1);
  };

  const handleTabChange = (t: 'all' | 'orders' | 'tecnico') => {
    setTab(t);
    setSelectedStatuses([]);
    setPage(1);
  };

  const statusKeys = tab === 'tecnico' ? ALL_TECNICO_STATUS_KEYS : ALL_ORDER_STATUS_KEYS;
  const statusMap  = tab === 'tecnico' ? TECNICO_STATUSES : ORDER_STATUSES;

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pedidos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {total.toLocaleString('es-PY')} pedidos en total ·{' '}
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              {activeDriversCount} activos ahora
            </span>
          </p>
        </div>
        <button
          onClick={() => fetchData()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key as 'all' | 'orders' | 'tecnico')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Filters bar ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Buscar</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Email, dirección, ID..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] text-gray-800"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] text-gray-800"
            />
          </div>

          {/* Clear */}
          {(search || selectedStatuses.length > 0 || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearch(''); setSearchInput(''); setSelectedStatuses([]);
                setDateFrom(''); setDateTo(''); setPage(1);
              }}
              className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold text-gray-400 self-center mr-1">Estado:</span>
          {statusKeys.map(s => {
            const cfg = statusMap[s];
            const active = selectedStatuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  active
                    ? cfg.color + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[120px_1fr_160px_100px_110px_110px_90px] gap-0 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div>Tipo / Estado</div>
          <div>Cliente / Asignado</div>
          <div>Destino / Servicio</div>
          <div>Precio</div>
          <div>Asignado</div>
          <div>Fecha</div>
          <div>En campo</div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F5C518]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium">Sin pedidos</p>
            <p className="text-sm mt-0.5">Cambiá los filtros para ver más resultados</p>
          </div>
        ) : rows.map((row, i) => (
          <OrderRow key={row.id} row={row} index={i} onClick={() => setSelected(row)} />
        ))}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Mostrando {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total.toLocaleString('es-PY')}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
            >
              ← Anterior
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(7, pages) }, (_, i) => {
                let p: number;
                if (pages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= pages - 3) {
                  p = pages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 text-sm rounded-lg transition-colors font-medium ${
                      p === page
                        ? 'bg-[#F5C518] text-[#1C1C2E] font-bold'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <button
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ── Drawer ───────────────────────────────────────────────────────── */}
      <OrderDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ── Row component ──────────────────────────────────────────────────────────────
function OrderRow({ row, index, onClick }: { row: Row; index: number; onClick: () => void }) {
  const isOrder = row._type === 'order';
  const o = row as Order;
  const j = row as TecnicoJob;

  const driverLabel = isOrder
    ? (o.accepted_by ? o.accepted_by.split('@')[0] : '—')
    : (j.tecnico_email ? j.tecnico_email.split('@')[0] : '—');

  const destination = isOrder
    ? o.delivery_address
    : (j.service_type ?? j.address ?? '—');

  const price = isOrder ? o.offer : j.agreed_price;

  return (
    <div
      onClick={onClick}
      className={`grid grid-cols-[120px_1fr_160px_100px_110px_110px_90px] gap-0 px-4 py-3.5 border-b border-gray-100 cursor-pointer transition-colors hover:bg-amber-50/60 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
    >
      {/* Type / Status */}
      <div className="flex flex-col gap-1.5 justify-center">
        <TypeBadge type={row._type} />
        <StatusBadge status={row.status} type={row._type} />
      </div>

      {/* Client */}
      <div className="flex flex-col justify-center overflow-hidden pr-3">
        <p className="text-sm text-gray-800 font-medium truncate">{row.client_email}</p>
        {isOrder
          ? <p className="text-xs text-gray-400 truncate">{o.vehicle_type ? (VEHICLE_LABELS[o.vehicle_type] ?? o.vehicle_type) : ''}</p>
          : <p className="text-xs text-gray-400 truncate">{j.client_name ?? ''}</p>
        }
      </div>

      {/* Destination */}
      <div className="flex flex-col justify-center overflow-hidden pr-3">
        <p className="text-xs text-gray-700 leading-snug line-clamp-2">{destination || '—'}</p>
        {isOrder && o.is_multi_stop && (
          <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 w-fit">
            📦 {o.stop_count ?? o.order_stops?.length ?? '?'} paradas
          </span>
        )}
      </div>

      {/* Price */}
      <div className="flex flex-col justify-center">
        <p className="text-sm font-bold text-gray-800">{fmtPrice(price)}</p>
      </div>

      {/* Driver */}
      <div className="flex flex-col justify-center overflow-hidden pr-3">
        <p className="text-xs text-gray-700 font-medium truncate">{driverLabel}</p>
        {(isOrder ? !!o.accepted_by : !!j.tecnico_email) && (
          <ActiveDot active={row._driver_active} />
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col justify-center">
        <p className="text-xs text-gray-600">{fmtDate(row.created_at)}</p>
      </div>

      {/* Active indicator */}
      <div className="flex items-center justify-center">
        {row._driver_active
          ? <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" title="En campo" />
          : <span className="w-3 h-3 rounded-full bg-gray-200" title="Offline" />
        }
      </div>
    </div>
  );
}
