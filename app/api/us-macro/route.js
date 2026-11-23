export const revalidate = 3600
export const dynamic = 'force-dynamic'

import { fetchFredSeries } from '../../lib/fred.js'

const FOMC_MEETINGS = [
  { start: '2026-09-15', end: '2026-09-16', sep: true },
  { start: '2026-10-27', end: '2026-10-28', sep: false },
  { start: '2026-12-08', end: '2026-12-09', sep: true },
  { start: '2027-01-26', end: '2027-01-27', sep: false },
  { start: '2027-03-16', end: '2027-03-17', sep: true },
  { start: '2027-04-27', end: '2027-04-28', sep: false },
  { start: '2027-06-08', end: '2027-06-09', sep: true },
  { start: '2027-07-27', end: '2027-07-28', sep: false },
  { start: '2027-09-14', end: '2027-09-15', sep: true },
  { start: '2027-10-26', end: '2027-10-27', sep: false },
  { start: '2027-12-07', end: '2027-12-08', sep: true },
]

const quarterKey = date => {
  const [year, month] = date.split('-').map(Number)
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
}

const averageByQuarter = series => {
  const buckets = new Map()
  series.forEach(point => {
    const key = quarterKey(point.date)
    const bucket = buckets.get(key) || []
    bucket.push(point.value)
    buckets.set(key, bucket)
  })
  return [...buckets.entries()].map(([date, values]) => ({
    date,
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
  }))
}

const fourQuarterInflation = monthlyIndex => {
  const quarterlyIndex = averageByQuarter(monthlyIndex)
  return quarterlyIndex.slice(4).map((point, index) => ({
    date: point.date,
    value: (point.value / quarterlyIndex[index].value - 1) * 100,
  }))
}

const seriesMap = series => new Map(series.map(point => [point.date, point.value]))

// Hodrick-Prescott trend used for the Bullard-style safe real-rate proxy.
// Quarterly lambda follows the conventional 1,600 setting.
const hpTrend = (values, lambda = 1600) => {
  const n = values.length
  if (n < 4) return [...values]

  const matrix = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, column) => row === column ? 1 : 0)
  )

  for (let row = 0; row < n - 2; row++) {
    const coefficients = [1, -2, 1]
    for (let left = 0; left < 3; left++) {
      for (let right = 0; right < 3; right++) {
        matrix[row + left][row + right] += lambda * coefficients[left] * coefficients[right]
      }
    }
  }

  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < n; column++) {
    let pivot = column
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]

    const divisor = augmented[column][column]
    if (Math.abs(divisor) < 1e-12) return [...values]
    for (let item = column; item <= n; item++) augmented[column][item] /= divisor

    for (let row = 0; row < n; row++) {
      if (row === column) continue
      const factor = augmented[row][column]
      if (factor === 0) continue
      for (let item = column; item <= n; item++) {
        augmented[row][item] -= factor * augmented[column][item]
      }
    }
  }

  return augmented.map(row => row[n])
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY
  const fallbackSeries = []

  const fetchSeries = async (seriesId, limit = 36, options = {}) => {
    try {
      return await fetchFredSeries(seriesId, {
        apiKey,
        limit,
        frequency: options.frequency,
        aggregation: options.aggregation,
        startDate: options.startDate,
        revalidate,
        onFallback: id => fallbackSeries.push(id),
      })
    } catch (e) {
      console.warn(`[US Macro] Failed to fetch ${seriesId}:`, e.message)
      return []
    }
  }

  const [
    payems, unrate, u6rate, civpart, prime_part, ahe,
    goods, construction, trade, info, fire, pbs, ehs, lah, govt,
    ahe_goods, ahe_privsvr, ahe_constr, ahe_retail, ahe_info, ahe_fin, ahe_pro, ahe_edh, ahe_lei,
    cpi, coreCpi, gdp, realGdpGrowth, retail, fedfunds,
    corePce, realGdp, potentialGdp, naturalUnemployment,
    fiveYearBreakeven, oneYearTreasury, trimmedMeanPce,
  ] = await Promise.all([
    fetchSeries('PAYEMS'),
    fetchSeries('UNRATE'),
    fetchSeries('U6RATE'),
    fetchSeries('CIVPART'),
    fetchSeries('LNS11300060'),
    fetchSeries('CES0500000003'),
    fetchSeries('USGOOD'),
    fetchSeries('USCONS'),
    fetchSeries('USTRADE'),
    fetchSeries('USINFO'),
    fetchSeries('USFIRE'),
    fetchSeries('USPBS'),
    fetchSeries('USEHS'),
    fetchSeries('USLAH'),
    fetchSeries('USGOVT'),
    fetchSeries('CES0600000003'),
    fetchSeries('CES0800000003'),
    fetchSeries('CES2000000003'),
    fetchSeries('CES4200000003'),
    fetchSeries('CES5000000003'),
    fetchSeries('CES5500000003'),
    fetchSeries('CES6000000003'),
    fetchSeries('CES6500000003'),
    fetchSeries('CES7000000003'),
    fetchSeries('CPIAUCSL'),
    fetchSeries('CPILFESL'),
    fetchSeries('GDP', 8),
    fetchSeries('A191RL1Q225SBEA', 8),
    fetchSeries('RSAFS'),
    fetchSeries('FEDFUNDS', 240),
    fetchSeries('PCEPILFE', 240),
    fetchSeries('GDPC1', 100, { startDate: '1995-01-01' }),
    fetchSeries('GDPPOT', 100, { startDate: '1995-01-01' }),
    fetchSeries('NROU', 100, { startDate: '1995-01-01' }),
    // Official monthly average; averaging the daily series rounds differently by delivery path.
    fetchSeries('T5YIEM', 240),
    fetchSeries('GS1', 600),
    fetchSeries('PCETRIM12M159SFRBDAL', 600),
  ])

  const corePceInflation = fourQuarterInflation(corePce)
  const quarterlyFedFunds = averageByQuarter(fedfunds)
  const quarterlyUnemployment = averageByQuarter(unrate)
  const quarterlyBreakeven = averageByQuarter(fiveYearBreakeven)
  const quarterlyTreasury = averageByQuarter(oneYearTreasury)
  const quarterlyTrimmedPce = averageByQuarter(trimmedMeanPce)

  const corePceMap = seriesMap(corePceInflation)
  const fedFundsMap = seriesMap(quarterlyFedFunds)
  const unemploymentMap = seriesMap(quarterlyUnemployment)
  const breakevenMap = seriesMap(quarterlyBreakeven)
  const realGdpMap = seriesMap(realGdp.map(point => ({ ...point, date: quarterKey(point.date) })))
  const potentialGdpMap = seriesMap(potentialGdp.map(point => ({ ...point, date: quarterKey(point.date) })))
  const naturalUnemploymentMap = seriesMap(
    naturalUnemployment.map(point => ({ ...point, date: quarterKey(point.date) }))
  )
  const treasuryMap = seriesMap(quarterlyTreasury)
  const trimmedPceMap = seriesMap(quarterlyTrimmedPce)

  const safeRealRateHistory = quarterlyTreasury
    .filter(point => trimmedPceMap.has(point.date))
    .map(point => ({
      date: point.date,
      value: point.value - trimmedPceMap.get(point.date),
    }))
  const safeRealRateTrend = hpTrend(safeRealRateHistory.map(point => point.value))
  const bullardRStarMap = new Map(
    safeRealRateHistory.map((point, index) => [point.date, safeRealRateTrend[index]])
  )

  const ruleHistory = corePceInflation.map((point, index) => {
    const date = point.date
    const inflation = corePceMap.get(date)
    const actual = fedFundsMap.get(date)
    const previousActual = index > 0 ? fedFundsMap.get(corePceInflation[index - 1].date) : null
    const actualGdp = realGdpMap.get(date)
    const potential = potentialGdpMap.get(date)
    const outputGap = actualGdp != null && potential != null
      ? (actualGdp / potential - 1) * 100
      : null
    const unemployment = unemploymentMap.get(date)
    const naturalRate = naturalUnemploymentMap.get(date)
    const unemploymentGap = unemployment != null && naturalRate != null
      ? unemployment - naturalRate
      : null
    const breakeven = breakevenMap.get(date)
    const expectedPceInflation = breakeven != null ? breakeven - 0.3 : null
    const bullardRStar = bullardRStarMap.get(date)

    const taylor93 = outputGap != null
      ? 2 + inflation + 0.5 * (inflation - 2) + 0.5 * outputGap
      : null
    const balanced = outputGap != null
      ? 2 + inflation + 0.5 * (inflation - 2) + outputGap
      : null

    // Clarida–Galí–Gertler-style proxy:
    // forward-looking inflation, estimated reaction coefficients and partial adjustment.
    const claridaTarget = expectedPceInflation != null && outputGap != null
      ? 4.12 + 2.15 * (expectedPceInflation - 2) + 0.93 * outputGap
      : null
    const clarida = previousActual != null && claridaTarget != null
      ? 0.79 * previousActual + 0.21 * claridaTarget
      : null

    // Bullard (2018) modernized Taylor (1999) proxy:
    // market inflation expectations, HP-trend safe real rate, attenuated slack response
    // and substantial interest-rate smoothing.
    const bullardTarget = expectedPceInflation != null &&
      outputGap != null &&
      bullardRStar != null
      ? bullardRStar + 2 + 1.5 * (expectedPceInflation - 2) + 0.1 * outputGap
      : null
    const bullard = previousActual != null && bullardTarget != null
      ? 0.85 * previousActual + 0.15 * bullardTarget
      : null

    return {
      date,
      actual,
      taylor93,
      balanced,
      clarida,
      bullard,
      inputs: {
        corePceInflation: inflation,
        outputGap,
        unemployment,
        naturalUnemployment: naturalRate,
        unemploymentGap,
        fiveYearBreakeven: breakeven,
        expectedPceInflation,
        bullardRStar,
      },
    }
  }).filter(point =>
    point.actual != null &&
    point.taylor93 != null &&
    point.balanced != null
  ).slice(-36)

  const today = new Date().toISOString().slice(0, 10)
  const nextFomc = FOMC_MEETINGS.find(meeting => meeting.end >= today) || null

  return Response.json({
    meta: {
      delivery: fallbackSeries.length ? 'FRED API with official CSV fallback' : 'FRED API',
      fallbackSeries: [...new Set(fallbackSeries)],
    },
    employment: { nfp: payems, unrate, u6rate, civpart, prime_part, ahe },
    sectors: { goods, construction, trade, info, fire, pbs, ehs, lah, govt },
    wages: {
      bySector: {
        goods_prod:   ahe_goods,
        private_srv:  ahe_privsvr,
        construction: ahe_constr,
        retail:       ahe_retail,
        info:         ahe_info,
        finance:      ahe_fin,
        professional: ahe_pro,
        edu_health:   ahe_edh,
        leisure:      ahe_lei,
      },
    },
    inflation: { cpi, coreCpi },
    growth:    { gdp, realGdpGrowth, retail },
    policy: {
      fedfunds,
      nextFomc,
      rules: {
        history: ruleHistory,
        latest: ruleHistory[ruleHistory.length - 1] || null,
        targetInflation: 2,
      },
    },
  })
}
