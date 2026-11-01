import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SECTORS,
  SECTOR_FAMILIES,
  familyChanges,
  isBenchmarkMonth,
  newYorkTimeToUtc,
  nextRelease,
  levelRates,
  monthlyChanges,
  payrollRevisions,
  payrollSummary,
  pickPriorVintage,
  rateSummary,
  sumSeries,
} from '../app/lib/us-employment-metrics.mjs'

function monthly(start, values) {
  const [year, month] = start.split('-').map(Number)
  return values.map((value, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1))
    return { date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`, value }
  })
}

const close = (actual, expected, digits = 6) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} != ${expected}`)

test('every sector belongs to a family and families have distinct colors', () => {
  const families = new Set(SECTOR_FAMILIES.map(family => family.key))
  SECTORS.forEach(sector => assert.ok(families.has(sector.family), sector.key))
  assert.equal(new Set(SECTOR_FAMILIES.map(family => family.color)).size, SECTOR_FAMILIES.length)
  assert.equal(new Set(SECTORS.map(sector => sector.id)).size, SECTORS.length)
})

test('monthly changes never bridge a missing month', () => {
  const series = [
    { date: '2026-01-01', value: 100 },
    { date: '2026-02-01', value: 103 },
    { date: '2026-04-01', value: 110 },
  ]
  assert.deepEqual(monthlyChanges(series).map(point => point.value), [null, 3, null])
})

test('payroll summary averages only complete windows', () => {
  const summary = payrollSummary(monthly('2025-09', [100, 110, 115, 130, 140, 150, 145, 160]))
  assert.equal(summary.change, 15)
  assert.equal(summary.prior, -5)
  close(summary.avg3, (10 - 5 + 15) / 3)
  close(summary.avg6, (5 + 15 + 10 + 10 - 5 + 15) / 6)
  assert.equal(summary.avg12, null)
})

test('level rates give M/M, 3M annualized and Y/Y', () => {
  const series = monthly('2025-01', Array.from({ length: 14 }, (_, i) => 30 * 1.003 ** i))
  const rates = levelRates(series)
  close(rates.change, 0.3)
  close(rates.annualized3m, (1.003 ** 12 - 1) * 100)
  close(rates.yoy, (1.003 ** 12 - 1) * 100)
  close(rates.priorYoy, (1.003 ** 12 - 1) * 100)
})

test('quarterly level rates compare four quarters back', () => {
  const series = monthly('2025-01', [100, null, null, 101, null, null, 102, null, null, 103, null, null, 104])
    .filter(point => point.value !== null)
  const rates = levelRates(series, { periodsPerYear: 4 })
  close(rates.yoy, 4)
  close(rates.change, (104 / 103 - 1) * 100)
  assert.equal(rates.annualized3m, null)
})

test('rate summary reports point changes', () => {
  const summary = rateSummary(monthly('2025-09', [4.0, 4.1, 4.1, 4.2, 4.1, 4.1, 4.2, 4.3, 4.2, 4.2, 4.3, 4.3, 4.4]))
  close(summary.change1m, 0.1)
  close(summary.change12m, 0.4)
})

test('sums turn missing components into gaps, not zeros', () => {
  const a = monthly('2026-01', [10, 11, 12])
  const b = [{ date: '2026-01-01', value: 1 }, { date: '2026-03-01', value: 3 }]
  assert.deepEqual(sumSeries([a, b]).map(point => point.value), [11, null, 15])
  assert.deepEqual(sumSeries([a, []]), [])
})

test('family changes add up to the change in the sum of all sectors', () => {
  const sectors = Object.fromEntries(SECTORS.map((sector, index) => [
    sector.key,
    monthly('2026-01', [100 + index, 101 + index * 2, 103 + index * 3]),
  ]))
  const families = familyChanges(sectors, 2)
  const total = monthlyChanges(sumSeries(SECTORS.map(sector => sectors[sector.key]))).slice(-2)
  total.forEach((point, index) => {
    const sum = SECTOR_FAMILIES.reduce((acc, family) => acc + families[family.key][index].value, 0)
    close(sum, point.value)
  })
})

test('prior vintage is the latest one ending in the previous month', () => {
  const candidates = [
    { vintageDate: '2026-10-24', observations: monthly('2026-06', [1, 2, 3, 4]) },
    { vintageDate: '2026-09-26', observations: monthly('2026-05', [1, 2, 3, 4]) },
    { vintageDate: '2026-09-19', observations: monthly('2026-05', [1, 2, 3, 5]) },
    { vintageDate: '2026-09-05', observations: monthly('2026-04', [1, 2, 3, 4]) },
  ]
  assert.equal(pickPriorVintage(candidates, '2026-09-01').vintageDate, '2026-09-26')
  assert.equal(pickPriorVintage(candidates.slice(0, 1), '2026-09-01'), null)
})

test('revisions compare the prior two monthly changes across releases', () => {
  const current = monthly('2026-05', [158861, 158892, 158882, 159015, 159044])
  const prior = monthly('2026-05', [158861, 158892, 158913, 159075])
  const result = payrollRevisions(current, prior)
  assert.deepEqual(result.months.map(month => month.date), ['2026-07-01', '2026-08-01'])
  assert.equal(result.months[0].previous, 21)
  assert.equal(result.months[0].revised, -10)
  assert.equal(result.months[0].revision, -31)
  assert.equal(result.months[1].revision, 133 - 162)
  assert.equal(result.net, -60)
})

test('helpers treat a missing series as empty', () => {
  assert.deepEqual(levelRates(null), {})
  assert.deepEqual(payrollSummary(null), {})
  assert.deepEqual(rateSummary(null), {})
  assert.deepEqual(monthlyChanges(null), [])
})

test('New York release time converts across daylight saving', () => {
  assert.equal(newYorkTimeToUtc('2026-11-06').toISOString(), '2026-11-06T13:30:00.000Z')
  assert.equal(newYorkTimeToUtc('2026-10-02').toISOString(), '2026-10-02T12:30:00.000Z')
})

test('next release picks the first matching date on or after today', () => {
  const events = [
    { href: '/us/employment', date: '2026-12-04' },
    { href: '/us/cpi', date: '2026-11-03' },
    { href: '/us/employment', date: '2026-11-06' },
    { href: '/us/employment', date: '2026-10-02' },
  ]
  assert.equal(nextRelease(events, '/us/employment', '2026-10-31').date, '2026-11-06')
  assert.equal(nextRelease(events, '/us/employment', '2027-01-01'), null)
})

test('benchmark month is the January reference month', () => {
  assert.equal(isBenchmarkMonth('2027-01-01'), true)
  assert.equal(isBenchmarkMonth('2026-09-01'), false)
})
