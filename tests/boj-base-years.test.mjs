import assert from 'node:assert/strict'
import test from 'node:test'

import { baseYearFromHeader, spliceBaseSeries, stripBaseTags } from '../app/lib/boj-base-years.mjs'

const rank = period => {
  const [year, month] = period.split('/').map(Number)
  return year * 12 + month
}

test('BOJ base year is read from English and Japanese header tags', () => {
  assert.equal(baseYearFromHeader('trimmed mean y y chg | 2025base | chart'), 2025)
  assert.equal(baseYearFromHeader('刈込平均値 前年比 | 20年基準'), 2020)
  assert.equal(baseYearFromHeader('刈込平均値 | 25年基準 | trimmed mean | 2025base'), 2025)
  assert.equal(baseYearFromHeader('output gap | gap'), null)
})

test('base tags are removed so sibling base columns compare equal', () => {
  const newer = '刈込平均値 | 25年基準 | trimmed mean | 2025base | chart'
  const older = '刈込平均値 | 20年基準 | trimmed mean | 2020base | chart'
  assert.equal(stripBaseTags(newer), stripBaseTags(older))
  assert.notEqual(stripBaseTags(newer), stripBaseTags('加重中央値 | 25年基準 | weighted median | 2025base | chart'))
})

test('newest base continues the older base and wins on overlap', () => {
  const spliced = spliceBaseSeries([
    { baseYear: 2025, series: [{ date: '2025/12', value: 9 }, { date: '2026/01', value: 2.0 }] },
    { baseYear: 2020, series: [{ date: '2025/11', value: 2.9 }, { date: '2025/12', value: 2.7 }] },
  ], rank)

  assert.deepEqual(spliced.map(point => point.date), ['2025/11', '2025/12', '2026/01'])
  assert.equal(spliced[1].value, 9)
})
