import { fetchEstatMonthly, fetchNamedSeries } from '../../lib/estat.js'
import { JAPAN_CPI_BASE_YEAR, JAPAN_CPI_STATS_ID, JAPAN_CPI_WEIGHTS } from '../../lib/japan-cpi-config.mjs'
import { JAPAN_CPI_SERIES } from '../../lib/japan-cpi-series.mjs'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

export async function GET() {
  const appId = process.env.ESTAT_APP_ID

  let fetched
  try {
    fetched = await fetchNamedSeries(
      JAPAN_CPI_SERIES,
      ({ cat, tab }) => fetchEstatMonthly({ appId, statsDataId: JAPAN_CPI_STATS_ID, area: '00000', cat, tab, revalidate }),
      // ~66 small requests; 12 at a time halves the rounds of a cold refresh.
      { required: ['headline', 'core', 'corecore'], concurrency: 12 },
    )
  } catch (error) {
    console.error('[CPI]', error)
    return Response.json({ error: 'Unable to load national CPI from e-Stat.', detail: error.message }, { status: 502 })
  }
  const { series, warnings } = fetched
  const { food, housing, utilities, furniture, apparel, medical, transport_comms, education, leisure, miscellaneous } = series

  const calcContrib = (series, weight) =>
    series.map(v => ({ date: v.date, value: parseFloat((v.value * weight / 10000).toFixed(3)) }))

  const contrib = {
    food: calcContrib(food, JAPAN_CPI_WEIGHTS.food),
    housing: calcContrib(housing, JAPAN_CPI_WEIGHTS.housing),
    utilities: calcContrib(utilities, JAPAN_CPI_WEIGHTS.utilities),
    furniture: calcContrib(furniture, JAPAN_CPI_WEIGHTS.furniture),
    apparel: calcContrib(apparel, JAPAN_CPI_WEIGHTS.apparel),
    medical: calcContrib(medical, JAPAN_CPI_WEIGHTS.medical),
    transport_comms: calcContrib(transport_comms, JAPAN_CPI_WEIGHTS.transportComms),
    education: calcContrib(education, JAPAN_CPI_WEIGHTS.education),
    leisure: calcContrib(leisure, JAPAN_CPI_WEIGHTS.leisure),
    miscellaneous: calcContrib(miscellaneous, JAPAN_CPI_WEIGHTS.miscellaneous),
  }

  return Response.json({
    ...series,
    contrib,
    metadata: { baseYear: JAPAN_CPI_BASE_YEAR, statsDataId: JAPAN_CPI_STATS_ID, weightUnit: 10000 },
    meta: { partial: warnings.length > 0, warnings },
  })
}
