'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardFreshness } from '../../components/DashboardStatus'
import { Line } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import styles from '../analysis-dashboard.module.css'

ChartJS.register(CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = {
  orange: '#f08a24',
  blue: '#42a9bc',
  green: '#60d4af',
  red: '#ff6b6b',
  violet: '#a99af0',
  muted: '#c7cdd1',
  grid: '#4a5258',
}

const valid = value => Number.isFinite(value)
const compact = value => valid(value)
  ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value * 1000)
  : '—'
const pct = value => valid(value) ? `${value.toFixed(1)}%` : '—'
const signed = (value, suffix = '') => valid(value)
  ? `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
  : '—'

function monthLabel(month) {
  return month
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${month}-01T00:00:00Z`))
    : '—'
}

function clean(observations) {
  return (observations || []).filter(point => valid(point.value))
}

function byMonth(observations) {
  return new Map(clean(observations).map(point => [point.date.slice(0, 7), point.value]))
}

function percentChange(current, previous) {
  return valid(current) && valid(previous) && previous !== 0 ? (current / previous - 1) * 100 : null
}

function chartOptions({ ratio = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: COLORS.muted,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          font: { size: 10 },
        },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          label: context => `${context.dataset.label}: ${context.parsed.y?.toFixed(ratio ? 2 : 1)}${context.dataset.unit || ''}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: COLORS.muted, maxTicksLimit: 12, font: { size: 9 } },
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: {
          color: COLORS.muted,
          font: { size: 9 },
          callback: value => ratio ? value.toFixed(1) : value.toLocaleString('en-US'),
        },
      },
    },
  }
}

function rateChartOptions() {
  const options = chartOptions()
  options.scales.y.ticks.callback = value => `${value}%`
  return options
}

function MetricCard({ label, value, period, rows, tone = '' }) {
  return (
    <article className={`${styles.metricCard} ${tone ? styles[tone] : ''}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricHeadline}>
        <strong>{value}</strong>
        <span>{period}</span>
      </div>
      <div className={styles.metricRows}>
        {rows.map(row => (
          <div key={row.label}>
            <span>{row.label}</span>
            <b>{row.value}</b>
          </div>
        ))}
      </div>
    </article>
  )
}

function signalState({ openingsRate, openingsPerUnemployed, quitsRate, layoffsRate, openingsYoy }) {
  let demandScore = 0
  if (openingsRate >= 4.5) demandScore += 2
  else if (openingsRate >= 3.8) demandScore += 1
  if (openingsPerUnemployed >= 1) demandScore += 2
  else if (openingsPerUnemployed >= .8) demandScore += 1
  if (openingsYoy < -10) demandScore -= 2
  else if (openingsYoy < -3) demandScore -= 1

  const demand = demandScore >= 3
    ? { label: 'Labor demand firm', tone: 'positiveText' }
    : demandScore <= 0
      ? { label: 'Demand cooling', tone: 'warningText' }
      : { label: 'Demand normalizing', tone: 'neutralText' }
  const confidence = quitsRate >= 2.3
    ? { label: 'Worker confidence high', tone: 'positiveText' }
    : quitsRate < 1.8
      ? { label: 'Worker confidence weak', tone: 'warningText' }
      : { label: 'Worker confidence normal', tone: 'neutralText' }
  const layoffs = layoffsRate >= 1.4
    ? { label: 'Layoff pressure elevated', tone: 'negativeText' }
    : layoffsRate <= 1.0
      ? { label: 'Layoff pressure low', tone: 'positiveText' }
      : { label: 'Layoffs near normal', tone: 'neutralText' }
  return { demand, confidence, layoffs }
}

export default function JoltsDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-jolts', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load JOLTS data.')
        return body
      })
      .then(setPayload)
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      })
    return () => controller.abort()
  }, [])

  const model = useMemo(() => {
    if (!payload) return null
    const maps = Object.fromEntries(
      Object.entries(payload.series).map(([key, definition]) => [key, byMonth(definition.observations)]),
    )
    const commonMonth = [...maps.openings.keys()]
      .filter(month => Object.values(maps).every(map => map.has(month)))
      .sort()
      .at(-1)
    if (!commonMonth) return null

    const months = [...maps.openings.keys()].filter(month => month <= commonMonth).sort()
    const currentIndex = months.indexOf(commonMonth)
    const value = (key, offset = 0) => maps[key].get(months[currentIndex - offset])
    const openings = value('openings')
    const unemployed = value('unemployed')
    const openingsRate = value('openingsRate')
    const hiresRate = value('hiresRate')
    const quitsRate = value('quitsRate')
    const layoffsRate = value('layoffsRate')
    const openingsMom = openings - value('openings', 1)
    const openingsYoy = percentChange(openings, value('openings', 12))
    const openingsPerUnemployed = openings / unemployed
    const unemployedPerOpening = unemployed / openings
    const hiringSpread = hiresRate - quitsRate
    const flowSpread = quitsRate - layoffsRate
    const signals = signalState({ openingsRate, openingsPerUnemployed, quitsRate, layoffsRate, openingsYoy })
    const chartMonths = months.slice(-60)
    const labels = chartMonths.map(monthLabel)
    const data = key => chartMonths.map(month => maps[key].get(month) ?? null)
    const ratioData = chartMonths.map(month => {
      const jobs = maps.openings.get(month)
      const jobless = maps.unemployed.get(month)
      return valid(jobs) && valid(jobless) && jobless !== 0 ? jobs / jobless : null
    })

    const recentMonths = months.slice(-3).reverse()
    return {
      commonMonth,
      openings,
      unemployed,
      openingsRate,
      hiresRate,
      quitsRate,
      layoffsRate,
      openingsMom,
      openingsYoy,
      openingsPerUnemployed,
      unemployedPerOpening,
      hiringSpread,
      flowSpread,
      signals,
      recentMonths,
      valueForMonth: (key, month) => maps[key].get(month),
      levelsChart: {
        labels,
        datasets: [
          { label: 'Job openings', data: data('openings'), borderColor: COLORS.orange, backgroundColor: 'rgba(240,138,36,.08)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Unemployed', data: data('unemployed'), borderColor: COLORS.blue, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
        ],
      },
      flowChart: {
        labels,
        datasets: [
          { label: 'Openings rate', data: data('openingsRate'), borderColor: COLORS.orange, unit: '%', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Hires rate', data: data('hiresRate'), borderColor: COLORS.blue, unit: '%', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Quits rate', data: data('quitsRate'), borderColor: COLORS.green, unit: '%', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Layoffs rate', data: data('layoffsRate'), borderColor: COLORS.red, unit: '%', tension: .25, pointRadius: 0, borderWidth: 1.8 },
        ],
      },
      tightnessChart: {
        labels,
        datasets: [
          { label: 'Job openings per unemployed person', data: ratioData, borderColor: COLORS.violet, backgroundColor: 'rgba(169,154,240,.10)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2 },
        ],
      },
    }
  }, [payload])

  if (error) return <main className={styles.page}><div className={styles.error}>{error}</div></main>
  if (!model) return <main className={styles.page}><div className={styles.loading}>Loading JOLTS…</div></main>

  const updated = new Date(payload.fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="BLS · FRED" />
        <nav className={styles.topbar}>
          <Link href="/#united-states">← US Macro Dashboard</Link>
          <span>EMPLOYMENT & WAGES / MONTHLY</span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>US / LABOR DEMAND & TURNOVER</div>
          <h1>JOLTS Labor Market Pulse</h1>
          <p>
            A demand-side view of the labor market: unfilled jobs, hiring, voluntary quits,
            layoffs and the balance between available workers and available positions.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Auto-updated from FRED</span>
            <span>Common reference month: {monthLabel(model.commonMonth)}</span>
            <span>Fetched: {updated}</span>
          </div>
        </header>

        <section className={styles.metricGrid}>
          <MetricCard label="Job Openings" value={compact(model.openings)} period="positions" tone="warning" rows={[
            { label: 'MoM', value: `${model.openingsMom > 0 ? '+' : ''}${Math.round(model.openingsMom).toLocaleString()}K` },
            { label: 'YoY', value: signed(model.openingsYoy, '%') },
          ]} />
          <MetricCard label="Openings Rate" value={pct(model.openingsRate)} period="labor demand" rows={[
            { label: 'Jobs / unemployed', value: model.openingsPerUnemployed.toFixed(2) },
            { label: 'Unemployed / job', value: model.unemployedPerOpening.toFixed(2) },
          ]} />
          <MetricCard label="Quits Rate" value={pct(model.quitsRate)} period="worker confidence" tone="positive" rows={[
            { label: 'Hires rate', value: pct(model.hiresRate) },
            { label: 'Hires - quits', value: signed(model.hiringSpread, ' pt') },
          ]} />
          <MetricCard label="Layoffs Rate" value={pct(model.layoffsRate)} period="employer stress" tone={model.layoffsRate >= 1.4 ? 'negative' : 'violet'} rows={[
            { label: 'Quits - layoffs', value: signed(model.flowSpread, ' pt') },
            { label: 'Status', value: model.signals.layoffs.label.replace(' pressure', '') },
          ]} />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>01 / LABOR TIGHTNESS</span><h2>Open jobs versus available workers</h2></div>
            <p>The core comparison from the earlier Excel dashboard, now aligned to one reference month and updated automatically.</p>
          </header>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div><h3>Job openings and unemployment</h3><p>Thousands · seasonally adjusted · 5-year window</p></div>
                <span className={styles.tag}>{model.openingsPerUnemployed.toFixed(2)} jobs / worker</span>
              </div>
              <div className={styles.chart}><Line data={model.levelsChart} options={chartOptions()} /></div>
            </article>
            <aside className={styles.analysis}>
              <div>
                <div className={styles.analysisKicker}>LABOR-MARKET READ</div>
                <div className={styles.analysisScore}>
                  <div><strong className={styles[model.signals.demand.tone]}>{model.signals.demand.label}</strong><small>Demand, confidence and stress</small></div>
                  <b>{pct(model.openingsRate)}</b>
                </div>
                <ul>
                  <li><span>Unmet labor demand</span><b className={styles[model.signals.demand.tone]}>{compact(model.openings)} openings</b></li>
                  <li><span>Worker confidence</span><b className={styles[model.signals.confidence.tone]}>{model.signals.confidence.label}</b></li>
                  <li><span>Employer stress</span><b className={styles[model.signals.layoffs.tone]}>{model.signals.layoffs.label}</b></li>
                  <li><span>12-month openings momentum</span><b>{signed(model.openingsYoy, '%')}</b></li>
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>02 / TURNOVER FLOWS</span><h2>Demand, hiring and separation rates</h2></div>
            <p>Openings measure positions available at month-end; hires, quits and layoffs measure flows during the month.</p>
          </header>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>JOLTS flow rates</h3><p>Percent of employment · 5-year window</p></div></div>
              <div className={styles.chartSmall}><Line data={model.flowChart} options={rateChartOptions()} /></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Labor tightness ratio</h3><p>Job openings per unemployed person</p></div><span className={styles.tag}>1.00 = balance</span></div>
              <div className={styles.chartSmall}><Line data={model.tightnessChart} options={chartOptions({ ratio: true })} /></div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>03 / RELEASE SCORECARD</span><h2>Three-month direction</h2></div>
            <p>All columns represent the same month across every JOLTS series; no mixed-month horizontal comparison.</p>
          </header>
          <article className={styles.panel}>
            <div className={styles.tableWrap}>
              <table className={styles.matrix}>
                <thead>
                  <tr><th>Signal</th>{model.recentMonths.map(month => <th key={month}>{monthLabel(month)}</th>)}</tr>
                </thead>
                <tbody>
                  <tr><td>Job openings</td>{model.recentMonths.map(month => <td key={month}>{compact(model.valueForMonth('openings', month))}</td>)}</tr>
                  <tr><td>Openings rate</td>{model.recentMonths.map(month => <td key={month}>{pct(model.valueForMonth('openingsRate', month))}</td>)}</tr>
                  <tr><td>Hires rate</td>{model.recentMonths.map(month => <td key={month}>{pct(model.valueForMonth('hiresRate', month))}</td>)}</tr>
                  <tr><td>Quits rate</td>{model.recentMonths.map(month => <td key={month}>{pct(model.valueForMonth('quitsRate', month))}</td>)}</tr>
                  <tr><td>Layoffs rate</td>{model.recentMonths.map(month => <td key={month}>{pct(model.valueForMonth('layoffsRate', month))}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <footer className={styles.methodology}>
          <strong>Methodology.</strong> The openings-to-unemployed ratio divides total nonfarm job
          openings by the civilian unemployment level; both are measured in thousands. JOLTS rates
          are seasonally adjusted. The latest JOLTS month is preliminary and normally revised in the
          following release. Source: <a href="https://www.bls.gov/jlt/" target="_blank" rel="noreferrer">BLS JOLTS via FRED</a>.
        </footer>
      </div>
    </main>
  )
}
