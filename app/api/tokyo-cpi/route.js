import { fetchEstatMonthly, fetchNamedSeries } from '../../lib/estat.js'
import { JAPAN_CPI_BASE_YEAR, JAPAN_CPI_STATS_ID } from '../../lib/japan-cpi-config.mjs'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

// cdTab 3 = y/y %, 2 = m/m %.
const SERIES = [
  { key: 'headline', cat: '0001', tab: '3' },
  { key: 'core', cat: '0161', tab: '3' },
  { key: 'corecore', cat: '0178', tab: '3' },
  { key: 'services', cat: '0242', tab: '3' },
  { key: 'headline_mm', cat: '0001', tab: '2' },
  { key: 'core_mm', cat: '0161', tab: '2' },
  { key: 'corecore_mm', cat: '0178', tab: '2' },
  { key: 'services_mm', cat: '0242', tab: '2' },
]

export async function GET() {
  const appId = process.env.ESTAT_APP_ID

  try {
    const { series, warnings } = await fetchNamedSeries(
      SERIES,
      ({ cat, tab }) => fetchEstatMonthly({ appId, statsDataId: JAPAN_CPI_STATS_ID, area: '13100', cat, tab, revalidate }),
      { required: ['headline', 'core', 'corecore'] },
    )

    return Response.json({
      ...series,
      metadata: { baseYear: JAPAN_CPI_BASE_YEAR, statsDataId: JAPAN_CPI_STATS_ID },
      meta: { partial: warnings.length > 0, warnings },
    })
  } catch (error) {
    console.error('[Tokyo CPI]', error)
    return Response.json({ error: 'Unable to load Tokyo CPI from e-Stat.', detail: error.message }, { status: 502 })
  }
}
