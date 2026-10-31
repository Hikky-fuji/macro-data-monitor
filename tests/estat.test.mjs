import test from 'node:test'
import assert from 'node:assert/strict'
import { estatValues, fetchNamedSeries, monthlyObservations } from '../app/lib/estat.js'

test('e-Stat error statuses fail instead of returning an empty series', () => {
  assert.throws(
    () => estatValues({ GET_STATS_DATA: { RESULT: { STATUS: 100, ERROR_MSG: 'invalid appId' } } }),
    /e-Stat status 100: invalid appId/,
  )
  assert.deepEqual(estatValues({ GET_STATS_DATA: { RESULT: { STATUS: 1 } } }), [])
})

test('monthly observations keep only month codes, sorted, and limited', () => {
  const values = [
    { '@time': '2026000909', $: '2.1' },
    { '@time': '2026000808', $: '2.0' },
    { '@time': '2026000000', $: '2.5' },
    { '@time': '2026001010', $: '1.9' },
  ]
  assert.deepEqual(monthlyObservations(values, 2), [
    { date: '2026/09', value: 2.1 },
    { date: '2026/10', value: 1.9 },
  ])
})

test('required series fail the feed while optional ones become warnings', async () => {
  const definitions = [{ key: 'headline' }, { key: 'detail' }]
  const ok = [{ date: '2026/09', value: 2.1 }]

  const partial = await fetchNamedSeries(definitions, async ({ key }) => {
    if (key === 'detail') throw new Error('HTTP 503')
    return ok
  }, { required: ['headline'] })
  assert.deepEqual(partial.series, { headline: ok, detail: [] })
  assert.deepEqual(partial.warnings, ['detail: HTTP 503'])

  await assert.rejects(
    fetchNamedSeries(definitions, async () => [], { required: ['headline'] }),
    /Required series unavailable: headline \(no observations returned\)/,
  )
})
