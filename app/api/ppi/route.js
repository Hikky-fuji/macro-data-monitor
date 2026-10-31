import { fetchWithRetry } from '../../lib/resilient-fetch.js'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

const BOJ_BASE = 'https://www.stat-search.boj.or.jp/api/v1/getDataCode'
const START_DATE = '202201'

const SERIES = {
  cgpi: {
    db: 'PR01',
    code: 'PRCG20_2200000000',
  },
  import_ppi: {
    db: 'PR01',
    code: 'PRCG20_2600000000',
  },
  export_ppi: {
    db: 'PR01',
    code: 'PRCG20_2400000000',
  },
  sppi: {
    db: 'PR02',
    code: 'PRCS20_5200000000',
  },
}

function parseDate(value) {
  const text = String(value ?? '')
  if (text.length < 6) return null
  return `${text.slice(0, 4)}/${text.slice(4, 6)}`
}

function parseSeries(series) {
  if (!series) return []

  const valueBlock = series.VALUES ?? {}
  const dates = valueBlock.SURVEY_DATES ?? series.SURVEY_DATES ?? []
  const values = valueBlock.VALUES ?? series.VALUES ?? []

  return dates
    .map((date, index) => {
      const period = parseDate(date)
      const value = Number(values[index])
      return period && Number.isFinite(value) ? { date: period, value } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-36)
}

async function fetchDatabase(db, codes) {
  const params = new URLSearchParams({
    format: 'json',
    lang: 'en',
    db,
    code: codes.join(','),
    startDate: START_DATE,
  })
  const response = await fetchWithRetry(`${BOJ_BASE}?${params}`, { next: { revalidate } }, { attempts: 2, timeoutMs: 15000 })
  const payload = await response.json()

  if (!response.ok || Number(payload.STATUS) !== 200) {
    throw new Error(payload.MESSAGE || `BOJ API returned HTTP ${response.status}`)
  }

  return payload.RESULTSET ?? payload?.DATA?.SERIES ?? []
}

export async function GET() {
  try {
    const grouped = Object.entries(SERIES).reduce((map, [key, definition]) => {
      if (!map[definition.db]) map[definition.db] = []
      map[definition.db].push({ key, code: definition.code })
      return map
    }, {})

    const databaseResults = await Promise.all(
      Object.entries(grouped).map(async ([db, definitions]) => [
        db,
        await fetchDatabase(db, definitions.map(item => item.code)),
      ]),
    )
    const resultsets = Object.fromEntries(databaseResults)

    const result = {}
    for (const [key, definition] of Object.entries(SERIES)) {
      const series = resultsets[definition.db]?.find(item => item.SERIES_CODE === definition.code)
      result[key] = parseSeries(series)
    }

    if (!result.cgpi.length) throw new Error('BOJ did not return CGPI observations')

    return Response.json(result)
  } catch (error) {
    console.error('[PPI]', error)
    return Response.json({ error: error.message }, { status: 502 })
  }
}
