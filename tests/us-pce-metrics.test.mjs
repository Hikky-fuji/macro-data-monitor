import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HEADLINE_BLOCKS,
  INCOME_COMPONENTS,
  PCE_PRICE_ROWS,
  diningMetrics,
  levelContributions,
  priceRow,
  shareContributions,
} from '../app/lib/us-pce-metrics.mjs'

function monthly(start, values) {
  const [year, month] = start.split('-').map(Number)
  return values.map((value, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1))
    return { date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`, value }
  })
}

const close = (actual, expected, digits = 6) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} != ${expected}`)

test('series lists have unique keys and FRED ids', () => {
  for (const list of [PCE_PRICE_ROWS, INCOME_COMPONENTS]) {
    assert.equal(new Set(list.map(item => item.key)).size, list.length)
    assert.equal(new Set(list.map(item => item.id)).size, list.length)
  }
  assert.deepEqual(INCOME_COMPONENTS.filter(item => item.sign < 0).map(item => item.id), ['A061RC1'])
  HEADLINE_BLOCKS.forEach(block => assert.ok(PCE_PRICE_ROWS.some(row => row.key === block.price), block.price))
})

test('price row gives the last three monthly changes, momentum and trend', () => {
  const row = priceRow(monthly('2025-01', Array.from({ length: 15 }, (_, i) => 100 * 1.002 ** i)))
  assert.deepEqual(row.mom.map(point => point.date), ['2026-01-01', '2026-02-01', '2026-03-01'])
  row.mom.forEach(point => close(point.value, 0.2))
  close(row.annualized3m, (1.002 ** 12 - 1) * 100)
  close(row.annualized6m, (1.002 ** 12 - 1) * 100)
  close(row.yoy, (1.002 ** 12 - 1) * 100)
  close(row.priorYoy, (1.002 ** 12 - 1) * 100)
})

test('price row leaves a gap blank instead of bridging it', () => {
  const series = monthly('2026-01', [100, 101, 102, 103]).filter(point => point.date !== '2026-03-01')
  const row = priceRow(series)
  assert.equal(row.mom[1].value, null)
  assert.equal(row.mom[2].value, null)
  assert.equal(row.yoy, null)
  assert.deepEqual(priceRow(null), {})
})

test('level contributions add up to total growth when the identity holds', () => {
  const a = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 100 + i))
  const b = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 50 + 2 * i))
  const c = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 10 + 0.5 * i))
  const total = a.map((point, i) => ({ date: point.date, value: point.value + b[i].value - c[i].value }))
  const result = levelContributions([
    { key: 'a', sign: 1, observations: a },
    { key: 'b', sign: 1, observations: b },
    { key: 'c', sign: -1, observations: c },
  ], total).at(-1)
  close(result.values.a, 12 / 140 * 100)
  close(result.values.c, -6 / 140 * 100)
  close(result.growth, (170 / 140 - 1) * 100)
  close(result.residual, 0)
  assert.equal(levelContributions([{ key: 'a', sign: 1, observations: a }], total)[0].growth, null)
})

test('share contributions weight price changes by base-period nominal share', () => {
  const food = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 100 * 1.01 ** (i / 12)))
  const core = monthly('2025-01', Array.from({ length: 13 }, (_, i) => 100 * 1.03 ** (i / 12)))
  const aggregate = food.map((point, i) => ({ date: point.date, value: 0.25 * point.value + 0.75 * core[i].value }))
  const nominal = value => monthly('2025-01', Array(13).fill(value))
  const result = shareContributions([
    { key: 'food', price: food, nominal: nominal(25) },
    { key: 'core', price: core, nominal: nominal(75) },
  ], aggregate, nominal(100)).at(-1)
  close(result.values.food, 0.25)
  close(result.values.core, 2.25)
  close(result.growth, 2.5)
  close(result.residual, 0)
})

test('dining changes match calendar months and stay blank across an unpublished CPI month', () => {
  const sales = monthly('2025-01', Array.from({ length: 22 }, (_, i) => 100 + i))
  const cpi = monthly('2025-01', Array(22).fill(50)).filter(point => point.date !== '2025-10-01')
  const result = diningMetrics(sales, cpi)
  assert.equal(result.date, '2026-10-01')
  close(result.salesYoy, (121 / 109 - 1) * 100)
  close(result.real3m, ((121 / 118) ** 4 - 1) * 100)
  assert.equal(result.realYoy, null)
  assert.equal(result.priceYoy, null)
  const [sep, oct] = result.path('real', ['2026-09-01', '2026-10-01'])
  close(sep, (120 / 108 - 1) * 100)
  assert.equal(oct, null)
  assert.equal(diningMetrics([], []).date, null)
})
