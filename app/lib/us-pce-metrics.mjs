import { addMonths, latestObservation, observationMap } from './us-cpi-scenarios.mjs'
import { SERIES_COLORS } from './series-colors.mjs'

const finite = value => Number.isFinite(value)

// BEA chain-type price indexes shown in the PCE breakdown table. Rows overlap
// (goods includes food and energy goods; services includes energy services),
// so they are read side by side and never summed.
export const PCE_PRICE_ROWS = [
  { key: 'headlinePce', label: 'Headline PCE', id: 'PCEPI', level: 0 },
  { key: 'foodPrice', label: 'Food', id: 'DFXARG3M086SBEA', level: 1 },
  { key: 'energyPrice', label: 'Energy goods & services', id: 'DNRGRG3M086SBEA', level: 1 },
  { key: 'corePce', label: 'Core PCE (ex food & energy)', id: 'PCEPILFE', level: 0 },
  { key: 'servicesExHousing', label: 'Services ex energy & housing', id: 'IA001260M', level: 1, rounded: true },
  { key: 'coreExHousing', label: 'Core ex housing', id: 'IA001176M', level: 1, rounded: true },
  { key: 'marketCore', label: 'Market-based core', id: 'DPCXRG3M086SBEA', level: 1 },
  { key: 'goodsPrice', label: 'Goods', id: 'DGDSRG3M086SBEA', level: 0 },
  { key: 'durablePrice', label: 'Durable goods', id: 'DDURRG3M086SBEA', level: 1 },
  { key: 'nondurablePrice', label: 'Nondurable goods', id: 'DNDGRG3M086SBEA', level: 1 },
  { key: 'servicesPrice', label: 'Services', id: 'DSERRG3M086SBEA', level: 0 },
]

// Nominal spending (SAAR, $bn) used as weights for the headline split. Food,
// energy and core are BEA's non-overlapping split of total PCE.
export const PCE_NOMINAL = {
  total: 'PCE',
  food: 'DFXARC1M027SBEA',
  energy: 'DNRGRC1M027SBEA',
  core: 'DPCCRC1M027SBEA',
}

// Stack order follows the validated CHART_ORDERS.headlineSplit (energy, food, core).
export const HEADLINE_BLOCKS = [
  { key: 'energy', label: 'Energy', price: 'energyPrice', nominal: 'nominalEnergy', color: SERIES_COLORS.energy },
  { key: 'food', label: 'Food', price: 'foodPrice', nominal: 'nominalFood', color: SERIES_COLORS.food },
  { key: 'core', label: 'Core (ex food & energy)', price: 'corePce', nominal: 'nominalCore', color: SERIES_COLORS.core },
]

// BEA Table 2.6 identity: personal income = compensation + proprietors' income
// + rental income + asset income + transfer receipts - social insurance contributions.
export const INCOME_COMPONENTS = [
  { key: 'compensation', label: 'Compensation of employees', id: 'W209RC1', sign: 1, color: SERIES_COLORS.compensation },
  { key: 'proprietors', label: "Proprietors' income", id: 'A041RC1', sign: 1, color: SERIES_COLORS.proprietorsIncome },
  { key: 'rental', label: 'Rental income', id: 'A048RC1', sign: 1, color: SERIES_COLORS.rentalIncome },
  { key: 'assetIncome', label: 'Interest & dividends', id: 'PIROA', sign: 1, color: SERIES_COLORS.assetIncome },
  { key: 'transfers', label: 'Transfer receipts', id: 'PCTR', sign: 1, color: SERIES_COLORS.transfers },
  { key: 'socialContributions', label: 'Less: social insurance contributions', id: 'A061RC1', sign: -1, color: SERIES_COLORS.socialContributions },
]

function sumValues(values) {
  const list = Object.values(values)
  return list.length && list.every(finite) ? list.reduce((acc, value) => acc + value, 0) : null
}

function rate(current, base, power = 1) {
  return finite(current) && finite(base) && base !== 0 ? ((current / base) ** power - 1) * 100 : null
}

// Monthly impulse, short-run momentum and trend for one price index. The last
// three month-over-month changes are returned oldest first.
export function priceRow(observations = []) {
  observations ||= []
  const latest = latestObservation(observations)
  if (!latest) return {}
  const values = observationMap(observations)
  const at = months => values.get(addMonths(latest.date, -months))
  const mom = [2, 1, 0].map(offset => ({
    date: addMonths(latest.date, -offset),
    value: rate(at(offset), at(offset + 1)),
  }))
  return {
    date: latest.date,
    mom,
    annualized3m: rate(latest.value, at(3), 4),
    annualized6m: rate(latest.value, at(6), 2),
    yoy: rate(latest.value, at(12)),
    priorYoy: rate(at(1), at(13)),
  }
}

// Additive contributions to the growth of a level identity (e.g. personal
// income). Each part contributes sign * (x_t - x_{t-p}) / total_{t-p}; the
// residual is the published total's growth minus their sum (rounding only).
export function levelContributions(parts = [], total = [], periods = 12) {
  const totals = observationMap(total || [])
  const maps = parts.map(part => observationMap(part.observations || []))
  return (total || []).map(point => {
    const previousDate = addMonths(point.date, -periods)
    const base = totals.get(previousDate)
    const values = Object.fromEntries(parts.map((part, index) => {
      const current = maps[index].get(point.date)
      const previous = maps[index].get(previousDate)
      const value = finite(current) && finite(previous) && finite(base) && base !== 0
        ? part.sign * (current - previous) / base * 100
        : null
      return [part.key, value]
    }))
    const growth = rate(point.value, base)
    const sum = sumValues(values)
    return { date: point.date, values, growth, residual: finite(growth) && finite(sum) ? growth - sum : null }
  })
}

// Approximate contributions to a chain-type index's change over `periods`
// months: base-period nominal share times the component's price change. The
// Fisher chain is not exactly additive, so the gap to the published aggregate
// is returned as `residual` instead of being hidden.
export function shareContributions(blocks = [], aggregatePrice = [], totalNominal = [], periods = 12) {
  const aggregate = observationMap(aggregatePrice || [])
  const totals = observationMap(totalNominal || [])
  const maps = blocks.map(block => ({ prices: observationMap(block.price || []), nominal: observationMap(block.nominal || []) }))
  return (aggregatePrice || []).map(point => {
    const previousDate = addMonths(point.date, -periods)
    const totalBase = totals.get(previousDate)
    const values = Object.fromEntries(blocks.map((block, index) => {
      const { prices, nominal } = maps[index]
      const share = finite(totalBase) && totalBase !== 0 ? nominal.get(previousDate) / totalBase : null
      const change = rate(prices.get(point.date), prices.get(previousDate))
      return [block.key, finite(share) && finite(change) ? share * change : null]
    }))
    const growth = rate(point.value, aggregate.get(previousDate))
    const sum = sumValues(values)
    return { date: point.date, values, growth, residual: finite(growth) && finite(sum) ? growth - sum : null }
  })
}

// Dining demand: restaurant sales deflated by the food-away-from-home CPI.
// Changes are matched by calendar month, so an unpublished month (no October
// 2025 CPI) leaves dependent changes blank instead of shifting the base.
export function diningMetrics(restaurantSales = [], foodAwayCpi = []) {
  const sales = observationMap(restaurantSales || [])
  const prices = observationMap(foodAwayCpi || [])
  const dates = [...sales.keys()].filter(date => finite(sales.get(date)) && finite(prices.get(date))).sort()
  const real = new Map(dates.filter(date => prices.get(date) !== 0).map(date => [date, sales.get(date) / prices.get(date)]))
  const ratio = (map, date, months) => {
    const current = map.get(date)
    const base = map.get(addMonths(date, -months))
    return finite(current) && finite(base) && base !== 0 ? current / base : null
  }
  const growth = (map, date, months, power = 1) => {
    const value = ratio(map, date, months)
    return value === null ? null : (value ** power - 1) * 100
  }
  const maps = { sales, prices, real }
  const date = dates.at(-1) ?? null
  return {
    date,
    salesMom: date && growth(sales, date, 1),
    salesYoy: date && growth(sales, date, 12),
    priceYoy: date && growth(prices, date, 12),
    realMom: date && growth(real, date, 1),
    realYoy: date && growth(real, date, 12),
    real3m: date && growth(real, date, 3, 4),
    path: (kind, pathDates) => pathDates.map(item => growth(maps[kind], item, 12)),
  }
}
