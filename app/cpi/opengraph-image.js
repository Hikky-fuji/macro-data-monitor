import { createIndicatorOg } from '../lib/indicator-og'

export const alt = 'Macro Data Monitor · Japan CPI Dashboard'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return createIndicatorOg({
    eyebrow: 'JAPAN / CONSUMER PRICES',
    title: 'Japan inflation, from headline to services.',
    subtitle: 'Official national CPI, underlying momentum and category-level price pressure.',
  })
}
