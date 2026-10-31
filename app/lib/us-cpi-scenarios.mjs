const finite = value => Number.isFinite(value)

export function addMonths(date, months) {
  const [year, month] = date.slice(0, 7).split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function yearAgo(date) {
  return addMonths(date, -12)
}

export function monthOverMonth(current, previous) {
  return finite(current) && finite(previous) && previous !== 0
    ? (current / previous - 1) * 100
    : null
}

export function yearOverYear(current, previousYear) {
  return monthOverMonth(current, previousYear)
}

export function annualizeMonthlyRate(rate) {
  return finite(rate) ? ((1 + rate / 100) ** 12 - 1) * 100 : null
}

export function weightedContribution(rate, weight) {
  return finite(rate) && finite(weight) ? rate * weight : null
}

export function weightedResidual(aggregateRate, aggregateWeight, components = []) {
  if (!finite(aggregateRate) || !finite(aggregateWeight) || components.some(component => !finite(component.rate) || !finite(component.weight))) {
    return null
  }
  const componentWeight = components.reduce((sum, component) => sum + component.weight, 0)
  const residualWeight = aggregateWeight - componentWeight
  if (residualWeight <= 0) return null

  const aggregateContribution = weightedContribution(aggregateRate, aggregateWeight)
  const componentContribution = components.reduce(
    (sum, component) => sum + weightedContribution(component.rate, component.weight),
    0,
  )
  const contribution = aggregateContribution - componentContribution
  return {
    rate: contribution / residualWeight,
    weight: residualWeight,
    contribution,
  }
}

export function observationMap(observations = []) {
  return new Map(observations.map(point => [point.date, point.value]))
}

export function latestObservation(observations = []) {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (finite(observations[index]?.value)) return observations[index]
  }
  return null
}

export function historicalYoy(observations = [], startDate = '2021-01-01') {
  const values = observationMap(observations)
  return observations
    .filter(point => point.date >= startDate)
    .map(point => ({
      date: point.date,
      value: yearOverYear(point.value, values.get(yearAgo(point.date))),
      kind: 'actual',
    }))
}

export function buildConstantRateScenario(observations = [], monthlyRate, months = 12) {
  const latest = latestObservation(observations)
  if (!latest || !finite(monthlyRate) || months < 1) return null

  const actual = observationMap(observations)
  const projected = new Map([[latest.date, latest.value]])
  const points = []
  let indexLevel = latest.value

  for (let offset = 1; offset <= months; offset += 1) {
    const date = addMonths(latest.date, offset)
    indexLevel *= 1 + monthlyRate / 100
    projected.set(date, indexLevel)

    const comparisonDate = yearAgo(date)
    const comparison = actual.has(comparisonDate)
      ? actual.get(comparisonDate)
      : projected.get(comparisonDate)

    points.push({
      date,
      index: indexLevel,
      yoy: yearOverYear(indexLevel, comparison),
      comparisonDate,
      missingBase: !finite(comparison),
    })
  }

  const currentYoy = yearOverYear(latest.value, actual.get(yearAgo(latest.date)))
  return {
    monthlyRate,
    annualizedRate: annualizeMonthlyRate(monthlyRate),
    latest,
    currentYoy,
    points,
  }
}

export function buildScenarioSet(observations = [], monthlyRates = [0.2, 0.3, 0.4], months = 12) {
  return monthlyRates
    .filter(finite)
    .map(rate => buildConstantRateScenario(observations, rate, months))
    .filter(Boolean)
}

export function nextMonthHurdles(observations = []) {
  const latest = latestObservation(observations)
  if (!latest) return null

  const values = observationMap(observations)
  const currentBase = values.get(yearAgo(latest.date))
  const currentYoy = yearOverYear(latest.value, currentBase)
  const nextDate = addMonths(latest.date, 1)
  const nextBaseDate = yearAgo(nextDate)
  const nextBase = values.get(nextBaseDate)
  if (!finite(currentYoy) || !finite(nextBase)) return null

  const requiredRate = targetYoy => {
    const requiredIndex = nextBase * (1 + targetYoy / 100)
    return monthOverMonth(requiredIndex, latest.value)
  }

  return {
    nextDate,
    nextBaseDate,
    currentYoy,
    hold: requiredRate(currentYoy),
    downTenth: requiredRate(currentYoy - 0.1),
    upTenth: requiredRate(currentYoy + 0.1),
  }
}

export function baseEffectCalendar(observations = [], replacementRate = 0.2, months = 6) {
  const latest = latestObservation(observations)
  if (!latest || !finite(replacementRate)) return []

  const values = observationMap(observations)
  return Array.from({ length: months }, (_, index) => {
    const date = addMonths(latest.date, index + 1)
    const baseDate = yearAgo(date)
    const previousBaseDate = addMonths(baseDate, -1)
    const rolloffRate = monthOverMonth(values.get(baseDate), values.get(previousBaseDate))
    const pressure = finite(rolloffRate) ? replacementRate - rolloffRate : null
    return {
      date,
      baseDate,
      rolloffRate,
      replacementRate,
      pressure,
      direction: !finite(pressure)
        ? 'unavailable'
        : pressure > 0.025
          ? 'upward'
          : pressure < -0.025
            ? 'downward'
            : 'neutral',
    }
  })
}

export function scenarioSummary(scenario, threshold = 2.5) {
  if (!scenario) return null
  const yearEnd = scenario.points.find(point => point.date.slice(5, 7) === '12') ?? null
  const final = scenario.points.at(-1) ?? null
  const firstAtOrBelow = scenario.points.find(point => finite(point.yoy) && point.yoy <= threshold) ?? null
  return { yearEnd, final, firstAtOrBelow, threshold }
}

const MONTHLY_BLOCKS = ['food', 'energy', 'coreGoods', 'rentOfShelter', 'medicalServices', 'transportation']
const RESIDUAL_COMPONENTS = ['rentOfShelter', 'medicalServices', 'transportation']

// Approximate contribution of each non-overlapping CPI block to the latest
// headline M/M change, using fixed relative-importance weights. "Other core
// services" is the implied residual of core services.
export function monthlyBlockContributions(series = {}, weights = {}, aggregateWeights = {}) {
  const latest = latestObservation(series.headline?.observations)
  if (!latest) return null
  const previous = addMonths(latest.date, -1)
  const mom = key => {
    const values = observationMap(series[key]?.observations)
    return monthOverMonth(values.get(latest.date), values.get(previous))
  }

  const blocks = MONTHLY_BLOCKS.map(key => ({
    key,
    rate: mom(key),
    contribution: weightedContribution(mom(key), weights[key]),
  }))
  const residual = weightedResidual(
    mom('coreServices'),
    aggregateWeights.coreServices,
    RESIDUAL_COMPONENTS.map(key => ({ rate: mom(key), weight: weights[key] })),
  )
  blocks.push({
    key: 'otherCoreServices',
    rate: residual?.rate ?? null,
    contribution: residual?.contribution ?? null,
    derived: true,
  })

  return { date: latest.date, headline: mom('headline'), blocks }
}
