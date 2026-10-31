export const dynamic = 'force-dynamic'

import { FetchTimeoutError, fetchWithRetry } from '../../lib/resilient-fetch.js'

const SOURCES = {
  // Core monitoring set only; archive dashboards load on their own pages.
  JP: {
    cpi: '/api/cpi',
    tokyoCpi: '/api/tokyo-cpi',
    wages: '/api/wages',
    bojPolicy: '/api/boj-policy',
  },
  US: {
    cpi: '/api/us-cpi',
    employment: '/api/us-employment',
    consumption: '/api/us-consumption',
    manufacturing: '/api/us-manufacturing',
    macro: '/api/us-macro',
  },
}

const SOURCE_TIMEOUTS = {
  bojPolicy: 20000,
  // CPI routes load 60-70 series on a cold cache (the cpi key is shared by JP and US).
  cpi: 20000,
  tokyoCpi: 20000,
}

async function fetchSource(origin, key, path, timeoutMs = 8500) {
  const startedAt = Date.now()

  try {
    const response = await fetchWithRetry(`${origin}${path}`, {
      next: { revalidate: 900 },
      headers: { 'User-Agent': 'Macro Data Monitor workspace aggregator' },
    }, {
      attempts: 2,
      timeoutMs,
      retryDelayMs: 200,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.error) throw new Error(payload.error)
    return {
      key,
      payload,
      status: 'current',
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      key,
      payload: null,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: error instanceof FetchTimeoutError ? 'Timed out after retry' : error.message,
    }
  }
}

export async function GET(request) {
  const country = new URL(request.url).searchParams.get('country')?.toUpperCase()
  if (!SOURCES[country]) {
    return Response.json({ error: 'country must be JP or US' }, { status: 400 })
  }

  const origin = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : new URL(request.url).origin
  const entries = Object.entries(SOURCES[country])
  const results = await Promise.all(entries.map(([key, path]) => (
    fetchSource(origin, key, path, SOURCE_TIMEOUTS[key] || 8500)
  )))
  const sources = Object.fromEntries(results.map(result => [result.key, result.payload]))
  const status = Object.fromEntries(results.map(result => [result.key, {
    status: result.status,
    durationMs: result.durationMs,
    error: result.error || null,
  }]))
  const failed = results.filter(result => result.status === 'failed').length

  return Response.json({
    country,
    fetchedAt: new Date().toISOString(),
    delivery: 'aggregated',
    complete: failed === 0,
    summary: {
      total: results.length,
      current: results.length - failed,
      failed,
    },
    sources,
    status,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=21600',
    },
  })
}
