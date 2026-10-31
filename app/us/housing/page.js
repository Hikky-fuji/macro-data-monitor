'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { DashboardFreshness, DashboardState } from '../../components/DashboardStatus'
import styles from '../analysis-dashboard.module.css'

ChartJS.register(CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = { orange: '#f08a24', blue: '#42a9bc', green: '#60d4af', red: '#ff6b6b', violet: '#a99af0', muted: '#c7cdd1', grid: '#4a5258' }
const valid = Number.isFinite
const clean = item => (item?.observations || []).filter(point => valid(point.value))
const byDate = item => new Map(clean(item).map(point => [point.date, point.value]))
const change = (current, previous) => valid(current) && valid(previous) && previous !== 0 ? (current / previous - 1) * 100 : null
const pct = (value, digits = 1) => valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}%` : '—'
const level = (value, digits = 0) => valid(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const dateLabel = date => date ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '—'

function options({ percent = false, rightAxis = false } = {}) {
  const scales = {
    x: { grid: { display: false }, ticks: { color: COLORS.muted, maxTicksLimit: 12, font: { size: 9 } } },
    y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, callback: value => percent ? `${value}%` : value.toLocaleString(), font: { size: 9 } } },
  }
  if (rightAxis) scales.y1 = { position: 'right', grid: { display: false }, ticks: { color: COLORS.muted, font: { size: 9 } } }
  return {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales,
    plugins: { legend: { position: 'bottom', labels: { color: COLORS.muted, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 10 } } }, tooltip: { backgroundColor: '#142b3c', padding: 10 } },
  }
}

function MetricCard({ label, value, period, rows, tone = '' }) {
  return <article className={`${styles.metricCard} ${tone ? styles[tone] : ''}`}>
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.metricHeadline}><strong>{value}</strong><span>{period}</span></div>
    <div className={styles.metricRows}>{rows.map(row => <div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>)}</div>
  </article>
}

function latestMeasure(item, yearPeriods = 12) {
  const values = clean(item)
  const current = values.at(-1)
  const yearAgo = values.at(-(yearPeriods + 1))
  return {
    date: current?.date,
    value: current?.value,
    prior: values.at(-2)?.value,
    mom: change(current?.value, values.at(-2)?.value),
    yoy: change(current?.value, yearAgo?.value),
    yearDifference: valid(current?.value) && valid(yearAgo?.value) ? current.value - yearAgo.value : null,
  }
}

export default function UsHousingDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-housing', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load housing data.')
        return body
      })
      .then(setPayload)
      .catch(fetchError => { if (fetchError.name !== 'AbortError') setError(fetchError.message) })
    return () => controller.abort()
  }, [])

  const model = useMemo(() => {
    if (!payload) return null
    const { series } = payload
    const starts = latestMeasure(series.starts)
    const permits = latestMeasure(series.permits)
    const sales = latestMeasure(series.newHomeSales)
    const supply = latestMeasure(series.monthsSupply)
    const mortgage = latestMeasure(series.mortgage, 52)
    const prices = latestMeasure(series.housePrices, 4)
    if (!starts.date || !permits.date || !sales.date) return null

    const startsValues = clean(series.starts)
    const recent3 = startsValues.slice(-3).map(item => item.value)
    const prior3 = startsValues.slice(-6, -3).map(item => item.value)
    const startsImpulse = change(average(recent3), average(prior3))
    const pulse = startsImpulse > 4 && permits.yoy > 0
      ? { label: 'Construction improving', tone: 'positiveText' }
      : startsImpulse < -4 && permits.yoy < 0
        ? { label: 'Construction cooling', tone: 'negativeText' }
        : { label: 'Housing activity mixed', tone: 'neutralText' }

    const monthlyDates = startsValues.slice(-84).map(item => item.date)
    const pipelineMaps = Object.fromEntries(['starts', 'permits', 'completions'].map(key => [key, byDate(series[key])]))
    const compositionMaps = Object.fromEntries(['singleFamily', 'multifamily'].map(key => [key, byDate(series[key])]))
    const salesDates = clean(series.newHomeSales).slice(-84).map(item => item.date)
    const salesMap = byDate(series.newHomeSales)
    const supplyMap = byDate(series.monthsSupply)
    const mortgageValues = clean(series.mortgage).slice(-260)
    const priceValues = clean(series.housePrices)

    return {
      starts, permits, sales, supply, mortgage, prices, startsImpulse, pulse,
      permitGap: change(permits.value, starts.value),
      pipelineChart: { labels: monthlyDates.map(dateLabel), datasets: [
        { label: 'Permits', data: monthlyDates.map(date => pipelineMaps.permits.get(date) ?? null), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 1.8, tension: .2 },
        { label: 'Starts', data: monthlyDates.map(date => pipelineMaps.starts.get(date) ?? null), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 2, tension: .2 },
        { label: 'Completions', data: monthlyDates.map(date => pipelineMaps.completions.get(date) ?? null), borderColor: COLORS.green, pointRadius: 0, borderWidth: 1.8, tension: .2 },
      ] },
      compositionChart: { labels: monthlyDates.map(dateLabel), datasets: [
        { label: 'Single-family starts', data: monthlyDates.map(date => compositionMaps.singleFamily.get(date) ?? null), borderColor: COLORS.green, pointRadius: 0, borderWidth: 2, tension: .2 },
        { label: '5+ unit starts', data: monthlyDates.map(date => compositionMaps.multifamily.get(date) ?? null), borderColor: COLORS.violet, pointRadius: 0, borderWidth: 1.8, tension: .2 },
      ] },
      demandChart: { labels: salesDates.map(dateLabel), datasets: [
        { label: 'New home sales · SAAR', data: salesDates.map(date => salesMap.get(date) ?? null), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 2, tension: .2, yAxisID: 'y' },
        { label: 'Months of supply', data: salesDates.map(date => supplyMap.get(date) ?? null), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 1.8, tension: .2, yAxisID: 'y1' },
      ] },
      mortgageChart: { labels: mortgageValues.map(item => dateLabel(item.date)), datasets: [{ label: '30-year mortgage rate', data: mortgageValues.map(item => item.value), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 2, tension: .18 }] },
      priceChart: { labels: priceValues.slice(-40).map(item => dateLabel(item.date)), datasets: [{ label: 'FHFA HPI YoY', data: priceValues.slice(-40).map((item, index, array) => change(item.value, array[index - 4]?.value)), borderColor: COLORS.green, pointRadius: 0, borderWidth: 2, tension: .2 }] },
    }
  }, [payload])

  if (error) return <DashboardState type="error" message={error} />
  if (!model) return <DashboardState message="Loading construction, sales, mortgage and house-price feeds…" />

  return <main className={styles.page}><div className={styles.shell}>
    <DashboardFreshness data={payload} source="Census · HUD · FHFA · FRED" />
    <nav className={styles.topbar}><Link href="/#united-states">← US Macro Dashboard</Link><span>HOUSING / CONSTRUCTION / FINANCING</span></nav>
    <header className={styles.hero}>
      <div className={styles.eyebrow}>US / HOUSING & REAL ESTATE</div><h1>Housing Cycle Monitor</h1>
      <p>Construction pipeline, single-family and multifamily mix, new-home demand, inventory, mortgage rates and house-price momentum.</p>
      <div className={styles.heroMeta}><span><i />Auto-updated from official feeds</span><span>Each card retains its own observation date</span><span>{payload.meta?.partial ? 'Partial feed · available series shown' : 'All tracked feeds available'}</span></div>
    </header>

    <section className={styles.metricGrid}>
      <MetricCard label="Housing Starts" value={level(model.starts.value)} period={`thousand SAAR · ${dateLabel(model.starts.date)}`} tone="warning" rows={[{ label: 'MoM', value: pct(model.starts.mom) }, { label: 'YoY', value: pct(model.starts.yoy) }]} />
      <MetricCard label="Building Permits" value={level(model.permits.value)} period={`thousand SAAR · ${dateLabel(model.permits.date)}`} rows={[{ label: 'MoM', value: pct(model.permits.mom) }, { label: 'YoY', value: pct(model.permits.yoy) }]} />
      <MetricCard label="New Home Sales" value={level(model.sales.value)} period={`thousand SAAR · ${dateLabel(model.sales.date)}`} tone="positive" rows={[{ label: 'MoM', value: pct(model.sales.mom) }, { label: 'YoY', value: pct(model.sales.yoy) }]} />
      <MetricCard label="30Y Mortgage Rate" value={valid(model.mortgage.value) ? `${model.mortgage.value.toFixed(2)}%` : '—'} period={dateLabel(model.mortgage.date)} tone="violet" rows={[{ label: 'Weekly change', value: valid(model.mortgage.value) && valid(model.mortgage.prior) ? `${(model.mortgage.value - model.mortgage.prior).toFixed(2)} pp` : '—' }, { label: 'YoY change', value: valid(model.mortgage.yearDifference) ? `${model.mortgage.yearDifference > 0 ? '+' : ''}${model.mortgage.yearDifference.toFixed(2)} pp` : '—' }]} />
    </section>

    <section className={styles.section}>
      <header className={styles.sectionHeader}><div><span>01 / CONSTRUCTION PIPELINE</span><h2>Permits → starts → completions</h2></div><p>Each monthly series is plotted on its own official date; missing months are not forward-filled.</p></header>
      <div className={styles.mainGrid}>
        <article className={styles.panel}><div className={styles.panelHeading}><div><h3>Residential construction pipeline</h3><p>Thousands of units · seasonally adjusted annual rate</p></div><span className={styles.tag}>{dateLabel(model.starts.date)}</span></div><div className={styles.chart}><Line data={model.pipelineChart} options={options()} /></div></article>
        <aside className={styles.analysis}><div><div className={styles.analysisKicker}>HOUSING READ</div><div className={styles.analysisScore}><div><strong className={styles[model.pulse.tone]}>{model.pulse.label}</strong><small>Three-month construction impulse</small></div><b>{pct(model.startsImpulse)}</b></div><ul>
          <li><span>Permits vs starts<small>Forward pipeline balance</small></span><b>{pct(model.permitGap)}</b></li>
          <li><span>New-home supply</span><b>{valid(model.supply.value) ? `${model.supply.value.toFixed(1)} months` : '—'}</b></li>
          <li><span>House-price momentum<small>FHFA HPI · quarterly YoY</small></span><b>{pct(model.prices.yoy)}</b></li>
        </ul></div></aside>
      </div>
    </section>

    <section className={styles.section}>
      <header className={styles.sectionHeader}><div><span>02 / SUPPLY & DEMAND</span><h2>Housing composition and inventory</h2></div><p>Single-family demand is separated from the more volatile multifamily construction cycle.</p></header>
      <div className={styles.equalGrid}>
        <article className={styles.panel}><div className={styles.panelHeading}><div><h3>Starts by structure</h3><p>Thousands · SAAR</p></div></div><div className={styles.chartSmall}><Line data={model.compositionChart} options={options()} /></div></article>
        <article className={styles.panel}><div className={styles.panelHeading}><div><h3>New-home demand and inventory</h3><p>Sales SAAR · months of supply</p></div></div><div className={styles.chartSmall}><Line data={model.demandChart} options={options({ rightAxis: true })} /></div></article>
      </div>
    </section>

    <section className={styles.section}>
      <header className={styles.sectionHeader}><div><span>03 / AFFORDABILITY & PRICES</span><h2>Financing pressure and house-price persistence</h2></div><p>Weekly mortgage rates and quarterly house prices keep independent, visibly labeled frequencies.</p></header>
      <div className={styles.equalGrid}>
        <article className={styles.panel}><div className={styles.panelHeading}><div><h3>Mortgage financing cost</h3><p>Freddie Mac 30-year fixed rate · weekly</p></div></div><div className={styles.chartSmall}><Line data={model.mortgageChart} options={options({ percent: true })} /></div></article>
        <article className={styles.panel}><div className={styles.panelHeading}><div><h3>House-price momentum</h3><p>FHFA All-Transactions HPI · quarterly YoY</p></div></div><div className={styles.chartSmall}><Line data={model.priceChart} options={options({ percent: true })} /></div></article>
      </div>
    </section>

    <footer className={styles.methodology}><strong>Methodology.</strong> Construction, sales and inventory are monthly; mortgage rates are weekly; the FHFA house-price index is quarterly. Cards show their own latest observation to avoid comparing unlike release months. SAAR means seasonally adjusted annual rate. Sources: U.S. Census Bureau, HUD, Freddie Mac and FHFA via FRED.{' '}<a href="https://www.census.gov/construction/nrc/index.html" rel="noreferrer" target="_blank">Official construction release ↗</a></footer>
  </div></main>
}
