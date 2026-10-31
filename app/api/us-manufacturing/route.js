import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const REGIONAL_SERIES = {
  empire: {
    label: 'Empire State Manufacturing Survey',
    shortLabel: 'New York',
    source: 'Federal Reserve Bank of New York via FRED',
    series: {
      headline: { id: 'GACDISA066MSFRBNY', label: 'General Business Conditions' },
      newOrders: { id: 'NOCDISA066MSFRBNY', label: 'New Orders' },
      employment: { id: 'NECDISA066MSFRBNY', label: 'Employment' },
      pricesPaid: { id: 'PPCDISA066MSFRBNY', label: 'Prices Paid' },
    },
  },
  philly: {
    label: 'Manufacturing Business Outlook Survey',
    shortLabel: 'Philadelphia',
    source: 'Federal Reserve Bank of Philadelphia via FRED',
    series: {
      headline: { id: 'GACDFSA066MSFRBPHI', label: 'General Activity' },
      newOrders: { id: 'NOCDFSA066MSFRBPHI', label: 'New Orders' },
      employment: { id: 'NECDFSA066MSFRBPHI', label: 'Employment' },
      pricesPaid: { id: 'PPCDFSA066MSFRBPHI', label: 'Prices Paid' },
    },
  },
}

// ISM does not provide a public API and its website terms restrict automated
// collection. Keep this compact official snapshot explicit and auditable.
const ISM_SNAPSHOT = {
  label: 'ISM Manufacturing PMI',
  source: 'Institute for Supply Management',
  sourceUrl: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/pmi/september/',
  updateMode: 'Official snapshot — manually verified',
  verifiedAt: '2026-10-01',
  headline: [
    { date: '2025-10-01', value: 48.8 },
    { date: '2025-11-01', value: 48.0 },
    { date: '2025-12-01', value: 47.9 },
    { date: '2026-01-01', value: 52.6 },
    { date: '2026-02-01', value: 52.4 },
    { date: '2026-03-01', value: 52.7 },
    { date: '2026-04-01', value: 52.7 },
    { date: '2026-05-01', value: 54.0 },
    { date: '2026-06-01', value: 53.3 },
    { date: '2026-07-01', value: 55.6 },
    { date: '2026-08-01', value: 54.6 },
    { date: '2026-09-01', value: 54.5 },
  ],
  latest: {
    headline: 54.5,
    newOrders: 55.3,
    production: 56.7,
    employment: 52.7,
    pricesPaid: 77.9,
    inventories: 48.6,
    supplierDeliveries: 59.0,
  },
}

async function fetchSeries(apiKey, definition) {
  const observations = await fetchFredSeries(definition.id, {
    apiKey,
    limit: 400,
    startDate: '2017-01-01',
    revalidate,
  })
  if (!observations.length) throw new Error(`${definition.id}: no observations returned`)
  return { ...definition, observations }
}

// Each survey needs its headline; component series degrade to meta.warnings.
async function fetchSurvey(apiKey, definition, warnings) {
  const definitions = Object.entries(definition.series)
  const settled = await Promise.allSettled(definitions.map(([, series]) => fetchSeries(apiKey, series)))
  const series = {}
  settled.forEach((result, index) => {
    const [key, seriesDefinition] = definitions[index]
    if (result.status === 'fulfilled') series[key] = result.value
    else if (key === 'headline') throw result.reason
    else warnings.push(`${seriesDefinition.id}: ${result.reason?.message || 'unavailable'}`)
  })

  return {
    label: definition.label,
    shortLabel: definition.shortLabel,
    source: definition.source,
    series,
  }
}

export async function GET() {
  try {
    const apiKey = process.env.FRED_API_KEY
    const warnings = []
    const [empire, philly] = await Promise.all([
      fetchSurvey(apiKey, REGIONAL_SERIES.empire, warnings),
      fetchSurvey(apiKey, REGIONAL_SERIES.philly, warnings),
    ])

    return Response.json({
      fetchedAt: new Date().toISOString(),
      frequency: 'Monthly',
      regional: { empire, philly },
      ism: ISM_SNAPSHOT,
      meta: { partial: warnings.length > 0, warnings },
      cadence: [
        {
          key: 'empire',
          sequence: 1,
          timing: 'Around the 15th',
          time: '08:30 ET',
          role: 'Early regional read',
          importance: 'Lead',
        },
        {
          key: 'philly',
          sequence: 2,
          timing: 'Third Thursday',
          time: '08:30 ET',
          role: 'Regional confirmation',
          importance: 'Confirm',
        },
        {
          key: 'ism',
          sequence: 3,
          timing: 'First business day, next month',
          time: '10:00 ET',
          role: 'National manufacturing anchor',
          importance: 'Anchor',
        },
      ],
    })
  } catch (error) {
    console.error('[US Manufacturing Momentum]', error)
    return Response.json(
      { error: 'Unable to load US manufacturing survey data.' },
      { status: 502 },
    )
  }
}
