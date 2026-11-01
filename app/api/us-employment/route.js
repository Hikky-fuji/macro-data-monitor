export const revalidate = 3600
export const dynamic = 'force-dynamic'

import { fetchFredSeries, parseFredCsv } from '../../lib/fred.js'
import { fetchWithRetry } from '../../lib/resilient-fetch.js'
import { SECTORS, pickPriorVintage } from '../../lib/us-employment-metrics.mjs'

const EMPLOYMENT = {
  payems: 'PAYEMS',
  private: 'USPRIV',
  healthSocial: 'CES6562000001',  // Health care & social assistance
  tempHelp: 'TEMPHELPS',
  unrate: 'UNRATE',
  u6rate: 'U6RATE',
  civpart: 'CIVPART',
  prime_part: 'LNS11300060',
  primeEpop: 'LNS12300060',
  ahe: 'CES0500000003',
  aheProd: 'AHETPI',               // Production & nonsupervisory employees
  avgWeeklyHours: 'AWHAETP',
  aggregateHours: 'AWHI',          // Index of aggregate weekly hours, 2002=100
  sahm: 'SAHMREALTIME',
  medianDuration: 'UEMPMED',
  permanentLosers: 'LNS13026638',
  longTermShare: 'LNS13025703',    // Unemployed 27+ weeks, % of unemployed
}

const WAGES = {
  eci: { id: 'ECIWAG', limit: 24 },                 // ECI wages & salaries, private industry (quarterly index)
  atlanta: { id: 'FRBATLWGT3MMAUMHWGO', limit: 120 }, // Atlanta Fed Wage Growth Tracker, 3M moving average
}

const REQUIRED = ['payems', 'unrate', 'ahe']

async function mapLimited(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function isoDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

// Payrolls as published in earlier releases (ALFRED vintages), used only to
// measure revisions. Weekly probes cover any gap between monthly releases.
async function fetchPayrollVintages() {
  const cosd = isoDaysAgo(240)
  return Promise.all([7, 14, 21, 28, 35, 42, 49, 56].map(async days => {
    const vintageDate = isoDaysAgo(days)
    try {
      const params = new URLSearchParams({ id: 'PAYEMS', cosd, vintage_date: vintageDate })
      const response = await fetchWithRetry(
        `https://alfred.stlouisfed.org/graph/alfredgraph.csv?${params}`,
        { next: { revalidate } },
        { attempts: 2, timeoutMs: 10000 },
      )
      if (!response.ok) return { vintageDate, observations: [] }
      return { vintageDate, observations: parseFredCsv(await response.text()) }
    } catch {
      return { vintageDate, observations: [] }
    }
  }))
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY
  const fallbackSeries = []
  const warnings = []

  const fetchFred = async (key, id, limit = 120, options = {}) => {
    try {
      return await fetchFredSeries(id, {
        apiKey,
        limit,
        startDate: options.startDate,
        revalidate,
        onFallback: seriesId => fallbackSeries.push(seriesId),
      })
    } catch (e) {
      console.warn(`[US-Emp] Failed ${id}:`, e.message)
      warnings.push(`${key} (${id}) unavailable`)
      return []
    }
  }

  const jobs = [
    ...Object.entries(EMPLOYMENT).map(([key, id]) => ({ group: 'employment', key, id })),
    { group: 'sectors', key: 'goods', id: 'USGOOD' },
    ...SECTORS.map(sector => ({ group: 'sectors', key: sector.key, id: sector.id })),
    { group: 'sectorAhe', key: 'goods', id: 'CES0600000003' },
    ...SECTORS.filter(sector => sector.aheId).map(sector => ({ group: 'sectorAhe', key: sector.key, id: sector.aheId })),
    ...Object.entries(WAGES).map(([key, { id, limit }]) => ({ group: 'wages', key, id, limit })),
    // FOMC Summary of Economic Projections
    { group: 'sep', key: 'yearEnd', id: 'UNRATEMD', limit: 10, startDate: '2010-01-01' },
    { group: 'sep', key: 'longRun', id: 'UNRATEMDLR', limit: 8, startDate: '2010-01-01' },
  ]

  const [values, vintages] = await Promise.all([
    mapLimited(jobs, 12, job => fetchFred(job.key, job.id, job.limit, job)),
    fetchPayrollVintages(),
  ])

  const payload = { employment: {}, sectors: {}, sectorAhe: {}, wages: {}, sep: {} }
  jobs.forEach((job, index) => {
    payload[job.group][job.key] = values[index]
    if (!values[index].length && !warnings.some(item => item.startsWith(`${job.key} (`))) {
      warnings.push(`${job.key} (${job.id}) returned no observations`)
    }
  })
  payload.sectorAhe.overall = payload.employment.ahe

  const missingCore = REQUIRED.filter(key => !payload.employment[key]?.length)
  if (missingCore.length) {
    return Response.json(
      { error: 'Core Employment Situation series are unavailable.', detail: missingCore.join(', ') },
      { status: 502 },
    )
  }

  const latestDate = payload.employment.payems.at(-1)?.date
  const prior = pickPriorVintage(vintages, latestDate)
  if (!prior) warnings.push('Previous payroll vintage unavailable; revisions not shown')

  return Response.json({
    ...payload,
    revisions: prior ? { vintageDate: prior.vintageDate, payems: prior.observations } : null,
    fetchedAt: new Date().toISOString(),
    meta: {
      delivery: fallbackSeries.length ? 'FRED API with official CSV fallback' : 'FRED API',
      fallbackSeries: [...new Set(fallbackSeries)],
      partial: warnings.length > 0,
      warnings,
    },
  })
}
