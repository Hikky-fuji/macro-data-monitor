import { fetchEstatMonthly, fetchNamedSeries } from '../../lib/estat.js'
import { JAPAN_CPI_BASE_YEAR, JAPAN_CPI_STATS_ID, JAPAN_CPI_WEIGHTS } from '../../lib/japan-cpi-config.mjs'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

// cdTab 3 = y/y %, 2 = m/m %.
const SERIES = [
  { key: 'headline', cat: '0001', tab: '3' },
  { key: 'core', cat: '0161', tab: '3' },
  { key: 'corecore', cat: '0178', tab: '3' },
  { key: 'services', cat: '0242', tab: '3' },
  { key: 'food_ex_fresh', cat: '0172', tab: '3' },
  { key: 'energy', cat: '0167', tab: '3' },
  { key: 'goods_ex_fresh', cat: '0241', tab: '3' },
  { key: 'food', cat: '0002', tab: '3' },
  { key: 'housing', cat: '0045', tab: '3' },
  { key: 'utilities', cat: '0054', tab: '3' },
  { key: 'medical', cat: '0107', tab: '3' },
  { key: 'transport', cat: '0112', tab: '3' },
  { key: 'transport_comms', cat: '0111', tab: '3' },
  { key: 'education', cat: '0118', tab: '3' },
  { key: 'comms', cat: '0117', tab: '3' },
  { key: 'leisure', cat: '0122', tab: '3' },
  { key: 'miscellaneous', cat: '0145', tab: '3' },
  { key: 'eating_out', cat: '0042', tab: '3' },
  { key: 'apparel', cat: '0082', tab: '3' },
  { key: 'furniture', cat: '0060', tab: '3' },
  { key: 'headline_mm', cat: '0001', tab: '2' },
  { key: 'core_mm', cat: '0161', tab: '2' },
  { key: 'corecore_mm', cat: '0178', tab: '2' },
  { key: 'services_mm', cat: '0242', tab: '2' },
  { key: 'food_mm', cat: '0172', tab: '2' },
  { key: 'energy_mm', cat: '0167', tab: '2' },
  { key: 'goods_mm', cat: '0241', tab: '2' },
  { key: 'housing_mm', cat: '0045', tab: '2' },
  { key: 'medical_mm', cat: '0107', tab: '2' },
  { key: 'transport_mm', cat: '0112', tab: '2' },
  { key: 'education_mm', cat: '0118', tab: '2' },
  { key: 'comms_mm', cat: '0117', tab: '2' },
  { key: 'leisure_mm', cat: '0122', tab: '2' },
  { key: 'eating_out_mm', cat: '0042', tab: '2' },
  { key: 'apparel_mm', cat: '0082', tab: '2' },
  { key: 'furniture_mm', cat: '0060', tab: '2' },
]

export async function GET() {
  const appId = process.env.ESTAT_APP_ID

  let fetched
  try {
    fetched = await fetchNamedSeries(
      SERIES,
      ({ cat, tab }) => fetchEstatMonthly({ appId, statsDataId: JAPAN_CPI_STATS_ID, area: '00000', cat, tab, revalidate }),
      { required: ['headline', 'core', 'corecore'] },
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
