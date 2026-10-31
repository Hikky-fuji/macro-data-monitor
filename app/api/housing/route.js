export const revalidate = 3600
export const dynamic = 'force-dynamic'

const API_BASE = 'https://dashboard.e-stat.go.jp/api/1.0/Json/getData'
const SERIES = {
  startsSaar: { code: '0802010103000010001', label: 'Housing Starts · SAAR', seasonal: '2', unit: 'dwellings, SAAR' },
  totalYoy: { code: '0802010103010030000', label: 'Total Starts', seasonal: '1', unit: 'percent YoY' },
  ownedYoy: { code: '0802010103010030010', label: 'Owner-Occupied', seasonal: '1', unit: 'percent YoY' },
  rentedYoy: { code: '0802010103010030020', label: 'Rental', seasonal: '1', unit: 'percent YoY' },
  builtForSaleYoy: { code: '0802010103010030030', label: 'Built for Sale', seasonal: '1', unit: 'percent YoY' },
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function period(raw) {
  const match = String(raw || '').match(/^(\d{4})(\d{2})/)
  return match ? `${match[1]}-${match[2]}-01` : null
}

async function fetchSeries(definition) {
  const params = new URLSearchParams({
    Cycle: '1',
    IndicatorCode: definition.code,
    IsSeasonalAdjustment: definition.seasonal,
    Lang: 'EN',
    MetaGetFlg: 'N',
    RegionalRank: '2',
    SectionHeaderFlg: '1',
  })
  const response = await fetch(`${API_BASE}?${params}`, {
    next: { revalidate },
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Macro Data Monitor housing dashboard' },
  })
  if (!response.ok) throw new Error(`Statistics Dashboard returned HTTP ${response.status}`)
  const payload = await response.json()
  const result = payload?.GET_STATS?.RESULT
  if (String(result?.status) !== '0') throw new Error(result?.errorMsg || 'Statistics Dashboard request failed')
  const observations = asArray(payload?.GET_STATS?.STATISTICAL_DATA?.DATA_INF?.DATA_OBJ)
    .map(item => item?.VALUE)
    .map(item => ({
      date: period(item?.['@time']),
      value: Number(item?.$),
      provisional: item?.['@isProvisional'] === '1',
    }))
    .filter(item => item.date && Number.isFinite(item.value) && item.date >= '2015-01-01')

  if (!observations.length) throw new Error(`No usable observations for ${definition.code}`)
  return { ...definition, observations }
}

export async function GET() {
  try {
    const entries = await Promise.all(Object.entries(SERIES).map(async ([key, definition]) => (
      [key, await fetchSeries(definition)]
    )))
    return Response.json({
      source: 'Ministry of Land, Infrastructure, Transport and Tourism via Statistics Dashboard API',
      release: 'Housing Starts (Building Starts)',
      frequency: 'Monthly',
      fetchedAt: new Date().toISOString(),
      series: Object.fromEntries(entries),
      meta: {
        automatic: true,
        credit: 'This service uses the API feature of Statistics Dashboard, but the contents of this service are not guaranteed by the Statistics Bureau of Japan.',
      },
    })
  } catch (error) {
    console.error('[Japan Housing]', error)
    return Response.json({ error: 'Unable to load Japan housing-starts data from the Statistics Dashboard API.' }, { status: 502 })
  }
}
