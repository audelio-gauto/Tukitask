'use client'
import React, { useState } from 'react'
import { useGeocode } from '../hooks/useGeocode'

export default function GeocodeDemo() {
  const [q, setQ] = useState('')
  const { result, loading, error } = useGeocode(q, { ttlSeconds: 600, debounceMs: 300 })

  return (
    <div className="p-4">
      <label className="block mb-2">Buscar dirección</label>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Escribe una dirección..."
        className="border p-2 w-full"
      />
      {loading && <div className="mt-2">Cargando...</div>}
      {error && <div className="mt-2 text-red-600">{error}</div>}
      {result && (
        <div className="mt-2">
          <div><strong>{result.display_name}</strong></div>
          <div>Lat: {result.lat} Lng: {result.lng}</div>
          <div>Provider: {result.provider}</div>
        </div>
      )}
    </div>
  )
}
