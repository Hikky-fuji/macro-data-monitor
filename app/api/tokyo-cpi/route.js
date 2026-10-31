import { fetchEstatMonthly, fetchNamedSeries } from '../../lib/estat.js'
import { JAPAN_CPI_BASE_YEAR, JAPAN_CPI_STATS_ID } from '../../lib/japan-cpi-config.mjs'
import { BRIDGE_HISTORY_SERIES, JAPAN_CPI_SERIES } from '../../lib/japan-cpi-series.mjs'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

const TOKYO_AREA = '13100'
const NATIONAL_AREA = '00000'

// Tokyo ward-area CPI uses the same categories as the national dashboard, plus
// about eight years of Y/Y history for both areas so the page can describe how
// the early Tokyo release has lined up with the national release.
const HISTORY = BRIDGE_HISTORY_SERIES.flatMap(({ key, cat }) => [
  { key: `history_tokyo_${key}`, cat, tab: '3', area: TOKYO_AREA, limit: 100 },
  { key: `history_national_${key}`, cat, tab: '3', area: NATIONAL_AREA, limit: 100 },
])

export async function GET() {
  const appId = process.env.ESTAT_APP_ID

  try {
    const { series, warnings } = await fetchNamedSeries(
      [...JAPAN_CPI_SERIES.map(definition => ({ ...definition, area: TOKYO_AREA })), ...HISTORY],
      ({ cat, tab, area, limit }) => fetchEstatMonthly({ appId, statsDataId: JAPAN_CPI_STATS_ID, area, cat, tab, revalidate, limit }),
      { required: ['headline', 'core', 'corecore'], concurrency: 12 },
    )

    const history = Object.fromEntries(['tokyo', 'national'].map(area => [
      area,
      Object.fromEntries(BRIDGE_HISTORY_SERIES.map(({ key }) => [key, series[`history_${area}_${key}`]])),
    ]))
    const current = Object.fromEntries(Object.entries(series).filter(([key]) => !key.startsWith('history_')))

    return Response.json({
      ...current,
      history,
      metadata: { baseYear: JAPAN_CPI_BASE_YEAR, statsDataId: JAPAN_CPI_STATS_ID, area: 'Tokyo ward area (13100)' },
      meta: { partial: warnings.length > 0, warnings },
    })
  } catch (error) {
    console.error('[Tokyo CPI]', error)
    return Response.json({ error: 'Unable to load Tokyo CPI from e-Stat.', detail: error.message }, { status: 502 })
  }
}
