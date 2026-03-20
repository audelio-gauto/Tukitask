'use client'
import React, { useState } from 'react'

export default function MetricsControls() {
  const [status, setStatus] = useState('')
  const token = process.env.NEXT_PUBLIC_ADMIN_METRICS_TOKEN || ''

  async function clearAll() {
    setStatus('Procesando...')
    try {
      const res = await fetch('/api/admin/metrics/clear', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'all' }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'error')
      setStatus('Contadores eliminados')
    } catch (err: any) {
      setStatus('Error: ' + String(err?.message || err))
    }
    setTimeout(() => setStatus(''), 3000)
  }

  async function clearAlerts() {
    setStatus('Procesando...')
    try {
      const res = await fetch('/api/admin/metrics/clear', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'alerts' }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'error')
      setStatus('Alertas eliminadas')
    } catch (err: any) {
      setStatus('Error: ' + String(err?.message || err))
    }
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <div className="flex gap-3 items-center">
      <button onClick={clearAll} className="px-3 py-1 bg-red-600 text-white rounded">Limpiar métricas</button>
      <button onClick={clearAlerts} className="px-3 py-1 bg-yellow-600 text-white rounded">Limpiar alertas</button>
      {status && <div className="text-sm text-gray-600">{status}</div>}
    </div>
  )
}
