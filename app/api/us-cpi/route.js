import { fetchWithRetry } from '../../lib/resilient-fetch.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

// `id` is the seasonally adjusted index (momentum); `nsaId` is the unadjusted
// index BLS uses for published 12-month changes.
const SERIES = {
  headline: { id: 'CPIAUCSL', nsaId: 'CPIAUCNS', label: 'Headline CPI' },
  core: { id: 'CPILFESL', nsaId: 'CPILFENS', label: 'Core CPI' },
  servicesExShelter: { id: 'CUSR0000SASL2RS', nsaId: 'CUUR0000SASL2RS', label: 'Services ex Shelter' },
  food: { id: 'CPIUFDSL', nsaId: 'CPIUFDNS', label: 'Food' },
  energy: { id: 'CPIENGSL', nsaId: 'CPIENGNS', label: 'Energy' },
  coreGoods: { id: 'CUSR0000SACL1E', nsaId: 'CUUR0000SACL1E', label: 'Core Goods' },
  coreServices: { id: 'CUSR0000SASLE', nsaId: 'CUUR0000SASLE', label: 'Core Services' },
  rentOfShelter: { id: 'CUSR0000SAS2RS', nsaId: 'CUUR0000SAS2RS', label: 'Rent of Shelter' },
  medicalServices: { id: 'CUSR0000SAM2', nsaId: 'CUUR0000SAM2', label: 'Medical Care Services' },
  vehicles: { id: 'CUSR0000SETA', nsaId: 'CUUR0000SETA', label: 'New & Used Vehicles' },
  usedCars: { id: 'CUSR0000SETA02', nsaId: 'CUUR0000SETA02', label: 'Used Cars & Trucks' },
  furnishings: { id: 'CUSR0000SAH3', nsaId: 'CUUR0000SAH3', label: 'Household Furnishings & Operations' },
  apparel: { id: 'CPIAPPSL', nsaId: 'CPIAPPNS', label: 'Apparel' },
  rent: { id: 'CUSR0000SEHA', nsaId: 'CUUR0000SEHA', label: 'Rent of Primary Residence' },
  oer: { id: 'CUSR0000SEHC', nsaId: 'CUUR0000SEHC', label: "Owners' Equivalent Rent" },
  medical: { id: 'CPIMEDSL', nsaId: 'CPIMEDNS', label: 'Medical Care' },
  education: { id: 'CPIEDUSL', nsaId: 'CPIEDUNS', label: 'Education & Communication' },
  transportation: { id: 'CUSR0000SAS4', nsaId: 'CUUR0000SAS4', label: 'Transportation Services' },
  // Components whose CPI and PCE treatment or weight differ most.
  airfares: { id: 'CUSR0000SETG01', nsaId: 'CUUR0000SETG01', label: 'Airline Fares' },
  lodging: { id: 'CUSR0000SEHB', nsaId: 'CUUR0000SEHB', label: 'Lodging Away from Home' },
  hospital: { id: 'CUSR0000SEMD', nsaId: 'CUUR0000SEMD', label: 'Hospital & Related Services' },
  professionalMedical: { id: 'CUSR0000SEMC', nsaId: 'CUUR0000SEMC', label: 'Professional Medical Services' },
  vehicleRepair: { id: 'CUSR0000SETD', nsaId: 'CUUR0000SETD', label: 'Motor Vehicle Maintenance & Repair' },
  // Import-intensive goods (analyst grouping, not a BLS aggregate).
  newVehicles: { id: 'CUSR0000SETA01', nsaId: 'CUUR0000SETA01', label: 'New Vehicles' },
  vehicleParts: { id: 'CUSR0000SETC', nsaId: 'CUUR0000SETC', label: 'Motor Vehicle Parts & Equipment' },
  footwear: { id: 'CUSR0000SEAE', nsaId: 'CUUR0000SEAE', label: 'Footwear' },
  toys: { id: 'CUSR0000SERE01', nsaId: 'CUUR0000SERE01', label: 'Toys' },
  videoAudio: { id: 'CUSR0000SERA', nsaId: 'CUUR0000SERA', label: 'Video & Audio' },
}

// Underlying-inflation measures published by regional Reserve Banks (all SA).
const UNDERLYING = {
  median: { id: 'MEDCPIM094SFRBCLE', kind: 'index', label: 'Median CPI', publisher: 'Cleveland Fed', sourceUrl: 'https://www.clevelandfed.org/indicators-and-data/median-cpi' },
  trimmedMean: { id: 'TRMMEANCPIM094SFRBCLE', kind: 'index', label: '16% Trimmed-Mean CPI', publisher: 'Cleveland Fed', sourceUrl: 'https://www.clevelandfed.org/indicators-and-data/median-cpi' },
  stickyCoreYoy: { id: 'CORESTICKM159SFRBATL', kind: 'yoy', label: 'Sticky-Price Core CPI', publisher: 'Atlanta Fed', sourceUrl: 'https://www.atlantafed.org/research/inflationproject/stickyprice' },
  stickyCore3m: { id: 'CORESTICKM679SFRBATL', kind: 'annualized3m', label: 'Sticky-Price Core CPI', publisher: 'Atlanta Fed', sourceUrl: 'https://www.atlantafed.org/research/inflationproject/stickyprice' },
  flexibleYoy: { id: 'FLEXCPIM159SFRBATL', kind: 'yoy', label: 'Flexible-Price CPI', publisher: 'Atlanta Fed', sourceUrl: 'https://www.atlantafed.org/research/inflationproject/stickyprice' },
  flexible3m: { id: 'FLEXCPIM679SFRBATL', kind: 'annualized3m', label: 'Flexible-Price CPI', publisher: 'Atlanta Fed', sourceUrl: 'https://www.atlantafed.org/research/inflationproject/stickyprice' },
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

// About 60 FRED requests per refresh; cap concurrency so a cold cache does not
// burst the API or the CSV fallback.
async function mapLimited(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const usable = series => series?.observations?.some(observation => Number.isFinite(observation.value))

export async function GET() {
  const apiKey = process.env.FRED_API_KEY

  try {
    const jobs = [
      ...Object.entries(SERIES).map(([key, definition]) => ({ group: 'sa', key, definition: { id: definition.id, label: definition.label } })),
      ...Object.entries(SERIES).map(([key, definition]) => ({ group: 'nsa', key, definition: { id: definition.nsaId, label: `${definition.label} (NSA)` } })),
      ...Object.entries(UNDERLYING).map(([key, definition]) => ({ group: 'underlying', key, definition })),
    ]
    const settled = await mapLimited(jobs, 12, job => fetchSeries(apiKey, job.definition))
    const incompleteSeries = []
    const warnings = []
    const results = { sa: {}, nsa: {}, underlying: {} }
    settled.forEach((result, index) => {
      const { group, key, definition } = jobs[index]
      const label = group === 'sa' ? key : `${group}:${key}`
      if (result.status === 'fulfilled') {
        const series = result.value
        if (series.warning) warnings.push(`${definition.id}: ${series.warning}`)
        if (!usable(series)) {
          incompleteSeries.push(label)
          warnings.push(`${definition.id}: no usable observations returned`)
        }
        results[group][key] = series
        return
      }
      incompleteSeries.push(label)
      warnings.push(`${definition.id}: ${result.reason?.message || 'Official feed unavailable'}`)
      results[group][key] = { ...definition, delivery: 'Unavailable', observations: [] }
    })
    const series = Object.fromEntries(Object.entries(results.sa).map(([key, item]) => [key, {
      ...item,
      nsa: { id: results.nsa[key].id, delivery: results.nsa[key].delivery, observations: results.nsa[key].observations },
    }]))
    const entries = [...Object.values(results.sa), ...Object.values(results.nsa), ...Object.values(results.underlying)]

    for (const required of ['headline', 'core']) {
      if (!series[required]?.observations?.some(observation => Number.isFinite(observation.value))) {
        throw new Error(`Required ${required} CPI series is unavailable`)
      }
    }

    return Response.json({
      source: 'Federal Reserve Bank of St. Louis (FRED); underlying CPI data from BLS',
      frequency: 'Monthly',
      seasonalAdjustment: 'Momentum from seasonally adjusted indices; year-over-year from unadjusted (NSA) indices, as BLS publishes',
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
        deliveryModes: [...new Set(entries.map(item => item.delivery))],
      },
      series,
      underlying: results.underlying,
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
