import { addMonths, latestObservation, observationMap } from './us-cpi-scenarios.mjs'

const finite = value => Number.isFinite(value)

// BLS supersectors. The leaf sectors sum to total nonfarm payrolls (up to
// rounding of the published thousands), so stacked changes add to the headline.
// Each family has one color used by every table and chart on the page.
export const SECTOR_FAMILIES = [
  { key: 'goods', label: 'Goods-producing', color: '#3987e5' },
  { key: 'ttu', label: 'Trade, transportation & utilities', color: '#d95926' },
  { key: 'business', label: 'Information, financial & business services', color: '#199e70' },
  { key: 'eduHealth', label: 'Education & health', color: '#c98500' },
  { key: 'leisureOther', label: 'Leisure, hospitality & other services', color: '#d55181' },
  { key: 'govt', label: 'Government', color: '#9085e9' },
]

export const SECTORS = [
  { key: 'mining', label: 'Mining & logging', family: 'goods', id: 'USMINE', aheId: 'CES1000000003' },
  { key: 'construction', label: 'Construction', family: 'goods', id: 'USCONS', aheId: 'CES2000000003' },
  { key: 'manufacturing', label: 'Manufacturing', family: 'goods', id: 'MANEMP', aheId: 'CES3000000003' },
  { key: 'wholesale', label: 'Wholesale trade', family: 'ttu', id: 'USWTRADE', aheId: 'CES4142000003' },
  { key: 'retail', label: 'Retail trade', family: 'ttu', id: 'USTRADE', aheId: 'CES4200000003' },
  { key: 'transportation', label: 'Transportation & warehousing', family: 'ttu', id: 'CES4300000001', aheId: 'CES4300000003' },
  { key: 'utilities', label: 'Utilities', family: 'ttu', id: 'CES4422000001', aheId: 'CES4422000003' },
  { key: 'info', label: 'Information', family: 'business', id: 'USINFO', aheId: 'CES5000000003' },
  { key: 'fire', label: 'Financial activities', family: 'business', id: 'USFIRE', aheId: 'CES5500000003' },
  { key: 'pbs', label: 'Professional & business services', family: 'business', id: 'USPBS', aheId: 'CES6000000003' },
  { key: 'ehs', label: 'Education & health services', family: 'eduHealth', id: 'USEHS', aheId: 'CES6500000003' },
  { key: 'lah', label: 'Leisure & hospitality', family: 'leisureOther', id: 'USLAH', aheId: 'CES7000000003' },
  { key: 'other', label: 'Other services', family: 'leisureOther', id: 'USSERV', aheId: 'CES8000000003' },
  { key: 'govt', label: 'Government', family: 'govt', id: 'USGOVT', aheId: null },
]

export const familyColor = key => SECTOR_FAMILIES.find(family => family.key === key)?.color

export function average(values) {
  return values.length && values.every(finite)
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

// Month-over-month level differences. A month is null unless both it and the
// previous calendar month were published, so gaps are never bridged.
export function monthlyChanges(observations = []) {
  observations ||= []
  const values = observationMap(observations)
  return observations.map(point => {
    const previous = values.get(addMonths(point.date, -1))
    return { date: point.date, value: finite(point.value) && finite(previous) ? point.value - previous : null }
  })
}

export function payrollSummary(observations = []) {
  observations ||= []
  const changes = monthlyChanges(observations)
  const latest = latestObservation(observations)
  if (!latest) return {}
  const tail = count => changes.slice(-count).map(point => point.value)
  return {
    date: latest.date,
    level: latest.value,
    change: changes.at(-1)?.value ?? null,
    prior: changes.at(-2)?.value ?? null,
    avg3: changes.length >= 3 ? average(tail(3)) : null,
    avg6: changes.length >= 6 ? average(tail(6)) : null,
    avg12: changes.length >= 12 ? average(tail(12)) : null,
  }
}

function rate(current, base, power = 1) {
  return finite(current) && finite(base) && base !== 0 ? ((current / base) ** power - 1) * 100 : null
}

// Momentum and trend for an index or wage level (AHE, aggregate hours, ECI).
export function levelRates(observations = [], { periodsPerYear = 12 } = {}) {
  observations ||= []
  const latest = latestObservation(observations)
  if (!latest) return {}
  const values = observationMap(observations)
  const step = 12 / periodsPerYear
  const at = periods => values.get(addMonths(latest.date, -periods * step))
  return {
    date: latest.date,
    level: latest.value,
    change: rate(latest.value, at(1)),
    annualized3m: periodsPerYear === 12 ? rate(latest.value, at(3), 4) : null,
    yoy: rate(latest.value, at(periodsPerYear)),
    priorYoy: finite(at(1)) ? rate(at(1), values.get(addMonths(latest.date, -(periodsPerYear + 1) * step))) : null,
  }
}

// Latest value of a rate series with its change against one month and one year earlier.
export function rateSummary(observations = []) {
  observations ||= []
  const latest = latestObservation(observations)
  if (!latest) return {}
  const values = observationMap(observations)
  const diff = months => {
    const base = values.get(addMonths(latest.date, -months))
    return finite(base) ? latest.value - base : null
  }
  return { date: latest.date, value: latest.value, change1m: diff(1), change12m: diff(12) }
}

// Sum of component levels per date; null when any component is missing.
export function sumSeries(seriesList = []) {
  if (!seriesList.length || seriesList.some(series => !series?.length)) return []
  const maps = seriesList.map(observationMap)
  return seriesList[0].map(point => {
    const values = maps.map(map => map.get(point.date))
    return { date: point.date, value: values.every(finite) ? values.reduce((sum, value) => sum + value, 0) : null }
  })
}

export function differenceSeries(minuend = [], subtrahend = []) {
  const other = observationMap(subtrahend)
  return minuend.map(point => {
    const value = other.get(point.date)
    return { date: point.date, value: finite(point.value) && finite(value) ? point.value - value : null }
  })
}

// Monthly change by family for the last `months` months, keyed by family.
export function familyChanges(sectors = {}, months = 12) {
  return Object.fromEntries(SECTOR_FAMILIES.map(family => {
    const members = SECTORS.filter(sector => sector.family === family.key).map(sector => sectors[sector.key])
    return [family.key, monthlyChanges(sumSeries(members)).slice(-months)]
  }))
}

// Choose the most recent earlier vintage whose final observation is the month
// before the current latest month: that is the previous Employment Situation.
export function pickPriorVintage(candidates = [], latestDate) {
  if (!latestDate) return null
  const target = addMonths(latestDate, -1)
  return [...candidates]
    .filter(candidate => latestObservation(candidate.observations)?.date === target)
    .sort((a, b) => b.vintageDate.localeCompare(a.vintageDate))[0] ?? null
}

// BLS-style revision of the prior two monthly changes: current estimate minus
// the estimate published in the previous release.
export function payrollRevisions(current = [], prior = []) {
  const latest = latestObservation(current)
  if (!latest || !prior.length) return null
  const now = new Map(monthlyChanges(current).map(point => [point.date, point.value]))
  const before = new Map(monthlyChanges(prior).map(point => [point.date, point.value]))
  const months = [-2, -1].map(offset => {
    const date = addMonths(latest.date, offset)
    const previous = before.get(date)
    const revised = now.get(date)
    return {
      date,
      previous: previous ?? null,
      revised: revised ?? null,
      revision: finite(previous) && finite(revised) ? revised - previous : null,
    }
  })
  return { months, net: months.every(month => finite(month.revision)) ? months[0].revision + months[1].revision : null }
}
