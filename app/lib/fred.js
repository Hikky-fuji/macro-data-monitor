import { fetchWithRetry } from './resilient-fetch.js'

export function parseFredCsv(csv) {
  return String(csv)
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map(line => {
      const [date, rawValue] = line.split(',')
      const value = Number.parseFloat(rawValue)
      return date && Number.isFinite(value) ? { date, value } : null
    })
    .filter(Boolean)
}

export function averageByMonth(series) {
  const buckets = new Map()
  series.forEach(point => {
    const month = point.date.slice(0, 7)
    const bucket = buckets.get(month) || []
    bucket.push(point.value)
    buckets.set(month, bucket)
  })
  return [...buckets.entries()].map(([month, values]) => ({
    date: `${month}-01`,
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
  }))
}

function csvStartDate(limit) {
  const years = Math.max(5, Math.ceil(limit / 12) + 2)
  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() - years)
  return `${date.getUTCFullYear()}-01-01`
}

export async function fetchFredSeries(seriesId, config = {}) {
  const {
    apiKey,
    limit = 120,
    frequency,
    aggregation,
    startDate,
    revalidate = 3600,
    timeoutMs = 10000,
    onFallback,
  } = config

  if (apiKey) {
    try {
      const params = new URLSearchParams({
        series_id: seriesId,
        api_key: apiKey,
        file_type: 'json',
        sort_order: 'desc',
        limit: String(limit),
      })
      if (startDate) params.set('observation_start', startDate)
      if (frequency) params.set('frequency', frequency)
      if (aggregation) params.set('aggregation_method', aggregation)

      const response = await fetchWithRetry(
        `https://api.stlouisfed.org/fred/series/observations?${params}`,
        { next: { revalidate } },
        { attempts: 2, timeoutMs }
      )
      if (response.ok) {
        const payload = await response.json()
        if (!payload.error_message) {
          return (payload.observations || [])
            .filter(observation => observation.value !== '.')
            .map(observation => ({ date: observation.date, value: Number.parseFloat(observation.value) }))
            .filter(point => Number.isFinite(point.value))
            .reverse()
        }
      }
    } catch (error) {
      console.warn(`[FRED] API request failed for ${seriesId}:`, error.message)
    }
  }

  onFallback?.(seriesId)
  const params = new URLSearchParams({ id: seriesId, cosd: startDate || csvStartDate(limit) })
  const response = await fetchWithRetry(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?${params}`,
    { next: { revalidate } },
    { attempts: 2, timeoutMs }
  )
  if (!response.ok) throw new Error(`FRED CSV HTTP ${response.status} for ${seriesId}`)

  let series = parseFredCsv(await response.text())
  if (frequency === 'm' && aggregation === 'avg') series = averageByMonth(series)
  return series.slice(-limit)
}
