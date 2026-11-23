import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const SERIES = {
  initialClaims: {
    id: 'ICSA',
    label: 'Initial Claims',
    unit: 'claims',
  },
  continuedClaims: {
    id: 'CCSA',
    label: 'Continued Claims',
    unit: 'claims',
  },
  insuredRate: {
    id: 'IURSA',
    label: 'Insured Unemployment Rate',
    unit: 'percent',
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
      source: 'U.S. Employment and Training Administration via FRED',
      frequency: 'Weekly',
      seasonalAdjustment: 'Seasonally Adjusted',
      fetchedAt: new Date().toISOString(),
      series: Object.fromEntries(entries),
    })
  } catch (error) {
    console.error('[US Initial Claims]', error)
    return Response.json(
      { error: 'Unable to load weekly unemployment claims from FRED.' },
      { status: 502 },
    )
  }
}
