import { fetchWithRetry } from '../../lib/resilient-fetch.js'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

const BOJ_BASE = 'https://www.stat-search.boj.or.jp/api/v1/getDataCode'

// db=CO, series code = TK99 + F + industry(4) + item(3) + G + CQ + actual/fc(1) + size(1) + 000
// industry: 1000=manufacturing, 2000=non-manufacturing
// actual/fc: 0=actual, 1=forecast (next-quarter outlook)
// size: 1=large, 2=medium, 3=small
const CODES = {
  large_mfg:       'TK99F1000601GCQ01000',
  large_mfg_fc:    'TK99F1000601GCQ11000',
  large_nonmfg:    'TK99F2000601GCQ01000',
  large_nonmfg_fc: 'TK99F2000601GCQ11000',
  med_mfg:         'TK99F1000601GCQ02000',
  med_mfg_fc:      'TK99F1000601GCQ12000',
  small_mfg:       'TK99F1000601GCQ03000',
  small_nonmfg:    'TK99F2000601GCQ03000',
}

// SURVEY_DATES format: 202201 = 2022 Q1, 202204 = 2022 Q4
function parseDate(d) {
  const s = String(d)
  const year = s.slice(0, 4)
  const q = s.slice(4, 6)
  return `${year}/Q${parseInt(q)}`
}

function parseSeries(resultset, code) {
  const s = resultset.find(r => r.SERIES_CODE === code)
  if (!s) return []
  const dates = s.VALUES?.SURVEY_DATES ?? []
  const vals  = s.VALUES?.VALUES ?? []
  return dates
    .map((d, i) => ({ date: parseDate(d), value: vals[i] }))
    .filter(o => o.value != null && !isNaN(o.value))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET() {
  try {
    const allCodes = Object.values(CODES).join(',')
    const url = `${BOJ_BASE}?format=json&lang=en&db=CO&code=${allCodes}&startDate=200001`
    const res = await fetchWithRetry(url, { next: { revalidate } }, { attempts: 2, timeoutMs: 15000 })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`BOJ API ${res.status}: ${text.slice(0, 300)}`)
    }

    const json = await res.json()
    if (json.STATUS !== 200) throw new Error(`BOJ: ${json.MESSAGE}`)

    const rs = json.RESULTSET ?? []
    const result = {}
    for (const [key, code] of Object.entries(CODES)) {
      result[key] = parseSeries(rs, code)
    }

    // Forecast surprise: actual(t) - forecast made at (t-1) for period t
    const calcSurprise = (actual, forecast) => {
      const fcMap = Object.fromEntries(forecast.map(v => [v.date, v.value]))
      return actual.map((a, i) => {
        if (i === 0) return null
        const priorFc = fcMap[actual[i - 1].date]
        if (priorFc == null) return null
        return { date: a.date, value: parseFloat((a.value - priorFc).toFixed(1)) }
      }).filter(Boolean)
    }

    result.large_mfg_surprise    = calcSurprise(result.large_mfg, result.large_mfg_fc)
    result.large_nonmfg_surprise = calcSurprise(result.large_nonmfg, result.large_nonmfg_fc)

    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
