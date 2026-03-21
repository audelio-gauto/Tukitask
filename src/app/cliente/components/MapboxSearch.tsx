'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onSelect: (name: string, lat: number, lng: number) => void;
  placeholder?: string;
  value?: string;
}

interface Suggestion {
  display_name: string;
  lat: number;
  lng: number;
}

export default function MapboxSearch({ onSelect, placeholder, value }: Props) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  // Sync external value changes
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Debounced search via backend proxy
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (!query || query.length < 2) { setSuggestions([]); return; }

    setLoading(true);
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
        if (!res.ok) { setSuggestions([]); return; }
        const data = await res.json();
        if (signal.aborted) return;
        const items: Suggestion[] = (data.results || []).map((r: any) => ({
          display_name: r.display_name,
          lat: r.lat,
          lng: r.lng,
        }));
        setSuggestions(items);
      } catch {
        if (!signal.aborted) setSuggestions([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [query]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || 'Buscar dirección...'}
        style={{
          width: '100%',
          padding: '0.65em 1em',
          fontSize: '0.95rem',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          border: '1.5px solid #e5e7eb',
          borderRadius: 12,
          outline: 'none',
          background: '#fff',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => e.target.style.borderColor = '#10b981'}
        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        autoComplete="off"
      />
      {loading && (
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.8rem' }}>...</span>
      )}
      {suggestions.length > 0 && (
        <ul style={{
          listStyle: 'none', margin: '4px 0 0', padding: 0,
          background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', maxHeight: 260, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => { onSelect(s.display_name, s.lat, s.lng); setSuggestions([]); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.88rem', color: '#374151', textAlign: 'left',
                  borderBottom: i < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <svg width="16" height="16" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{s.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
