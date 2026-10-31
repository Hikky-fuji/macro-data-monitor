import test from 'node:test'
import assert from 'node:assert/strict'
import { momentumSignal, movingAverage, saMomentum, yoyMomentum } from '../app/lib/japan-cpi-momentum.mjs'

test('three-month moving average preserves dates and smooths year-over-year rates', () => {
  const result = movingAverage([
    { date: '2026/04', value: 1.2 },
    { date: '2026/05', value: 1.5 },
    { date: '2026/06', value: 1.8 },
  ])

  assert.equal(result[0].value, null)
  assert.equal(result[1].value, null)
  assert.equal(result[2].date, '2026/06')
  assert.equal(result[2].value, 1.5)
})

test('momentum compares successive three-month averages and aligns NSA monthly data', () => {
  const result = yoyMomentum([
    { date: '2026/03', value: 1.0 },
    { date: '2026/04', value: 1.2 },
    { date: '2026/05', value: 1.5 },
    { date: '2026/06', value: 1.8 },
  ], [
    { date: '2026/05', value: 0.1 },
    { date: '2026/06', value: 0.3 },
  ])

  assert.equal(result.yoy, 1.8)
  assert.ok(Math.abs(result.mma3 - 1.5) < 1e-12)
  assert.ok(Math.abs(result.mma3Change - (1.5 - 1.2333333333333334)) < 1e-12)
  assert.equal(result.monthlyNsa, 0.3)
})

test('momentum signal distinguishes acceleration, cooling and noise', () => {
  assert.equal(momentumSignal(0.2), 'Accelerating')
  assert.equal(momentumSignal(-0.2), 'Cooling')
  assert.equal(momentumSignal(0.02), 'Stable')
  assert.equal(momentumSignal(null), 'Unavailable')
})

test('SA momentum uses the official M/M and annualizes the official SA index', () => {
  const index = ['2026/03', '2026/04', '2026/05', '2026/06', '2026/07', '2026/08', '2026/09']
    .map((date, i) => ({ date, value: [100, 100.2, 100.4, 100.5, 100.8, 101.0, 101.3][i] }))
  const result = saMomentum(index, [{ date: '2026/09', value: 0.3 }])

  assert.equal(result.date, '2026/09')
  assert.equal(result.mom, 0.3)
  assert.ok(Math.abs(result.annualized3m - ((101.3 / 100.5) ** 4 - 1) * 100) < 1e-9)
  assert.ok(Math.abs(result.annualized6m - ((101.3 / 100) ** 2 - 1) * 100) < 1e-9)
})

test('SA momentum leaves horizons blank when the base month is missing', () => {
  const result = saMomentum([{ date: '2026/08', value: 101 }, { date: '2026/09', value: 101.3 }], [])
  assert.equal(result.mom, null)
  assert.equal(result.annualized3m, null)
  assert.equal(result.annualized6m, null)
})
