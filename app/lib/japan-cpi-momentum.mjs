const finite = value => Number.isFinite(value)

export function movingAverage(series, window = 3) {
  return (series || []).map((point, index, observations) => {
    if (index < window - 1) return { date: point.date, value: null }
    const sample = observations.slice(index - window + 1, index + 1).map(item => item.value)
    if (!sample.every(finite)) return { date: point.date, value: null }
    return {
      date: point.date,
      value: sample.reduce((sum, value) => sum + value, 0) / window,
    }
  })
}

export function yoyMomentum(series, monthlySeries) {
  const observations = series || []
  const latest = observations.at(-1)
  const previous = observations.at(-2)
  const averages = movingAverage(observations, 3)
  const latestAverage = averages.at(-1)?.value
  const previousAverage = averages.at(-2)?.value
  const latestMonthly = (monthlySeries || []).find(point => point.date === latest?.date)

  return {
    date: latest?.date,
    yoy: finite(latest?.value) ? latest.value : null,
    yoyChange: finite(latest?.value) && finite(previous?.value)
      ? latest.value - previous.value
      : null,
    mma3: finite(latestAverage) ? latestAverage : null,
    mma3Change: finite(latestAverage) && finite(previousAverage)
      ? latestAverage - previousAverage
      : null,
    monthlyNsa: finite(latestMonthly?.value) ? latestMonthly.value : null,
  }
}

export function momentumSignal(change, threshold = 0.05) {
  if (!finite(change)) return 'Unavailable'
  if (change > threshold) return 'Accelerating'
  if (change < -threshold) return 'Cooling'
  return 'Stable'
}

function shiftMonth(date, months) {
  const [year, month] = date.split('/').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1))
  return `${shifted.getUTCFullYear()}/${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

// Momentum from MIC's official seasonally adjusted aggregates (published only
// for headline, core, core-core, goods and services). M/M is the official
// rate; 3M/6M annualized are derived from the SA index, which MIC rounds to
// 0.1, so they carry roughly ±0.4pp of rounding noise.
export function saMomentum(indexSeries, monthlySeries) {
  const index = new Map((indexSeries || []).filter(point => finite(point.value)).map(point => [point.date, point.value]))
  const latest = [...index.keys()].sort().at(-1)
  if (!latest) return {}
  const annualized = (months, power) => {
    const base = index.get(shiftMonth(latest, -months))
    return finite(base) && base !== 0 ? ((index.get(latest) / base) ** power - 1) * 100 : null
  }
  const official = (monthlySeries || []).find(point => point.date === latest)
  return {
    date: latest,
    mom: finite(official?.value) ? official.value : null,
    annualized3m: annualized(3, 4),
    annualized6m: annualized(6, 2),
  }
}
