import { fetchFredSeries } from '../../lib/fred.js'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const OBSERVATION_START = '2021-01-01'

const SERIES = {
  fedFunds: { id: 'DFF', label: 'Effective Federal Funds Rate', unit: 'percent', cadence: 'Daily' },
  treasury1m: { id: 'DGS1MO', label: '1-Month Treasury', unit: 'percent', cadence: 'Daily' },
  treasury3m: { id: 'DGS3MO', label: '3-Month Treasury', unit: 'percent', cadence: 'Daily' },
  treasury6m: { id: 'DGS6MO', label: '6-Month Treasury', unit: 'percent', cadence: 'Daily' },
  treasury1y: { id: 'DGS1', label: '1-Year Treasury', unit: 'percent', cadence: 'Daily' },
  treasury2y: { id: 'DGS2', label: '2-Year Treasury', unit: 'percent', cadence: 'Daily' },
  treasury5y: { id: 'DGS5', label: '5-Year Treasury', unit: 'percent', cadence: 'Daily' },
  treasury10y: { id: 'DGS10', label: '10-Year Treasury', unit: 'percent', cadence: 'Daily' },
  treasury30y: { id: 'DGS30', label: '30-Year Treasury', unit: 'percent', cadence: 'Daily' },
  real5y: { id: 'DFII5', label: '5-Year Real Treasury Yield', unit: 'percent', cadence: 'Daily' },
  real10y: { id: 'DFII10', label: '10-Year Real Treasury Yield', unit: 'percent', cadence: 'Daily' },
  breakeven5y: { id: 'T5YIE', label: '5-Year Breakeven Inflation', unit: 'percent', cadence: 'Daily' },
  breakeven10y: { id: 'T10YIE', label: '10-Year Breakeven Inflation', unit: 'percent', cadence: 'Daily' },
  spread2s10s: { id: 'T10Y2Y', label: '10-Year Minus 2-Year Treasury', unit: 'percent', cadence: 'Daily' },
  spread3m10y: { id: 'T10Y3M', label: '10-Year Minus 3-Month Treasury', unit: 'percent', cadence: 'Daily' },
  nfci: { id: 'NFCI', label: 'Chicago Fed National Financial Conditions Index', unit: 'index', cadence: 'Weekly' },
}

const CURVE = [
  ['1M', 'treasury1m'],
  ['3M', 'treasury3m'],
  ['6M', 'treasury6m'],
  ['1Y', 'treasury1y'],
  ['2Y', 'treasury2y'],
  ['5Y', 'treasury5y'],
  ['10Y', 'treasury10y'],
  ['30Y', 'treasury30y'],
]

// The response fails only when these are unavailable; other series degrade to
// meta.partial so one missing curve point cannot take down the whole dashboard.
const CORE_SERIES = ['fedFunds', 'treasury2y', 'treasury10y']
// Daily series since 2021 exceed 1,400 observations.
const OBSERVATION_LIMIT = 3000
const FETCH_CONCURRENCY = 4

async function fetchSeries(apiKey, definition, onFallback) {
  const observations = await fetchFredSeries(definition.id, {
    apiKey,
    limit: OBSERVATION_LIMIT,
    startDate: OBSERVATION_START,
    revalidate,
    onFallback,
  })
  return { ...definition, observations }
}

async function settleInBatches(entries, worker) {
  const results = []
  for (let index = 0; index < entries.length; index += FETCH_CONCURRENCY) {
    results.push(...await Promise.allSettled(entries.slice(index, index + FETCH_CONCURRENCY).map(worker)))
  }
  return results
}

function cleanObservations(series) {
  return (series?.observations || []).filter(point => Number.isFinite(point.value))
}

function latest(series) {
  return cleanObservations(series).at(-1) || null
}

function pointOnOrBefore(series, date) {
  const observations = cleanObservations(series)
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (observations[index].date <= date) return observations[index]
  }
  return null
}

function shiftMonths(date, months) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + months)
  return value.toISOString().slice(0, 10)
}

function curveAt(series, date) {
  return CURVE.map(([maturity, key]) => ({
    maturity,
    value: pointOnOrBefore(series[key], date)?.value ?? null,
  }))
}

function change(series, date, days) {
  const current = pointOnOrBefore(series, date)
  const target = new Date(`${date}T12:00:00Z`)
  target.setUTCDate(target.getUTCDate() - days)
  const prior = pointOnOrBefore(series, target.toISOString().slice(0, 10))
  return current && prior ? (current.value - prior.value) * 100 : null
}

export async function GET() {
  try {
    const apiKey = process.env.FRED_API_KEY
    const csvFallbacks = []
    const definitions = Object.entries(SERIES)
    const settled = await settleInBatches(definitions, ([, definition]) => (
      fetchSeries(apiKey, definition, id => csvFallbacks.push(id))
    ))
    const series = {}
    const missing = []
    settled.forEach((result, index) => {
      const [key, definition] = definitions[index]
      if (result.status === 'fulfilled' && result.value.observations.length) {
        series[key] = result.value
      } else {
        missing.push({ key, id: definition.id, reason: result.reason?.message || 'No observations returned' })
      }
    })
    const missingCore = missing.filter(item => CORE_SERIES.includes(item.key))
    if (missingCore.length) {
      throw new Error(`Core rate series unavailable: ${missingCore.map(item => `${item.id} (${item.reason})`).join('; ')}`)
    }
    const warnings = missing.map(item => `${item.id} unavailable: ${item.reason}`)
    const curveDates = CURVE
      .map(([, key]) => latest(series[key])?.date)
      .filter(Boolean)
      .sort()
    const curveDate = curveDates[0] || null
    const previousCurveDate = curveDate ? shiftMonths(curveDate, -3) : null
    const tenYear = latest(series.treasury10y)
    const twoYear = latest(series.treasury2y)
    const fedFunds = latest(series.fedFunds)
    const real10y = latest(series.real10y)
    const breakeven5y = latest(series.breakeven5y)
    const breakeven10y = latest(series.breakeven10y)
    const spread2s10s = latest(series.spread2s10s)
    const spread3m10y = latest(series.spread3m10y)
    const nfci = latest(series.nfci)
    const nfciPrior = nfci ? pointOnOrBefore(series.nfci, shiftMonths(nfci.date, -1)) : null

    return Response.json({
      source: 'Federal Reserve Board, Chicago Fed and U.S. Treasury data via FRED',
      fetchedAt: new Date().toISOString(),
      automatic: true,
      series,
      curve: {
        date: curveDate,
        current: curveDate ? curveAt(series, curveDate) : [],
        priorDate: previousCurveDate,
        prior: previousCurveDate ? curveAt(series, previousCurveDate) : [],
      },
      latest: {
        date: curveDate,
        fedFunds,
        twoYear,
        tenYear,
        real10y,
        breakeven5y,
        breakeven10y,
        spread2s10s,
        spread3m10y,
        nfci,
        nfciFourWeekChange: nfci && nfciPrior ? nfci.value - nfciPrior.value : null,
        changes: {
          twoYear: curveDate ? { oneDayBp: change(series.treasury2y, curveDate, 1), oneWeekBp: change(series.treasury2y, curveDate, 7), oneMonthBp: change(series.treasury2y, curveDate, 30) } : null,
          tenYear: curveDate ? { oneDayBp: change(series.treasury10y, curveDate, 1), oneWeekBp: change(series.treasury10y, curveDate, 7), oneMonthBp: change(series.treasury10y, curveDate, 30) } : null,
        },
        policyGapToTwoYear: fedFunds && twoYear ? (twoYear.value - fedFunds.value) * 100 : null,
      },
      meta: {
        partial: warnings.length > 0,
        warnings,
        csvFallbacks,
        coreSeries: CORE_SERIES.map(key => SERIES[key].id),
      },
      methodology: {
        curve: 'The latest curve uses the most recent date available across every displayed Treasury maturity; the comparison curve uses the closest observation on or before three months earlier.',
        breakeven: 'Treasury breakevens are market-implied inflation compensation, not pure inflation forecasts; risk and liquidity premia also matter.',
        nfci: 'Positive NFCI values indicate tighter-than-average financial conditions; negative values indicate looser-than-average conditions.',
      },
    })
  } catch (error) {
    console.error('[US Rates & Financial Conditions]', error)
    return Response.json(
      { error: 'Unable to load US rates and financial-conditions data from FRED.' },
      { status: 502 },
    )
  }
}
