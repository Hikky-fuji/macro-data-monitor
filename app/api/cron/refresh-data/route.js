export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ENDPOINTS = [
  '/api/workspace-pulse?country=JP',
  '/api/workspace-pulse?country=US',
  '/api/data-health?country=JP',
  '/api/data-health?country=US',
  '/api/release-calendar',
  '/api/us-ppi',
  '/api/us-household-credit',
]

async function warm(origin, path) {
  const response = await fetch(`${origin}${path}`, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Macro Data Monitor scheduled data refresh' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json()
  if (payload?.error) throw new Error(payload.error)
  return {
    path,
    ok: true,
    checkedAt: payload.checkedAt || payload.generatedAt || payload.fetchedAt || null,
  }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: 'Scheduled refresh is not configured.' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : new URL(request.url).origin
  const settled = await Promise.allSettled(ENDPOINTS.map(path => warm(origin, path)))
  const results = settled.map((result, index) => (
    result.status === 'fulfilled'
      ? result.value
      : {
          path: ENDPOINTS[index],
          ok: false,
          error: result.reason?.message || 'Refresh failed',
        }
  ))
  const failed = results.filter(result => !result.ok).length

  return Response.json({
    ok: failed === 0,
    triggeredAt: new Date().toISOString(),
    schedule: 'Daily production backstop',
    failed,
    results,
  }, { status: failed === results.length ? 502 : 200 })
}
