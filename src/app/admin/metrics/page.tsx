'use server'
import React from 'react'
import { getMetric } from '../../../lib/metrics'

async function read(key: string) {
  try { const v = await getMetric(key); return v === null ? null : v } catch { return null }
}

import MetricsLive from './MetricsLive'
import MetricsControls from './Controls'

export default async function AdminMetricsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin — Métricas</h1>
      <div className="mb-6 p-4 bg-white rounded shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm text-gray-600">Live metrics</div>
            <div className="text-xs text-gray-400">Polling cada 5s</div>
          </div>
          <MetricsControls />
        </div>
        <MetricsLive />
      </div>
    </div>
  )
}
