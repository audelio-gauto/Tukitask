export async function sendWebhook(url: string, payload: any) {
  if (!url) return
  try {
    // If webhook looks like Slack incoming webhook, send Slack-formatted blocks
    if (url.includes('hooks.slack.com')) {
      const text = payload.message || `${payload.type || 'alert'} — ratio: ${payload.ratio ?? ''}`
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Tukitask alerta:* ${text}`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `*Entorno:* ${process.env.VERCEL_ENV || process.env.NODE_ENV || 'dev'}` },
            { type: 'mrkdwn', text: `*Timestamp:* ${new Date(payload.timestamp || Date.now()).toISOString()}` },
          ],
        },
      ]

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, blocks }),
      })
      return
    }

    // Default: send raw JSON
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.warn('sendWebhook error', err)
  }
}

export async function sendEmail(subject: string, text: string, html?: string) {
  const apiKey = process.env.SENDGRID_API_KEY || ''
  const to = process.env.ADMIN_ALERT_EMAIL_TO || ''
  const from = process.env.SENDGRID_FROM || ''
  if (!apiKey || !to || !from) return
  try {
    const body: any = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        { type: 'text/plain', value: text }
      ]
    }
    if (html) body.content.push({ type: 'text/html', value: html })

    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  } catch (err) {
    console.warn('sendEmail error', err)
  }
}
