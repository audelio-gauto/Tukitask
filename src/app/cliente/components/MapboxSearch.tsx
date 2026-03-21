'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  onSelect: (name: string, lat: number, lng: number) => void;
  placeholder?: string;
  value?: string;
}

interface Suggestion {
  id: string;
  display_name: string;
  lat: number;
  lng: number;
}

export default function MapboxSearch({ onSelect, placeholder, value }: Props) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Sync external value changes
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search via backend proxy
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!query || query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/maps/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, multi: true, limit: 6 }),
          signal,
        });

        if (signal.aborted) return;

        if (!res.ok) {
          const status = res.status;
          if (status === 429) setError('Demasiadas solicitudes. Esperá un momento.');
          else if (status === 503) setError('Servicio no disponible. Intentá luego.');
          else setError('Error al buscar dirección.');
          setSuggestions([]);
          setOpen(true);
          return;
        }

        const data = await res.json();
        if (signal.aborted) return;

        const items: Suggestion[] = (data.results || []).map((r: { display_name: string; lat: number; lng: number; placeId?: string }, i: number) => ({
          id: r.placeId || `result-${i}`,
          display_name: r.display_name,
          lat: r.lat,
          lng: r.lng,
        }));

        setSuggestions(items);
        setActiveIdx(-1);
        setOpen(items.length > 0);
      } catch (err) {
        if (!signal.aborted) {
          setSuggestions([]);
          setError('Sin conexión. Verificá tu internet.');
          setOpen(true);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [query]);

  const selectSuggestion = useCallback((s: Suggestion) => {
    setQuery(s.display_name);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    onSelect(s.display_name, s.lat, s.lng);
  }, [onSelect]);

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setError(null);
    setActiveIdx(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const li = listRef.current.children[activeIdx] as HTMLElement;
    li?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Input con clear button */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="mapbox-search-listbox"
          aria-activedescendant={activeIdx >= 0 ? `mapbox-opt-${activeIdx}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder || 'Buscar dirección...'}
          autoComplete="off"
          className="w-full pl-10 pr-16 py-3 text-[0.95rem] bg-white border border-gray-200 rounded-xl
                     outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />

        {/* Loading spinner + Clear button */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && (
            <span className="text-gray-400 animate-spin">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Limpiar búsqueda"
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && open && (
        <div className="mt-1.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
          {error}
        </div>
      )}

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id="mapbox-search-listbox"
          role="listbox"
          className="absolute z-50 mt-1.5 w-full bg-white rounded-xl border border-gray-200
                     shadow-lg shadow-black/8 max-h-[280px] overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" id={`mapbox-opt-${i}`} aria-selected={i === activeIdx}>
              <button
                type="button"
                onClick={() => selectSuggestion(s)}
                className={`flex items-start gap-3 w-full px-4 py-3 text-left text-sm transition-colors
                  ${i === activeIdx ? 'bg-emerald-50 text-emerald-900' : 'text-gray-700 hover:bg-gray-50'}
                  ${i < suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <span className={`mt-0.5 flex-shrink-0 ${i === activeIdx ? 'text-emerald-500' : 'text-gray-400'}`}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </span>
                <span className="leading-snug">{s.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* No results */}
      {open && !loading && !error && suggestions.length === 0 && query.length >= 2 && (
        <div className="mt-1.5 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 text-center">
          No se encontraron direcciones para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
