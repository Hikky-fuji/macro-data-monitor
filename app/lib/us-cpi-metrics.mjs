import { addMonths, observationMap, weightedResidual } from './us-cpi-scenarios.mjs'

const finite = value => Number.isFinite(value)

function change(current, base, power = 1) {
  return finite(current) && finite(base) && base !== 0
    ? ((current / base) ** power - 1) * 100
    : null
}

function latestIndex(observations = []) {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (finite(observations[index]?.value)) return observations[index]
  }
  return null
}

// Momentum uses the seasonally adjusted index. Year-over-year follows the BLS
// convention of comparing unadjusted (NSA) indices; it falls back to the SA
// index only when the NSA series is missing, and says so via yoyBasis.
export function cpiMetrics(series) {
  const latest = latestIndex(series?.observations)
  if (!latest) return {}

  const sa = observationMap(series.observations)
  const nsa = observationMap(series.nsa?.observations)
  const at = months => sa.get(addMonths(latest.date, months))
  const previousDate = addMonths(latest.date, -1)

  const nsaYoy = date => change(nsa.get(date), nsa.get(addMonths(date, -12)))
  const saYoy = date => change(sa.get(date), sa.get(addMonths(date, -12)))
  const useNsa = finite(nsaYoy(latest.date))
  const yoyAt = useNsa ? nsaYoy : saYoy
  const yoy = yoyAt(latest.date)
  const previousYoy = yoyAt(previousDate)

  return {
    date: latest.date,
    mom: change(latest.value, at(-1)),
    annualized3m: change(latest.value, at(-3), 4),
    annualized6m: change(latest.value, at(-6), 2),
    yoy,
    yoyBasis: finite(yoy) ? (useNsa ? 'NSA' : 'SA') : null,
    yoyChange: finite(yoy) && finite(previousYoy) ? yoy - previousYoy : null,
  }
}

// Year-over-year path for charts, NSA where available (same rule as cpiMetrics).
export function yoyPath(series, dates = []) {
  const source = series?.nsa?.observations?.some(point => finite(point.value)) ? series.nsa : series
  const values = observationMap(source?.observations)
  return dates.map(date => change(values.get(date), values.get(addMonths(date, -12))))
}

// Rates from an index published by another agency (Cleveland Fed median and
// trimmed-mean CPI indices are already seasonally adjusted).
export function indexRates(observations = []) {
  const latest = latestIndex(observations)
  if (!latest) return {}
  const values = observationMap(observations)
  const at = months => values.get(addMonths(latest.date, months))
  return {
    date: latest.date,
    annualized1m: change(latest.value, at(-1), 12),
    annualized3m: change(latest.value, at(-3), 4),
    annualized6m: change(latest.value, at(-6), 2),
    yoy: change(latest.value, at(-12)),
  }
}

// Street "supercore": core services less rent of shelter, derived as a
// relative-importance-weighted residual. Approximate because fixed December
// weights drift during the year.
export function supercoreMetrics(series = {}, weights = {}, aggregateWeights = {}) {
  const core = cpiMetrics(series.coreServices)
  const shelter = cpiMetrics(series.rentOfShelter)
  if (!core.date || core.date !== shelter.date) return {}
  const residual = metric => weightedResidual(
    core[metric],
    aggregateWeights.coreServices,
    [{ rate: shelter[metric], weight: weights.rentOfShelter }],
  )?.rate ?? null
  const yoy = residual('yoy')
  return {
    date: core.date,
    mom: residual('mom'),
    annualized3m: residual('annualized3m'),
    annualized6m: residual('annualized6m'),
    yoy,
    yoyBasis: finite(yoy) && core.yoyBasis === shelter.yoyBasis ? core.yoyBasis : null,
    yoyChange: residual('yoyChange'),
    weight: finite(aggregateWeights.coreServices) && finite(weights.rentOfShelter)
      ? aggregateWeights.coreServices - weights.rentOfShelter
      : null,
  }
}

export function supercoreYoyPath(series = {}, weights = {}, aggregateWeights = {}, dates = []) {
  const core = yoyPath(series.coreServices, dates)
  const shelter = yoyPath(series.rentOfShelter, dates)
  return dates.map((date, index) => weightedResidual(
    core[index],
    aggregateWeights.coreServices,
    [{ rate: shelter[index], weight: weights.rentOfShelter }],
  )?.rate ?? null)
}
