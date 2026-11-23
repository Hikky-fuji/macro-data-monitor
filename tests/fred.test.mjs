import test from 'node:test'
import assert from 'node:assert/strict'
import { averageByMonth, fetchFredSeries, parseFredCsv } from '../app/lib/fred.js'

test('parses FRED CSV and ignores missing observations', () => {
  const series = parseFredCsv('DATE,VALUE\n2026-01-01,1.5\n2026-02-01,.\n2026-03-01,2.25\n')
  assert.deepEqual(series, [
    { date: '2026-01-01', value: 1.5 },
    { date: '2026-03-01', value: 2.25 },
  ])
})

test('aggregates daily CSV observations to monthly averages', () => {
  assert.deepEqual(averageByMonth([
    { date: '2026-01-02', value: 2 },
    { date: '2026-01-03', value: 4 },
    { date: '2026-02-01', value: 8 },
  ]), [
    { date: '2026-01-01', value: 3 },
    { date: '2026-02-01', value: 8 },
  ])
})

test('the API and CSV paths return the same series when a month is unpublished', async () => {
  const rows = [['2026-01-01', '1'], ['2026-02-01', '2'], ['2026-03-01', '.'], ['2026-04-01', '4'], ['2026-05-01', '5']]
  const original = globalThis.fetch
  globalThis.fetch = async url => {
    const params = new URL(url).searchParams
    if (!String(url).startsWith('https://api.')) {
      return new Response(`DATE,X\n${rows.map(row => row.join(',')).join('\n')}`)
    }
    const observations = rows.map(([date, value]) => ({ date, value })).reverse().slice(0, Number(params.get('limit')))
    return Response.json({ observations })
  }
  try {
    const api = await fetchFredSeries('X', { apiKey: 'test', limit: 3 })
    const csv = await fetchFredSeries('X', { limit: 3 })
    assert.deepEqual(api, csv)
    assert.deepEqual(api.map(point => point.date), ['2026-02-01', '2026-04-01', '2026-05-01'])
  } finally {
    globalThis.fetch = original
  }
})
