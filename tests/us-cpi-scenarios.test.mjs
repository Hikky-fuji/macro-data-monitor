import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths,
  annualizeMonthlyRate,
  baseEffectCalendar,
  buildConstantRateScenario,
  monthlyBlockContributions,
  nextMonthHurdles,
  scenarioSummary,
  weightedContribution,
  weightedResidual,
} from '../app/lib/us-cpi-scenarios.mjs'

const closeTo = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

test('calendar arithmetic remains monthly across year boundaries', () => {
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01')
  assert.equal(addMonths('2026-11-01', 3), '2027-02-01')
})

test('annualized pace compounds the monthly assumption', () => {
  closeTo(annualizeMonthlyRate(0.2), 2.426576794540325)
  closeTo(annualizeMonthlyRate(0.3), 3.659998028813005)
})

test('weighted residual produces a non-overlapping implied category rate', () => {
  const residual = weightedResidual(3, 0.60744, [
    { rate: 4, weight: 0.35333 },
    { rate: 2, weight: 0.06935 },
    { rate: 1, weight: 0.06315 },
  ])

  closeTo(residual.weight, 0.12161)
  closeTo(residual.contribution, weightedContribution(3, 0.60744)
    - weightedContribution(4, 0.35333)
    - weightedContribution(2, 0.06935)
    - weightedContribution(1, 0.06315))
  closeTo(residual.rate, residual.contribution / residual.weight)
})

test('scenario path compounds the index and uses the actual year-ago base', () => {
  const observations = [
    { date: '2025-01-01', value: 100 },
    { date: '2025-02-01', value: 101 },
    { date: '2026-01-01', value: 120 },
  ]
  const scenario = buildConstantRateScenario(observations, 0.2, 1)

  closeTo(scenario.points[0].index, 120.24)
  closeTo(scenario.points[0].yoy, (120.24 / 101 - 1) * 100)
  closeTo(scenario.currentYoy, 20)
})

test('scenario never interpolates a missing official comparison month', () => {
  const observations = [
    { date: '2025-09-01', value: 100 },
    { date: '2025-10-01', value: null },
    { date: '2026-09-01', value: 104 },
  ]
  const scenario = buildConstantRateScenario(observations, 0.2, 1)

  assert.equal(scenario.points[0].comparisonDate, '2025-10-01')
  assert.equal(scenario.points[0].yoy, null)
  assert.equal(scenario.points[0].missingBase, true)
})

test('next-month hurdle solves for an unchanged or shifted annual rate', () => {
  const observations = [
    { date: '2025-01-01', value: 100 },
    { date: '2025-02-01', value: 101 },
    { date: '2026-01-01', value: 120 },
  ]
  const hurdles = nextMonthHurdles(observations)

  closeTo(hurdles.hold, 1)
  closeTo(hurdles.downTenth, (121.099 / 120 - 1) * 100)
  closeTo(hurdles.upTenth, (121.301 / 120 - 1) * 100)
})

test('base-effect calendar compares the selected replacement with the rate rolling off', () => {
  const observations = [
    { date: '2025-01-01', value: 100 },
    { date: '2025-02-01', value: 101 },
    { date: '2026-01-01', value: 120 },
  ]
  const [effect] = baseEffectCalendar(observations, 0.2, 1)

  closeTo(effect.rolloffRate, 1)
  closeTo(effect.pressure, -0.8)
  assert.equal(effect.direction, 'downward')
})

test('summary reports year-end, horizon endpoint, and threshold timing', () => {
  const observations = [
    { date: '2025-01-01', value: 100 },
    { date: '2025-02-01', value: 101 },
    { date: '2025-03-01', value: 102 },
    { date: '2025-04-01', value: 103 },
    { date: '2025-05-01', value: 104 },
    { date: '2025-06-01', value: 105 },
    { date: '2025-07-01', value: 106 },
    { date: '2025-08-01', value: 107 },
    { date: '2025-09-01', value: 108 },
    { date: '2025-10-01', value: 109 },
    { date: '2025-11-01', value: 110 },
    { date: '2025-12-01', value: 111 },
    { date: '2026-01-01', value: 112 },
  ]
  const summary = scenarioSummary(buildConstantRateScenario(observations, 0, 12), 2.5)

  assert.equal(summary.yearEnd.date, '2026-12-01')
  assert.equal(summary.final.date, '2027-01-01')
  assert.equal(summary.firstAtOrBelow.date, '2026-11-01')
})

test('monthly block contributions use the latest headline month and an implied residual', () => {
  const months = ['2026-08-01', '2026-09-01']
  const index = (august, september) => ({ observations: [
    { date: months[0], value: august },
    { date: months[1], value: september },
  ] })
  const series = {
    headline: index(100, 100.3),
    food: index(100, 100),
    energy: index(100, 105),
    coreGoods: index(100, 100.3),
    coreServices: index(100, 100.4),
    rentOfShelter: index(100, 100.4),
    medicalServices: index(100, 100.3),
    transportation: index(100, 100.6),
  }
  const weights = { food: 0.137, energy: 0.064, coreGoods: 0.192, rentOfShelter: 0.353, medicalServices: 0.069, transportation: 0.063 }
  const result = monthlyBlockContributions(series, weights, { coreServices: 0.607 })

  assert.equal(result.date, '2026-09-01')
  closeTo(result.headline, 0.3, 1e-9)
  assert.deepEqual(result.blocks.map(block => block.key), [
    'food', 'energy', 'coreGoods', 'rentOfShelter', 'medicalServices', 'transportation', 'otherCoreServices',
  ])
  closeTo(result.blocks[1].contribution, 5 * 0.064, 1e-9)
  const residual = result.blocks.at(-1)
  assert.equal(residual.derived, true)
  closeTo(residual.contribution, 0.4 * 0.607 - (0.4 * 0.353 + 0.3 * 0.069 + 0.6 * 0.063), 1e-9)
  assert.equal(monthlyBlockContributions({}, weights, {}), null)
})
