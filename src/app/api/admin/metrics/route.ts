import { NextResponse } from 'next/server'
import { getMetric, incrementMetric } from '../../../../lib/metrics'
import { sendWebhook, sendEmail } from '../../../../lib/notify'

async function read(key: string) {
  try {
    const v = await getMetric(key)
    return v === null ? null : v
  } catch (err) {
    return null
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = process.env.ADMIN_METRICS_TOKEN || ''
  if (!token || !auth || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // keys we track
  const keys = {
    geocode_hit: 'metrics:cache:hit:geocode',
    geocode_miss: 'metrics:cache:miss:geocode',
    geocode_set: 'metrics:cache:set:geocode',
    directions_hit: 'metrics:cache:hit:directions',
    directions_miss: 'metrics:cache:miss:directions',
    directions_set: 'metrics:cache:set:directions',
  }

  const out: Record<string, number | null> = {}
  for (const k of Object.keys(keys)) {
    // @ts-ignore
    out[k] = await read(keys[k])
  }

  // compute simple hit ratios when possible
  const gh = out.geocode_hit ?? 0
  const gm = out.geocode_miss ?? 0
  const dh = out.directions_hit ?? 0
  const dm = out.directions_miss ?? 0
  const geocode_ratio = (gh === null || gm === null) ? null : ( (gh + gm) > 0 ? Number((gh as number) / ((gh as number) + (gm as number))).toFixed(3) : null )
  const directions_ratio = (dh === null || dm === null) ? null : ( (dh + dm) > 0 ? Number((dh as number) / ((dh as number) + (dm as number))).toFixed(3) : null )

  // Alerting: increment alert counters when ratio below thresholds
  try {
    const geoThreshold = Number(process.env.ADMIN_ALERT_GEOCODE_HIT_RATIO ?? 0.5)
    const dirThreshold = Number(process.env.ADMIN_ALERT_DIRECTIONS_HIT_RATIO ?? 0.5)
    if (geocode_ratio !== null && Number(geocode_ratio) < geoThreshold) {
      incrementMetric('alerts:geocode_low_hit_ratio')
      // notify via webhook if configured
      try {
        const hook = process.env.ADMIN_ALERT_WEBHOOK_URL || ''
        if (hook) await sendWebhook(hook, { type: 'geocode_low_hit_ratio', ratio: geocode_ratio, timestamp: Date.now() })
        // also send email if configured
        const emailTo = process.env.ADMIN_ALERT_EMAIL_TO || ''
        if (emailTo) await sendEmail('Tukitask alert: geocode low hit ratio', `Geocode hit ratio low: ${geocode_ratio}`)
      } catch (e) {}
    }
    if (directions_ratio !== null && Number(directions_ratio) < dirThreshold) {
      incrementMetric('alerts:directions_low_hit_ratio')
      try {
        const hook = process.env.ADMIN_ALERT_WEBHOOK_URL || ''
        if (hook) await sendWebhook(hook, { type: 'directions_low_hit_ratio', ratio: directions_ratio, timestamp: Date.now() })
        const emailTo = process.env.ADMIN_ALERT_EMAIL_TO || ''
        if (emailTo) await sendEmail('Tukitask alert: directions low hit ratio', `Directions hit ratio low: ${directions_ratio}`)
      } catch (e) {}
    }
  } catch (e) {
    // ignore
  }

  return NextResponse.json({ metrics: out, ratios: { geocode_ratio, directions_ratio } })
}
