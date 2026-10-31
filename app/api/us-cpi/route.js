import { fetchWithRetry } from '../../lib/resilient-fetch.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const SERIES = {
  headline: { id: 'CPIAUCSL', label: 'Headline CPI' },
  core: { id: 'CPILFESL', label: 'Core CPI' },
  servicesExShelter: { id: 'CUSR0000SASL2RS', label: 'Services ex Shelter' },
  food: { id: 'CPIUFDSL', label: 'Food' },
  energy: { id: 'CPIENGSL', label: 'Energy' },
  coreGoods: { id: 'CUSR0000SACL1E', label: 'Core Goods' },
  coreServices: { id: 'CUSR0000SASLE', label: 'Core Services' },
  rentOfShelter: { id: 'CUSR0000SAS2RS', label: 'Rent of Shelter' },
  medicalServices: { id: 'CUSR0000SAM2', label: 'Medical Care Services' },
  vehicles: { id: 'CUSR0000SETA', label: 'New & Used Vehicles' },
  usedCars: { id: 'CUSR0000SETA02', label: 'Used Cars & Trucks' },
  furnishings: { id: 'CUSR0000SAH3', label: 'Household Furnishings' },
  apparel: { id: 'CPIAPPSL', label: 'Apparel' },
  rent: { id: 'CUSR0000SEHA', label: 'Rent of Primary Residence' },
  oer: { id: 'CUSR0000SEHC', label: "Owners' Equivalent Rent" },
  medical: { id: 'CPIMEDSL', label: 'Medical Care' },
  education: { id: 'CPIEDUSL', label: 'Education & Communication' },
  transportation: { id: 'CUSR0000SAS4', label: 'Transportation Services' },
}

function preserveOfficialGap(observations) {
  const gapDate = '2025-10-01'
  const withoutGap = observations.filter(observation => observation.date !== gapDate)
  return [...withoutGap, { date: gapDate, value: null }]
    .sort((a, b) => a.date.localeCompare(b.date))
}

function fetchWithTimeout(url, options = {}, milliseconds = 15000) {
  return fetchWithRetry(url, options, { attempts: 2, timeoutMs: milliseconds })
}

async function fetchCsvSeries(definition) {
  const response = await fetchWithTimeout(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${definition.id}&cosd=2019-01-01`,
    { next: { revalidate: 3600 } },
  )
  if (!response.ok) {
    throw new Error(`FRED CSV returned HTTP ${response.status} for ${definition.id}`)
  }
  const rows = (await response.text()).trim().split(/\r?\n/).slice(1)
  return preserveOfficialGap(rows.map(row => {
    const [date, rawValue] = row.split(',')
    const value = Number(rawValue)
    return { date, value: rawValue === '.' || !Number.isFinite(value) ? null : value }
  }))
}

async function fetchApiSeries(apiKey, definition) {
  const params = new URLSearchParams({
    series_id: definition.id,
    api_key: apiKey,
    file_type: 'json',
    observation_start: '2019-01-01',
    sort_order: 'asc',
  })

  const response = await fetchWithTimeout(
    `https://api.stlouisfed.org/fred/series/observations?${params}`,
    { next: { revalidate: 3600 } },
  )

  if (!response.ok) {
    throw new Error(`FRED returned HTTP ${response.status} for ${definition.id}`)
  }

  const payload = await response.json()
  if (payload.error_message) {
    throw new Error(`${definition.id}: ${payload.error_message}`)
  }

  return preserveOfficialGap((payload.observations || []).map(observation => {
    const value = Number(observation.value)
    return {
      date: observation.date,
      value: observation.value === '.' || !Number.isFinite(value) ? null : value,
    }
  }))
}

async function fetchSeries(apiKey, definition) {
  if (apiKey) {
    try {
      return {
        ...definition,
        delivery: 'FRED API',
        observations: await fetchApiSeries(apiKey, definition),
      }
    } catch (apiError) {
      const observations = await fetchCsvSeries(definition)
      return {
        ...definition,
        delivery: 'FRED CSV fallback',
        warning: apiError.name === 'FetchTimeoutError' ? 'FRED API timed out' : apiError.message,
        observations,
      }
    }
  }

  return {
    ...definition,
    delivery: 'FRED CSV',
    observations: await fetchCsvSeries(definition),
  }
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY

  try {
    const definitions = Object.entries(SERIES)
    const settled = await Promise.allSettled(
      definitions.map(async ([key, definition]) => [key, await fetchSeries(apiKey, definition)]),
    )
    const incompleteSeries = []
    const warnings = []
    const entries = settled.map((result, index) => {
      const [key, definition] = definitions[index]
      if (result.status === 'fulfilled') {
        const [, series] = result.value
        if (series.warning) warnings.push(`${definition.id}: ${series.warning}`)
        if (!series.observations.some(observation => Number.isFinite(observation.value))) {
          incompleteSeries.push(key)
          warnings.push(`${definition.id}: no usable observations returned`)
        }
        return result.value
      }

      incompleteSeries.push(key)
      warnings.push(`${definition.id}: ${result.reason?.message || 'Official feed unavailable'}`)
      return [key, {
        ...definition,
        delivery: 'Unavailable',
        observations: [],
      }]
    })
    const series = Object.fromEntries(entries)

    for (const required of ['headline', 'core']) {
      if (!series[required]?.observations?.some(observation => Number.isFinite(observation.value))) {
        throw new Error(`Required ${required} CPI series is unavailable`)
      }
    }

    return Response.json({
      source: 'Federal Reserve Bank of St. Louis (FRED); underlying CPI data from BLS',
      frequency: 'Monthly',
      seasonalAdjustment: 'Seasonally Adjusted',
      fetchedAt: new Date().toISOString(),
      missingPeriods: [{
        date: '2025-10-01',
        label: 'Data unavailable due to the 2025 lapse in appropriations',
        sourceUrl: 'https://www.bls.gov/cpi/additional-resources/2025-federal-government-shutdown-impact-cpi-faq.htm',
      }],
      // December 2025 CPI-U relative importance. Used only for an approximate
      // decomposition; the displayed headline remains the official FRED series.
      contributionWeights: {
        food: 0.13698,
        energy: 0.06383,
        coreGoods: 0.19176,
        rentOfShelter: 0.35333,
        medicalServices: 0.06935,
        transportation: 0.06315,
        otherCoreServices: 0.12161,
      },
      aggregateWeights: {
        coreServices: 0.60744,
      },
      weightAsOf: 'December 2025',
      weightSourceUrl: 'https://www.bls.gov/cpi/tables/relative-importance/2025.htm',
      sourceStatus: {
        complete: incompleteSeries.length === 0,
        incompleteSeries,
        warnings,
        deliveryModes: [...new Set(entries.map(([, item]) => item.delivery))],
      },
      series,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('[US CPI]', error)
    return Response.json(
      { error: 'Unable to load CPI data from FRED.' },
      { status: 502 },
    )
  }
}
