import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const SERIES = {
  headline: {
    id: 'PPIFIS',
    label: 'PPI Final Demand',
    unit: 'index',
  },
  core: {
    id: 'PPIFES',
    label: 'PPI Final Demand Less Foods and Energy',
    unit: 'index',
  },
  coreExTrade: {
    id: 'WPSFD49116',
    label: 'PPI Final Demand Less Foods, Energy, and Trade Services',
    unit: 'index',
  },
  goods: {
    id: 'PPIDGS',
    label: 'PPI Final Demand Goods',
    unit: 'index',
  },
  services: {
    id: 'PPIDSS',
    label: 'PPI Final Demand Services',
    unit: 'index',
  },
  energy: {
    id: 'PPIDES',
    label: 'PPI Final Demand Energy',
    unit: 'index',
  },
  tradeServices: {
    id: 'PPITSS',
    label: 'PPI Final Demand Trade Services',
    unit: 'index',
  },
}

async function fetchSeries(apiKey, definition) {
  const observations = await fetchFredSeries(definition.id, {
    apiKey,
    limit: 2000,
    startDate: '2015-01-01',
    revalidate,
    timeoutMs: 12000,
  })
  if (!observations.length) throw new Error(`${definition.id}: no observations returned`)
  return { ...definition, observations }
}

export async function GET() {
  try {
    const apiKey = process.env.FRED_API_KEY
    const entries = await Promise.all(
      Object.entries(SERIES).map(async ([key, definition]) => [
        key,
        await fetchSeries(apiKey, definition),
      ]),
    )

    return Response.json({
      source: 'U.S. Bureau of Labor Statistics via FRED',
      release: 'Producer Price Index',
      releaseId: 46,
      frequency: 'Monthly',
      seasonalAdjustment: 'Seasonally Adjusted',
      fetchedAt: new Date().toISOString(),
      series: Object.fromEntries(entries),
    })
  } catch (error) {
    console.error('[US Producer Price Index]', error)
    return Response.json(
      { error: 'Unable to load US producer price data from FRED.' },
      { status: 502 },
    )
  }
}
