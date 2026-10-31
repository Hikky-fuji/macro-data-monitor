'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { DashboardFreshness, DashboardState } from '../../components/DashboardStatus'
import styles from '../analysis-dashboard.module.css'

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = {
  orange: '#f08a24', blue: '#42a9bc', green: '#60d4af', red: '#ff6b6b',
  violet: '#a99af0', muted: '#c7cdd1', grid: '#4a5258',
}
const valid = Number.isFinite
const pct = (value, digits = 1) => valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}%` : '—'
const clean = observations => (observations || []).filter(point => valid(point.value))
const mapByMonth = observations => new Map(clean(observations).map(point => [point.date.slice(0, 7), point.value]))
const change = (current, previous) => valid(current) && valid(previous) && previous !== 0 ? (current / previous - 1) * 100 : null
const annualized = (current, previous, periods) => valid(current) && valid(previous) && previous !== 0
  ? (Math.pow(current / previous, 12 / periods) - 1) * 100
  : null
const monthLabel = month => new Intl.DateTimeFormat('en-US', {
  month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${month}-01T00:00:00Z`))

function lineOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: COLORS.muted, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 10 } } },
      tooltip: { backgroundColor: '#142b3c', padding: 10, callbacks: { label: item => `${item.dataset.label}: ${pct(item.parsed.y, 2)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.muted, maxTicksLimit: 12, font: { size: 9 } } },
      y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, callback: value => `${value}%`, font: { size: 9 } } },
    },
  }
}

function barOptions() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => pct(item.parsed.x, 1) } } },
    scales: {
      x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, callback: value => `${value}%`, font: { size: 9 } } },
      y: { grid: { display: false }, ticks: { color: COLORS.muted, font: { size: 9 } } },
    },
  }
}

function MetricCard({ label, value, period, rows, tone = '' }) {
  return (
    <article className={`${styles.metricCard} ${tone ? styles[tone] : ''}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricHeadline}><strong>{value}</strong><span>{period}</span></div>
      <div className={styles.metricRows}>{rows.map(row => (
        <div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>
      ))}</div>
    </article>
  )
}

export default function RetailSalesDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-retail-sales', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load retail-sales data.')
        return body
      })
      .then(setPayload)
      .catch(fetchError => { if (fetchError.name !== 'AbortError') setError(fetchError.message) })
    return () => controller.abort()
  }, [])

  const model = useMemo(() => {
    if (!payload) return null
    const maps = Object.fromEntries(Object.entries(payload.series).map(([key, item]) => [key, mapByMonth(item.observations)]))
    const headlineKeys = ['total', 'exAutos', 'exAutosGas', 'realTotal']
    const headlineMonth = [...maps.total.keys()].filter(month => headlineKeys.every(key => maps[key]?.has(month))).sort().at(-1)
    if (!headlineMonth) return null
    const months = [...maps.total.keys()].filter(month => month <= headlineMonth).sort()
    const index = months.indexOf(headlineMonth)
    const value = (key, offset = 0) => maps[key]?.get(months[index - offset])
    const measure = key => ({
      mom: change(value(key), value(key, 1)),
      threeMonth: annualized(value(key), value(key, 3), 3),
      yoy: change(value(key), value(key, 12)),
    })
    const headline = Object.fromEntries(headlineKeys.map(key => [key, measure(key)]))
    const chartMonths = months.slice(-60)
    const seriesChange = (key, periods, useAnnualized = false) => chartMonths.map(month => {
      const currentIndex = months.indexOf(month)
      return useAnnualized
        ? annualized(maps[key]?.get(month), maps[key]?.get(months[currentIndex - periods]), periods)
        : change(maps[key]?.get(month), maps[key]?.get(months[currentIndex - periods]))
    })

    const categoryKeys = Object.entries(payload.series).filter(([, item]) => item.group === 'category').map(([key]) => key)
    const categoryMonth = categoryKeys.length
      ? [...maps[categoryKeys[0]].keys()].filter(month => categoryKeys.every(key => maps[key]?.has(month))).sort().at(-1)
      : null
    const categoryRows = categoryMonth ? categoryKeys.map(key => {
      const item = payload.series[key]
      const categoryMonths = [...maps[key].keys()].sort()
      const categoryIndex = categoryMonths.indexOf(categoryMonth)
      return {
        label: item.label,
        mom: change(maps[key].get(categoryMonth), maps[key].get(categoryMonths[categoryIndex - 1])),
        yoy: change(maps[key].get(categoryMonth), maps[key].get(categoryMonths[categoryIndex - 12])),
      }
    }).filter(row => valid(row.yoy)).sort((a, b) => b.yoy - a.yoy) : []
    const improving = categoryRows.filter(row => row.mom > 0).length
    const breadth = categoryRows.length ? improving / categoryRows.length * 100 : null
    const realState = headline.realTotal.threeMonth > 2
      ? { label: 'Real demand strengthening', tone: 'positiveText' }
      : headline.realTotal.threeMonth < -2
        ? { label: 'Real demand cooling', tone: 'negativeText' }
        : { label: 'Real demand broadly steady', tone: 'neutralText' }

    return {
      headlineMonth,
      categoryMonth,
      headline,
      categoryRows,
      breadth,
      realState,
      headlineChart: {
        labels: chartMonths.map(monthLabel),
        datasets: [
          { label: 'Total YoY', data: seriesChange('total', 12), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 2, tension: .25 },
          { label: 'Ex autos YoY', data: seriesChange('exAutos', 12), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 1.8, tension: .25 },
          { label: 'Ex autos & gas YoY', data: seriesChange('exAutosGas', 12), borderColor: COLORS.green, pointRadius: 0, borderWidth: 1.8, tension: .25 },
        ],
      },
      realChart: {
        labels: chartMonths.map(monthLabel),
        datasets: [
          { label: 'Real sales YoY', data: seriesChange('realTotal', 12), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 2, tension: .25 },
          { label: 'Real sales 3M ann.', data: seriesChange('realTotal', 3, true), borderColor: COLORS.violet, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.7, tension: .25 },
        ],
      },
      categoryChart: {
        labels: categoryRows.map(row => row.label),
        datasets: [{
          data: categoryRows.map(row => row.yoy),
          backgroundColor: categoryRows.map(row => row.yoy >= 0 ? COLORS.green : COLORS.red),
          borderWidth: 0,
        }],
      },
    }
  }, [payload])

  if (error) return <DashboardState type="error" message={error} />
  if (!model) return <DashboardState message="Loading advance and category retail-sales releases…" />

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="Census · FRED" />
        <nav className={styles.topbar}><Link href="/#united-states">← US Macro Dashboard</Link><span>CONSUMPTION / RETAIL DEMAND / MONTHLY</span></nav>
        <header className={styles.hero}>
          <div className={styles.eyebrow}>US / RETAIL SALES</div>
          <h1>Retail Demand Monitor</h1>
          <p>Advance spending momentum, inflation-adjusted demand and category breadth—kept on clearly labeled release vintages for valid comparisons.</p>
          <div className={styles.heroMeta}>
            <span><i />Auto-updated from FRED</span>
            <span>Advance release: {monthLabel(model.headlineMonth)}</span>
            <span>Category detail: {model.categoryMonth ? monthLabel(model.categoryMonth) : 'Unavailable'}</span>
          </div>
        </header>

        <section className={styles.metricGrid}>
          <MetricCard label="Total Retail Sales" value={pct(model.headline.total.mom, 2)} period="MoM" tone="warning" rows={[
            { label: 'YoY', value: pct(model.headline.total.yoy) }, { label: '3M annualized', value: pct(model.headline.total.threeMonth) },
          ]} />
          <MetricCard label="Ex Motor Vehicles" value={pct(model.headline.exAutos.mom, 2)} period="MoM" rows={[
            { label: 'YoY', value: pct(model.headline.exAutos.yoy) }, { label: '3M annualized', value: pct(model.headline.exAutos.threeMonth) },
          ]} />
          <MetricCard label="Ex Autos & Gas" value={pct(model.headline.exAutosGas.mom, 2)} period="MoM" tone="violet" rows={[
            { label: 'YoY', value: pct(model.headline.exAutosGas.yoy) }, { label: '3M annualized', value: pct(model.headline.exAutosGas.threeMonth) },
          ]} />
          <MetricCard label="Real Retail Sales" value={pct(model.headline.realTotal.threeMonth)} period="3M annualized" tone="positive" rows={[
            { label: 'MoM', value: pct(model.headline.realTotal.mom, 2) }, { label: 'YoY', value: pct(model.headline.realTotal.yoy) },
          ]} />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}><div><span>01 / TOPLINE MOMENTUM</span><h2>Nominal spending and underlying control</h2></div><p>Total, ex-auto and ex-auto-and-gas series use one common advance-release month.</p></header>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Advance retail-sales growth</h3><p>Year-over-year · five-year window</p></div><span className={styles.tag}>{monthLabel(model.headlineMonth)}</span></div>
              <div className={styles.chart}><Line data={model.headlineChart} options={lineOptions()} /></div>
            </article>
            <aside className={styles.analysis}>
              <div>
                <div className={styles.analysisKicker}>CONSUMER READ</div>
                <div className={styles.analysisScore}><div><strong className={styles[model.realState.tone]}>{model.realState.label}</strong><small>Inflation-adjusted retail demand</small></div><b>{pct(model.headline.realTotal.threeMonth)}</b></div>
                <ul>
                  <li><span>Core-like nominal impulse<small>Ex autos & gasoline</small></span><b>{pct(model.headline.exAutosGas.threeMonth)}</b></li>
                  <li><span>Real monthly change</span><b>{pct(model.headline.realTotal.mom, 2)}</b></li>
                  <li><span>Categories rising MoM</span><b>{valid(model.breadth) ? `${Math.round(model.breadth)}%` : '—'}</b></li>
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}><div><span>02 / REAL DEMAND & BREADTH</span><h2>Purchasing power and category participation</h2></div><p>Category detail deliberately uses its own latest common MRTS month; it is never relabeled as the newer advance month.</p></header>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Real retail momentum</h3><p>YoY and three-month annualized</p></div></div>
              <div className={styles.chartSmall}><Line data={model.realChart} options={lineOptions()} /></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Category growth</h3><p>YoY · {model.categoryMonth ? monthLabel(model.categoryMonth) : '—'}</p></div></div>
              <div className={styles.chart}><Bar data={model.categoryChart} options={barOptions()} /></div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}><div><span>03 / CATEGORY SCORECARD</span><h2>Where spending is expanding or contracting</h2></div><p>Month-over-month and year-over-year rates are calculated from seasonally adjusted levels.</p></header>
          <article className={styles.panel}><div className={styles.tableWrap}><table className={styles.matrix}>
            <thead><tr><th>Category</th><th>MoM</th><th>YoY</th><th>Direction</th></tr></thead>
            <tbody>{model.categoryRows.map(row => <tr key={row.label}><td>{row.label}</td><td>{pct(row.mom, 2)}</td><td>{pct(row.yoy)}</td><td>{row.mom > 0 ? 'Expanding' : row.mom < 0 ? 'Contracting' : 'Flat'}</td></tr>)}</tbody>
          </table></div></article>
        </section>

        <footer className={styles.methodology}>
          <strong>Methodology.</strong> Advance total, ex-auto and ex-auto-and-gas readings are compared on one common release month. Category breadth comes from the revised Monthly Retail Trade Survey and carries its own common month. Real sales are the St. Louis Fed’s CPI-deflated RRSFS series. All estimates are revisable. Source: U.S. Census Bureau via FRED.{' '}
          <a href="https://www.census.gov/retail/index.html" rel="noreferrer" target="_blank">Official release ↗</a>
        </footer>
      </div>
    </main>
  )
}
