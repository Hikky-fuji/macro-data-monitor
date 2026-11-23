import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const SERIES = {
  openings: {
    id: 'JTSJOL',
    label: 'Job Openings',
    unit: 'thousands',
  },
  openingsRate: {
    id: 'JTSJOR',
    label: 'Job Openings Rate',
    unit: 'percent',
  },
  hiresRate: {
    id: 'JTSHIR',
    label: 'Hires Rate',
    unit: 'percent',
  },
  quitsRate: {
    id: 'JTSQUR',
    label: 'Quits Rate',
    unit: 'percent',
  },
  layoffsRate: {
    id: 'JTSLDR',
    label: 'Layoffs and Discharges Rate',
    unit: 'percent',
  },
  unemployed: {
    id: 'UNEMPLOY',
    label: 'Unemployment Level',
    unit: 'thousands',
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
      release: 'Job Openings and Labor Turnover Survey',
      frequency: 'Monthly',
      seasonalAdjustment: 'Seasonally Adjusted',
      revisionNote: 'The latest JOLTS observation is preliminary and normally revised with the next release.',
      fetchedAt: new Date().toISOString(),
      series: Object.fromEntries(entries),
    })
  } catch (error) {
    console.error('[US JOLTS]', error)
    return Response.json(
      { error: 'Unable to load US JOLTS data from FRED.' },
      { status: 502 },
    )
  }
}
