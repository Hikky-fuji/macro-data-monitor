import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const SERIES = {
  headlinePce: {
    id: 'PCEPI',
    label: 'Headline PCE Price Index',
    unit: 'index',
  },
  corePce: {
    id: 'PCEPILFE',
    label: 'Core PCE Price Index',
    unit: 'index',
  },
  realPce: {
    id: 'PCEC96',
    label: 'Real Personal Consumption Expenditures',
    unit: 'billions of chained 2017 dollars, SAAR',
  },
  realDisposableIncome: {
    id: 'DSPIC96',
    label: 'Real Disposable Personal Income',
    unit: 'billions of chained 2017 dollars, SAAR',
  },
  realGoods: {
    id: 'DGDSRX1',
    label: 'Real PCE: Goods',
    unit: 'billions of chained 2017 dollars, SAAR',
  },
  realServices: {
    id: 'PCESC96',
    label: 'Real PCE: Services',
    unit: 'billions of chained 2017 dollars, SAAR',
  },
  savingRate: {
    id: 'PSAVERT',
    label: 'Personal Saving Rate',
    unit: 'percent',
  },
  restaurantSales: {
    id: 'RSFSDP',
    label: 'Advance Retail Sales: Food Services and Drinking Places',
    unit: 'millions of dollars, seasonally adjusted',
    optional: true,
  },
  foodAwayCpi: {
    id: 'CUSR0000SEFV',
    label: 'CPI: Food Away from Home',
    unit: 'index, seasonally adjusted',
    optional: true,
  },
}

async function fetchSeries(apiKey, definition) {
  const observations = await fetchFredSeries(definition.id, {
    apiKey,
    limit: 400,
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
    const definitions = Object.entries(SERIES)
    const settled = await Promise.allSettled(
      definitions.map(([, definition]) => fetchSeries(apiKey, definition)),
    )
    const entries = []
    const warnings = []

    settled.forEach((result, index) => {
      const [key, definition] = definitions[index]
      if (result.status === 'fulfilled') {
        entries.push([key, result.value])
      } else if (definition.optional) {
        warnings.push(`${definition.id}: ${result.reason?.message || 'optional feed unavailable'}`)
      } else {
        throw result.reason
      }
    })

    return Response.json({
      source: 'U.S. Bureau of Economic Analysis, Census Bureau and BLS via FRED',
      release: 'Personal Income and Outlays / Advance Retail Sales / Consumer Price Index',
      frequency: 'Monthly',
      seasonalAdjustment: 'Seasonally Adjusted',
      fetchedAt: new Date().toISOString(),
      series: Object.fromEntries(entries),
      meta: {
        partial: warnings.length > 0,
        warnings,
        diningMethod: 'Restaurant sales divided by the food-away-from-home CPI; growth rates are an approximate real-demand signal.',
      },
    })
  } catch (error) {
    console.error('[US Personal Income and Outlays]', error)
    return Response.json(
      { error: 'Unable to load US personal income and outlays data from FRED.' },
      { status: 502 },
    )
  }
}
