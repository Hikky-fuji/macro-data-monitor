import { createIndicatorOg } from '../../lib/indicator-og'

export const alt = 'Macro Data Monitor · US PCE, Consumer and Dining Demand Dashboard'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return createIndicatorOg({
    eyebrow: 'UNITED STATES / CONSUMER PULSE',
    title: 'PCE, income and dining demand.',
    subtitle: 'Inflation, real spending, household capacity and official price-adjusted restaurant sales.',
    accent: '#60d4af',
  })
}
