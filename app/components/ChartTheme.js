'use client'

import { Chart } from 'chart.js'

Chart.defaults.color = '#dde2e5'
Chart.defaults.borderColor = '#4a5258'
Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif'
Chart.defaults.font.size = 12
if (Chart.defaults.plugins?.legend?.labels) {
  Chart.defaults.plugins.legend.labels.boxWidth = 14
  Chart.defaults.plugins.legend.labels.boxHeight = 8
  Chart.defaults.plugins.legend.labels.padding = 14
}

Chart.register({
  id: 'japanPulseAccessibility',
  afterInit(chart) {
    const canvas = chart.canvas
    if (canvas && !canvas.getAttribute('aria-label')) {
      const series = chart.data.datasets
        .map(dataset => dataset.label)
        .filter(Boolean)
        .slice(0, 6)
      canvas.setAttribute('role', 'img')
      canvas.setAttribute(
        'aria-label',
        series.length ? `Economic chart showing ${series.join(', ')}` : 'Economic data chart',
      )
    }
  },
})

export default function ChartTheme() {
  return null
}
