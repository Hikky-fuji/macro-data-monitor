'use client'

import { Chart } from 'chart.js'

function exportCanvas(canvas) {
  const output = document.createElement('canvas')
  output.width = canvas.width
  output.height = canvas.height
  const context = output.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, output.width, output.height)
  context.drawImage(canvas, 0, 0)
  return output
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    exportCanvas(canvas).toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png')
  })
}

function chartFilename(canvas) {
  const label = canvas.getAttribute('aria-label') || 'Macro Data Monitor chart'
  const safe = label.replace(/^Economic chart showing /, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70)
  return `${safe || 'macro-data-monitor-chart'}.png`.toLowerCase()
}

function setStatus(toolbar, message) {
  const status = toolbar.querySelector('[data-chart-export-status]')
  if (!status) return
  status.textContent = message
  window.setTimeout(() => { status.textContent = '' }, 2400)
}

function clipboardErrorMessage(error) {
  if (!window.isSecureContext) return 'Copy requires HTTPS'
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return 'Image copy unsupported — use PNG'
  if (error?.name === 'NotAllowedError') return 'Allow clipboard access, then retry'
  return 'Copy failed — use PNG'
}

function addExportControls(chart) {
  const canvas = chart.canvas
  const parent = canvas?.parentElement
  if (!canvas || !parent || canvas.dataset.chartExportId) return

  const exportId = `chart-export-${Math.random().toString(36).slice(2)}`
  canvas.dataset.chartExportId = exportId
  const toolbar = document.createElement('div')
  toolbar.className = 'jp-chart-export'
  toolbar.dataset.chartExportFor = exportId
  toolbar.innerHTML = '<button type="button" data-copy-chart>Copy image</button><button type="button" data-download-chart>Download PNG</button><span role="status" aria-live="polite" data-chart-export-status></span>'

  toolbar.querySelector('[data-copy-chart]').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard images are unavailable')
      // Start clipboard.write during the click itself. Safari otherwise expires
      // the transient user activation while canvas.toBlob is resolving.
      const blobPromise = canvasBlob(canvas)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
      setStatus(toolbar, 'Copied')
    } catch (error) {
      setStatus(toolbar, clipboardErrorMessage(error))
    }
  })

  toolbar.querySelector('[data-download-chart]').addEventListener('click', async () => {
    try {
      const blob = await canvasBlob(canvas)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = chartFilename(canvas)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(toolbar, 'Downloaded')
    } catch {
      setStatus(toolbar, 'Download failed')
    }
  })

  parent.insertBefore(toolbar, canvas)
}

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
    addExportControls(chart)
  },
  afterDestroy(chart) {
    const canvas = chart.canvas
    const exportId = canvas?.dataset.chartExportId
    if (!exportId) return
    canvas.parentElement?.querySelector(`[data-chart-export-for="${exportId}"]`)?.remove()
    delete canvas.dataset.chartExportId
  },
})

export default function ChartTheme() {
  return null
}
