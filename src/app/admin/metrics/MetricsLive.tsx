'use client'
import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type MetricsResp = {
  metrics: Record<string, number | null>
  ratios: { geocode_ratio: string | null, directions_ratio: string | null }
}

export default function MetricsLive() {
  const [data, setData] = useState<MetricsResp | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchMetrics() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('error')
      const json = await res.json()
      setData(json)
    } catch {
      // ignore
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchMetrics()
    const id = setInterval(fetchMetrics, 15_000)
    return () => clearInterval(id)
  }, [])

  if (!data) return <div>{loading ? 'Cargando métricas...' : 'Sin métricas'}</div>

  return (
    <div>
      <div className="mb-2 text-sm text-gray-600">Actualizado en vivo (polling cada 15s)</div>
      <pre className="text-xs bg-gray-50 p-3 rounded">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
