import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cpiMetrics,
  indexRates,
  supercoreMetrics,
  supercoreYoyPath,
  yoyPath,
} from '../app/lib/us-cpi-metrics.mjs'

function monthly(start, values) {
  const [year, month] = start.split('-').map(Number)
  return values.map((value, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1))
    return { date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`, value }
  })
}

const close = (actual, expected, digits = 6) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} != ${expected}`)

test('CPI metrics take momentum from SA and year-over-year from NSA', () => {
  const sa = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 100 * 1.002 ** i))
  const nsa = monthly('2025-01', Array.from({ length: 13 }, (_, i) => (i === 12 ? 103 : 100 + i * 0.1)))
  const stats = cpiMetrics({ observations: sa, nsa: { observations: nsa } })

  assert.equal(stats.date, '2026-01-01')
  close(stats.mom, 0.2)
  close(stats.annualized3m, (1.002 ** 12 - 1) * 100)
  close(stats.annualized6m, (1.002 ** 12 - 1) * 100)
  close(stats.yoy, 3)
  assert.equal(stats.yoyBasis, 'NSA')
})

test('CPI metrics fall back to SA year-over-year and label it', () => {
  const sa = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 100 + i))
  const stats = cpiMetrics({ observations: sa, nsa: { observations: [] } })
  close(stats.yoy, 12)
  assert.equal(stats.yoyBasis, 'SA')
})

test('six-month annualized rate is a compounded index change, not an average', () => {
  const sa = monthly('2025-07', [100, 100, 100, 100, 100, 100, 103])
  close(cpiMetrics({ observations: sa }).annualized6m, (1.03 ** 2 - 1) * 100)
})

test('yoy path does not interpolate a missing official month', () => {
  const nsa = monthly('2024-09', Array.from({ length: 14 }, (_, i) => 100 + i))
  nsa[13].value = null
  const path = yoyPath({ observations: [], nsa: { observations: nsa } }, ['2025-09-01', '2025-10-01'])
  close(path[0], 12)
  assert.equal(path[1], null)
})

test('Reserve Bank index rates annualize 1, 3 and 6 month changes', () => {
  const index = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 100 * 1.0025 ** i))
  const rates = indexRates(index)
  close(rates.annualized1m, (1.0025 ** 12 - 1) * 100)
  close(rates.annualized6m, (1.0025 ** 12 - 1) * 100)
  close(rates.yoy, (1.0025 ** 12 - 1) * 100)
})

test('supercore is the weighted residual of core services after rent of shelter', () => {
  const months = Array.from({ length: 13 }, (_, i) => i)
  const series = {
    coreServices: { observations: monthly('2025-01', months.map(i => 100 * 1.003 ** i)), nsa: { observations: monthly('2025-01', months.map(i => (i === 12 ? 104 : 100))) } },
    rentOfShelter: { observations: monthly('2025-01', months.map(i => 100 * 1.004 ** i)), nsa: { observations: monthly('2025-01', months.map(i => (i === 12 ? 105 : 100))) } },
  }
  const weights = { rentOfShelter: 0.35 }
  const aggregate = { coreServices: 0.6 }
  const stats = supercoreMetrics(series, weights, aggregate)

  close(stats.mom, (0.6 * 0.3 - 0.35 * 0.4) / 0.25)
  close(stats.yoy, (0.6 * 4 - 0.35 * 5) / 0.25)
  assert.equal(stats.yoyBasis, 'NSA')
  close(stats.weight, 0.25)
  close(supercoreYoyPath(series, weights, aggregate, ['2026-01-01'])[0], stats.yoy)
})
