import { NextResponse } from 'next/server'
import { redis } from '../../../../../lib/redis'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = process.env.ADMIN_METRICS_TOKEN || ''
  if (!token || !auth || auth !== `Bearer ${token}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const type = body?.type || 'all' // all | metrics | alerts

  const keysMetrics = [
    'metrics:cache:hit:geocode',
    'metrics:cache:miss:geocode',
    'metrics:cache:set:geocode',
    'metrics:cache:hit:directions',
    'metrics:cache:miss:directions',
    'metrics:cache:set:directions',
  ]
  const keysAlerts = [
    'alerts:geocode_low_hit_ratio',
    'alerts:directions_low_hit_ratio',
  ]

  try {
    if (!redis) return NextResponse.json({ error: 'no_redis' }, { status: 500 })
    const toDel: string[] = []
    if (type === 'all' || type === 'metrics') toDel.push(...keysMetrics)
    if (type === 'all' || type === 'alerts') toDel.push(...keysAlerts)
    if (toDel.length > 0) await redis.del(...toDel)
    return NextResponse.json({ ok: true, deleted: toDel })
  } catch (err) {
    console.error('clear metrics error', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
