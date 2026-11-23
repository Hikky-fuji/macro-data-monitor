import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const SERIES = {
  total: { id: 'RSAFS', label: 'Advance Retail & Food Services Sales', group: 'headline' },
  exAutos: { id: 'RSFSXMV', label: 'Advance Sales ex Motor Vehicles', group: 'headline' },
  exAutosGas: { id: 'MARTSSM44W72USS', label: 'Advance Sales ex Motor Vehicles & Gasoline', group: 'headline' },
  realTotal: { id: 'RRSFS', label: 'Advance Real Retail & Food Services Sales', group: 'headline' },
  motorVehicles: { id: 'MRTSSM441USS', label: 'Motor Vehicles & Parts', group: 'category', optional: true },
  furniture: { id: 'MRTSSM442USS', label: 'Furniture & Home Furnishings', group: 'category', optional: true },
  electronics: { id: 'MRTSSM443USS', label: 'Electronics & Appliances', group: 'category', optional: true },
  buildingMaterials: { id: 'MRTSSM444USS', label: 'Building Materials & Garden', group: 'category', optional: true },
  foodBeverage: { id: 'MRTSSM445USS', label: 'Food & Beverage Stores', group: 'category', optional: true },
  health: { id: 'MRTSSM446USS', label: 'Health & Personal Care', group: 'category', optional: true },
  gasoline: { id: 'MRTSSM447USS', label: 'Gasoline Stations', group: 'category', optional: true },
  clothing: { id: 'MRTSSM448USS', label: 'Clothing & Accessories', group: 'category', optional: true },
  recreation: { id: 'MRTSSM451USS', label: 'Sporting Goods, Hobby & Books', group: 'category', optional: true },
  generalMerchandise: { id: 'MRTSSM452USS', label: 'General Merchandise', group: 'category', optional: true },
  miscellaneous: { id: 'MRTSSM453USS', label: 'Miscellaneous Retailers', group: 'category', optional: true },
  nonstore: { id: 'MRTSSM454USS', label: 'Nonstore Retailers', group: 'category', optional: true },
  restaurants: { id: 'MRTSSM722USS', label: 'Food Services & Drinking Places', group: 'category', optional: true },
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
    const definitions = Object.entries(SERIES)
    const settled = await Promise.allSettled(
      definitions.map(([, definition]) => fetchSeries(process.env.FRED_API_KEY, definition)),
    )
    const entries = []
    const warnings = []

    settled.forEach((result, index) => {
      const [key, definition] = definitions[index]
      if (result.status === 'fulfilled') entries.push([key, result.value])
      else if (definition.optional) warnings.push(`${definition.id}: ${result.reason?.message || 'unavailable'}`)
      else throw result.reason
    })

    return Response.json({
      source: 'U.S. Census Bureau and Federal Reserve Bank of St. Louis via FRED',
      release: 'Advance Monthly Sales for Retail and Food Services / Monthly Retail Trade Survey',
      frequency: 'Monthly',
      seasonalAdjustment: 'Seasonally Adjusted',
      fetchedAt: new Date().toISOString(),
      series: Object.fromEntries(entries),
      meta: {
        partial: warnings.length > 0,
        warnings,
        comparison: 'Headline cards use the advance release. Category breadth uses the latest common month from the revised Monthly Retail Trade Survey and is labeled separately.',
        realMethod: 'RRSFS is calculated by the St. Louis Fed by deflating advance retail and food-services sales with CPI-U.',
      },
    })
  } catch (error) {
    console.error('[US Retail Sales]', error)
    return Response.json({ error: 'Unable to load US retail-sales data from FRED.' }, { status: 502 })
  }
}
