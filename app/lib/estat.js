import { fetchWithRetry } from './resilient-fetch.js'

const ESTAT_STATS_DATA = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData'

// e-Stat RESULT.STATUS: 0 = success, 1-2 = success with no or partial data,
// 100+ = request or service errors.
export function estatValues(payload) {
  const result = payload?.GET_STATS_DATA?.RESULT
  const status = Number(result?.STATUS)
  if (Number.isFinite(status) && status >= 100) {
    throw new Error(`e-Stat status ${status}: ${result?.ERROR_MSG || 'request failed'}`)
  }
  const values = payload?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? []
  return Array.isArray(values) ? values : [values]
}

// Monthly e-Stat time codes look like YYYY00MMMM (e.g. 2026000909).
export function monthlyObservations(values, limit = 24) {
  return values
    .filter(value => {
      const time = value?.['@time']
      if (!time || time.length !== 10 || time.slice(4, 6) !== '00') return false
      const month = Number.parseInt(time.slice(6, 8), 10)
      return month >= 1 && month <= 12
    })
    .sort((a, b) => a['@time'].localeCompare(b['@time']))
    .slice(-limit)
    .map(value => ({
      date: `${value['@time'].slice(0, 4)}/${value['@time'].slice(6, 8)}`,
      value: Number.parseFloat(value.$),
    }))
}

export async function fetchEstatMonthly({ appId, statsDataId, area, cat, tab, revalidate, limit = 24 }) {
  if (!appId) throw new Error('ESTAT_APP_ID is not configured')
  const params = new URLSearchParams({
    appId,
    statsDataId,
    metaGetFlg: 'N',
    limit: '100',
    cdArea: area,
    cdCat01: cat,
    cdTab: tab,
  })
  const response = await fetchWithRetry(`${ESTAT_STATS_DATA}?${params}`, { next: { revalidate } }, {
    attempts: 2,
    timeoutMs: 12000,
  })
  if (!response.ok) throw new Error(`e-Stat HTTP ${response.status} for cat ${cat} tab ${tab}`)
  return monthlyObservations(estatValues(await response.json()), limit)
}

// Fetch named series with bounded concurrency. Required series must return
// observations; other failures are reported as warnings instead of failing.
export async function fetchNamedSeries(definitions, fetcher, { required = [], concurrency = 6 } = {}) {
  const series = {}
  const warnings = []
  const missingRequired = []

  for (let index = 0; index < definitions.length; index += concurrency) {
    const batch = definitions.slice(index, index + concurrency)
    const settled = await Promise.allSettled(batch.map(definition => fetcher(definition)))
    settled.forEach((result, offset) => {
      const { key } = batch[offset]
      const observations = result.status === 'fulfilled' ? result.value : []
      series[key] = observations
      if (observations.length) return
      const reason = result.status === 'rejected' ? result.reason?.message : 'no observations returned'
      if (required.includes(key)) missingRequired.push(`${key} (${reason})`)
      else warnings.push(`${key}: ${reason}`)
    })
  }

  if (missingRequired.length) {
    throw new Error(`Required series unavailable: ${missingRequired.join('; ')}`)
  }
  return { series, warnings }
}
